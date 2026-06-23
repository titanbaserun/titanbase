export type TitanbaseRuntime = "web" | "desktop";
export type DesktopSourceKind = "blank" | "template" | "titan-json" | "postgres-sql";
export type DesktopMenuAction =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "import-sql"
  | "export"
  | "compare"
  | "settings"
  | "undo"
  | "redo"
  | "close-requested"
  | { type: "open-recent"; filePath: string };

export interface RuntimeFileResult {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
  content?: string;
  error?: string;
}

export interface RuntimeSaveResult {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
}

export interface RuntimeRecentFile {
  filePath: string;
  displayName: string;
  lastOpenedAt: string;
}

export interface RuntimeDocumentState {
  currentFilePath?: string;
  currentFileName?: string;
  isDirty: boolean;
  sourceKind: DesktopSourceKind;
}

export interface RuntimeExportFileArgs {
  defaultName: string;
  content: string;
  extensions: string[];
}

export interface TitanbaseFileAdapter {
  runtime: "desktop";
  openTitanJson(): Promise<RuntimeFileResult>;
  openTitanJsonAt(filePath: string): Promise<RuntimeFileResult>;
  saveTitanJson(args: { filePath: string; content: string }): Promise<RuntimeSaveResult>;
  saveTitanJsonAs(args: { defaultName: string; content: string }): Promise<RuntimeSaveResult>;
  openPostgresSql(): Promise<RuntimeFileResult>;
  compareTitanJson(): Promise<RuntimeFileResult>;
  exportFile(args: RuntimeExportFileArgs): Promise<RuntimeSaveResult>;
  readDroppedFile(file: File): Promise<RuntimeFileResult>;
  showUnsavedChangesDialog(): Promise<"save" | "discard" | "cancel">;
  getRecentFiles(): Promise<RuntimeRecentFile[]>;
  clearRecentFiles(): Promise<void>;
  updateDocumentState(state: RuntimeDocumentState): void;
  closeWindow(): void;
  openExternal(url: "https://docs.titanbase.run" | "https://github.com/titanbaserun/titanbase" | "https://www.titanbase.run"): void;
  onMenuAction(callback: (action: DesktopMenuAction) => void): () => void;
  onOpenFileFromOS(callback: (file: RuntimeFileResult) => void): () => void;
}
