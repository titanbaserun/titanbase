import type { ReferentialAction, TitanColumn, TitanEnum, TitanIndex, TitanRelation, TitanTable } from "@titanbase/core";

export const quotePostgresIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
export const postgresLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const qualifiedPostgresName = (schema: string | undefined, name: string) => schema ? `${quotePostgresIdentifier(schema)}.${quotePostgresIdentifier(name)}` : quotePostgresIdentifier(name);
export const postgresReferentialAction = (value: ReferentialAction) => value.replace("-", " ").toUpperCase();

const typeMap: Record<string, string> = {
  string: "text", text: "text", uuid: "uuid", integer: "integer", int: "integer", smallint: "smallint", bigint: "bigint", serial: "serial", bigserial: "bigserial",
  boolean: "boolean", bool: "boolean", decimal: "numeric", numeric: "numeric", real: "real", float: "double precision", "double precision": "double precision",
  date: "date", datetime: "timestamp", timestamp: "timestamp", timestamptz: "timestamptz", time: "time", timetz: "timetz", interval: "interval",
  json: "jsonb", jsonb: "jsonb", bytea: "bytea", inet: "inet", cidr: "cidr", macaddr: "macaddr", money: "money",
};

const indexMethods = new Set(["btree", "hash", "gin", "gist", "brin"]);

export interface PostgresSqlFormatResult {
  sql?: string;
  warning?: string;
}

export function postgresTypeSql(column: TitanColumn, enums: TitanEnum[]) {
  const normalizedType = column.type.toLowerCase();
  const enumName = enums.find((item) => item.name.toLowerCase() === normalizedType)?.name;
  const sql = column.nativeType ?? typeMap[normalizedType] ?? (enumName ? quotePostgresIdentifier(enumName) : "text");
  return { sql, ...(column.nativeType || typeMap[normalizedType] || enumName ? {} : { warning: `Column "${column.name}": unknown type "${column.type}"; emitted as text.` }) };
}

export function postgresColumnSql(column: TitanColumn, enums: TitanEnum[], options: { includeNotNull?: boolean; includeUnique?: boolean; includeDefault?: boolean } = {}) {
  const type = postgresTypeSql(column, enums);
  const parts = [quotePostgresIdentifier(column.name), type.sql];
  if (options.includeNotNull !== false && !column.nullable) parts.push("NOT NULL");
  if (options.includeUnique !== false && column.unique && !column.primaryKey) parts.push("UNIQUE");
  if (options.includeDefault !== false && column.default) parts.push(`DEFAULT ${column.default}`);
  return { sql: parts.join(" "), ...(type.warning ? { warning: type.warning } : {}) };
}

export function postgresCreateTableSql(table: TitanTable, enums: TitanEnum[]) {
  const warnings: string[] = [];
  const definitions = table.columns.map((column) => {
    const formatted = postgresColumnSql(column, enums);
    if (formatted.warning) warnings.push(formatted.warning);
    return `  ${formatted.sql}`;
  });
  const primaryColumns = table.columns.filter((column) => column.primaryKey).map((column) => quotePostgresIdentifier(column.name));
  if (primaryColumns.length) definitions.push(`  CONSTRAINT ${quotePostgresIdentifier(`${table.name}_pkey`)} PRIMARY KEY (${primaryColumns.join(", ")})`);
  return { sql: `CREATE TABLE ${qualifiedPostgresName(table.schema, table.name)} (\n${definitions.join(",\n")}\n);`, warnings };
}

export function postgresIndexSql(table: TitanTable, index: TitanIndex): PostgresSqlFormatResult {
  const columns = index.columns.map((columnId) => table.columns.find((column) => column.id === columnId)?.name).filter((name): name is string => Boolean(name));
  if (columns.length !== index.columns.length) return { warning: `Index "${index.name}": skipped because one or more columns are missing.` };
  const method = index.method?.toLowerCase();
  const warning = method && !indexMethods.has(method) ? `Index "${index.name}": unsupported method "${index.method}"; emitted without USING.` : undefined;
  const using = method && indexMethods.has(method) ? ` USING ${method}` : "";
  const where = index.where ? ` WHERE ${index.where}` : "";
  return { sql: `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quotePostgresIdentifier(index.name)} ON ${qualifiedPostgresName(table.schema, table.name)}${using} (${columns.map(quotePostgresIdentifier).join(", ")})${where};`, ...(warning ? { warning } : {}) };
}

export function postgresForeignKeySql(relation: TitanRelation, fromTable: TitanTable, toTable: TitanTable): PostgresSqlFormatResult {
  const fromColumns = relation.from.columns.map((id) => fromTable.columns.find((column) => column.id === id)?.name).filter((name): name is string => Boolean(name));
  const toColumns = relation.to.columns.map((id) => toTable.columns.find((column) => column.id === id)?.name).filter((name): name is string => Boolean(name));
  if (fromColumns.length !== relation.from.columns.length || toColumns.length !== relation.to.columns.length) return { warning: `Relation "${relation.name}": skipped because a referenced column is missing.` };
  const onDelete = relation.onDelete ? ` ON DELETE ${postgresReferentialAction(relation.onDelete)}` : "";
  const onUpdate = relation.onUpdate ? ` ON UPDATE ${postgresReferentialAction(relation.onUpdate)}` : "";
  return { sql: `ALTER TABLE ${qualifiedPostgresName(fromTable.schema, fromTable.name)} ADD CONSTRAINT ${quotePostgresIdentifier(relation.name)} FOREIGN KEY (${fromColumns.map(quotePostgresIdentifier).join(", ")}) REFERENCES ${qualifiedPostgresName(toTable.schema, toTable.name)} (${toColumns.map(quotePostgresIdentifier).join(", ")})${onDelete}${onUpdate};` };
}
