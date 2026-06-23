export type DesktopFileState = {
  currentFilePath?: string;
  currentFileName?: string;
  isDirty: boolean;
  lastSavedAt?: string;
  sourceKind?: "blank" | "template" | "titan-json" | "postgres-sql";
};

export const createDesktopFileState = (): DesktopFileState => ({ isDirty: false, sourceKind: "blank" });

export const openedTitanFileState = (filePath: string, fileName: string): DesktopFileState => ({ currentFilePath: filePath, currentFileName: fileName, isDirty: false, sourceKind: "titan-json" });

export const importedSqlFileState = (suggestedName: string): DesktopFileState => ({ currentFileName: suggestedName, isDirty: true, sourceKind: "postgres-sql" });

export const savedTitanFileState = (filePath: string, fileName: string, lastSavedAt: string): DesktopFileState => ({ currentFilePath: filePath, currentFileName: fileName, isDirty: false, lastSavedAt, sourceKind: "titan-json" });
