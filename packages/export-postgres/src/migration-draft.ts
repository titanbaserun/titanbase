import { diffSchemas, normalizeSchema, type SchemaDiffChange, type TitanColumn, type TitanEnum, type TitanIndex, type TitanRelation, type TitanSchema, type TitanTable } from "@titanbase/core";
import { postgresColumnSql, postgresCreateTableSql, postgresForeignKeySql, postgresIndexSql, postgresLiteral, postgresTypeSql, qualifiedPostgresName, quotePostgresIdentifier } from "./format";

export type MigrationDraftWarningSeverity = "info" | "warning" | "danger";

export interface MigrationDraftWarning {
  code: string;
  message: string;
  severity: MigrationDraftWarningSeverity;
  path?: string;
  changeId?: string;
}

export interface MigrationDraftStatement {
  id: string;
  sql: string;
  description: string;
  changeId?: string;
  destructive?: boolean;
  breaking?: boolean;
}

export interface MigrationDraftResult {
  filename: string;
  sql: string;
  statements: MigrationDraftStatement[];
  warnings: MigrationDraftWarning[];
}

export interface GeneratePostgresMigrationDraftOptions {
  name?: string;
  includeComments?: boolean;
}

type Section = "Enums" | "Tables" | "Columns" | "Relations / Foreign keys" | "Indexes" | "Comments" | "Destructive cleanup";
type TablePair = { before: TitanTable; after: TitanTable };

const sectionOrder: Section[] = ["Enums", "Tables", "Columns", "Relations / Foreign keys", "Indexes", "Comments", "Destructive cleanup"];
const compareText = (left: string, right: string) => left.localeCompare(right, "en");
const stableTableName = (table: TitanTable) => `${table.schema ?? ""}.${table.name}`;
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "schema";

function matchByIdOrName<T extends { id: string; name: string }>(before: T[], after: T[]) {
  const remaining = new Set(after);
  const pairs: Array<{ before: T; after: T }> = [];
  for (const previous of before) {
    const next = [...remaining].find((item) => item.id === previous.id) ?? [...remaining].find((item) => item.name === previous.name);
    if (!next) continue;
    remaining.delete(next);
    pairs.push({ before: previous, after: next });
  }
  return pairs;
}

function tablePairs(before: TitanSchema, after: TitanSchema, changes: SchemaDiffChange[]): TablePair[] {
  const pairs = matchByIdOrName(before.tables, after.tables);
  const matchedBefore = new Set(pairs.map((pair) => pair.before.id));
  const matchedAfter = new Set(pairs.map((pair) => pair.after.id));
  for (const change of changes.filter((item) => item.entityType === "table" && item.kind === "renamed")) {
    const previous = before.tables.find((table) => table.id === change.tableId);
    const next = after.tables.find((table) => table.name === change.after && !matchedAfter.has(table.id));
    if (!previous || !next || matchedBefore.has(previous.id)) continue;
    pairs.push({ before: previous, after: next });
    matchedBefore.add(previous.id);
    matchedAfter.add(next.id);
  }
  return pairs.sort((left, right) => compareText(stableTableName(left.after), stableTableName(right.after)));
}

function findColumnPair(pair: TablePair, change: SchemaDiffChange) {
  const previous = pair.before.columns.find((column) => column.id === change.columnId)
    ?? pair.before.columns.find((column) => column.name === change.before);
  const next = pair.after.columns.find((column) => column.id === previous?.id)
    ?? pair.after.columns.find((column) => column.name === change.after)
    ?? pair.after.columns.find((column) => column.name === previous?.name);
  return previous && next ? { before: previous, after: next } : undefined;
}

function findTablePair(pairs: TablePair[], change: SchemaDiffChange) {
  return pairs.find((pair) => pair.before.id === change.tableId || pair.after.id === change.tableId);
}

function findEnumPair(before: TitanSchema, after: TitanSchema, change: SchemaDiffChange) {
  const previous = before.enums.find((item) => item.id === change.enumId);
  const next = after.enums.find((item) => item.id === previous?.id)
    ?? after.enums.find((item) => item.name === change.after)
    ?? after.enums.find((item) => item.name === previous?.name);
  return previous && next ? { before: previous, after: next } : undefined;
}

