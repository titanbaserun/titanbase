import type { ExportResult, ExportWarning, ReferentialAction, TitanColumn, TitanSchema, TitanTable } from "@titanbase/core";
import type { DrizzleExportOptions } from "./types";

const words = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .split(/[^A-Za-z0-9]+/)
  .filter(Boolean);

const toPascalCase = (value: string) => words(value).map((word) => word[0]!.toUpperCase() + word.slice(1)).join("") || "Value";
const toCamelCase = (value: string) => {
  const pascal = toPascalCase(value);
  return `${pascal[0]!.toLowerCase()}${pascal.slice(1)}`;
};
const typescriptReservedWords = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "implements", "import", "in", "instanceof", "interface", "let", "new", "null", "package", "private", "protected", "public", "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield",
]);
const sanitizeIdentifier = (value: string, fallback: string) => {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, "_");
  const nonEmpty = cleaned || fallback;
  const validStart = /^[A-Za-z_$]/.test(nonEmpty) ? nonEmpty : `${fallback}_${nonEmpty}`;
  return typescriptReservedWords.has(validStart) ? `${validStart}_` : validStart;
};
const quote = (value: string) => JSON.stringify(value);
const baseType = (value: string) => value.trim().toLowerCase().replace(/\s*\(.*/, "");

const actionMap: Record<ReferentialAction, string> = {
  cascade: "cascade",
  restrict: "restrict",
  "set-null": "set null",
  "set-default": "set default",
  "no-action": "no action",
};

function renderDefault(column: TitanColumn, warnings: ExportWarning[], path: string) {
  if (!column.default) return "";
  const value = column.default.trim();
  const normalized = baseType(column.nativeType ?? column.type);
  if (/^(now\(\)|current_timestamp)$/i.test(value) && ["timestamp", "timestamptz", "datetime"].includes(normalized)) return ".defaultNow()";
  if (/^(gen_random_uuid\(\)|uuid_generate_v4\(\)|uuid\(\))$/i.test(value) && normalized === "uuid") return ".defaultRandom()";
  if (/^(true|false)$/i.test(value) && ["boolean", "bool"].includes(normalized)) return `.default(${value.toLowerCase()})`;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    if (["integer", "int", "smallint"].includes(normalized)) return `.default(${value})`;
    if (normalized === "bigint" && /^-?\d+$/.test(value)) return `.default(${value}n)`;
    if (["numeric", "decimal", "float", "real", "double", "double precision"].includes(normalized)) return `.default(${quote(value)})`;
  }
  const stringMatch = value.match(/^'(.*)'$/s);
  if (stringMatch) return `.default(${quote(stringMatch[1]!.replaceAll("''", "'"))})`;
  warnings.push({ code: "DRIZZLE_UNSUPPORTED_DEFAULT", message: `Default expression "${value}" on "${column.name}" was omitted.`, path });
  return "";
}

function columnExpression(column: TitanColumn, enumVariables: Map<string, string>, imports: Set<string>, warnings: ExportWarning[], path: string) {
  const raw = column.nativeType ?? column.type;
  const normalized = baseType(raw);
  const enumVariable = enumVariables.get(normalized);
  if (enumVariable) return `${enumVariable}(${quote(column.name)})`;

  const varcharMatch = raw.match(/^(?:varchar|character varying)\s*\(\s*(\d+)\s*\)$/i);
  if (varcharMatch) {
    imports.add("varchar");
    return `varchar(${quote(column.name)}, { length: ${varcharMatch[1]} })`;
  }

  const functions: Record<string, { name: string; options?: string }> = {
    uuid: { name: "uuid" },
    string: { name: "text" },
    text: { name: "text" },
    varchar: { name: "varchar" },
    "character varying": { name: "varchar" },
    integer: { name: "integer" },
    int: { name: "integer" },
    smallint: { name: "integer" },
    bigint: { name: "bigint", options: ', { mode: "bigint" }' },
    boolean: { name: "boolean" },
    bool: { name: "boolean" },
    timestamp: { name: "timestamp", options: ', { withTimezone: false }' },
    timestamptz: { name: "timestamp", options: ', { withTimezone: true }' },
    datetime: { name: "timestamp", options: ', { withTimezone: false }' },
    date: { name: "date" },
    numeric: { name: "numeric" },
    decimal: { name: "numeric" },
    float: { name: "numeric" },
    real: { name: "numeric" },
    double: { name: "numeric" },
    "double precision": { name: "numeric" },
    json: { name: "jsonb" },
    jsonb: { name: "jsonb" },
  };
  const mapped = functions[normalized];
  if (!mapped) {
    imports.add("text");
    warnings.push({ code: "DRIZZLE_UNSUPPORTED_TYPE", message: `Column "${column.name}" uses unsupported type "${raw}"; text() was used.`, path });
    return `text(${quote(column.name)})`;
  }
  if (["float", "real", "double", "double precision"].includes(normalized)) {
    warnings.push({ code: "DRIZZLE_TYPE_APPROXIMATION", message: `Column "${column.name}" uses "${raw}"; numeric() was used because this exporter does not currently emit PostgreSQL floating-point builders.`, path });
  }
  imports.add(mapped.name);
  return `${mapped.name}(${quote(column.name)}${mapped.options ?? ""})`;
}

