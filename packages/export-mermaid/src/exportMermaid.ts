import type { ExportResult, ExportWarning, RelationCardinality, TitanSchema } from "@titanbase/core";
import type { MermaidExportOptions } from "./types";

const cardinalityMap: Record<RelationCardinality, string> = {
  "one-to-one": "||--||",
  "one-to-many": "||--o{",
  "many-to-one": "}o--||",
  "many-to-many": "}o--o{",
};

function sanitizeIdentifier(value: string, prefix = "item") {
  const sanitized = value.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_");
  const nonEmpty = sanitized || prefix;
  return /^[A-Za-z_]/.test(nonEmpty) ? nonEmpty : `${prefix}_${nonEmpty}`;
}

function uniqueName(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

const escapeLabel = (value: string) => value.replaceAll('"', "'").replaceAll("\n", " ");

export function exportMermaid(schema: TitanSchema, options: MermaidExportOptions = {}): ExportResult {
  const warnings: ExportWarning[] = [];
  const includeColumnKeys = options.includeColumnKeys ?? true;
  const tableById = new Map(schema.tables.map((table) => [table.id, table]));
  const tableIdentifiers = new Map<string, string>();
  const usedTableIdentifiers = new Set<string>();
  for (const table of schema.tables) {
    const base = sanitizeIdentifier(table.name, "table");
    const identifier = uniqueName(base, usedTableIdentifiers);
    tableIdentifiers.set(table.id, identifier);
    if (identifier !== base) warnings.push({ code: "MERMAID_IDENTIFIER_COLLISION", message: `Table "${table.name}" was renamed to "${identifier}" to avoid a Mermaid identifier collision.`, path: `tables.${table.id}.name` });
  }
  const fkColumns = new Set(schema.relations.flatMap((relation) => relation.from.columns));
  const uniqueIndexColumns = new Set(schema.tables.flatMap((table) => table.indexes.filter((index) => index.unique && index.columns.length === 1).flatMap((index) => index.columns)));
  const lines: string[] = ["erDiagram"];

  for (const table of schema.tables) {
    const tableName = tableIdentifiers.get(table.id)!;
    const usedColumnIdentifiers = new Set<string>();
    lines.push(`  ${tableName} {`);
    for (const column of table.columns) {
      const type = sanitizeIdentifier(column.nativeType ?? column.type, "type");
      const name = uniqueName(sanitizeIdentifier(column.name, "column"), usedColumnIdentifiers);
      const keys: string[] = [];
      if (includeColumnKeys && column.primaryKey) keys.push("PK");
      if (includeColumnKeys && fkColumns.has(column.id)) keys.push("FK");
      if (includeColumnKeys && (column.unique || uniqueIndexColumns.has(column.id)) && !column.primaryKey) keys.push("UK");
      lines.push(`    ${type} ${name}${keys.length ? ` ${keys.join(", ")}` : ""}`);
    }
    lines.push("  }", "");

    for (const index of table.indexes) {
      if (index.columns.length > 1) {
        warnings.push({ code: "MERMAID_COMPLEX_INDEX", message: `Index "${index.name}" spans multiple columns and is not represented in Mermaid.`, path: `tables.${table.id}.indexes.${index.id}` });
      }
      if (index.where) {
        warnings.push({ code: "MERMAID_PARTIAL_INDEX", message: `Partial index "${index.name}" is not represented in Mermaid.`, path: `tables.${table.id}.indexes.${index.id}` });
      }
      if (index.method && index.method.toLowerCase() !== "btree") {
        warnings.push({ code: "MERMAID_INDEX_METHOD", message: `Index method "${index.method}" on "${index.name}" is not represented in Mermaid.`, path: `tables.${table.id}.indexes.${index.id}` });
      }
    }
  }

  for (const relation of schema.relations) {
    const fromTable = tableById.get(relation.from.table);
    const toTable = tableById.get(relation.to.table);
    if (!fromTable || !toTable) {
      warnings.push({ code: "MERMAID_RELATION_TABLE", message: `Relation "${relation.name}" references a missing table and was skipped.`, path: `relations.${relation.id}` });
      continue;
    }

    const fromColumns = relation.from.columns.map((id) => fromTable.columns.find((column) => column.id === id));
    const toColumns = relation.to.columns.map((id) => toTable.columns.find((column) => column.id === id));
    if (fromColumns.some((column) => !column) || toColumns.some((column) => !column)) {
      warnings.push({ code: "MERMAID_RELATION_COLUMN", message: `Relation "${relation.name}" references a missing column; the table-level relation was still exported.`, path: `relations.${relation.id}` });
    }

    const connector = cardinalityMap[relation.cardinality] ?? "||--o{";
    if (!cardinalityMap[relation.cardinality]) {
      warnings.push({ code: "MERMAID_CARDINALITY", message: `Relation "${relation.name}" has unsupported cardinality; one-to-many was used.`, path: `relations.${relation.id}` });
    }
    const fallbackColumn = fromColumns[0]?.name ?? relation.from.columns[0] ?? "relation";
    const fallbackLabel = `${fallbackColumn}_to_${toTable.name}`;
    const label = escapeLabel(relation.name || fallbackLabel);
    lines.push(`  ${tableIdentifiers.get(fromTable.id)} ${connector} ${tableIdentifiers.get(toTable.id)} : "${label}"`);
  }

  const content = `${lines.join("\n").trimEnd()}\n`;
  return { files: [{ path: "schema.mmd", content }], warnings };
}
