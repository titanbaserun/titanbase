import type { EditorAppSettings, ResolvedTheme, ThemePreference } from "@titanbase/editor";

export const APP_SETTINGS_KEY = "titanbase:app-settings";

export const defaultAppSettings: EditorAppSettings = {
  theme: "system",
  showMinimap: true,
  showGrid: true,
  autoFitViewOnLoad: true,
  autosave: true,
  inspectorPinned: true,
  inspectorOpen: true,
  inspectorHover: true,
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isTheme = (value: unknown): value is ThemePreference => value === "system" || value === "light" || value === "dark";

export function loadAppSettings(storage?: StorageLike): EditorAppSettings {
  if (!storage) return { ...defaultAppSettings };
  try {
    const parsed = JSON.parse(storage.getItem(APP_SETTINGS_KEY) ?? "null") as Partial<EditorAppSettings> | null;
    if (!parsed || typeof parsed !== "object") return { ...defaultAppSettings };
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : defaultAppSettings.theme,
      showMinimap: typeof parsed.showMinimap === "boolean" ? parsed.showMinimap : defaultAppSettings.showMinimap,
      showGrid: typeof parsed.showGrid === "boolean" ? parsed.showGrid : defaultAppSettings.showGrid,
      autoFitViewOnLoad: typeof parsed.autoFitViewOnLoad === "boolean" ? parsed.autoFitViewOnLoad : defaultAppSettings.autoFitViewOnLoad,
      autosave: typeof parsed.autosave === "boolean" ? parsed.autosave : defaultAppSettings.autosave,
      inspectorPinned: typeof parsed.inspectorPinned === "boolean" ? parsed.inspectorPinned : defaultAppSettings.inspectorPinned,
      inspectorOpen: typeof parsed.inspectorOpen === "boolean" ? parsed.inspectorOpen : defaultAppSettings.inspectorOpen,
      inspectorHover: typeof parsed.inspectorHover === "boolean" ? parsed.inspectorHover : defaultAppSettings.inspectorHover,
    };
  } catch {
    return { ...defaultAppSettings };
  }
}

export function saveAppSettings(settings: EditorAppSettings, storage?: StorageLike) {
  storage?.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
}

export function resetAppSettings(storage?: StorageLike): EditorAppSettings {
  storage?.removeItem(APP_SETTINGS_KEY);
  return { ...defaultAppSettings };
}

export function resolveThemePreference(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
