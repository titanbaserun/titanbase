import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { DesktopMenuAction, RuntimeDocumentState, RuntimeExportFileArgs, RuntimeFileResult, RuntimeRecentFile, RuntimeSaveResult } from "@titanbase/editor";
import { addRecentFileEntry, isPostgresSqlPath, isTitanbaseSchemaPath, MAX_DESKTOP_FILE_BYTES, normalizeExportExtensions, validateTitanJsonContent } from "./file-utils";

const trustedExternalUrls = new Set(["https://docs.titanbase.run", "https://github.com/titanbaserun/titanbase", "https://www.titanbase.run"]);

let mainWindow: BrowserWindow | undefined;
let forceClose = false;
let documentState: RuntimeDocumentState = { isDirty: false, sourceKind: "blank" };
let pendingOpenPath: string | undefined;
const approvedTitanPaths = new Set<string>();

const recentPath = () => join(app.getPath("userData"), "recent-files.json");
const fileName = (filePath: string) => basename(filePath);
const titanFile = isTitanbaseSchemaPath;
const sqlFile = isPostgresSqlPath;
const appIconPath = () => join(__dirname, "../../build/icon.png");

async function loadRecentFiles(): Promise<RuntimeRecentFile[]> {
  try {
    const parsed = JSON.parse(await readFile(recentPath(), "utf8")) as RuntimeRecentFile[];
    return parsed.filter((item) => typeof item.filePath === "string" && typeof item.displayName === "string" && typeof item.lastOpenedAt === "string").slice(0, 10);
  } catch { return []; }
}

async function saveRecentFiles(files: RuntimeRecentFile[]) {
  await mkdir(dirname(recentPath()), { recursive: true });
  await writeFile(recentPath(), JSON.stringify(files.slice(0, 10), null, 2), "utf8");
  await rebuildMenu();
}

async function addRecentFile(filePath: string) {
  await saveRecentFiles(addRecentFileEntry(await loadRecentFiles(), filePath, new Date().toISOString()));
}

async function removeRecentFile(filePath: string) {
  await saveRecentFiles((await loadRecentFiles()).filter((item) => item.filePath !== filePath));
}

async function readSelectedFile(filePath: string, expected: "titan" | "sql"): Promise<RuntimeFileResult> {
  if ((expected === "titan" && !titanFile(filePath)) || (expected === "sql" && !sqlFile(filePath))) return { canceled: false, filePath, fileName: fileName(filePath), error: expected === "titan" ? "Choose a .titan.json or .json file." : "Choose a PostgreSQL .sql file." };
  try {
    const details = await stat(filePath);
    if (!details.isFile()) return { canceled: false, filePath, fileName: fileName(filePath), error: "The selected path is not a file." };
    if (details.size > MAX_DESKTOP_FILE_BYTES) return { canceled: false, filePath, fileName: fileName(filePath), error: "The selected file is larger than the 20 MB desktop limit." };
    const content = await readFile(filePath, "utf8");
    if (expected === "titan") {
      const validationError = validateTitanJsonContent(content);
      if (validationError) return { canceled: false, filePath, fileName: fileName(filePath), error: validationError };
    }
    return { canceled: false, filePath, fileName: fileName(filePath), content };
  } catch (error) { return { canceled: false, filePath, fileName: fileName(filePath), error: error instanceof Error ? error.message : "Could not read the selected file." }; }
}

