export type ExportTarget = "json" | "sql";

export function slugifyExportName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "titanbase-schema";
}

export function createExportFilename(projectName: string, target: ExportTarget): string {
  return `${slugifyExportName(projectName)}.${target === "sql" ? "sql" : "titan.json"}`;
}
