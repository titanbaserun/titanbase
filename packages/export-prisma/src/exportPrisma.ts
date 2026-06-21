import type { ExportResult, ExportWarning, ReferentialAction, TitanColumn, TitanSchema, TitanTable } from "@titanbase/core";
import type { PrismaExportOptions } from "./types";

const words = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .split(/[^A-Za-z0-9]+/)
  .filter(Boolean);

const toPascalCase = (value: string) => words(value).map((word) => word[0]!.toUpperCase() + word.slice(1)).join("") || "Model";
const toCamelCase = (value: string) => {
  const pascal = toPascalCase(value);
  return `${pascal[0]!.toLowerCase()}${pascal.slice(1)}`;
};
const prismaReservedWords = new Set([
  "model", "enum", "type", "datasource", "generator", "default", "true", "false", "null",
  "string", "boolean", "int", "bigint", "float", "decimal", "datetime", "json", "bytes", "unsupported",
]);
const sanitizeIdentifier = (value: string, fallback: string) => {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "_");
  const nonEmpty = cleaned || fallback;
  const validStart = /^[A-Za-z]/.test(nonEmpty) ? nonEmpty : `${fallback}_${nonEmpty}`;
  return prismaReservedWords.has(validStart.toLowerCase()) ? `${validStart}_` : validStart;
};
const quote = (value: string) => JSON.stringify(value);
const baseType = (value: string) => value.trim().toLowerCase().replace(/\s*\(.*/, "");

const referentialAction: Record<ReferentialAction, string> = {
  cascade: "Cascade",
  restrict: "Restrict",
  "set-null": "SetNull",
  "set-default": "SetDefault",
  "no-action": "NoAction",
};

interface PrismaType {
  scalar: string;
  native?: string;
}

function mapType(column: TitanColumn, enumTypes: Map<string, string>, warnings: ExportWarning[], path: string): PrismaType {
  const raw = column.nativeType ?? column.type;
  const normalized = baseType(raw);
  const enumType = enumTypes.get(normalized);
  if (enumType) return { scalar: enumType };

  const varcharMatch = raw.match(/^(?:varchar|character varying)\s*\(\s*(\d+)\s*\)$/i);
  const numericMatch = raw.match(/^(?:numeric|decimal)\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (varcharMatch) return { scalar: "String", native: `@db.VarChar(${varcharMatch[1]})` };
  if (numericMatch) return { scalar: "Decimal", native: `@db.Decimal(${numericMatch[1]}, ${numericMatch[2]})` };

  const mapped: Record<string, PrismaType> = {
    uuid: { scalar: "String", native: "@db.Uuid" },
    string: { scalar: "String" },
    text: { scalar: "String" },
    varchar: { scalar: "String" },
    "character varying": { scalar: "String" },
    integer: { scalar: "Int" },
    int: { scalar: "Int" },
    smallint: { scalar: "Int", native: "@db.SmallInt" },
    bigint: { scalar: "BigInt" },
    boolean: { scalar: "Boolean" },
    bool: { scalar: "Boolean" },
    timestamp: { scalar: "DateTime", native: "@db.Timestamp" },
    timestamptz: { scalar: "DateTime", native: "@db.Timestamptz" },
    datetime: { scalar: "DateTime" },
    date: { scalar: "DateTime", native: "@db.Date" },
    numeric: { scalar: "Decimal" },
    decimal: { scalar: "Decimal" },
    float: { scalar: "Float" },
    real: { scalar: "Float", native: "@db.Real" },
    double: { scalar: "Float" },
    "double precision": { scalar: "Float", native: "@db.DoublePrecision" },
    json: { scalar: "Json" },
    jsonb: { scalar: "Json" },
    bytes: { scalar: "Bytes" },
    bytea: { scalar: "Bytes" },
  };
  const result = mapped[normalized];
  if (result) return result;
  warnings.push({ code: "PRISMA_UNSUPPORTED_TYPE", message: `Column "${column.name}" uses unsupported type "${raw}"; String was used.`, path });
  return { scalar: "String" };
}

function renderDefault(column: TitanColumn, enumValueNames: Map<string, Map<string, string>>, warnings: ExportWarning[], path: string) {
  if (!column.default) return undefined;
  const value = column.default.trim();
  if (/^(now\(\)|current_timestamp)$/i.test(value)) return "now()";
  if (/^(gen_random_uuid\(\)|uuid_generate_v4\(\)|uuid\(\))$/i.test(value)) {
    if (!/^uuid\(\)$/i.test(value)) warnings.push({ code: "PRISMA_UUID_DEFAULT", message: `Default "${value}" on "${column.name}" was converted to uuid().`, path });
    return "uuid()";
  }
  if (/^(true|false|-?\d+(?:\.\d+)?)$/i.test(value)) return value.toLowerCase();
  const stringMatch = value.match(/^'(.*)'$/s);
  if (stringMatch) {
    const inner = stringMatch[1]!.replaceAll("''", "'");
    const enumValues = enumValueNames.get(baseType(column.type));
    if (enumValues) return enumValues.get(inner) ?? sanitizeIdentifier(inner, "value");
    return quote(inner);
  }
  warnings.push({ code: "PRISMA_UNSUPPORTED_DEFAULT", message: `Default expression "${value}" on "${column.name}" was omitted.`, path });
  return undefined;
}

function sameColumns(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function columnsAreUnique(table: TitanTable, columnIds: string[]) {
  const primaryColumns = table.columns.filter((column) => column.primaryKey).map((column) => column.id);
  if (sameColumns(primaryColumns, columnIds)) return true;
  if (columnIds.length === 1 && table.columns.some((column) => column.id === columnIds[0] && column.unique)) return true;
  return table.indexes.some((index) => index.unique && sameColumns(index.columns, columnIds));
}

function uniqueName(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}${suffix++}`;
  used.add(candidate);
  return candidate;
}

export function exportPrisma(schema: TitanSchema, options: PrismaExportOptions = {}): ExportResult {
  const warnings: ExportWarning[] = [];
  const provider = options.datasourceProvider ?? "postgresql";
  const urlEnv = options.datasourceUrlEnv ?? "DATABASE_URL";
  const includeGenerator = options.includeGenerator ?? true;
  if (schema.dialect !== "postgres" && schema.dialect !== "generic") {
    warnings.push({ code: "PRISMA_DIALECT", message: `Schema dialect "${schema.dialect}" is exported using the PostgreSQL Prisma provider.`, path: "dialect" });
  }

  const usedTypeNames = new Set<string>();
  const enumTypes = new Map<string, string>();
  const enumValueNames = new Map<string, Map<string, string>>();
  for (const item of schema.enums) {
    enumTypes.set(item.name.toLowerCase(), uniqueName(sanitizeIdentifier(toPascalCase(item.name), "Enum"), usedTypeNames));
    const values = new Map<string, string>();
    const usedValues = new Set<string>();
    for (const value of item.values) values.set(value, uniqueName(sanitizeIdentifier(value, "value"), usedValues));
    enumValueNames.set(item.name.toLowerCase(), values);
  }

  const modelNames = new Map<string, string>();
  const fieldNames = new Map<string, Map<string, string>>();
  for (const table of schema.tables) {
    modelNames.set(table.id, uniqueName(sanitizeIdentifier(toPascalCase(table.name), "Model"), usedTypeNames));
    const names = new Map<string, string>();
    const used = new Set<string>();
    for (const column of table.columns) names.set(column.id, uniqueName(sanitizeIdentifier(toCamelCase(column.name), "field"), used));
    fieldNames.set(table.id, names);
  }

  const relationFields = new Map<string, string[]>();
  for (const table of schema.tables) relationFields.set(table.id, []);
  const usedRelationNames = new Map(schema.tables.map((table) => [table.id, new Set(fieldNames.get(table.id)?.values() ?? [])]));
  const tableById = new Map(schema.tables.map((table) => [table.id, table]));

  for (const relation of schema.relations) {
    const fromTable = tableById.get(relation.from.table);
    const toTable = tableById.get(relation.to.table);
    const path = `relations.${relation.id}`;
    if (!fromTable || !toTable) {
      warnings.push({ code: "PRISMA_RELATION_TABLE", message: `Relation "${relation.name}" references a missing table and was skipped.`, path });
      continue;
    }
    if (relation.cardinality !== "many-to-one" && relation.cardinality !== "one-to-one") {
      warnings.push({ code: "PRISMA_AMBIGUOUS_RELATION", message: `Relation "${relation.name}" (${relation.cardinality}) requires an explicit join/relation model; scalar columns were preserved.`, path });
      continue;
    }
    if (!columnsAreUnique(toTable, relation.to.columns)) {
      warnings.push({ code: "PRISMA_AMBIGUOUS_RELATION", message: `Relation "${relation.name}" targets columns that are not a primary or unique key; scalar columns were preserved.`, path });
      continue;
    }
    if (relation.cardinality === "one-to-one" && !columnsAreUnique(fromTable, relation.from.columns)) {
      warnings.push({ code: "PRISMA_AMBIGUOUS_RELATION", message: `One-to-one relation "${relation.name}" requires unique source columns; scalar columns were preserved.`, path });
      continue;
    }
    const fromNames = relation.from.columns.map((id) => fieldNames.get(fromTable.id)?.get(id)).filter((name): name is string => Boolean(name));
    const toNames = relation.to.columns.map((id) => fieldNames.get(toTable.id)?.get(id)).filter((name): name is string => Boolean(name));
    if (!fromNames.length || fromNames.length !== relation.from.columns.length || toNames.length !== relation.to.columns.length) {
      warnings.push({ code: "PRISMA_RELATION_COLUMN", message: `Relation "${relation.name}" references missing columns and was skipped.`, path });
      continue;
    }

    const fromUsed = usedRelationNames.get(fromTable.id)!;
    const toUsed = usedRelationNames.get(toTable.id)!;
    const relationName = quote(relation.name);
    const targetField = uniqueName(sanitizeIdentifier(toCamelCase(toTable.name), "relation"), fromUsed);
    const sourceBase = sanitizeIdentifier(toCamelCase(fromTable.name), "relation");
    const backField = uniqueName(relation.cardinality === "many-to-one" ? `${sourceBase}List` : sourceBase, toUsed);
    const fromColumns = relation.from.columns.map((id) => fromTable.columns.find((column) => column.id === id));
    const optional = fromColumns.some((column) => column?.nullable);
    const actions = [relation.onDelete ? `onDelete: ${referentialAction[relation.onDelete]}` : "", relation.onUpdate ? `onUpdate: ${referentialAction[relation.onUpdate]}` : ""].filter(Boolean);
    const actionSuffix = actions.length ? `, ${actions.join(", ")}` : "";
    relationFields.get(fromTable.id)!.push(`  ${targetField} ${modelNames.get(toTable.id)}${optional ? "?" : ""} @relation(${relationName}, fields: [${fromNames.join(", ")}], references: [${toNames.join(", ")}]${actionSuffix})`);
    relationFields.get(toTable.id)!.push(`  ${backField} ${modelNames.get(fromTable.id)}${relation.cardinality === "many-to-one" ? "[]" : "?"} @relation(${relationName})`);
  }

  const blocks: string[] = [];
  if (includeGenerator) blocks.push("generator client {\n  provider = \"prisma-client-js\"\n}");
  blocks.push(`datasource db {\n  provider = "${provider}"\n  url      = env(${quote(urlEnv)})\n}`);

  for (const item of schema.enums) {
    const enumName = enumTypes.get(item.name.toLowerCase())!;
    const values = item.values.map((value) => {
      const identifier = enumValueNames.get(item.name.toLowerCase())!.get(value)!;
      return `  ${identifier}${identifier !== value ? ` @map(${quote(value)})` : ""}`;
    });
    blocks.push(`enum ${enumName} {\n${values.join("\n")}\n}`);
  }

  for (const table of schema.tables) {
    const modelName = modelNames.get(table.id)!;
    const names = fieldNames.get(table.id)!;
    const primaryColumns = table.columns.filter((column) => column.primaryKey);
    const lines: string[] = [];
    for (const column of table.columns) {
      const path = `tables.${table.id}.columns.${column.id}`;
      const fieldName = names.get(column.id)!;
      const prismaType = mapType(column, enumTypes, warnings, path);
      const attributes: string[] = [];
      if (column.primaryKey && primaryColumns.length === 1) attributes.push("@id");
      if (column.unique && !column.primaryKey) attributes.push("@unique");
      const renderedDefault = renderDefault(column, enumValueNames, warnings, path);
      if (renderedDefault) attributes.push(`@default(${renderedDefault})`);
      if (prismaType.native) attributes.push(prismaType.native);
      if (fieldName !== column.name) attributes.push(`@map(${quote(column.name)})`);
      lines.push(`  ${fieldName} ${prismaType.scalar}${column.nullable ? "?" : ""}${attributes.length ? ` ${attributes.join(" ")}` : ""}`);
    }
    lines.push(...(relationFields.get(table.id) ?? []));
    if (primaryColumns.length > 1) lines.push(`  @@id([${primaryColumns.map((column) => names.get(column.id)).join(", ")}])`);
    for (const index of table.indexes) {
      const indexPath = `tables.${table.id}.indexes.${index.id}`;
      const columns = index.columns.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
      if (columns.length !== index.columns.length) {
        warnings.push({ code: "PRISMA_INDEX_COLUMN", message: `Index "${index.name}" references missing columns and was skipped.`, path: indexPath });
        continue;
      }
      if (index.where) warnings.push({ code: "PRISMA_PARTIAL_INDEX", message: `Partial predicate on index "${index.name}" is not supported by Prisma schema syntax and was omitted.`, path: indexPath });
      if (index.method && index.method.toLowerCase() !== "btree") warnings.push({ code: "PRISMA_INDEX_METHOD", message: `Index method "${index.method}" on "${index.name}" was omitted.`, path: indexPath });
      if (index.unique && columnsAreUnique({ ...table, indexes: table.indexes.filter((candidate) => candidate.id !== index.id) }, index.columns)) continue;
      lines.push(`  ${index.unique ? "@@unique" : "@@index"}([${columns.join(", ")}], map: ${quote(index.name)})`);
    }
    if (modelName !== table.name) lines.push(`  @@map(${quote(table.name)})`);
    if (table.schema) warnings.push({ code: "PRISMA_SCHEMA_NAMESPACE", message: `Table namespace "${table.schema}" for "${table.name}" requires Prisma multiSchema configuration and was omitted.`, path: `tables.${table.id}.schema` });
    blocks.push(`model ${modelName} {\n${lines.join("\n")}\n}`);
  }

  const content = `// Generated by Titanbase\n\n${blocks.join("\n\n")}\n`;
  return { files: [{ path: "schema.prisma", content }], warnings };
}
