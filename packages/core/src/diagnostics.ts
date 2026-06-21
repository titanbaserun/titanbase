import type { ZodIssue } from "zod";
import { titanSchemaSchema } from "./schema";
import { TITAN_VERSION, type TitanColumn, type TitanDiagnostic, type TitanSchema, type TitanTable } from "./types";

const postgresIndexMethods = new Set(["btree", "hash", "gin", "gist", "brin"]);
const mysqlIndexMethods = new Set(["btree", "hash"]);
const simpleIdentifier = /^[a-z_][a-z0-9_]*$/;
const invalidIdentifier = /[\u0000-\u001f\u007f]/;

const commonTypes = new Set([
  "uuid", "text", "integer", "int", "bigint", "boolean", "bool", "numeric", "decimal",
  "date", "datetime", "timestamp", "timestamptz", "json", "jsonb", "string", "smallint",
  "real", "double precision", "float", "varchar", "character varying", "char", "bytes", "bytea",
]);
const postgresTypes = new Set([
  ...commonTypes, "serial", "bigserial", "time", "timetz", "interval", "money", "inet", "cidr", "macaddr",
]);
const mysqlTypes = new Set([...commonTypes, "tinyint", "mediumint", "longtext", "mediumtext", "blob"]);
const sqliteTypes = new Set([...commonTypes, "blob"]);

