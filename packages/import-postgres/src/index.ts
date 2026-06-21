import { normalizeSchema, TITAN_VERSION, type ReferentialAction, type TitanColumn, type TitanEnum, type TitanIndex, type TitanRelation, type TitanSchema, type TitanTable } from "@titanbase/core";

export type ImportWarning = {
  code: string;
  message: string;
  statement?: string;
  line?: number;
  severity?: "warning" | "info";
};

export type ImportResult = {
  schema?: TitanSchema;
  warnings: ImportWarning[];
  errors: ImportWarning[];
};

export type ImportPostgresOptions = {
  projectName?: string;
  sourceName?: string;
};

type SqlStatement = { text: string; line: number };
type Token = { kind: "word" | "identifier" | "string" | "symbol"; value: string; raw: string; start: number; end: number };
type QualifiedName = { schema?: string; name: string };
type PendingReference = { name?: string; source: QualifiedName; sourceColumns: string[]; target: QualifiedName; targetColumns: string[]; onDelete?: ReferentialAction; onUpdate?: ReferentialAction; line: number; statement: string };
type PendingIndex = { name: QualifiedName; table: QualifiedName; columns: string[]; unique: boolean; method?: string; where?: string; line: number; statement: string };
type PendingComment = { target: "table" | "column"; table: QualifiedName; column?: string; description: string; line: number; statement: string };
type ParsedColumn = { column: TitanColumn; sqlType: string };

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const constraintWords = new Set(["NOT", "NULL", "PRIMARY", "UNIQUE", "DEFAULT", "REFERENCES", "CONSTRAINT", "CHECK", "COLLATE", "GENERATED"]);
const knownTypes: Record<string, string> = {
  text: "text", varchar: "string", "character varying": "string", char: "string", character: "string",
  uuid: "uuid", integer: "integer", int: "integer", int4: "integer", smallint: "smallint", int2: "smallint",
  bigint: "bigint", int8: "bigint", serial: "serial", bigserial: "bigserial", boolean: "boolean", bool: "boolean",
  decimal: "decimal", numeric: "numeric", real: "real", float: "float", "double precision": "double precision",
  date: "date", timestamp: "timestamp", "timestamp without time zone": "timestamp", timestamptz: "timestamptz",
  "timestamp with time zone": "timestamptz", time: "time", timetz: "timetz", interval: "interval",
  json: "json", jsonb: "jsonb", bytea: "bytea", inet: "inet", cidr: "cidr", macaddr: "macaddr", money: "money",
};

const preview = (statement: string) => statement.replace(/\s+/g, " ").trim().slice(0, 180);
const warning = (code: string, message: string, statement: SqlStatement, severity: "warning" | "info" = "warning"): ImportWarning => ({ code, message, statement: preview(statement.text), line: statement.line, severity });
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";
const nameKey = (value: QualifiedName) => `${value.schema ?? ""}.${value.name}`;
const displayName = (value: QualifiedName) => value.schema ? `${value.schema}.${value.name}` : value.name;

