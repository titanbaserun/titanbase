import type { TitanDiagnostic, TitanSchema, TitanTable } from "./types";
import { titanSchemaSchema } from "./schema";

// ---------------------------------------------------------------------------
// diagnoseSchema — validates a TitanSchema and returns all issues found.
//
// Checks performed:
// - Zod structural validation (required fields, types, constraints)
// - Duplicate table names within same schema namespace
// - Duplicate column names within a table
// - Duplicate index names within a table
// - Index references to missing columns
// - Index with duplicate columns
// - Index with unsupported method (Postgres-specific)
// - Duplicate enum names
// - Enum with duplicate values
// - Relation references to missing tables
// - Relation references to missing columns
// - Relation with mismatched column counts
// - Duplicate relation names
// - Columns referencing enum types that don't exist (warning)
// - Metadata positions referencing missing tables
// - Tables missing editor positions
// ---------------------------------------------------------------------------

const key = (table: TitanTable) => `${table.schema ?? "public"}.${table.name}`.toLowerCase();

export function diagnoseSchema(input: unknown): TitanDiagnostic[] {
  const parsed = titanSchemaSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: "schema.invalid",
      severity: "error",
      message: issue.message,
      path: issue.path.join("."),
    }));
  }

  const schema = parsed.data as TitanSchema;
  const issues: TitanDiagnostic[] = [];
  const tableIds = new Set(schema.tables.map((t) => t.id));
  const tableKeys = new Set<string>();
  const enumNames = new Set(schema.enums.map((e) => e.name.toLowerCase()));
  const relationNames = new Set<string>();
  const postgresIndexMethods = new Set(["btree", "hash", "gin", "gist", "brin"]);

  // Known column types that don't need to be enums
  const builtinTypes = new Set([
    "uuid", "text", "integer", "int", "bigint", "boolean", "bool",
    "numeric", "decimal", "date", "datetime", "timestamp", "timestamptz",
    "json", "jsonb", "string", "serial", "bigserial", "smallint",
    "real", "double precision", "float", "varchar", "char", "bytea",
    "time", "timetz", "interval", "money", "inet", "cidr", "macaddr",
  ]);

  // --- Tables ---
  for (const [index, table] of schema.tables.entries()) {
    const tablePath = `tables.${index}`;
    const namespaceKey = key(table);

    if (tableKeys.has(namespaceKey)) {
      issues.push({ code: "table.duplicate-name", severity: "error", message: `Duplicate table name "${table.name}" in schema "${table.schema ?? "public"}".`, path: `${tablePath}.name`, entityId: table.id });
    }
    tableKeys.add(namespaceKey);

    // --- Columns ---
    const columnNames = new Set<string>();
    for (const [colIndex, column] of table.columns.entries()) {
      const colPath = `${tablePath}.columns.${colIndex}`;
      const normalizedName = column.name.toLowerCase();

      if (columnNames.has(normalizedName)) {
        issues.push({ code: "column.duplicate-name", severity: "error", message: `Duplicate column name "${column.name}" in table "${table.name}".`, path: `${colPath}.name`, entityId: column.id });
      }
      columnNames.add(normalizedName);

      // Warn if column type looks like an enum reference but the enum doesn't exist
      const normalizedType = column.type.toLowerCase();
      if (!builtinTypes.has(normalizedType) && !enumNames.has(normalizedType) && !column.nativeType) {
        issues.push({ code: "column.unknown-type", severity: "warning", message: `Column "${column.name}" has type "${column.type}" which is not a built-in type or known enum.`, path: `${colPath}.type`, entityId: column.id });
      }
    }

    // --- Indexes ---
    const indexNames = new Set<string>();
    for (const [idxIndex, idx] of table.indexes.entries()) {
      const idxPath = `${tablePath}.indexes.${idxIndex}`;
      const normalizedName = idx.name.toLowerCase();

      if (indexNames.has(normalizedName)) {
        issues.push({ code: "index.duplicate-name", severity: "error", message: `Duplicate index name "${idx.name}" in table "${table.name}".`, path: `${idxPath}.name`, entityId: idx.id });
      }
      indexNames.add(normalizedName);

      if (idx.table !== table.id) {
        issues.push({ code: "index.invalid-table", severity: "error", message: `Index "${idx.name}" references table "${idx.table}" but belongs to "${table.name}".`, path: `${idxPath}.table`, entityId: idx.id });
      }

      for (const columnId of idx.columns) {
        if (!table.columns.some((c) => c.id === columnId)) {
          issues.push({ code: "index.invalid-column", severity: "error", message: `Index "${idx.name}" references missing column "${columnId}".`, path: `${idxPath}.columns`, entityId: idx.id });
        }
      }

      if (new Set(idx.columns).size !== idx.columns.length) {
        issues.push({ code: "index.duplicate-column", severity: "error", message: `Index "${idx.name}" contains the same column more than once.`, path: `${idxPath}.columns`, entityId: idx.id });
      }

      if (schema.dialect === "postgres" && idx.method && !postgresIndexMethods.has(idx.method.toLowerCase())) {
        issues.push({ code: "index.unsupported-method", severity: "error", message: `PostgreSQL does not support index method "${idx.method}".`, path: `${idxPath}.method`, entityId: idx.id });
      }
    }
  }

  // --- Enums ---
  const enumNameSet = new Set<string>();
  for (const [index, enumDef] of schema.enums.entries()) {
    const enumPath = `enums.${index}`;
    const name = enumDef.name.toLowerCase();

    if (enumNameSet.has(name)) {
      issues.push({ code: "enum.duplicate-name", severity: "error", message: `Duplicate enum name "${enumDef.name}".`, path: `${enumPath}.name`, entityId: enumDef.id });
    }
    enumNameSet.add(name);

    const values = new Set<string>();
    for (const [valIndex, value] of enumDef.values.entries()) {
      if (values.has(value)) {
        issues.push({ code: "enum.duplicate-value", severity: "error", message: `Enum "${enumDef.name}" contains duplicate value "${value}".`, path: `${enumPath}.values.${valIndex}`, entityId: enumDef.id });
      }
      values.add(value);
    }
  }

  // --- Relations ---
  const tableById = new Map(schema.tables.map((t) => [t.id, t]));
  for (const [index, relation] of schema.relations.entries()) {
    const relPath = `relations.${index}`;
    const relName = relation.name.toLowerCase();

    if (relationNames.has(relName)) {
      issues.push({ code: "relation.duplicate-name", severity: "error", message: `Duplicate relation name "${relation.name}".`, path: `${relPath}.name`, entityId: relation.id });
    }
    relationNames.add(relName);

    for (const side of ["from", "to"] as const) {
      const endpoint = relation[side];
      const table = tableById.get(endpoint.table);

      if (!table) {
        issues.push({ code: "relation.invalid-table", severity: "error", message: `Relation "${relation.name}" references missing table "${endpoint.table}" on ${side} side.`, path: `${relPath}.${side}.table`, entityId: relation.id });
        continue;
      }

      for (const columnId of endpoint.columns) {
        if (!table.columns.some((c) => c.id === columnId)) {
          issues.push({ code: "relation.invalid-column", severity: "error", message: `Relation "${relation.name}" references missing column "${columnId}" in table "${table.name}".`, path: `${relPath}.${side}.columns`, entityId: relation.id });
        }
      }
    }

    if (relation.from.columns.length !== relation.to.columns.length) {
      issues.push({ code: "relation.column-count", severity: "error", message: `Relation "${relation.name}" must have the same number of columns on each side.`, path: `${relPath}`, entityId: relation.id });
    }
  }

  // --- Metadata ---
  for (const tableId of Object.keys(schema.metadata.editor.tablePositions)) {
    if (!tableIds.has(tableId)) {
      issues.push({ code: "metadata.invalid-table", severity: "error", message: `Editor position references missing table "${tableId}".`, path: `metadata.editor.tablePositions.${tableId}` });
    }
  }

  for (const table of schema.tables) {
    if (!schema.metadata.editor.tablePositions[table.id]) {
      issues.push({ code: "metadata.missing-position", severity: "warning", message: `Table "${table.name}" has no saved editor position.`, path: `metadata.editor.tablePositions.${table.id}`, entityId: table.id });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// validateTitanSchema — parse + diagnose in one call
// ---------------------------------------------------------------------------

export function validateTitanSchema(input: unknown) {
  const parsed = titanSchemaSchema.safeParse(input);
  const diagnostics = diagnoseSchema(input);
  return {
    success: parsed.success && diagnostics.every((d) => d.severity !== "error"),
    data: parsed.success ? (parsed.data as TitanSchema) : undefined,
    diagnostics,
  };
}