function findRelationPair(before: TitanSchema, after: TitanSchema, change: SchemaDiffChange) {
  const previous = before.relations.find((item) => item.id === change.relationId);
  const next = after.relations.find((item) => item.id === previous?.id)
    ?? after.relations.find((item) => item.name === change.after)
    ?? after.relations.find((item) => item.name === previous?.name);
  return previous && next ? { before: previous, after: next } : undefined;
}

function findIndexPair(pair: TablePair, change: SchemaDiffChange) {
  const previous = pair.before.indexes.find((item) => item.id === change.indexId);
  const next = pair.after.indexes.find((item) => item.id === previous?.id)
    ?? pair.after.indexes.find((item) => item.name === change.after)
    ?? pair.after.indexes.find((item) => item.name === previous?.name);
  return previous && next ? { before: previous, after: next } : undefined;
}

function commentSql(target: "TABLE" | "COLUMN" | "TYPE" | "INDEX" | "CONSTRAINT", identifier: string, description: string | undefined) {
  return `COMMENT ON ${target} ${identifier} IS ${description === undefined ? "NULL" : postgresLiteral(description)};`;
}

export function generatePostgresMigrationDraft(beforeInput: TitanSchema, afterInput: TitanSchema, options: GeneratePostgresMigrationDraftOptions = {}): MigrationDraftResult {
  const before = normalizeSchema(beforeInput);
  const after = normalizeSchema(afterInput);
  const diff = diffSchemas(before, after);
  const pairs = tablePairs(before, after, diff.changes);
  const sections = new Map<Section, MigrationDraftStatement[]>(sectionOrder.map((section) => [section, []]));
  const warnings: MigrationDraftWarning[] = [];
  const handled = new Set<string>();

  const addStatement = (section: Section, statement: MigrationDraftStatement) => sections.get(section)!.push(statement);
  const warn = (warning: MigrationDraftWarning) => warnings.push(warning);
  const changeWarning = (change: SchemaDiffChange, code: string, message: string, severity: MigrationDraftWarningSeverity = "warning") => warn({ code, message, severity, path: change.path, changeId: change.id });

  if (before.dialect !== "postgres" && before.dialect !== "generic") warn({ code: "before_dialect_not_postgres", message: `The source schema uses ${before.dialect}; review PostgreSQL type mappings carefully.`, severity: "warning", path: "project.dialect" });
  if (after.dialect !== "postgres" && after.dialect !== "generic") warn({ code: "after_dialect_not_postgres", message: `The target schema uses ${after.dialect}; this draft still emits PostgreSQL SQL.`, severity: "warning", path: "project.dialect" });
  for (const item of diff.warnings) warn({ code: item.code, message: item.message, severity: "warning", ...(item.path ? { path: item.path } : {}) });

  const changes = [...diff.changes].sort((left, right) => compareText(left.path, right.path) || compareText(left.id, right.id));

  // Enum operations intentionally avoid automatic removal SQL.
  for (const change of changes.filter((item) => item.entityType === "enum" || item.entityType === "enum_value")) {
    if (change.entityType === "enum" && change.kind === "added") {
      const item = after.enums.find((value) => value.id === change.enumId) ?? change.after as TitanEnum | undefined;
      if (!item) continue;
      addStatement("Enums", { id: `enum-create:${item.id}`, sql: `CREATE TYPE ${quotePostgresIdentifier(item.name)} AS ENUM (${item.values.map(postgresLiteral).join(", ")});`, description: `Create enum ${item.name}.`, changeId: change.id });
    } else if (change.entityType === "enum" && change.kind === "removed") {
      changeWarning(change, "enum_removal_not_generated", `Enum removal for ${String((change.before as TitanEnum | undefined)?.name ?? change.enumId)} was not generated automatically. Remove dependent columns or casts first.`, "danger");
    } else if (change.entityType === "enum" && change.kind === "renamed") {
      addStatement("Enums", { id: `enum-rename:${change.enumId}`, sql: `ALTER TYPE ${quotePostgresIdentifier(String(change.before))} RENAME TO ${quotePostgresIdentifier(String(change.after))};`, description: `Rename enum ${String(change.before)} to ${String(change.after)}.`, changeId: change.id, breaking: true });
    } else if (change.entityType === "enum_value" && change.kind === "added") {
      const pair = findEnumPair(before, after, change);
      if (!pair) continue;
      addStatement("Enums", { id: `enum-value-add:${change.enumId}:${String(change.after)}`, sql: `ALTER TYPE ${quotePostgresIdentifier(pair.after.name)} ADD VALUE ${postgresLiteral(String(change.after))};`, description: `Add ${String(change.after)} to enum ${pair.after.name}.`, changeId: change.id });
      changeWarning(change, "enum_value_order_review", `PostgreSQL appends enum value ${String(change.after)} unless BEFORE or AFTER is specified; review the intended ordering.`, "info");
    } else if (change.entityType === "enum_value" && change.kind === "removed") {
      changeWarning(change, "enum_value_removal_not_generated", `PostgreSQL does not safely remove enum values in place. No SQL was generated for ${String(change.before)}.`, "danger");
    } else if (change.path.endsWith(".values")) {
      changeWarning(change, "enum_value_reorder_not_generated", "PostgreSQL enum value reordering was not generated automatically.");
    }
  }

  // New namespaces and tables.
  const addedTables = changes.filter((item) => item.entityType === "table" && item.kind === "added");
  const addedSchemas = new Set(addedTables.map((change) => after.tables.find((table) => table.id === change.tableId)?.schema).filter((value): value is string => Boolean(value)));
  for (const schemaName of [...addedSchemas].sort(compareText)) addStatement("Tables", { id: `schema-create:${schemaName}`, sql: `CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(schemaName)};`, description: `Ensure namespace ${schemaName} exists.` });
  for (const change of addedTables) {
    const table = after.tables.find((item) => item.id === change.tableId) ?? change.after as TitanTable | undefined;
    if (!table) continue;
    const formatted = postgresCreateTableSql(table, after.enums);
    addStatement("Tables", { id: `table-create:${table.id}`, sql: formatted.sql, description: `Create table ${stableTableName(table)}.`, changeId: change.id });
    for (const message of formatted.warnings) changeWarning(change, "column_type_fallback", message);
    for (const index of table.indexes) {
      const indexSql = postgresIndexSql(table, index);
      if (indexSql.sql) addStatement("Indexes", { id: `index-new-table:${index.id}`, sql: indexSql.sql, description: `Create index ${index.name}.`, changeId: change.id, breaking: index.unique });
      if (indexSql.warning) changeWarning(change, "index_generation_warning", indexSql.warning);
    }
  }

  for (const change of changes.filter((item) => item.entityType === "table" && item.kind === "renamed")) {
    const pair = findTablePair(pairs, change);
    if (!pair) continue;
    addStatement("Tables", { id: `table-rename:${pair.before.id}`, sql: `ALTER TABLE ${qualifiedPostgresName(pair.before.schema, pair.before.name)} RENAME TO ${quotePostgresIdentifier(pair.after.name)};`, description: `Rename table ${pair.before.name} to ${pair.after.name}.`, changeId: change.id, breaking: true });
  }
  for (const change of changes.filter((item) => item.entityType === "table" && item.path.endsWith(".schema"))) {
    const pair = findTablePair(pairs, change);
    if (!pair || !pair.after.schema) { changeWarning(change, "table_namespace_change_not_generated", "Moving a table to the default namespace was not generated automatically."); continue; }
    addStatement("Tables", { id: `table-schema:${pair.before.id}`, sql: `CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(pair.after.schema)};\nALTER TABLE ${qualifiedPostgresName(pair.before.schema, pair.after.name)} SET SCHEMA ${quotePostgresIdentifier(pair.after.schema)};`, description: `Move table ${pair.after.name} to namespace ${pair.after.schema}.`, changeId: change.id, breaking: true });
  }

  // Column changes on matched tables.
  for (const change of changes.filter((item) => item.entityType === "column")) {
    const pair = findTablePair(pairs, change);
    if (!pair) continue;
    const tableName = qualifiedPostgresName(pair.after.schema, pair.after.name);
    if (change.kind === "added") {
      const column = pair.after.columns.find((item) => item.id === change.columnId) ?? change.after as TitanColumn | undefined;
      if (!column) continue;
      const formatted = postgresColumnSql(column, after.enums);
      addStatement("Columns", { id: `column-add:${pair.after.id}:${column.id}`, sql: `ALTER TABLE ${tableName} ADD COLUMN ${formatted.sql};`, description: `Add column ${pair.after.name}.${column.name}.`, changeId: change.id, ...(change.breaking ? { breaking: true } : {}) });
      if (formatted.warning) changeWarning(change, "column_type_fallback", formatted.warning);
      if (!column.nullable && !column.default) changeWarning(change, "required_column_without_default", `Adding required column ${pair.after.name}.${column.name} can fail when rows already exist.`, "danger");
      if (column.primaryKey && !pair.before.columns.some((item) => item.primaryKey)) {
        addStatement("Columns", { id: `pk-new-column:${pair.after.id}:${column.id}`, sql: `ALTER TABLE ${tableName} ADD CONSTRAINT ${quotePostgresIdentifier(`${pair.after.name}_pkey`)} PRIMARY KEY (${quotePostgresIdentifier(column.name)});`, description: `Add primary key to ${pair.after.name}.`, changeId: change.id, breaking: true });
        changeWarning(change, "primary_key_addition_review", `Backfill and deduplicate ${pair.after.name}.${column.name} before adding the primary key.`, "danger");
      } else if (column.primaryKey) {
        changeWarning(change, "primary_key_addition_not_generated", `The table already has a primary key. A composite primary-key change for ${pair.after.name}.${column.name} was not generated automatically.`, "danger");
      }
      if (options.includeComments !== false && column.description) addStatement("Comments", { id: `comment-added-column:${pair.after.id}:${column.id}`, sql: commentSql("COLUMN", `${tableName}.${quotePostgresIdentifier(column.name)}`, column.description), description: `Add comment to column ${pair.after.name}.${column.name}.`, changeId: change.id });
      continue;
    }
    if (change.kind === "removed") continue;
    const columns = findColumnPair(pair, change);
    if (!columns) continue;
    if (change.kind === "renamed") {
      addStatement("Columns", { id: `column-rename:${pair.after.id}:${columns.before.id}`, sql: `ALTER TABLE ${tableName} RENAME COLUMN ${quotePostgresIdentifier(columns.before.name)} TO ${quotePostgresIdentifier(columns.after.name)};`, description: `Rename column ${columns.before.name} to ${columns.after.name}.`, changeId: change.id, breaking: true });
    } else if (change.path.endsWith(".type")) {
      const type = postgresTypeSql(columns.after, after.enums);
      addStatement("Columns", { id: `column-type:${pair.after.id}:${columns.before.id}`, sql: `ALTER TABLE ${tableName} ALTER COLUMN ${quotePostgresIdentifier(columns.after.name)} TYPE ${type.sql};`, description: `Change type of ${pair.after.name}.${columns.after.name}.`, changeId: change.id, ...(change.destructive ? { destructive: true } : {}), breaking: true });
      changeWarning(change, "column_type_change_review", `Review casts and consider an explicit USING clause for ${pair.after.name}.${columns.after.name}.`, change.destructive ? "danger" : "warning");
      if (type.warning) changeWarning(change, "column_type_fallback", type.warning);
    } else if (change.path.endsWith(".nullable")) {
      addStatement("Columns", { id: `column-nullable:${pair.after.id}:${columns.before.id}`, sql: `ALTER TABLE ${tableName} ALTER COLUMN ${quotePostgresIdentifier(columns.after.name)} ${columns.after.nullable ? "DROP" : "SET"} NOT NULL;`, description: `${columns.after.nullable ? "Allow null values in" : "Require values for"} ${pair.after.name}.${columns.after.name}.`, changeId: change.id, breaking: !columns.after.nullable });
      if (!columns.after.nullable) changeWarning(change, "set_not_null_review", `SET NOT NULL will fail if ${pair.after.name}.${columns.after.name} contains null values.`);
    } else if (change.path.endsWith(".default")) {
      addStatement("Columns", { id: `column-default:${pair.after.id}:${columns.before.id}`, sql: `ALTER TABLE ${tableName} ALTER COLUMN ${quotePostgresIdentifier(columns.after.name)} ${columns.after.default === undefined ? "DROP DEFAULT" : `SET DEFAULT ${columns.after.default}`};`, description: `Update default for ${pair.after.name}.${columns.after.name}.`, changeId: change.id });
    }
  }

  // Primary key and single-column unique constraints.
  for (const pair of pairs) {
    const pkChanges = changes.filter((change) => change.entityType === "column" && change.tableId === pair.before.id && change.path.endsWith(".primaryKey"));
    if (pkChanges.length) {
      const first = pkChanges[0]!;
      const oldColumns = pair.before.columns.filter((column) => column.primaryKey).map((column) => quotePostgresIdentifier(column.name));
      const newColumns = pair.after.columns.filter((column) => column.primaryKey).map((column) => quotePostgresIdentifier(column.name));
      if (oldColumns.length) addStatement("Columns", { id: `pk-drop:${pair.before.id}`, sql: `ALTER TABLE ${qualifiedPostgresName(pair.after.schema, pair.after.name)} DROP CONSTRAINT ${quotePostgresIdentifier(`${pair.before.name}_pkey`)};`, description: `Drop the previous primary key on ${pair.after.name}.`, changeId: first.id, destructive: true, breaking: true });
      if (newColumns.length) addStatement("Columns", { id: `pk-add:${pair.after.id}`, sql: `ALTER TABLE ${qualifiedPostgresName(pair.after.schema, pair.after.name)} ADD CONSTRAINT ${quotePostgresIdentifier(`${pair.after.name}_pkey`)} PRIMARY KEY (${newColumns.join(", ")});`, description: `Add the primary key on ${pair.after.name}.`, changeId: first.id, breaking: true });
      changeWarning(first, "inferred_primary_key_name", `The primary key constraint name was inferred as ${pair.before.name}_pkey; verify it matches the database.`, "danger");
    }
    for (const change of changes.filter((item) => item.entityType === "column" && item.tableId === pair.before.id && item.path.endsWith(".unique"))) {
      const columns = findColumnPair(pair, change);
      if (!columns || columns.after.primaryKey) continue;
      const constraintName = `${pair.after.name}_${columns.after.name}_key`;
      const sql = columns.after.unique
        ? `ALTER TABLE ${qualifiedPostgresName(pair.after.schema, pair.after.name)} ADD CONSTRAINT ${quotePostgresIdentifier(constraintName)} UNIQUE (${quotePostgresIdentifier(columns.after.name)});`
        : `ALTER TABLE ${qualifiedPostgresName(pair.after.schema, pair.after.name)} DROP CONSTRAINT ${quotePostgresIdentifier(`${pair.before.name}_${columns.before.name}_key`)};`;
      addStatement("Columns", { id: `unique:${pair.after.id}:${columns.after.id}`, sql, description: `${columns.after.unique ? "Add" : "Drop"} unique constraint for ${pair.after.name}.${columns.after.name}.`, changeId: change.id, destructive: !columns.after.unique, breaking: true });
      changeWarning(change, "inferred_unique_constraint_name", `The unique constraint name was inferred; verify it against the database before running this statement.`, columns.after.unique ? "warning" : "danger");
    }
  }

  // Relations: changed definitions are recreated; name-only changes are renamed.
  const relationGroups = new Map<string, SchemaDiffChange[]>();
  for (const change of changes.filter((item) => item.entityType === "relation")) relationGroups.set(change.relationId ?? change.id, [...(relationGroups.get(change.relationId ?? change.id) ?? []), change]);
  for (const group of [...relationGroups.values()].sort((left, right) => compareText(left[0]!.path, right[0]!.path))) {
    const representative = group[0]!;
    if (representative.kind === "added") {
      const relation = after.relations.find((item) => item.id === representative.relationId) ?? representative.after as TitanRelation | undefined;
      if (!relation) continue;
      const from = after.tables.find((table) => table.id === relation.from.table);
      const to = after.tables.find((table) => table.id === relation.to.table);
      if (!from || !to) { changeWarning(representative, "relation_missing_table", `Relation ${relation.name} references a missing table.`, "danger"); continue; }
      const formatted = postgresForeignKeySql(relation, from, to);
      if (formatted.sql) addStatement("Relations / Foreign keys", { id: `relation-add:${relation.id}`, sql: formatted.sql, description: `Add foreign key ${relation.name}.`, changeId: representative.id });
      else if (formatted.warning) changeWarning(representative, "relation_missing_column", formatted.warning, "danger");
      continue;
    }
    if (representative.kind === "removed") {
      const relation = before.relations.find((item) => item.id === representative.relationId) ?? representative.before as TitanRelation | undefined;
      const from = relation && before.tables.find((table) => table.id === relation.from.table);
      if (!relation || !from) continue;
      addStatement("Relations / Foreign keys", { id: `relation-drop:${relation.id}`, sql: `ALTER TABLE ${qualifiedPostgresName(from.schema, from.name)} DROP CONSTRAINT ${quotePostgresIdentifier(relation.name)};`, description: `Drop foreign key ${relation.name}.`, changeId: representative.id, destructive: true, breaking: true });
      changeWarning(representative, "foreign_key_drop", `Dropping foreign key ${relation.name} removes referential enforcement.`, "danger");
      continue;
    }
    const relationPair = findRelationPair(before, after, representative);
    if (!relationPair) continue;
    const structural = group.some((change) => [".from", ".to", ".onDelete", ".onUpdate"].some((suffix) => change.path.endsWith(suffix)));
    const fromBefore = before.tables.find((table) => table.id === relationPair.before.from.table);
    const fromAfter = after.tables.find((table) => table.id === relationPair.after.from.table);
    const toAfter = after.tables.find((table) => table.id === relationPair.after.to.table);
    if (structural && fromBefore && fromAfter && toAfter) {
      const formatted = postgresForeignKeySql(relationPair.after, fromAfter, toAfter);
      const changeId = group.find((change) => change.path.endsWith(".from") || change.path.endsWith(".to") || change.path.endsWith(".onDelete") || change.path.endsWith(".onUpdate"))?.id;
      const sql = `ALTER TABLE ${qualifiedPostgresName(fromBefore.schema, fromBefore.name)} DROP CONSTRAINT ${quotePostgresIdentifier(relationPair.before.name)};${formatted.sql ? `\n${formatted.sql}` : ""}`;
      addStatement("Relations / Foreign keys", { id: `relation-recreate:${relationPair.before.id}`, sql, description: `Recreate foreign key ${relationPair.after.name}.`, ...(changeId ? { changeId } : {}), destructive: true, breaking: true });
      changeWarning(representative, "foreign_key_recreated", `Foreign key ${relationPair.before.name} is dropped and recreated; review locking and existing data.`, "danger");
    } else {
      const renamed = group.find((change) => change.kind === "renamed");
      if (renamed && fromAfter) addStatement("Relations / Foreign keys", { id: `relation-rename:${relationPair.before.id}`, sql: `ALTER TABLE ${qualifiedPostgresName(fromAfter.schema, fromAfter.name)} RENAME CONSTRAINT ${quotePostgresIdentifier(relationPair.before.name)} TO ${quotePostgresIdentifier(relationPair.after.name)};`, description: `Rename foreign key ${relationPair.before.name}.`, changeId: renamed.id, breaking: true });
      const cardinality = group.find((change) => change.path.endsWith(".cardinality"));
      if (cardinality) changeWarning(cardinality, "cardinality_metadata_only", "Relation cardinality is Titanbase metadata and does not produce a PostgreSQL constraint change.", "info");
    }
  }

  // Indexes: structural changes are represented as drop + create.
  for (const pair of pairs) {
    const indexGroups = new Map<string, SchemaDiffChange[]>();
    for (const change of changes.filter((item) => item.entityType === "index" && (item.tableId === pair.before.id || item.tableId === pair.after.id))) indexGroups.set(change.indexId ?? change.id, [...(indexGroups.get(change.indexId ?? change.id) ?? []), change]);
    for (const group of [...indexGroups.values()].sort((left, right) => compareText(left[0]!.path, right[0]!.path))) {
      const change = group[0]!;
      if (change.kind === "added") {
        const index = pair.after.indexes.find((item) => item.id === change.indexId) ?? change.after as TitanIndex | undefined;
        if (!index) continue;
        const formatted = postgresIndexSql(pair.after, index);
        if (formatted.sql) addStatement("Indexes", { id: `index-add:${index.id}`, sql: formatted.sql, description: `Create index ${index.name}.`, changeId: change.id, breaking: index.unique });
        if (formatted.warning) changeWarning(change, "index_generation_warning", formatted.warning);
      } else if (change.kind === "removed") {
        const index = pair.before.indexes.find((item) => item.id === change.indexId) ?? change.before as TitanIndex | undefined;
        if (!index) continue;
        addStatement("Indexes", { id: `index-drop:${index.id}`, sql: `DROP INDEX ${qualifiedPostgresName(pair.before.schema, index.name)};`, description: `Drop index ${index.name}.`, changeId: change.id });
      } else {
        const indexPair = findIndexPair(pair, change);
        if (!indexPair) continue;
        const structural = group.some((item) => [".columns", ".unique", ".method", ".where"].some((suffix) => item.path.endsWith(suffix)));
        if (structural) {
          const formatted = postgresIndexSql(pair.after, indexPair.after);
          addStatement("Indexes", { id: `index-recreate:${indexPair.before.id}`, sql: `DROP INDEX ${qualifiedPostgresName(pair.before.schema, indexPair.before.name)};${formatted.sql ? `\n${formatted.sql}` : ""}`, description: `Recreate index ${indexPair.after.name}.`, changeId: change.id, breaking: indexPair.after.unique });
          changeWarning(change, "index_recreated", `Index ${indexPair.before.name} is dropped and recreated; review locking on large tables.`);
          if (formatted.warning) changeWarning(change, "index_generation_warning", formatted.warning);
        } else {
          const renamed = group.find((item) => item.kind === "renamed");
          if (renamed) addStatement("Indexes", { id: `index-rename:${indexPair.before.id}`, sql: `ALTER INDEX ${qualifiedPostgresName(pair.before.schema, indexPair.before.name)} RENAME TO ${quotePostgresIdentifier(indexPair.after.name)};`, description: `Rename index ${indexPair.before.name}.`, changeId: renamed.id });
        }
      }
    }
  }

  // Destructive column and table removals are emitted last within their sections.
  for (const change of changes.filter((item) => item.entityType === "column" && item.kind === "removed")) {
    const pair = findTablePair(pairs, change);
    const column = pair?.before.columns.find((item) => item.id === change.columnId) ?? change.before as TitanColumn | undefined;
    if (!pair || !column) continue;
    addStatement("Destructive cleanup", { id: `column-drop:${pair.before.id}:${column.id}`, sql: `ALTER TABLE ${qualifiedPostgresName(pair.after.schema, pair.after.name)} DROP COLUMN ${quotePostgresIdentifier(column.name)};`, description: `Drop column ${pair.after.name}.${column.name}.`, changeId: change.id, destructive: true, breaking: true });
    changeWarning(change, "column_drop_data_loss", `Dropping ${pair.after.name}.${column.name} permanently removes its data.`, "danger");
  }
  for (const change of changes.filter((item) => item.entityType === "table" && item.kind === "removed")) {
    const table = before.tables.find((item) => item.id === change.tableId) ?? change.before as TitanTable | undefined;
    if (!table) continue;
    addStatement("Destructive cleanup", { id: `table-drop:${table.id}`, sql: `DROP TABLE ${qualifiedPostgresName(table.schema, table.name)};`, description: `Drop table ${stableTableName(table)}.`, changeId: change.id, destructive: true, breaking: true });
    changeWarning(change, "table_drop_data_loss", `Dropping table ${stableTableName(table)} permanently removes its data.`, "danger");
  }

  if (options.includeComments !== false) {
    for (const change of changes.filter((item) => item.path.endsWith(".description") && item.entityType !== "project")) {
      if (change.entityType === "table") {
        const pair = findTablePair(pairs, change); if (!pair) continue;
        addStatement("Comments", { id: `comment-table:${pair.after.id}`, sql: commentSql("TABLE", qualifiedPostgresName(pair.after.schema, pair.after.name), pair.after.description), description: `Update comment on table ${pair.after.name}.`, changeId: change.id });
      } else if (change.entityType === "column") {
        const pair = findTablePair(pairs, change); const columns = pair && findColumnPair(pair, change); if (!pair || !columns) continue;
        addStatement("Comments", { id: `comment-column:${pair.after.id}:${columns.after.id}`, sql: commentSql("COLUMN", `${qualifiedPostgresName(pair.after.schema, pair.after.name)}.${quotePostgresIdentifier(columns.after.name)}`, columns.after.description), description: `Update comment on column ${pair.after.name}.${columns.after.name}.`, changeId: change.id });
      } else if (change.entityType === "enum") {
        const pair = findEnumPair(before, after, change); if (!pair) continue;
        addStatement("Comments", { id: `comment-enum:${pair.after.id}`, sql: commentSql("TYPE", quotePostgresIdentifier(pair.after.name), pair.after.description), description: `Update comment on enum ${pair.after.name}.`, changeId: change.id });
      } else if (change.entityType === "index") {
        const pair = findTablePair(pairs, change); const indexes = pair && findIndexPair(pair, change); if (!pair || !indexes) continue;
        addStatement("Comments", { id: `comment-index:${indexes.after.id}`, sql: commentSql("INDEX", qualifiedPostgresName(pair.after.schema, indexes.after.name), indexes.after.description), description: `Update comment on index ${indexes.after.name}.`, changeId: change.id });
      } else if (change.entityType === "relation") {
        const relation = findRelationPair(before, after, change); const table = relation && after.tables.find((item) => item.id === relation.after.from.table); if (!relation || !table) continue;
        addStatement("Comments", { id: `comment-relation:${relation.after.id}`, sql: commentSql("CONSTRAINT", `${quotePostgresIdentifier(relation.after.name)} ON ${qualifiedPostgresName(table.schema, table.name)}`, relation.after.description), description: `Update comment on foreign key ${relation.after.name}.`, changeId: change.id });
      }
    }
  }

  // Descriptions on wholly new entities do not have standalone diff changes.
  if (options.includeComments !== false) {
    for (const change of changes.filter((item) => item.entityType === "enum" && item.kind === "added")) {
      const item = after.enums.find((value) => value.id === change.enumId);
      if (item?.description) addStatement("Comments", { id: `comment-new-enum:${item.id}`, sql: commentSql("TYPE", quotePostgresIdentifier(item.name), item.description), description: `Add comment to enum ${item.name}.`, changeId: change.id });
    }
    for (const change of addedTables) {
      const table = after.tables.find((item) => item.id === change.tableId); if (!table) continue;
      if (table.description) addStatement("Comments", { id: `comment-new-table:${table.id}`, sql: commentSql("TABLE", qualifiedPostgresName(table.schema, table.name), table.description), description: `Add comment to table ${table.name}.`, changeId: change.id });
      for (const column of table.columns.filter((item) => item.description)) addStatement("Comments", { id: `comment-new-column:${table.id}:${column.id}`, sql: commentSql("COLUMN", `${qualifiedPostgresName(table.schema, table.name)}.${quotePostgresIdentifier(column.name)}`, column.description), description: `Add comment to column ${table.name}.${column.name}.`, changeId: change.id });
      for (const index of table.indexes.filter((item) => item.description)) addStatement("Comments", { id: `comment-new-index:${index.id}`, sql: commentSql("INDEX", qualifiedPostgresName(table.schema, index.name), index.description), description: `Add comment to index ${index.name}.`, changeId: change.id });
    }
  }

  const statements = sectionOrder.flatMap((section) => sections.get(section)!).filter((statement) => {
    if (handled.has(statement.id)) return false;
    handled.add(statement.id);
    return true;
  });
  warnings.sort((left, right) => compareText(left.path ?? "", right.path ?? "") || compareText(left.code, right.code) || compareText(left.message, right.message));

  const header = [
    "-- Titanbase PostgreSQL migration draft",
    "-- Review carefully before running in production.",
    "-- This file was generated from a local schema diff.",
  ];
  const body = sectionOrder.flatMap((section) => {
    const sectionStatements = sections.get(section)!.filter((statement, index, all) => all.findIndex((item) => item.id === statement.id) === index);
    return sectionStatements.length ? [`-- ${section}`, ...sectionStatements.flatMap((statement) => [statement.sql, ""])] : [];
  });
  if (!body.length) body.push("-- No migration statements generated because the schemas are identical.");
  const sql = `${[...header, "", ...body].join("\n").trim()}\n`;
  return { filename: `${slug(options.name ?? after.project.name)}-migration-draft.sql`, sql, statements, warnings };
}
