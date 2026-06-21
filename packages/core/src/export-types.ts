export interface ExportFile {
  path: string;
  content: string;
}

export interface ExportWarning {
  code: string;
  message: string;
  path?: string;
}

export interface ExportResult {
  files: ExportFile[];
  warnings: ExportWarning[];
}