function uniqueName(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}${suffix++}`;
  used.add(candidate);
  return candidate;
}

function orderTablesByDependencies(schema: TitanSchema, warnings: ExportWarning[]) {
  const remaining = new Map(schema.tables.map((table) => [table.id, table]));
  const dependencies = new Map(schema.tables.map((table) => [
    table.id,
    new Set(schema.relations.filter((relation) => relation.from.table === table.id && relation.to.table !== table.id).map((relation) => relation.to.table)),
  ]));
  const ordered: TitanTable[] = [];

  while (remaining.size) {
    const ready = schema.tables.filter((table) => remaining.has(table.id) && [...(dependencies.get(table.id) ?? [])].every((dependency) => !remaining.has(dependency)));
    if (!ready.length) {
      const cyclic = schema.tables.filter((table) => remaining.has(table.id));
      warnings.push({ code: "DRIZZLE_RELATION_CYCLE", message: `Circular table dependencies (${cyclic.map((table) => table.name).join(", ")}) may require manually moving foreign keys to a migration.`, path: "relations" });
      ordered.push(...cyclic);
      break;
    }
    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table.id);
    }
  }
  return ordered;
}

export function exportDrizzle(schema: TitanSchema, options: DrizzleExportOptions = {}): ExportResult {
  const warnings: ExportWarning[] = [];
  const imports = new Set<string>();
  const enumVariables = new Map<string, string>();
  const tableVariables = new Map<string, string>();
  const columnProperties = new Map<string, Map<string, string>>();

  const usedDeclarations = new Set<string>();
  for (const item of schema.enums) {
    imports.add("pgEnum");
    enumVariables.set(item.name.toLowerCase(), uniqueName(sanitizeIdentifier(`${toCamelCase(item.name)}Enum`, "valueEnum"), usedDeclarations));
  }
  const orderedTables = orderTablesByDependencies(schema, warnings);
  if (orderedTables.length) imports.add("pgTable");
  for (const table of orderedTables) {
    tableVariables.set(table.id, uniqueName(sanitizeIdentifier(toCamelCase(table.name), "table"), usedDeclarations));
    const usedColumns = new Set<string>();
    const properties = new Map<string, string>();
    for (const column of table.columns) properties.set(column.id, uniqueName(sanitizeIdentifier(toCamelCase(column.name), "column"), usedColumns));
    columnProperties.set(table.id, properties);
  }

  const enumBlocks = schema.enums.map((item) => `export const ${enumVariables.get(item.name.toLowerCase())} = pgEnum(${quote(item.name)}, [${item.values.map(quote).join(", ")}]);`);
  const tableById = new Map(schema.tables.map((table) => [table.id, table]));
  const tableBlocks: string[] = [];

  const tableOrder = new Map(orderedTables.map((table, index) => [table.id, index]));
  for (const table of orderedTables) {
    const variable = tableVariables.get(table.id)!;
    const properties = columnProperties.get(table.id)!;
    const primaryColumns = table.columns.filter((column) => column.primaryKey);
    const columnLines = table.columns.map((column) => {
      const path = `tables.${table.id}.columns.${column.id}`;
      let expression = columnExpression(column, enumVariables, imports, warnings, path);
      if (column.primaryKey && primaryColumns.length === 1) expression += ".primaryKey()";
      if (!column.nullable) expression += ".notNull()";
      if (column.unique && !column.primaryKey) expression += ".unique()";
      expression += renderDefault(column, warnings, path);
      return `    ${properties.get(column.id)}: ${expression},`;
    });

    const callbacks: string[] = [];
    const callbackNames = new Set<string>();
    if (primaryColumns.length > 1) {
      imports.add("primaryKey");
      callbacks.push(`    ${uniqueName(`${variable}PrimaryKey`, callbackNames)}: primaryKey({ columns: [${primaryColumns.map((column) => `table.${properties.get(column.id)}`).join(", ")}] }),`);
    }
    for (const index of table.indexes) {
      const path = `tables.${table.id}.indexes.${index.id}`;
      const columns = index.columns.map((id) => properties.get(id)).filter((name): name is string => Boolean(name));
      if (columns.length !== index.columns.length) {
        warnings.push({ code: "DRIZZLE_INDEX_COLUMN", message: `Index "${index.name}" references missing columns and was skipped.`, path });
        continue;
      }
      const builder = index.unique ? "uniqueIndex" : "index";
      imports.add(builder);
      if (index.where) warnings.push({ code: "DRIZZLE_PARTIAL_INDEX", message: `Partial predicate on index "${index.name}" was omitted.`, path });
      if (index.method && index.method.toLowerCase() !== "btree") warnings.push({ code: "DRIZZLE_INDEX_METHOD", message: `Index method "${index.method}" on "${index.name}" was omitted.`, path });
      const callbackName = uniqueName(sanitizeIdentifier(toCamelCase(index.name), "indexDefinition"), callbackNames);
      callbacks.push(`    ${callbackName}: ${builder}(${quote(index.name)}).on(${columns.map((name) => `table.${name}`).join(", ")}),`);
    }

    for (const relation of schema.relations.filter((item) => item.from.table === table.id)) {
      const path = `relations.${relation.id}`;
      const toTable = tableById.get(relation.to.table);
      if (!toTable) {
        warnings.push({ code: "DRIZZLE_RELATION_TABLE", message: `Relation "${relation.name}" references a missing table and was skipped.`, path });
        continue;
      }
      if (toTable.id === table.id) {
        warnings.push({ code: "DRIZZLE_SELF_RELATION", message: `Self-relation "${relation.name}" requires a deferred reference and was omitted.`, path });
        continue;
      }
      if ((tableOrder.get(toTable.id) ?? Number.MAX_SAFE_INTEGER) > (tableOrder.get(table.id) ?? -1)) continue;
      const fromColumns = relation.from.columns.map((id) => properties.get(id)).filter((name): name is string => Boolean(name));
      const targetProperties = columnProperties.get(toTable.id)!;
      const toColumns = relation.to.columns.map((id) => targetProperties.get(id)).filter((name): name is string => Boolean(name));
      if (!fromColumns.length || fromColumns.length !== relation.from.columns.length || toColumns.length !== relation.to.columns.length) {
        warnings.push({ code: "DRIZZLE_RELATION_COLUMN", message: `Relation "${relation.name}" references missing columns and was skipped.`, path });
        continue;
      }
      imports.add("foreignKey");
      let constraint = `foreignKey({ columns: [${fromColumns.map((name) => `table.${name}`).join(", ")}], foreignColumns: [${toColumns.map((name) => `${tableVariables.get(toTable.id)}.${name}`).join(", ")}], name: ${quote(relation.name)} })`;
      if (relation.onDelete) constraint += `.onDelete(${quote(actionMap[relation.onDelete])})`;
      if (relation.onUpdate) constraint += `.onUpdate(${quote(actionMap[relation.onUpdate])})`;
      const callbackName = uniqueName(sanitizeIdentifier(`${toCamelCase(relation.name)}ForeignKey`, "foreignKeyDefinition"), callbackNames);
      callbacks.push(`    ${callbackName}: ${constraint},`);
    }

    if (table.schema) warnings.push({ code: "DRIZZLE_SCHEMA_NAMESPACE", message: `Table namespace "${table.schema}" for "${table.name}" requires pgSchema and was omitted.`, path: `tables.${table.id}.schema` });
    const callback = callbacks.length ? `,\n  (table) => ({\n${callbacks.join("\n")}\n  })` : "";
    tableBlocks.push(`export const ${variable} = pgTable(${quote(table.name)}, {\n${columnLines.join("\n")}\n  }${callback}\n);`);
  }

  const importOrder = ["pgTable", "pgEnum", "uuid", "text", "varchar", "integer", "bigint", "boolean", "timestamp", "date", "numeric", "jsonb", "index", "uniqueIndex", "primaryKey", "foreignKey"];
  const imported = importOrder.filter((name) => imports.has(name));
  const importBlock = imported.length ? `import { ${imported.join(", ")} } from "drizzle-orm/pg-core";\n\n` : "";
  const body = [...enumBlocks, ...tableBlocks].join("\n\n");
  const content = `// Generated by Titanbase\n\n${importBlock}${body}${body ? "\n" : ""}`;
  return { files: [{ path: options.schemaFilePath ?? "schema.ts", content }], warnings };
}
