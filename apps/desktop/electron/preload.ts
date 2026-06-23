import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopMenuAction, RuntimeDocumentState, RuntimeExportFileArgs, RuntimeFileResult, RuntimeRecentFile, RuntimeSaveResult, TitanbaseFileAdapter } from "@titanbase/editor";

const invoke = <T>(channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload) as Promise<T>;

const api: TitanbaseFileAdapter = {
  runtime: "desktop",
  openTitanJson: () => invoke<RuntimeFileResult>("desktop:open-titan"),
  openTitanJsonAt: (filePath) => invoke<RuntimeFileResult>("desktop:open-recent", { filePath }),
  saveTitanJson: (args) => invoke<RuntimeSaveResult>("desktop:save-titan", args),
  saveTitanJsonAs: (args) => invoke<RuntimeSaveResult>("desktop:save-titan-as", args),
  openPostgresSql: () => invoke<RuntimeFileResult>("desktop:open-sql"),
  compareTitanJson: () => invoke<RuntimeFileResult>("desktop:compare-titan"),
  exportFile: (args: RuntimeExportFileArgs) => invoke<RuntimeSaveResult>("desktop:export", args),
  readDroppedFile: (file) => invoke<RuntimeFileResult>("desktop:read-dropped", { filePath: webUtils.getPathForFile(file) }),
  showUnsavedChangesDialog: () => invoke<"save" | "discard" | "cancel">("desktop:confirm-unsaved"),
  getRecentFiles: () => invoke<RuntimeRecentFile[]>("desktop:get-recent"),
  clearRecentFiles: () => invoke<void>("desktop:clear-recent"),
  updateDocumentState: (state: RuntimeDocumentState) => ipcRenderer.send("desktop:document-state", state),
  closeWindow: () => ipcRenderer.send("desktop:close-window"),
  openExternal: (url) => ipcRenderer.send("desktop:open-external", url),
  onMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, action: DesktopMenuAction) => callback(action);
    ipcRenderer.on("desktop:menu-action", listener);
    return () => ipcRenderer.removeListener("desktop:menu-action", listener);
  },
  onOpenFileFromOS: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, file: RuntimeFileResult) => callback(file);
    ipcRenderer.on("desktop:open-file", listener);
    return () => ipcRenderer.removeListener("desktop:open-file", listener);
  },
};

contextBridge.exposeInMainWorld("titanbaseDesktop", api);
