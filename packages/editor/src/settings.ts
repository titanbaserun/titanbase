export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface EditorAppSettings {
  theme: ThemePreference;
  showMinimap: boolean;
  showGrid: boolean;
  autoFitViewOnLoad: boolean;
  autosave: boolean;
  inspectorPinned: boolean;
  inspectorOpen: boolean;
  inspectorHover: boolean;
}

export const fallbackEditorSettings: EditorAppSettings = {
  theme: "light",
  showMinimap: true,
  showGrid: true,
  autoFitViewOnLoad: true,
  autosave: true,
  inspectorPinned: true,
  inspectorOpen: true,
  inspectorHover: true,
};