const pathString = (path: PropertyKey[]) => path.map(String).join(".");
const baseType = (value: string) => value.trim().toLowerCase().replace(/\s*\(.*/, "");
const tableKey = (table: TitanTable) => `${table.schema ?? "public"}.${table.name}`.toLowerCase();
const sameColumns = (left: string[], right: string[]) => left.length === right.length && left.every((id, index) => id === right[index]);

function structuralDiagnostic(issue: ZodIssue): TitanDiagnostic {
  const path = pathString(issue.path);
  const segments = issue.path.map(String);
  const root = segments[0];
  let code = "schema.invalid";
  let message = issue.message;
  let entityType: TitanDiagnostic["entityType"];

  if (root === "titanVersion") {
    code = "project.unsupported-version";
    message = `Unsupported or missing titanVersion. Expected "${TITAN_VERSION}".`;
    entityType = "project";
  } else if (root === "project" && segments[1] === "id") {
    code = "project.missing-id";
    message = "Project id is required.";
    entityType = "project";
  } else if (root === "project" && segments[1] === "name") {
    code = "project.missing-name";
    message = "Project name is required.";
    entityType = "project";
  } else if (root === "dialect") {
    code = "project.unsupported-dialect";
    message = "Dialect must be postgres, mysql, sqlite, or generic.";
    entityType = "project";
  } else if (root === "tables" && segments[2] === "id") {
    code = "table.missing-id";
    message = "Table id is required.";
    entityType = "table";
  } else if (root === "tables" && segments[2] === "name") {
    code = "table.missing-name";
    message = "Table name is required.";
    entityType = "table";
  } else if (root === "tables" && segments[2] === "columns" && segments[3] !== undefined) {
    const field = segments[4] ?? "";
    entityType = "column";
    if (field === "name") { code = "column.missing-name"; message = "Column name is required."; }
    if (field === "type") { code = "column.missing-type"; message = "Column type is required."; }
  } else if (root === "tables" && segments[2] === "indexes" && segments[3] !== undefined) {
    const field = segments[4] ?? "";
    entityType = "index";
    if (field === "name") { code = "index.missing-name"; message = "Index name is required."; }
    if (field === "columns") { code = "index.no-columns"; message = "Index must include at least one column."; }
  } else if (root === "enums") {
    entityType = "enum";
    if (segments[2] === "name") { code = "enum.missing-name"; message = "Enum name is required."; }
    if (segments[2] === "values" && segments[3] === undefined) { code = "enum.no-values"; message = "Enum must contain at least one value."; }
    if (segments[2] === "values" && segments[3] !== undefined) { code = "enum.empty-value"; message = "Enum values cannot be empty."; }
  } else if (root === "relations") {
    entityType = "relation";
    if (segments[2] === "name") { code = "relation.missing-name"; message = "Relation name is required."; }
    if (segments[2] === "cardinality") { code = "relation.invalid-cardinality"; message = "Relation cardinality is missing or unsupported."; }
    if (segments[2] === "from" && segments[3] === "columns") { code = "relation.no-source-columns"; message = "Relation must include at least one source column."; }
    if (segments[2] === "to" && segments[3] === "columns") { code = "relation.no-target-columns"; message = "Relation must include at least one target column."; }
  }

  return { code, severity: "error", message, path, ...(entityType ? { entityType } : {}) };
}

function tableContext(table: TitanTable) {
  return { entityId: table.id, entityType: "table" as const, tableId: table.id };
}

function columnContext(table: TitanTable, column: TitanColumn) {
  return { entityId: column.id, entityType: "column" as const, tableId: table.id, columnId: column.id };
}

function columnsAreUnique(table: TitanTable, columnIds: string[]) {
  const primaryColumns = table.columns.filter((column) => column.primaryKey).map((column) => column.id);
  if (sameColumns(primaryColumns, columnIds)) return true;
  if (columnIds.length === 1 && table.columns.some((column) => column.id === columnIds[0] && column.unique)) return true;
  return table.indexes.some((index) => index.unique && sameColumns(index.columns, columnIds));
}

function columnsAreIndexed(table: TitanTable, columnIds: string[]) {
  if (columnsAreUnique(table, columnIds)) return true;
  return table.indexes.some((index) => columnIds.every((columnId, offset) => index.columns[offset] === columnId));
}

function typeSetForDialect(dialect: TitanSchema["dialect"]) {
  if (dialect === "postgres") return postgresTypes;
  if (dialect === "mysql") return mysqlTypes;
  if (dialect === "sqlite") return sqliteTypes;
  return commonTypes;
}

function defaultMatchesType(column: TitanColumn, enumValues?: Set<string>) {
  if (!column.default) return true;
  const value = column.default.trim();
  const type = baseType(column.nativeType ?? column.type);
  const quoted = value.match(/^'(.*)'$/s)?.[1]?.replaceAll("''", "'");
  if (enumValues) return quoted !== undefined && enumValues.has(quoted);
  if (["boolean", "bool"].includes(type)) return /^(true|false)$/i.test(value);
  if (["integer", "int", "smallint", "bigint", "serial", "bigserial", "numeric", "decimal", "float", "real", "double precision"].includes(type)) return /^-?\d+(?:\.\d+)?$/.test(value);
  if (["timestamp", "timestamptz", "datetime", "date", "time", "timetz"].includes(type)) return /^(now\(\)|current_timestamp|'[^']+')$/i.test(value);
  if (type === "uuid") return /^(gen_random_uuid\(\)|uuid_generate_v4\(\)|uuid\(\)|'[^']+')$/i.test(value);
  if (["text", "string", "varchar", "character varying", "char", "json", "jsonb"].includes(type)) return quoted !== undefined;
  return true;
}

export function diagnoseSchema(input: unknown): TitanDiagnostic[] {
  const parsed = titanSchemaSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map(structuralDiagnostic);

  const schema = parsed.data as TitanSchema;
  const issues: TitanDiagnostic[] = [];
  const tableById = new Map(schema.tables.map((table) => [table.id, table]));
  const tableIds = new Set<string>();
  const tableNames = new Set<string>();
  const columnIds = new Set<string>();
  const relationIds = new Set<string>();
  const relationNames = new Set<string>();
  const indexIds = new Set<string>();
  const enumIds = new Set<string>();
  const enumNames = new Set<string>();
  const enumByName = new Map(schema.enums.map((item) => [item.name.toLowerCase(), item]));
  const invalidEnums = new Set<string>();
  const usedEnumNames = new Set(schema.tables.flatMap((table) => table.columns.map((column) => baseType(column.type))));
  const supportedTypes = typeSetForDialect(schema.dialect);

  for (const item of schema.enums) {
    const name = item.name.toLowerCase();
    if (enumNames.has(name) || new Set(item.values).size !== item.values.length || invalidIdentifier.test(item.name)) invalidEnums.add(name);
    enumNames.add(name);
  }

  for (const [tableIndex, table] of schema.tables.entries()) {
    const tablePath = `tables.${tableIndex}`;
    const context = tableContext(table);
    if (tableIds.has(table.id)) issues.push({ code: "table.duplicate-id", severity: "error", message: `Duplicate table id "${table.id}".`, path: `${tablePath}.id`, ...context });
    tableIds.add(table.id);
    const namespaceKey = tableKey(table);
    if (tableNames.has(namespaceKey)) issues.push({ code: "table.duplicate-name", severity: "error", message: `Duplicate table name "${table.name}" in schema "${table.schema ?? "public"}".`, path: `${tablePath}.name`, ...context });
    tableNames.add(namespaceKey);
    if (invalidIdentifier.test(table.name)) issues.push({ code: "table.invalid-name", severity: "error", message: `Table "${table.name}" contains control characters.`, path: `${tablePath}.name`, ...context });
    else if (!simpleIdentifier.test(table.name)) issues.push({ code: "table.unsafe-name", severity: "warning", message: `Table name "${table.name}" may require SQL quoting and ORM name mapping.`, path: `${tablePath}.name`, help: "Prefer lowercase snake_case for the most portable exports.", ...context });
    if (!table.description) issues.push({ code: "table.missing-description", severity: "warning", message: `Table "${table.name}" has no description.`, path: `${tablePath}.description`, help: "Add a short purpose statement for future readers.", ...context });
    if (!table.columns.length) issues.push({ code: "table.no-columns", severity: "warning", message: `Table "${table.name}" has no columns.`, path: `${tablePath}.columns`, ...context });
    else if (!table.columns.some((column) => column.primaryKey)) issues.push({ code: "table.no-primary-key", severity: "warning", message: `Table "${table.name}" has no primary key.`, path: `${tablePath}.columns`, help: "A primary key improves relation safety and row identity.", ...context });
    if (table.columns.length > 30) issues.push({ code: "table.many-columns", severity: "warning", message: `Table "${table.name}" has ${table.columns.length} columns and may be difficult to maintain.`, path: `${tablePath}.columns`, ...context });

    const columnNames = new Set<string>();
    for (const [columnIndex, column] of table.columns.entries()) {
      const columnPath = `${tablePath}.columns.${columnIndex}`;
      const columnCtx = columnContext(table, column);
      const normalizedName = column.name.toLowerCase();
      if (columnIds.has(column.id)) issues.push({ code: "column.duplicate-id", severity: "error", message: `Duplicate column id "${column.id}".`, path: `${columnPath}.id`, ...columnCtx });
      columnIds.add(column.id);
      if (columnNames.has(normalizedName)) issues.push({ code: "column.duplicate-name", severity: "error", message: `Duplicate column name "${column.name}" in table "${table.name}".`, path: `${columnPath}.name`, ...columnCtx });
      columnNames.add(normalizedName);
      if (invalidIdentifier.test(column.name)) issues.push({ code: "column.invalid-name", severity: "error", message: `Column "${column.name}" contains control characters.`, path: `${columnPath}.name`, ...columnCtx });
      else if (!simpleIdentifier.test(column.name)) issues.push({ code: "column.unsafe-name", severity: "warning", message: `Column name "${column.name}" may require SQL quoting and ORM name mapping.`, path: `${columnPath}.name`, help: "Prefer lowercase snake_case for portable generated fields.", ...columnCtx });
      if (column.primaryKey && column.nullable) issues.push({ code: "column.nullable-primary-key", severity: "error", message: `Primary key column "${table.name}.${column.name}" cannot be nullable.`, path: `${columnPath}.nullable`, ...columnCtx });
      if (column.unique && column.nullable) issues.push({ code: "column.nullable-unique", severity: "warning", message: `Unique nullable column "${table.name}.${column.name}" may allow multiple NULL values depending on the database.`, path: `${columnPath}.unique`, ...columnCtx });

      const normalizedType = baseType(column.type);
      const enumDefinition = enumByName.get(normalizedType);
      if (!supportedTypes.has(normalizedType) && !enumDefinition && !column.nativeType) {
        const enumLike = normalizedType.endsWith("_enum") || normalizedType.startsWith("enum:");
        issues.push({ code: enumLike ? "column.missing-enum" : "column.unknown-type", severity: enumLike ? "error" : "warning", message: enumLike ? `Column "${table.name}.${column.name}" references missing enum "${column.type}".` : `Column "${table.name}.${column.name}" uses type "${column.type}" which is not known for ${schema.dialect}.`, path: `${columnPath}.type`, help: "Use a built-in type, an existing enum name, or set nativeType intentionally.", ...columnCtx });
      } else if (enumDefinition && invalidEnums.has(normalizedType)) {
        issues.push({ code: "column.invalid-enum", severity: "error", message: `Column "${table.name}.${column.name}" references enum "${enumDefinition.name}" which has validation errors.`, path: `${columnPath}.type`, ...columnCtx });
      }

      const enumValues = enumDefinition ? new Set(enumDefinition.values) : undefined;
      if (column.default && !defaultMatchesType(column, enumValues)) {
        const severity = column.primaryKey ? "error" : "warning";
        issues.push({ code: column.primaryKey ? "column.primary-key-default" : "column.default-type-mismatch", severity, message: `Default ${JSON.stringify(column.default)} may not be valid for ${table.name}.${column.name} (${column.type}).`, path: `${columnPath}.default`, help: "Use a literal or function compatible with the column type.", ...columnCtx });
      }
      if (column.default && /^(gen_random_uuid\(\)|uuid_generate_v4\(\))$/i.test(column.default) && schema.dialect !== "postgres") issues.push({ code: "column.dialect-default", severity: "warning", message: `Default "${column.default}" is PostgreSQL-specific but the project dialect is ${schema.dialect}.`, path: `${columnPath}.default`, ...columnCtx });
      if (schema.dialect === "mysql" && /^(varchar|character varying)$/i.test(column.type.trim())) issues.push({ code: "column.varchar-length", severity: "warning", message: `MySQL varchar column "${table.name}.${column.name}" should declare a length.`, path: `${columnPath}.type`, ...columnCtx });
    }

    const indexNames = new Set<string>();
    const indexSignatures = new Set<string>();
    for (const [indexPosition, index] of table.indexes.entries()) {
      const indexPath = `${tablePath}.indexes.${indexPosition}`;
      const indexContext = { entityId: index.id, entityType: "index" as const, tableId: table.id, indexId: index.id };
      if (indexIds.has(index.id)) issues.push({ code: "index.duplicate-id", severity: "error", message: `Duplicate index id "${index.id}".`, path: `${indexPath}.id`, ...indexContext });
      indexIds.add(index.id);
      const normalizedName = index.name.toLowerCase();
      if (indexNames.has(normalizedName)) issues.push({ code: "index.duplicate-name", severity: "error", message: `Duplicate index name "${index.name}" in table "${table.name}".`, path: `${indexPath}.name`, ...indexContext });
      indexNames.add(normalizedName);
      if (index.table !== table.id) issues.push({ code: "index.invalid-table", severity: "error", message: `Index "${index.name}" references table "${index.table}" but belongs to "${table.name}".`, path: `${indexPath}.table`, ...indexContext });
      if (new Set(index.columns).size !== index.columns.length) issues.push({ code: "index.duplicate-column", severity: "error", message: `Index "${index.name}" contains the same column more than once.`, path: `${indexPath}.columns`, ...indexContext });
      for (const columnId of index.columns) if (!table.columns.some((column) => column.id === columnId)) issues.push({ code: "index.invalid-column", severity: "error", message: `Index "${index.name}" references missing column "${columnId}".`, path: `${indexPath}.columns`, ...indexContext });
      const signature = index.columns.join("\u0000");
      if (indexSignatures.has(signature)) issues.push({ code: "index.duplicate-definition", severity: "warning", message: `Table "${table.name}" has multiple indexes on the same ordered columns.`, path: `${indexPath}.columns`, ...indexContext });
      indexSignatures.add(signature);
      if (index.unique && index.columns.length === 1 && table.columns.some((column) => column.id === index.columns[0] && column.unique)) issues.push({ code: "index.redundant-unique", severity: "warning", message: `Unique index "${index.name}" duplicates the unique constraint on its column.`, path: `${indexPath}.unique`, ...indexContext });
      if (index.where && schema.dialect !== "postgres") issues.push({ code: "index.partial-dialect", severity: "warning", message: `Partial index "${index.name}" is PostgreSQL-specific and may not export to ${schema.dialect}.`, path: `${indexPath}.where`, ...indexContext });
      const allowedMethods = schema.dialect === "postgres" ? postgresIndexMethods : schema.dialect === "mysql" ? mysqlIndexMethods : new Set(["btree"]);
      if (index.method && !allowedMethods.has(index.method.toLowerCase())) issues.push({ code: "index.unsupported-method", severity: "warning", message: `Index method "${index.method}" is not supported for ${schema.dialect}.`, path: `${indexPath}.method`, ...indexContext });
      if (index.name.length > 63) issues.push({ code: "index.long-name", severity: "warning", message: `Index name "${index.name}" exceeds PostgreSQL's common 63-byte identifier limit.`, path: `${indexPath}.name`, ...indexContext });
    }
  }

  for (const [enumIndex, enumDefinition] of schema.enums.entries()) {
    const enumPath = `enums.${enumIndex}`;
    const context = { entityId: enumDefinition.id, entityType: "enum" as const, enumId: enumDefinition.id };
    const normalizedName = enumDefinition.name.toLowerCase();
    if (enumIds.has(enumDefinition.id)) issues.push({ code: "enum.duplicate-id", severity: "error", message: `Duplicate enum id "${enumDefinition.id}".`, path: `${enumPath}.id`, ...context });
    enumIds.add(enumDefinition.id);
    if ([...schema.enums.slice(0, enumIndex)].some((item) => item.name.toLowerCase() === normalizedName)) issues.push({ code: "enum.duplicate-name", severity: "error", message: `Duplicate enum name "${enumDefinition.name}".`, path: `${enumPath}.name`, ...context });
    if (invalidIdentifier.test(enumDefinition.name)) issues.push({ code: "enum.invalid-name", severity: "error", message: `Enum "${enumDefinition.name}" contains control characters.`, path: `${enumPath}.name`, ...context });
    else if (!simpleIdentifier.test(enumDefinition.name)) issues.push({ code: "enum.unsafe-name", severity: "warning", message: `Enum name "${enumDefinition.name}" may require mapping in generated schemas.`, path: `${enumPath}.name`, ...context });
    const values = new Set<string>();
    for (const [valueIndex, value] of enumDefinition.values.entries()) {
      if (values.has(value)) issues.push({ code: "enum.duplicate-value", severity: "error", message: `Enum "${enumDefinition.name}" contains duplicate value "${value}".`, path: `${enumPath}.values.${valueIndex}`, ...context });
      values.add(value);
      if (!simpleIdentifier.test(value)) issues.push({ code: "enum.unsafe-value", severity: "warning", message: `Enum value "${value}" may require mapping in Prisma or Drizzle.`, path: `${enumPath}.values.${valueIndex}`, ...context });
    }
    if (!usedEnumNames.has(normalizedName)) issues.push({ code: "enum.unused", severity: "warning", message: `Enum "${enumDefinition.name}" is not used by any column.`, path: enumPath, ...context });
    if (enumDefinition.values.length > 50) issues.push({ code: "enum.many-values", severity: "warning", message: `Enum "${enumDefinition.name}" has ${enumDefinition.values.length} values and may be better modeled as a table.`, path: `${enumPath}.values`, ...context });
  }

  for (const [relationIndex, relation] of schema.relations.entries()) {
    const relationPath = `relations.${relationIndex}`;
    const context = { entityId: relation.id, entityType: "relation" as const, relationId: relation.id };
    if (relationIds.has(relation.id)) issues.push({ code: "relation.duplicate-id", severity: "error", message: `Duplicate relation id "${relation.id}".`, path: `${relationPath}.id`, ...context });
    relationIds.add(relation.id);
    const normalizedName = relation.name.toLowerCase();
    if (relationNames.has(normalizedName)) issues.push({ code: "relation.duplicate-name", severity: "error", message: `Duplicate relation name "${relation.name}".`, path: `${relationPath}.name`, ...context });
    relationNames.add(normalizedName);
    const fromTable = tableById.get(relation.from.table);
    const toTable = tableById.get(relation.to.table);
    if (!fromTable) issues.push({ code: "relation.invalid-table", severity: "error", message: `Relation "${relation.name}" references missing source table "${relation.from.table}".`, path: `${relationPath}.from.table`, tableId: relation.from.table, ...context });
    if (!toTable) issues.push({ code: "relation.invalid-table", severity: "error", message: `Relation "${relation.name}" references missing target table "${relation.to.table}".`, path: `${relationPath}.to.table`, tableId: relation.to.table, ...context });
    const fromColumns = relation.from.columns.map((id) => fromTable?.columns.find((column) => column.id === id));
    const toColumns = relation.to.columns.map((id) => toTable?.columns.find((column) => column.id === id));
    for (const [position, column] of fromColumns.entries()) {
      const columnId = relation.from.columns[position];
      if (!column && fromTable && columnId) issues.push({ code: "relation.invalid-column", severity: "error", message: `Relation "${relation.name}" references missing source column "${columnId}".`, path: `${relationPath}.from.columns.${position}`, tableId: fromTable.id, columnId, ...context });
    }
    for (const [position, column] of toColumns.entries()) {
      const columnId = relation.to.columns[position];
      if (!column && toTable && columnId) issues.push({ code: "relation.invalid-column", severity: "error", message: `Relation "${relation.name}" references missing target column "${columnId}".`, path: `${relationPath}.to.columns.${position}`, tableId: toTable.id, columnId, ...context });
    }
    if (relation.from.columns.length !== relation.to.columns.length) issues.push({ code: "relation.column-count", severity: "error", message: `Relation "${relation.name}" must have the same number of source and target columns.`, path: relationPath, ...context });
    if (fromTable && toTable && fromColumns.every(Boolean) && toColumns.every(Boolean) && relation.from.columns.length === relation.to.columns.length) {
      for (let position = 0; position < fromColumns.length; position++) {
        const source = fromColumns[position]!;
        const target = toColumns[position]!;
        if (baseType(source.nativeType ?? source.type) !== baseType(target.nativeType ?? target.type)) issues.push({ code: "relation.type-mismatch", severity: "error", message: `Relation "${relation.name}" connects incompatible types ${fromTable.name}.${source.name} (${source.type}) and ${toTable.name}.${target.name} (${target.type}).`, path: relationPath, tableId: fromTable.id, columnId: source.id, ...context });
      }
      if (!columnsAreUnique(toTable, relation.to.columns)) issues.push({ code: "relation.non-unique-target", severity: "error", message: `Relation "${relation.name}" targets columns that are not a primary key or unique constraint.`, path: `${relationPath}.to.columns`, tableId: toTable.id, help: "Reference a primary key or add a unique constraint to the target columns.", ...context });
      if (!columnsAreIndexed(fromTable, relation.from.columns)) issues.push({ code: "relation.unindexed-foreign-key", severity: "warning", message: `Foreign key columns for relation "${relation.name}" are not indexed in table "${fromTable.name}".`, path: `${relationPath}.from.columns`, tableId: fromTable.id, ...(relation.from.columns[0] ? { columnId: relation.from.columns[0] } : {}), help: "Add an index beginning with the foreign key columns.", ...context });
      const sourceIsNullable = fromColumns.every((column) => column!.nullable);
      if (!sourceIsNullable && relation.onDelete === "set-null") issues.push({ code: "relation.set-null-non-nullable", severity: "warning", message: `Relation "${relation.name}" uses ON DELETE SET NULL but its foreign key columns are not nullable.`, path: `${relationPath}.onDelete`, tableId: fromTable.id, ...context });
      if (!sourceIsNullable && relation.onUpdate === "set-null") issues.push({ code: "relation.set-null-non-nullable", severity: "warning", message: `Relation "${relation.name}" uses ON UPDATE SET NULL but its foreign key columns are not nullable.`, path: `${relationPath}.onUpdate`, tableId: fromTable.id, ...context });
    }
    if (relation.cardinality === "many-to-many") issues.push({ code: "relation.many-to-many", severity: "warning", message: `Many-to-many relation "${relation.name}" should usually be modeled with an explicit join table for portable exports.`, path: `${relationPath}.cardinality`, ...context });
    if (relation.from.columns.length > 1) issues.push({ code: "relation.composite-portability", severity: "info", message: `Composite relation "${relation.name}" may require manual adjustments in some ORM exporters.`, path: relationPath, ...context });
  }

  for (const tableId of Object.keys(schema.metadata.editor.tablePositions).sort()) {
    if (!tableById.has(tableId)) issues.push({ code: "metadata.invalid-table", severity: "warning", message: `Editor position references missing table "${tableId}".`, path: `metadata.editor.tablePositions.${tableId}`, entityType: "metadata", tableId, help: "Remove the stale table position from editor metadata." });
  }
  for (const table of schema.tables) if (!schema.metadata.editor.tablePositions[table.id]) issues.push({ code: "metadata.missing-position", severity: "warning", message: `Table "${table.name}" has no saved editor position.`, path: `metadata.editor.tablePositions.${table.id}`, ...tableContext(table) });

  return issues;
}

export function validateTitanSchema(input: unknown) {
  const parsed = titanSchemaSchema.safeParse(input);
  const diagnostics = diagnoseSchema(input);
  return {
    success: parsed.success && diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    data: parsed.success ? (parsed.data as TitanSchema) : undefined,
    diagnostics,
  };
}
