import type { TitanSchema } from "./types";
import { validateTitanSchema } from "./diagnostics";

export function normalizeSchema(input: unknown): TitanSchema {
  const result = validateTitanSchema(input);
  if (!result.data) {
    throw new Error(result.diagnostics.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }

  return {
    ...result.data,
    project: { id: result.data.project.id.trim(), name: result.data.project.name.trim() },
    tables: result.data.tables.map((table) => ({
      ...table,
      name: table.name.trim(),
      columns: table.columns.map((column) => ({ ...column, name: column.name.trim(), type: column.type.trim().toLowerCase() })),
      indexes: [...table.indexes].sort((a, b) => a.name.localeCompare(b.name)),
    })),
    enums: [...result.data.enums].sort((a, b) => a.name.localeCompare(b.name)),
    relations: [...result.data.relations].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
