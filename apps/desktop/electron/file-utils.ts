import { basename, extname } from "node:path";
import type { RuntimeRecentFile } from "@titanbase/editor";

export const MAX_DESKTOP_FILE_BYTES = 20 * 1024 * 1024;
export const DESKTOP_EXPORT_EXTENSIONS = new Set(["json", "sql", "mmd", "prisma", "ts"]);

export const isTitanbaseSchemaPath = (filePath: string) => filePath.toLowerCase().endsWith(".json");
export const isPostgresSqlPath = (filePath: string) => [".sql", ".psql"].includes(extname(filePath).toLowerCase());

export function validateTitanJsonContent(content: unknown) {
  if (typeof content !== "string" || content.length > MAX_DESKTOP_FILE_BYTES) return "Schema content is missing or too large.";
  try {
    const value = JSON.parse(content) as Record<string, unknown> | null;
    if (!value || typeof value !== "object" || typeof value.titanVersion !== "string" || !value.project || !Array.isArray(value.tables) || !Array.isArray(value.relations) || !Array.isArray(value.enums)) return "The selected JSON is not a Titanbase schema.";
    return undefined;
  } catch { return "Titanbase schema content is not valid JSON."; }
}

export function normalizeExportExtensions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && DESKTOP_EXPORT_EXTENSIONS.has(item));
}

export function addRecentFileEntry(files: RuntimeRecentFile[], filePath: string, timestamp: string): RuntimeRecentFile[] {
  return [{ filePath, displayName: basename(filePath), lastOpenedAt: timestamp }, ...files.filter((item) => item.filePath !== filePath)].slice(0, 10);
}