async function chooseFile(kind: "titan" | "sql", trackRecent = true): Promise<RuntimeFileResult> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile"],
    filters: kind === "titan" ? [{ name: "Titanbase Schema", extensions: ["json"] }] : [{ name: "PostgreSQL SQL", extensions: ["sql"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const opened = await readSelectedFile(result.filePaths[0], kind);
  if (!opened.error && kind === "titan" && trackRecent) { approvedTitanPaths.add(result.filePaths[0]); await addRecentFile(result.filePaths[0]); }
  return opened;
}

async function writeTextFile(filePath: string, content: string): Promise<RuntimeSaveResult> {
  try {
    await writeFile(filePath, content, "utf8");
    return { canceled: false, filePath, fileName: fileName(filePath) };
  } catch (error) { return { canceled: false, filePath, fileName: fileName(filePath), error: error instanceof Error ? error.message : "Could not write the file." }; }
}

function sendAction(action: DesktopMenuAction) { mainWindow?.webContents.send("desktop:menu-action", action); }

async function sendOpenPath(filePath: string) {
  const expected = sqlFile(filePath) ? "sql" : "titan";
  const opened = await readSelectedFile(filePath, expected);
  if (!opened.error && expected === "titan") { approvedTitanPaths.add(filePath); await addRecentFile(filePath); }
  mainWindow?.webContents.send("desktop:open-file", opened);
}

async function rebuildMenu() {
  if (!app.isReady()) return;
  const recent = await loadRecentFiles();
  const recentMenu: MenuItemConstructorOptions[] = recent.length ? recent.map((item) => ({ label: item.displayName, toolTip: item.filePath, click: () => sendAction({ type: "open-recent", filePath: item.filePath }) })) : [{ label: "No Recent Files", enabled: false }];
  recentMenu.push({ type: "separator" }, { label: "Clear Recent Files", enabled: recent.length > 0, click: () => { void saveRecentFiles([]); } });
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ label: app.name, submenu: [{ role: "about" as const }, { type: "separator" as const }, { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => sendAction("settings") }, { type: "separator" as const }, { role: "services" as const }, { type: "separator" as const }, { role: "hide" as const }, { role: "hideOthers" as const }, { role: "unhide" as const }, { type: "separator" as const }, { role: "quit" as const }] }] : []),
    { label: "File", submenu: [
      { label: "New Schema", accelerator: "CmdOrCtrl+N", click: () => sendAction("new") },
      { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => sendAction("open") },
      { label: "Open Recent", submenu: recentMenu },
      { type: "separator" },
      { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendAction("save") },
      { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => sendAction("save-as") },
      { type: "separator" },
      { label: "Import SQL…", accelerator: "CmdOrCtrl+I", click: () => sendAction("import-sql") },
      { label: "Compare Schemas…", accelerator: "CmdOrCtrl+Shift+C", click: () => sendAction("compare") },
      { label: "Export…", accelerator: "CmdOrCtrl+E", click: () => sendAction("export") },
      ...(process.platform === "darwin" ? [] : [{ type: "separator" as const }, { role: "quit" as const }]),
    ] },
    { label: "Edit", submenu: [{ label: "Undo", accelerator: "CmdOrCtrl+Z", click: () => sendAction("undo") }, { label: "Redo", accelerator: "CmdOrCtrl+Shift+Z", click: () => sendAction("redo") }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }, ...(process.platform === "darwin" ? [] : [{ type: "separator" as const }, { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => sendAction("settings") }])] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "Help", submenu: [
      { label: "Documentation", click: () => { void shell.openExternal("https://docs.titanbase.run"); } },
      { label: "GitHub Repository", click: () => { void shell.openExternal("https://github.com/titanbaserun/titanbase"); } },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle("desktop:open-titan", () => chooseFile("titan"));
  ipcMain.handle("desktop:compare-titan", () => chooseFile("titan", false));
  ipcMain.handle("desktop:open-sql", () => chooseFile("sql"));
  ipcMain.handle("desktop:open-recent", async (_event, payload: { filePath?: unknown }) => {
    const filePath = typeof payload?.filePath === "string" ? payload.filePath : "";
    if (!(await loadRecentFiles()).some((item) => item.filePath === filePath)) return { canceled: false, error: "This path is not in Titanbase recent files." } satisfies RuntimeFileResult;
    if (!existsSync(filePath)) { await removeRecentFile(filePath); return { canceled: false, filePath, fileName: fileName(filePath), error: "The recent file no longer exists." } satisfies RuntimeFileResult; }
    const result = await readSelectedFile(filePath, "titan");
    if (!result.error) { approvedTitanPaths.add(filePath); await addRecentFile(filePath); }
    return result;
  });
  ipcMain.handle("desktop:read-dropped", async (_event, payload: { filePath?: unknown }) => {
    const filePath = typeof payload?.filePath === "string" ? payload.filePath : "";
    if (!filePath || (!titanFile(filePath) && !sqlFile(filePath))) return { canceled: false, error: "Titanbase can only open .titan.json, .json, and .sql files." } satisfies RuntimeFileResult;
    const result = await readSelectedFile(filePath, sqlFile(filePath) ? "sql" : "titan");
    if (!result.error && titanFile(filePath)) { approvedTitanPaths.add(filePath); await addRecentFile(filePath); }
    return result;
  });
  ipcMain.handle("desktop:save-titan", async (_event, payload: { filePath?: unknown; content?: unknown }) => {
    const filePath = typeof payload?.filePath === "string" ? payload.filePath : "";
    const error = validateTitanJsonContent(payload?.content);
    if (!filePath || !titanFile(filePath) || error) return { canceled: false, error: error ?? "Save path must end in .json." } satisfies RuntimeSaveResult;
    if (documentState.currentFilePath !== filePath || !approvedTitanPaths.has(filePath)) return { canceled: false, error: "Titanbase can only overwrite a schema selected through Open or Save As. Use Save As for another path." } satisfies RuntimeSaveResult;
    const result = await writeTextFile(filePath, payload.content as string);
    if (!result.error) await addRecentFile(filePath);
    return result;
  });
  ipcMain.handle("desktop:save-titan-as", async (_event, payload: { defaultName?: unknown; content?: unknown }) => {
    const error = validateTitanJsonContent(payload?.content);
    if (error) return { canceled: false, error } satisfies RuntimeSaveResult;
    const requested = typeof payload?.defaultName === "string" ? basename(payload.defaultName) : "untitled.titan.json";
    const defaultName = requested.toLowerCase().endsWith(".json") ? requested : `${requested}.titan.json`;
    const selected = await dialog.showSaveDialog(mainWindow!, { defaultPath: defaultName, filters: [{ name: "Titanbase Schema", extensions: ["json"] }] });
    if (selected.canceled || !selected.filePath) return { canceled: true };
    const result = await writeTextFile(selected.filePath, payload.content as string);
    if (!result.error) { approvedTitanPaths.add(selected.filePath); await addRecentFile(selected.filePath); }
    return result;
  });
  ipcMain.handle("desktop:export", async (_event, payload: RuntimeExportFileArgs) => {
    if (!payload || typeof payload.content !== "string" || payload.content.length > MAX_DESKTOP_FILE_BYTES || typeof payload.defaultName !== "string" || !Array.isArray(payload.extensions)) return { canceled: false, error: "Invalid export request." } satisfies RuntimeSaveResult;
    const extensions = normalizeExportExtensions(payload.extensions);
    if (!extensions.length) return { canceled: false, error: "Unsupported export file type." } satisfies RuntimeSaveResult;
    const selected = await dialog.showSaveDialog(mainWindow!, { defaultPath: basename(payload.defaultName), filters: [{ name: "Titanbase Export", extensions }] });
    if (selected.canceled || !selected.filePath) return { canceled: true };
    return writeTextFile(selected.filePath, payload.content);
  });
  ipcMain.handle("desktop:confirm-unsaved", async () => {
    const result = await dialog.showMessageBox(mainWindow!, { type: "warning", title: "Unsaved changes", message: "Save changes before continuing?", detail: "Unsaved schema changes will be lost if you discard them.", buttons: ["Save", "Discard", "Cancel"], defaultId: 0, cancelId: 2, noLink: true });
    return (["save", "discard", "cancel"] as const)[result.response] ?? "cancel";
  });
  ipcMain.handle("desktop:get-recent", () => loadRecentFiles());
  ipcMain.handle("desktop:clear-recent", () => saveRecentFiles([]));
  ipcMain.on("desktop:document-state", (_event, state: RuntimeDocumentState) => {
    if (!state || typeof state.isDirty !== "boolean") return;
    documentState = { isDirty: state.isDirty, sourceKind: state.sourceKind, ...(typeof state.currentFilePath === "string" ? { currentFilePath: state.currentFilePath } : {}), ...(typeof state.currentFileName === "string" ? { currentFileName: state.currentFileName } : {}) };
    mainWindow?.setDocumentEdited(state.isDirty);
    mainWindow?.setTitle(`${state.currentFileName ?? "Untitled Schema"}${state.isDirty ? " •" : ""} — Titanbase`);
  });
  ipcMain.on("desktop:close-window", () => { forceClose = true; mainWindow?.close(); });
  ipcMain.on("desktop:open-external", (_event, url: unknown) => { if (typeof url === "string" && trustedExternalUrls.has(url)) void shell.openExternal(url); });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    backgroundColor: "#f8faf8",
    icon: appIconPath(),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (trustedExternalUrls.has(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:") && !url.startsWith("http://localhost:") && !url.startsWith("http://127.0.0.1:")) event.preventDefault();
  });
  mainWindow.on("close", (event) => {
    if (!forceClose && documentState.isDirty) { event.preventDefault(); sendAction("close-requested"); }
  });
  mainWindow.on("closed", () => { mainWindow = undefined; });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  if (process.env.ELECTRON_RENDERER_URL) await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  if (pendingOpenPath) { const value = pendingOpenPath; pendingOpenPath = undefined; await sendOpenPath(value); }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on("second-instance", (_event, commandLine) => {
    mainWindow?.show();
    mainWindow?.focus();
    const filePath = commandLine.find((value) => titanFile(value) || sqlFile(value));
    if (filePath) void sendOpenPath(filePath);
  });
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (mainWindow) void sendOpenPath(filePath);
    else pendingOpenPath = filePath;
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId("run.titanbase.desktop");
    if (process.platform === "darwin") app.dock?.setIcon(appIconPath());
    registerIpc();
    await rebuildMenu();
    pendingOpenPath ??= process.argv.find((value) => titanFile(value) || sqlFile(value));
    await createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