function createIdFactory() {
  const used = new Map<string, number>();
  return (prefix: string, value: string) => {
    const base = `${prefix}_${slug(value)}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count ? `${base}_${count + 1}` : base;
  };
}

function splitStatements(sql: string): { statements: SqlStatement[]; error?: ImportWarning } {
  const statements: SqlStatement[] = [];
  let start = 0;
  let line = 1;
  let depth = 0;
  let state: "normal" | "single" | "double" | "line-comment" | "block-comment" | "dollar" = "normal";
  let dollarTag = "";
  let cleaned = "";

  const push = (end: number) => {
    const raw = cleaned.slice(start, end);
    const leading = raw.search(/\S/);
    const text = raw.trim();
    if (text) statements.push({ text, line: 1 + (cleaned.slice(0, start + Math.max(0, leading)).match(/\n/g)?.length ?? 0) });
    start = end + 1;
  };

  for (let index = 0; index < sql.length; index++) {
    const char = sql[index]!;
    const next = sql[index + 1];
    if (char === "\n") line++;

    if (state === "line-comment") {
      cleaned += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      cleaned += char === "\n" ? "\n" : " ";
      if (char === "*" && next === "/") { cleaned += " "; index++; state = "normal"; }
      continue;
    }
    if (state === "single") {
      cleaned += char;
      if (char === "'" && next === "'") { cleaned += next; index++; }
      else if (char === "'") state = "normal";
      continue;
    }
    if (state === "double") {
      cleaned += char;
      if (char === "\"" && next === "\"") { cleaned += next; index++; }
      else if (char === "\"") state = "normal";
      continue;
    }
    if (state === "dollar") {
      if (sql.startsWith(dollarTag, index)) { cleaned += dollarTag; index += dollarTag.length - 1; state = "normal"; }
      else cleaned += char;
      continue;
    }

    if (char === "-" && next === "-") { cleaned += "  "; index++; state = "line-comment"; continue; }
    if (char === "/" && next === "*") { cleaned += "  "; index++; state = "block-comment"; continue; }
    if (char === "'") { cleaned += char; state = "single"; continue; }
    if (char === "\"") { cleaned += char; state = "double"; continue; }
    if (char === "$") {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollarTag = match[0]; cleaned += dollarTag; index += dollarTag.length - 1; state = "dollar"; continue; }
    }
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) return { statements, error: { code: "parse_failure", message: `Unexpected closing parenthesis at line ${line}.`, line } };
    cleaned += char;
    if (char === ";" && depth === 0) push(cleaned.length - 1);
  }

  if (state !== "normal" || depth !== 0) {
    return { statements, error: { code: "parse_failure", message: state !== "normal" ? `Unterminated SQL ${state.replace("-", " ")}.` : "Unbalanced parentheses in SQL input.", line } };
  }
  const tail = cleaned.slice(start).trim();
  if (tail) {
    const raw = cleaned.slice(start);
    const leading = raw.search(/\S/);
    statements.push({ text: tail, line: 1 + (cleaned.slice(0, start + Math.max(0, leading)).match(/\n/g)?.length ?? 0) });
  }
  return { statements };
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (let index = 0; index < text.length;) {
    const char = text[index]!;
    if (/\s/.test(char)) { index++; continue; }
    if (char === "\"") {
      const start = index++;
      let value = "";
      while (index < text.length) {
        if (text[index] === "\"" && text[index + 1] === "\"") { value += "\""; index += 2; continue; }
        if (text[index] === "\"") { index++; break; }
        value += text[index++];
      }
      tokens.push({ kind: "identifier", value, raw: text.slice(start, index), start, end: index });
      continue;
    }
    if (char === "'") {
      const start = index++;
      let value = "";
      while (index < text.length) {
        if (text[index] === "'" && text[index + 1] === "'") { value += "'"; index += 2; continue; }
        if (text[index] === "'") { index++; break; }
        value += text[index++];
      }
      tokens.push({ kind: "string", value, raw: text.slice(start, index), start, end: index });
      continue;
    }
    if ("(),.;".includes(char)) {
      tokens.push({ kind: "symbol", value: char, raw: char, start: index, end: index + 1 });
      index++;
      continue;
    }
    const start = index;
    while (index < text.length && !/\s/.test(text[index]!) && !"(),.;'\"".includes(text[index]!)) index++;
    const raw = text.slice(start, index);
    tokens.push({ kind: "word", value: raw, raw, start, end: index });
  }
  return tokens;
}

const isKeyword = (token: Token | undefined, value: string) => token?.kind === "word" && token.value.toUpperCase() === value;
const isIdentifier = (token: Token | undefined) => token?.kind === "identifier" || (token?.kind === "word" && identifierPattern.test(token.value));

function readIdentifier(tokens: Token[], cursor: { value: number }): string | undefined {
  const token = tokens[cursor.value];
  if (!isIdentifier(token)) return undefined;
  cursor.value++;
  return token!.kind === "identifier" ? token!.value : token!.value.toLowerCase();
}

function readQualifiedName(tokens: Token[], cursor: { value: number }): QualifiedName | undefined {
  const first = readIdentifier(tokens, cursor);
  if (!first) return undefined;
  if (tokens[cursor.value]?.value !== ".") return { name: first };
  cursor.value++;
  const second = readIdentifier(tokens, cursor);
  return second ? { schema: first, name: second } : undefined;
}

function splitTopLevel(value: string): { text: string; offset: number }[] {
  const parts: { text: string; offset: number }[] = [];
  let start = 0;
  let depth = 0;
  let single = false;
  let double = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (single) { if (char === "'" && value[index + 1] === "'") index++; else if (char === "'") single = false; continue; }
    if (double) { if (char === "\"" && value[index + 1] === "\"") index++; else if (char === "\"") double = false; continue; }
    if (char === "'") { single = true; continue; }
    if (char === "\"") { double = true; continue; }
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) { parts.push({ text: value.slice(start, index).trim(), offset: start }); start = index + 1; }
  }
  parts.push({ text: value.slice(start).trim(), offset: start });
  return parts.filter((part) => part.text);
}

function readParenthesizedIdentifiers(tokens: Token[], cursor: { value: number }): string[] | undefined {
  if (tokens[cursor.value]?.value !== "(") return undefined;
  cursor.value++;
  const values: string[] = [];
  while (cursor.value < tokens.length) {
    const value = readIdentifier(tokens, cursor);
    if (!value) return undefined;
    values.push(value);
    if (tokens[cursor.value]?.value === ",") { cursor.value++; continue; }
    if (tokens[cursor.value]?.value === ")") { cursor.value++; return values; }
    return undefined;
  }
  return undefined;
}

function readActions(tokens: Token[], cursor: { value: number }) {
  const result: { onDelete?: ReferentialAction; onUpdate?: ReferentialAction } = {};
  const map: Record<string, ReferentialAction> = { CASCADE: "cascade", RESTRICT: "restrict", "NO ACTION": "no-action", "SET NULL": "set-null", "SET DEFAULT": "set-default" };
  while (cursor.value < tokens.length) {
    if (!isKeyword(tokens[cursor.value], "ON")) { cursor.value++; continue; }
    cursor.value++;
    const kind = isKeyword(tokens[cursor.value], "DELETE") ? "onDelete" : isKeyword(tokens[cursor.value], "UPDATE") ? "onUpdate" : undefined;
    cursor.value++;
    if (!kind) continue;
    let action = tokens[cursor.value]?.value.toUpperCase() ?? "";
    cursor.value++;
    if ((action === "NO" || action === "SET") && tokens[cursor.value]) { action += ` ${tokens[cursor.value]!.value.toUpperCase()}`; cursor.value++; }
    const mapped = map[action];
    if (mapped) result[kind] = mapped;
  }
  return result;
}

function normalizedType(raw: string, enums: TitanEnum[]): { type: string; nativeType?: string } {
  const compact = raw.trim().replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1");
  const base = compact.replace(/\(.*/, "").trim();
  const unqualified = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1)! : base;
  const enumValue = unqualified.startsWith("\"") && unqualified.endsWith("\"") ? unqualified.slice(1, -1).replaceAll('""', '"') : unqualified.toLowerCase();
  const importedEnum = enums.find((item) => item.name === enumValue || item.name.toLowerCase() === enumValue.toLowerCase());
  if (importedEnum) return { type: importedEnum.name };
  const logical = knownTypes[base.toLowerCase()] ?? knownTypes[unqualified.toLowerCase()] ?? unqualified.replaceAll('"', "").toLowerCase();
  return compact.toLowerCase() === logical ? { type: logical } : { type: logical, nativeType: compact };
}

function findConstraintIndex(tokens: Token[], start: number) {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.value === "(") depth++;
    else if (token.value === ")") depth--;
    else if (depth === 0 && token.kind === "word" && constraintWords.has(token.value.toUpperCase())) return index;
  }
  return tokens.length;
}

function parseColumn(segment: string, table: QualifiedName, tableId: string, makeId: (prefix: string, value: string) => string, statement: SqlStatement, warnings: ImportWarning[], references: PendingReference[]): ParsedColumn | undefined {
  const tokens = tokenize(segment);
  const cursor = { value: 0 };
  const name = readIdentifier(tokens, cursor);
  if (!name) return undefined;
  const typeEnd = findConstraintIndex(tokens, cursor.value);
  if (typeEnd === cursor.value) return undefined;
  const sqlType = segment.slice(tokens[cursor.value]!.start, tokens[typeEnd - 1]!.end).trim();
  cursor.value = typeEnd;
  const column: TitanColumn = { id: makeId(`${tableId}_column`, name), name, type: sqlType, nullable: true, primaryKey: false, unique: false };
  let constraintName: string | undefined;
  while (cursor.value < tokens.length) {
    if (isKeyword(tokens[cursor.value], "CONSTRAINT")) { cursor.value++; constraintName = readIdentifier(tokens, cursor); continue; }
    if (isKeyword(tokens[cursor.value], "NOT") && isKeyword(tokens[cursor.value + 1], "NULL")) { column.nullable = false; cursor.value += 2; continue; }
    if (isKeyword(tokens[cursor.value], "NULL")) { column.nullable = true; cursor.value++; continue; }
    if (isKeyword(tokens[cursor.value], "PRIMARY") && isKeyword(tokens[cursor.value + 1], "KEY")) { column.primaryKey = true; column.unique = true; column.nullable = false; cursor.value += 2; continue; }
    if (isKeyword(tokens[cursor.value], "UNIQUE")) { column.unique = true; cursor.value++; continue; }
    if (isKeyword(tokens[cursor.value], "DEFAULT")) {
      cursor.value++;
      const end = findConstraintIndex(tokens, cursor.value);
      if (tokens[cursor.value]) column.default = segment.slice(tokens[cursor.value]!.start, tokens[end - 1]!.end).trim();
      cursor.value = end;
      continue;
    }
    if (isKeyword(tokens[cursor.value], "REFERENCES")) {
      cursor.value++;
      const target = readQualifiedName(tokens, cursor);
      const targetColumns = readParenthesizedIdentifiers(tokens, cursor);
      if (target && targetColumns?.length) {
        references.push({ ...(constraintName ? { name: constraintName } : {}), source: table, sourceColumns: [name], target, targetColumns, ...readActions(tokens, cursor), line: statement.line, statement: statement.text });
      } else warnings.push(warning("unsupported_reference", `Could not import inline reference on ${displayName(table)}.${name}.`, statement));
      continue;
    }
    if (isKeyword(tokens[cursor.value], "CHECK") || isKeyword(tokens[cursor.value], "GENERATED") || isKeyword(tokens[cursor.value], "COLLATE")) {
      warnings.push(warning("unsupported_column_constraint", `Column constraint on ${displayName(table)}.${name} was not imported.`, statement));
      break;
    }
    cursor.value++;
  }
  return { column, sqlType };
}

function parseTableConstraint(segment: string, table: QualifiedName, tableData: TitanTable, statement: SqlStatement, makeId: (prefix: string, value: string) => string, warnings: ImportWarning[], references: PendingReference[]) {
  const tokens = tokenize(segment);
  const cursor = { value: 0 };
  let constraintName: string | undefined;
  if (isKeyword(tokens[cursor.value], "CONSTRAINT")) { cursor.value++; constraintName = readIdentifier(tokens, cursor); }
  if (isKeyword(tokens[cursor.value], "PRIMARY") && isKeyword(tokens[cursor.value + 1], "KEY")) {
    cursor.value += 2;
    const columns = readParenthesizedIdentifiers(tokens, cursor);
    if (!columns) return false;
    for (const name of columns) {
      const column = tableData.columns.find((item) => item.name === name);
      if (column) { column.primaryKey = true; column.unique = columns.length === 1; column.nullable = false; }
      else warnings.push(warning("missing_constraint_column", `Primary key references missing column ${displayName(table)}.${name}.`, statement));
    }
    return true;
  }
  if (isKeyword(tokens[cursor.value], "UNIQUE")) {
    cursor.value++;
    const columns = readParenthesizedIdentifiers(tokens, cursor);
    if (!columns) return false;
    if (columns.length === 1) {
      const column = tableData.columns.find((item) => item.name === columns[0]);
      if (column) column.unique = true;
    } else {
      const ids = columns.map((name) => tableData.columns.find((item) => item.name === name)?.id).filter((id): id is string => Boolean(id));
      if (ids.length === columns.length) tableData.indexes.push({ id: makeId(`${tableData.id}_index`, constraintName ?? `${tableData.name}_${columns.join("_")}_key`), name: constraintName ?? `${tableData.name}_${columns.join("_")}_key`, table: tableData.id, columns: ids, unique: true, method: "btree" });
    }
    return true;
  }
  if (isKeyword(tokens[cursor.value], "FOREIGN") && isKeyword(tokens[cursor.value + 1], "KEY")) {
    cursor.value += 2;
    const sourceColumns = readParenthesizedIdentifiers(tokens, cursor);
    if (!sourceColumns || !isKeyword(tokens[cursor.value], "REFERENCES")) return false;
    cursor.value++;
    const target = readQualifiedName(tokens, cursor);
    const targetColumns = readParenthesizedIdentifiers(tokens, cursor);
    if (!target || !targetColumns) return false;
    references.push({ ...(constraintName ? { name: constraintName } : {}), source: table, sourceColumns, target, targetColumns, ...readActions(tokens, cursor), line: statement.line, statement: statement.text });
    return true;
  }
  return false;
}

function resolveTable(tables: TitanTable[], name: QualifiedName, sourceSchema?: string) {
  if (name.schema) return tables.find((table) => table.name === name.name && table.schema === name.schema);
  return tables.find((table) => table.name === name.name && table.schema === sourceSchema)
    ?? tables.find((table) => table.name === name.name && table.schema === "public")
    ?? tables.find((table) => table.name === name.name);
}

export function importPostgresSql(sql: string, options: ImportPostgresOptions = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  const errors: ImportWarning[] = [];
  const split = splitStatements(sql);
  if (split.error) return { warnings, errors: [split.error] };
  if (!split.statements.length) return { warnings, errors: [{ code: "empty_sql", message: "The SQL file does not contain any statements." }] };

  const makeId = createIdFactory();
  const tables: TitanTable[] = [];
  const enums: TitanEnum[] = [];
  const parsedTypes = new Map<string, string>();
  const references: PendingReference[] = [];
  const indexes: PendingIndex[] = [];
  const comments: PendingComment[] = [];

  for (const statement of split.statements) {
    const tokens = tokenize(statement.text);
    if (!tokens.length) continue;
    const cursor = { value: 0 };

    if (isKeyword(tokens[0], "CREATE") && isKeyword(tokens[1], "TYPE")) {
      cursor.value = 2;
      const enumName = readQualifiedName(tokens, cursor);
      if (!enumName || !isKeyword(tokens[cursor.value], "AS") || !isKeyword(tokens[cursor.value + 1], "ENUM")) {
        warnings.push(warning("unsupported_type_definition", "Only CREATE TYPE ... AS ENUM is supported.", statement));
        continue;
      }
      cursor.value += 2;
      if (tokens[cursor.value]?.value !== "(") { errors.push(warning("invalid_enum", `Could not parse enum ${displayName(enumName)}.`, statement)); continue; }
      cursor.value++;
      const values: string[] = [];
      while (cursor.value < tokens.length && tokens[cursor.value]?.value !== ")") {
        const token = tokens[cursor.value];
        if (token?.kind !== "string") { errors.push(warning("invalid_enum", `Enum ${displayName(enumName)} contains a non-literal value.`, statement)); break; }
        if (values.includes(token.value)) warnings.push(warning("duplicate_enum_value", `Enum ${displayName(enumName)} repeats value '${token.value}'.`, statement));
        else values.push(token.value);
        cursor.value++;
        if (tokens[cursor.value]?.value === ",") cursor.value++;
      }
      if (enumName.schema) warnings.push(warning("enum_schema_omitted", `Enum namespace ${enumName.schema} is not represented by TitanSchema and was omitted.`, statement, "info"));
      if (values.length) enums.push({ id: makeId("enum", displayName(enumName)), name: enumName.name, values });
      continue;
    }

    if (isKeyword(tokens[0], "CREATE") && isKeyword(tokens[1], "TABLE")) {
      cursor.value = 2;
      if (isKeyword(tokens[cursor.value], "IF") && isKeyword(tokens[cursor.value + 1], "NOT") && isKeyword(tokens[cursor.value + 2], "EXISTS")) cursor.value += 3;
      const tableName = readQualifiedName(tokens, cursor);
      if (!tableName || tokens[cursor.value]?.value !== "(") { errors.push(warning("invalid_create_table", "Could not parse CREATE TABLE statement.", statement)); continue; }
      const open = tokens[cursor.value]!.start;
      let depth = 0;
      let close = -1;
      for (let index = open; index < statement.text.length; index++) {
        if (statement.text[index] === "(") depth++;
        else if (statement.text[index] === ")" && --depth === 0) { close = index; break; }
      }
      if (close < 0) { errors.push(warning("invalid_create_table", `Table ${displayName(tableName)} has no closing parenthesis.`, statement)); continue; }
      const tableId = makeId("table", displayName(tableName));
      const table: TitanTable = { id: tableId, name: tableName.name, ...(tableName.schema ? { schema: tableName.schema } : {}), columns: [], indexes: [] };
      const deferredConstraints: string[] = [];
      for (const part of splitTopLevel(statement.text.slice(open + 1, close))) {
        const firstTokens = tokenize(part.text);
        if (isKeyword(firstTokens[0], "CONSTRAINT") || isKeyword(firstTokens[0], "PRIMARY") || isKeyword(firstTokens[0], "UNIQUE") || isKeyword(firstTokens[0], "FOREIGN") || isKeyword(firstTokens[0], "CHECK")) {
          deferredConstraints.push(part.text);
          continue;
        }
        const parsed = parseColumn(part.text, tableName, tableId, makeId, statement, warnings, references);
        if (!parsed) { warnings.push(warning("unsupported_table_item", `A table item in ${displayName(tableName)} was not imported.`, statement)); continue; }
        table.columns.push(parsed.column);
        parsedTypes.set(parsed.column.id, parsed.sqlType);
      }
      for (const constraint of deferredConstraints) {
        if (!parseTableConstraint(constraint, tableName, table, statement, makeId, warnings, references)) warnings.push(warning("unsupported_table_constraint", `A table constraint in ${displayName(tableName)} was not imported.`, statement));
      }
      tables.push(table);
      continue;
    }

    if (isKeyword(tokens[0], "CREATE") && (isKeyword(tokens[1], "INDEX") || (isKeyword(tokens[1], "UNIQUE") && isKeyword(tokens[2], "INDEX")))) {
      cursor.value = isKeyword(tokens[1], "UNIQUE") ? 3 : 2;
      const unique = isKeyword(tokens[1], "UNIQUE");
      const indexName = readQualifiedName(tokens, cursor);
      if (!indexName || !isKeyword(tokens[cursor.value], "ON")) { errors.push(warning("invalid_create_index", "Could not parse CREATE INDEX statement.", statement)); continue; }
      cursor.value++;
      const tableName = readQualifiedName(tokens, cursor);
      let method: string | undefined;
      if (isKeyword(tokens[cursor.value], "USING")) { cursor.value++; method = readIdentifier(tokens, cursor); }
      const columnStart = tokens[cursor.value]?.start;
      const columns = readParenthesizedIdentifiers(tokens, cursor);
      if (!tableName || !columns) {
        warnings.push(warning("expression_index", `Index ${displayName(indexName)} uses expressions or unsupported syntax and was not imported.`, statement));
        continue;
      }
      const closeToken = tokens[cursor.value - 1];
      const rawColumns = columnStart !== undefined && closeToken ? statement.text.slice(columnStart, closeToken.end) : "";
      if (rawColumns.includes("(", 1)) { warnings.push(warning("expression_index", `Index ${displayName(indexName)} uses expressions and was not imported.`, statement)); continue; }
      let where: string | undefined;
      if (isKeyword(tokens[cursor.value], "WHERE")) where = statement.text.slice(tokens[cursor.value]!.end).trim();
      indexes.push({ name: indexName, table: tableName, columns, unique, ...(method ? { method } : {}), ...(where ? { where } : {}), line: statement.line, statement: statement.text });
      continue;
    }

    if (isKeyword(tokens[0], "COMMENT") && isKeyword(tokens[1], "ON")) {
      cursor.value = 2;
      if (isKeyword(tokens[cursor.value], "TABLE")) {
        cursor.value++;
        const table = readQualifiedName(tokens, cursor);
        if (table && isKeyword(tokens[cursor.value], "IS") && tokens[cursor.value + 1]?.kind === "string") comments.push({ target: "table", table, description: tokens[cursor.value + 1]!.value, line: statement.line, statement: statement.text });
        else warnings.push(warning("unsupported_comment", "COMMENT ON TABLE could not be imported.", statement));
        continue;
      }
      if (isKeyword(tokens[cursor.value], "COLUMN")) {
        cursor.value++;
        const names: string[] = [];
        const first = readIdentifier(tokens, cursor);
        if (first) names.push(first);
        while (tokens[cursor.value]?.value === ".") { cursor.value++; const next = readIdentifier(tokens, cursor); if (next) names.push(next); }
        if ((names.length === 2 || names.length === 3) && isKeyword(tokens[cursor.value], "IS") && tokens[cursor.value + 1]?.kind === "string") {
          const [schema, table, column] = names.length === 3 ? names : [undefined, names[0], names[1]];
          comments.push({ target: "column", table: { ...(schema ? { schema } : {}), name: table! }, column: column!, description: tokens[cursor.value + 1]!.value, line: statement.line, statement: statement.text });
        } else warnings.push(warning("unsupported_comment", "COMMENT ON COLUMN could not be imported.", statement));
        continue;
      }
      warnings.push(warning("unsupported_comment", "This COMMENT target is not supported yet.", statement));
      continue;
    }

    warnings.push(warning("unsupported_statement", "This SQL statement is not supported and was skipped.", statement));
  }

  if (errors.length) return { warnings, errors };

  for (const table of tables) {
    for (const column of table.columns) {
      const parsed = normalizedType(parsedTypes.get(column.id) ?? column.type, enums);
      column.type = parsed.type;
      if (parsed.nativeType) column.nativeType = parsed.nativeType;
    }
  }

  for (const pending of indexes) {
    const table = resolveTable(tables, pending.table);
    if (!table) { warnings.push({ code: "missing_index_table", message: `Index ${displayName(pending.name)} references missing table ${displayName(pending.table)}.`, statement: preview(pending.statement), line: pending.line, severity: "warning" }); continue; }
    const columns = pending.columns.map((name) => table.columns.find((column) => column.name === name)?.id).filter((id): id is string => Boolean(id));
    if (columns.length !== pending.columns.length) { warnings.push({ code: "missing_index_column", message: `Index ${displayName(pending.name)} references a missing column.`, statement: preview(pending.statement), line: pending.line, severity: "warning" }); continue; }
    const index: TitanIndex = { id: makeId(`${table.id}_index`, pending.name.name), name: pending.name.name, table: table.id, columns, unique: pending.unique, ...(pending.method ? { method: pending.method } : {}), ...(pending.where ? { where: pending.where } : {}) };
    table.indexes.push(index);
  }

  const relations: TitanRelation[] = [];
  for (const pending of references) {
    const source = resolveTable(tables, pending.source);
    const target = resolveTable(tables, pending.target, source?.schema);
    if (!source || !target) { warnings.push({ code: "missing_referenced_table", message: `Foreign key references missing table ${displayName(!source ? pending.source : pending.target)}.`, statement: preview(pending.statement), line: pending.line, severity: "warning" }); continue; }
    const sourceColumns = pending.sourceColumns.map((name) => source.columns.find((column) => column.name === name)?.id).filter((id): id is string => Boolean(id));
    const targetColumns = pending.targetColumns.map((name) => target.columns.find((column) => column.name === name)?.id).filter((id): id is string => Boolean(id));
    if (sourceColumns.length !== pending.sourceColumns.length || targetColumns.length !== pending.targetColumns.length) { warnings.push({ code: "missing_referenced_column", message: `Foreign key between ${source.name} and ${target.name} references a missing column.`, statement: preview(pending.statement), line: pending.line, severity: "warning" }); continue; }
    const relationName = pending.name ?? `${source.name}_${pending.sourceColumns.join("_")}_fkey`;
    relations.push({ id: makeId("relation", relationName), name: relationName, from: { table: source.id, columns: sourceColumns }, to: { table: target.id, columns: targetColumns }, cardinality: "many-to-one", ...(pending.onDelete ? { onDelete: pending.onDelete } : {}), ...(pending.onUpdate ? { onUpdate: pending.onUpdate } : {}) });
  }

  for (const pending of comments) {
    const table = resolveTable(tables, pending.table);
    if (!table) { warnings.push({ code: "missing_comment_target", message: `Comment target ${displayName(pending.table)} does not exist.`, statement: preview(pending.statement), line: pending.line, severity: "warning" }); continue; }
    if (pending.target === "table") table.description = pending.description;
    else {
      const column = table.columns.find((item) => item.name === pending.column);
      if (column) column.description = pending.description;
      else warnings.push({ code: "missing_comment_target", message: `Comment target ${displayName(pending.table)}.${pending.column} does not exist.`, statement: preview(pending.statement), line: pending.line, severity: "warning" });
    }
  }

  const projectName = options.projectName?.trim() || options.sourceName?.replace(/\.(?:sql|psql)$/i, "").trim() || "Imported PostgreSQL Schema";
  const columns = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const tablePositions = Object.fromEntries(tables.map((table, index) => [table.id, { x: 80 + (index % columns) * 390, y: 80 + Math.floor(index / columns) * 300 }]));
  const schema: TitanSchema = normalizeSchema({ titanVersion: TITAN_VERSION, project: { id: `project_${slug(projectName)}`, name: projectName }, dialect: "postgres", tables, enums, relations, metadata: { editor: { tablePositions } } });
  return { schema, warnings, errors };
}
