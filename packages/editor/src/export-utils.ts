export type ExportTarget = "json" | "sql" | "mermaid" | "prisma" | "drizzle";

export function slugifyExportName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "titanbase-schema";
}

export function createExportFilename(projectName: string, target: ExportTarget): string {
  const slug = slugifyExportName(projectName);
  const filenames: Record<ExportTarget, string> = {
    json: `${slug}.titan.json`,
    sql: `${slug}.sql`,
    mermaid: `${slug}.mmd`,
    prisma: "schema.prisma",
    drizzle: "schema.ts",
  };
  return filenames[target];
}
