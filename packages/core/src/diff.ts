import { normalizeSchema } from "./normalize";
import type { TitanColumn, TitanEnum, TitanIndex, TitanRelation, TitanSchema, TitanTable } from "./types";

export type DiffChangeKind = "added" | "removed" | "changed" | "renamed";
export type DiffEntityType = "project" | "table" | "column" | "relation" | "index" | "enum" | "enum_value";
export type DiffSeverity = "info" | "warning" | "danger";

export interface SchemaDiffChange {
  id: string;
  kind: DiffChangeKind;
  entityType: DiffEntityType;
  path: string;
  title: string;
  description?: string;
  before?: unknown;
  after?: unknown;
  severity: DiffSeverity;
  destructive?: boolean;
  breaking?: boolean;
  tableId?: string;
  columnId?: string;
  relationId?: string;
  indexId?: string;
  enumId?: string;
}

export interface SchemaDiffSummary {
  added: number;
  removed: number;
  changed: number;
  renamed: number;
  destructive: number;
  breaking: number;
}

export interface SchemaDiffWarning {
  code: string;
  message: string;
  path?: string;
}

export interface SchemaDiffResult {
  changes: SchemaDiffChange[];
  summary: SchemaDiffSummary;
  warnings: SchemaDiffWarning[];
}

type MatchReason = "id" | "semantic" | "name" | "heuristic";
type Match<T> = { before: T; after: T; reason: MatchReason };
type MatchPhase<T> = { reason: Exclude<MatchReason, "heuristic">; beforeKey: (value: T) => string; afterKey?: (value: T) => string };

const compareText = (left: string, right: string) => left.localeCompare(right, "en");
const optional = (value: string | undefined) => value ?? null;
const qualifiedTableName = (table: TitanTable) => table.schema ? `${table.schema}.${table.name}` : table.name;
const stableTableKey = (table: TitanTable) => `${table.schema ?? ""}.${table.name}`;
const columnSignature = (column: TitanColumn) => JSON.stringify([column.type, optional(column.nativeType), column.nullable, column.primaryKey, column.unique, optional(column.default)]);
const changeId = (...parts: string[]) => parts.map((part) => encodeURIComponent(part)).join(":");

function canonicalSchema(input: TitanSchema): TitanSchema {
  const schema = normalizeSchema(input);
  return {
    ...schema,
    tables: schema.tables.map((table) => ({
      ...table,
      columns: [...table.columns].sort((left, right) => compareText(left.id, right.id) || compareText(left.name, right.name)),
      indexes: [...table.indexes].sort((left, right) => compareText(left.id, right.id) || compareText(left.name, right.name)),
    })).sort((left, right) => compareText(left.id, right.id) || compareText(stableTableKey(left), stableTableKey(right))),
    relations: [...schema.relations].sort((left, right) => compareText(left.id, right.id) || compareText(left.name, right.name)),
    enums: [...schema.enums].sort((left, right) => compareText(left.id, right.id) || compareText(left.name, right.name)),
  };
}

function matchEntities<T>(before: T[], after: T[], phases: MatchPhase<T>[], heuristic?: (before: T, after: T) => boolean) {
  const unmatchedBefore = new Set(before);
  const unmatchedAfter = new Set(after);
  const matches: Match<T>[] = [];

  for (const phase of phases) {
    const beforeValues = [...unmatchedBefore];
    for (const beforeValue of beforeValues) {
      const key = phase.beforeKey(beforeValue);
      if (!key) continue;
      const candidates = [...unmatchedAfter].filter((afterValue) => (phase.afterKey ?? phase.beforeKey)(afterValue) === key);
      if (candidates.length !== 1) continue;
      const afterValue = candidates[0]!;
      unmatchedBefore.delete(beforeValue);
      unmatchedAfter.delete(afterValue);
      matches.push({ before: beforeValue, after: afterValue, reason: phase.reason });
    }
  }

  if (heuristic) {
    for (const beforeValue of [...unmatchedBefore]) {
      const candidates = [...unmatchedAfter].filter((afterValue) => heuristic(beforeValue, afterValue));
      if (candidates.length !== 1) continue;
      const afterValue = candidates[0]!;
      const reverse = [...unmatchedBefore].filter((candidate) => heuristic(candidate, afterValue));
      if (reverse.length !== 1) continue;
      unmatchedBefore.delete(beforeValue);
      unmatchedAfter.delete(afterValue);
      matches.push({ before: beforeValue, after: afterValue, reason: "heuristic" });
    }
  }

  return { matches, removed: [...unmatchedBefore], added: [...unmatchedAfter] };
}

function tableRenameCandidate(before: TitanTable, after: TitanTable) {
  if (before.schema !== after.schema || !before.columns.length || !after.columns.length) return false;
  const beforeSignatures = new Set(before.columns.map(columnSignature));
  const afterSignatures = new Set(after.columns.map(columnSignature));
  const overlap = [...beforeSignatures].filter((value) => afterSignatures.has(value)).length;
  return overlap / Math.max(beforeSignatures.size, afterSignatures.size) >= 0.75;
}

function incompatibleType(before: TitanColumn, after: TitanColumn) {
  const families: Record<string, string> = {
    smallint: "number", integer: "number", int: "number", bigint: "number", serial: "number", bigserial: "number", numeric: "number", decimal: "number", real: "number", float: "number", "double precision": "number",
    text: "string", string: "string", varchar: "string", char: "string",
    timestamp: "datetime", timestamptz: "datetime", datetime: "datetime", date: "datetime", time: "datetime", timetz: "datetime",
    json: "json", jsonb: "json", boolean: "boolean", bool: "boolean", uuid: "uuid", bytea: "binary",
  };
  return (families[before.type] ?? before.type) !== (families[after.type] ?? after.type);
}

function columnNames(table: TitanTable, ids: string[]) {
  return ids.map((id) => table.columns.find((column) => column.id === id)?.name ?? id);
}

function relationEndpointKey(schema: TitanSchema, endpoint: TitanRelation["from"]) {
  const table = schema.tables.find((item) => item.id === endpoint.table);
  if (!table) return `${endpoint.table}:${endpoint.columns.join(",")}`;
  return `${stableTableKey(table)}:${columnNames(table, endpoint.columns).join(",")}`;
}

function relationSemanticKey(schema: TitanSchema, relation: TitanRelation) {
  return `${relationEndpointKey(schema, relation.from)}->${relationEndpointKey(schema, relation.to)}`;
}

function indexSemanticKey(table: TitanTable, index: TitanIndex) {
  return JSON.stringify([columnNames(table, index.columns), index.unique, optional(index.method)?.toLowerCase() ?? null]);
}

function valueChanged<T>(before: T, after: T) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export function diffSchemas(beforeInput: TitanSchema, afterInput: TitanSchema): SchemaDiffResult {
  const before = canonicalSchema(beforeInput);
  const after = canonicalSchema(afterInput);
  const changes: SchemaDiffChange[] = [];
  const warnings: SchemaDiffWarning[] = [];

  const push = (change: SchemaDiffChange) => changes.push(change);
  const projectChange = (field: "name" | "description" | "dialect" | "titanVersion", previous: unknown, next: unknown, severity: DiffSeverity, breaking = false) => {
    if (!valueChanged(previous, next)) return;
    push({ id: changeId("project", field, "changed"), kind: "changed", entityType: "project", path: `project.${field}`, title: `Project ${field} changed`, before: previous, after: next, severity, ...(breaking ? { breaking: true } : {}) });
  };
  projectChange("name", before.project.name, after.project.name, "info");
  projectChange("description", optional(before.project.description), optional(after.project.description), "info");
  projectChange("dialect", before.dialect, after.dialect, "warning", true);
  projectChange("titanVersion", before.titanVersion, after.titanVersion, "warning");

  const tableMatch = matchEntities(before.tables, after.tables, [
    { reason: "id", beforeKey: (table) => table.id },
    { reason: "name", beforeKey: stableTableKey },
  ], tableRenameCandidate);

  for (const table of tableMatch.removed) {
    push({ id: changeId("table", table.id, "removed"), kind: "removed", entityType: "table", path: `tables.${table.id}`, title: `Table ${qualifiedTableName(table)} removed`, before: table, severity: "danger", destructive: true, breaking: true, tableId: table.id });
  }
  for (const table of tableMatch.added) {
    push({ id: changeId("table", table.id, "added"), kind: "added", entityType: "table", path: `tables.${table.id}`, title: `Table ${qualifiedTableName(table)} added`, after: table, severity: "info", tableId: table.id });
  }

  for (const tablePair of tableMatch.matches) {
    const previousTable = tablePair.before;
    const nextTable = tablePair.after;
    const tableId = previousTable.id;
    const tablePath = `tables.${nextTable.id}`;
    if (tablePair.reason === "heuristic") warnings.push({ code: "heuristic_table_rename", message: `Matched ${qualifiedTableName(previousTable)} to ${qualifiedTableName(nextTable)} as a probable rename.`, path: tablePath });
    if (previousTable.name !== nextTable.name) {
      push({ id: changeId("table", tableId, "name", "renamed"), kind: "renamed", entityType: "table", path: `${tablePath}.name`, title: `Table ${previousTable.name} renamed to ${nextTable.name}`, before: previousTable.name, after: nextTable.name, severity: "warning", breaking: true, tableId });
    }
    if (previousTable.schema !== nextTable.schema) push({ id: changeId("table", tableId, "schema", "changed"), kind: "changed", entityType: "table", path: `${tablePath}.schema`, title: `Table ${nextTable.name} namespace changed`, before: optional(previousTable.schema), after: optional(nextTable.schema), severity: "warning", breaking: true, tableId });
    if (previousTable.description !== nextTable.description) push({ id: changeId("table", tableId, "description", "changed"), kind: "changed", entityType: "table", path: `${tablePath}.description`, title: `Table ${nextTable.name} description changed`, before: optional(previousTable.description), after: optional(nextTable.description), severity: "info", tableId });

    const columnMatch = matchEntities(previousTable.columns, nextTable.columns, [
      { reason: "id", beforeKey: (column) => column.id },
      { reason: "name", beforeKey: (column) => column.name },
    ], (previous, next) => columnSignature(previous) === columnSignature(next));

    for (const column of columnMatch.removed) push({ id: changeId("column", previousTable.id, column.id, "removed"), kind: "removed", entityType: "column", path: `${tablePath}.columns.${column.id}`, title: `Column ${previousTable.name}.${column.name} removed`, before: column, severity: "danger", destructive: true, breaking: true, tableId: previousTable.id, columnId: column.id });
    for (const column of columnMatch.added) {
      const breaking = !column.nullable && !column.default;
      push({ id: changeId("column", tableId, column.id, "added"), kind: "added", entityType: "column", path: `${tablePath}.columns.${column.id}`, title: `Column ${nextTable.name}.${column.name} added`, after: column, severity: breaking ? "warning" : "info", ...(breaking ? { breaking: true } : {}), tableId, columnId: column.id });
    }

    for (const columnPair of columnMatch.matches) {
      const previous = columnPair.before;
      const next = columnPair.after;
      const columnId = previous.id;
      const path = `${tablePath}.columns.${next.id}`;
      if (columnPair.reason === "heuristic") warnings.push({ code: "heuristic_column_rename", message: `Matched ${previousTable.name}.${previous.name} to ${nextTable.name}.${next.name} as a probable rename.`, path });
      if (previous.name !== next.name) push({ id: changeId("column", tableId, columnId, "name", "renamed"), kind: "renamed", entityType: "column", path: `${path}.name`, title: `Column ${previous.name} renamed to ${next.name}`, before: previous.name, after: next.name, severity: "warning", breaking: true, tableId, columnId });
      const previousType = previous.nativeType ?? previous.type;
      const nextType = next.nativeType ?? next.type;
      if (previousType !== nextType) {
        const destructive = incompatibleType(previous, next);
        push({ id: changeId("column", tableId, columnId, "type", "changed"), kind: "changed", entityType: "column", path: `${path}.type`, title: `Column ${nextTable.name}.${next.name} type changed`, before: previousType, after: nextType, severity: destructive ? "danger" : "warning", ...(destructive ? { destructive: true } : {}), breaking: true, tableId, columnId });
      }
      if (previous.nullable !== next.nullable) push({ id: changeId("column", tableId, columnId, "nullable", "changed"), kind: "changed", entityType: "column", path: `${path}.nullable`, title: `Column ${nextTable.name}.${next.name} ${next.nullable ? "is now nullable" : "is now required"}`, before: previous.nullable, after: next.nullable, severity: next.nullable ? "info" : "warning", ...(!next.nullable ? { breaking: true } : {}), tableId, columnId });
      if (previous.default !== next.default) push({ id: changeId("column", tableId, columnId, "default", "changed"), kind: "changed", entityType: "column", path: `${path}.default`, title: `Column ${nextTable.name}.${next.name} default changed`, before: optional(previous.default), after: optional(next.default), severity: "warning", tableId, columnId });
      if (previous.primaryKey !== next.primaryKey) push({ id: changeId("column", tableId, columnId, "primaryKey", "changed"), kind: "changed", entityType: "column", path: `${path}.primaryKey`, title: `Column ${nextTable.name}.${next.name} primary key changed`, before: previous.primaryKey, after: next.primaryKey, severity: "danger", destructive: true, breaking: true, tableId, columnId });
      if (previous.unique !== next.unique) push({ id: changeId("column", tableId, columnId, "unique", "changed"), kind: "changed", entityType: "column", path: `${path}.unique`, title: `Column ${nextTable.name}.${next.name} uniqueness changed`, before: previous.unique, after: next.unique, severity: "warning", ...(next.unique ? { breaking: true } : {}), tableId, columnId });
      if (previous.description !== next.description) push({ id: changeId("column", tableId, columnId, "description", "changed"), kind: "changed", entityType: "column", path: `${path}.description`, title: `Column ${nextTable.name}.${next.name} description changed`, before: optional(previous.description), after: optional(next.description), severity: "info", tableId, columnId });
    }

    const indexMatch = matchEntities(previousTable.indexes, nextTable.indexes, [
      { reason: "id", beforeKey: (index) => index.id },
      { reason: "semantic", beforeKey: (index) => indexSemanticKey(previousTable, index), afterKey: (index) => indexSemanticKey(nextTable, index) },
      { reason: "name", beforeKey: (index) => index.name },
    ]);
    for (const index of indexMatch.removed) push({ id: changeId("index", previousTable.id, index.id, "removed"), kind: "removed", entityType: "index", path: `${tablePath}.indexes.${index.id}`, title: `Index ${index.name} removed`, before: index, severity: "warning", tableId: previousTable.id, indexId: index.id });
    for (const index of indexMatch.added) push({ id: changeId("index", tableId, index.id, "added"), kind: "added", entityType: "index", path: `${tablePath}.indexes.${index.id}`, title: `Index ${index.name} added`, after: index, severity: index.unique ? "warning" : "info", ...(index.unique ? { breaking: true } : {}), tableId, indexId: index.id });
    for (const indexPair of indexMatch.matches) {
      const previous = indexPair.before;
      const next = indexPair.after;
      const indexId = previous.id;
      const path = `${tablePath}.indexes.${next.id}`;
      if (previous.name !== next.name) push({ id: changeId("index", tableId, indexId, "name", "renamed"), kind: "renamed", entityType: "index", path: `${path}.name`, title: `Index ${previous.name} renamed to ${next.name}`, before: previous.name, after: next.name, severity: "info", tableId, indexId });
      const previousColumns = columnNames(previousTable, previous.columns);
      const nextColumns = columnNames(nextTable, next.columns);
      if (valueChanged(previousColumns, nextColumns)) push({ id: changeId("index", tableId, indexId, "columns", "changed"), kind: "changed", entityType: "index", path: `${path}.columns`, title: `Index ${next.name} columns changed`, before: previousColumns, after: nextColumns, severity: "warning", tableId, indexId });
      if (previous.unique !== next.unique) push({ id: changeId("index", tableId, indexId, "unique", "changed"), kind: "changed", entityType: "index", path: `${path}.unique`, title: `Index ${next.name} uniqueness changed`, before: previous.unique, after: next.unique, severity: "warning", ...(next.unique ? { breaking: true } : {}), tableId, indexId });
      if (previous.method !== next.method) push({ id: changeId("index", tableId, indexId, "method", "changed"), kind: "changed", entityType: "index", path: `${path}.method`, title: `Index ${next.name} method changed`, before: optional(previous.method), after: optional(next.method), severity: "warning", tableId, indexId });
      if (previous.where !== next.where) push({ id: changeId("index", tableId, indexId, "where", "changed"), kind: "changed", entityType: "index", path: `${path}.where`, title: `Index ${next.name} predicate changed`, before: optional(previous.where), after: optional(next.where), severity: "warning", tableId, indexId });
      if (previous.description !== next.description) push({ id: changeId("index", tableId, indexId, "description", "changed"), kind: "changed", entityType: "index", path: `${path}.description`, title: `Index ${next.name} description changed`, before: optional(previous.description), after: optional(next.description), severity: "info", tableId, indexId });
    }
  }

  const relationMatch = matchEntities(before.relations, after.relations, [
    { reason: "id", beforeKey: (relation) => relation.id },
    { reason: "semantic", beforeKey: (relation) => relationSemanticKey(before, relation), afterKey: (relation) => relationSemanticKey(after, relation) },
    { reason: "name", beforeKey: (relation) => relation.name },
  ]);
  for (const relation of relationMatch.removed) push({ id: changeId("relation", relation.id, "removed"), kind: "removed", entityType: "relation", path: `relations.${relation.id}`, title: `Relation ${relation.name} removed`, before: relation, severity: "danger", destructive: true, breaking: true, relationId: relation.id });
  for (const relation of relationMatch.added) push({ id: changeId("relation", relation.id, "added"), kind: "added", entityType: "relation", path: `relations.${relation.id}`, title: `Relation ${relation.name} added`, after: relation, severity: "warning", relationId: relation.id });
  for (const relationPair of relationMatch.matches) {
    const previous = relationPair.before;
    const next = relationPair.after;
    const relationId = previous.id;
    const path = `relations.${next.id}`;
    if (previous.name !== next.name) push({ id: changeId("relation", relationId, "name", "renamed"), kind: "renamed", entityType: "relation", path: `${path}.name`, title: `Relation ${previous.name} renamed to ${next.name}`, before: previous.name, after: next.name, severity: "warning", breaking: true, relationId });
    const previousFrom = relationEndpointKey(before, previous.from);
    const nextFrom = relationEndpointKey(after, next.from);
    if (previousFrom !== nextFrom) push({ id: changeId("relation", relationId, "from", "changed"), kind: "changed", entityType: "relation", path: `${path}.from`, title: `Relation ${next.name} source changed`, before: previousFrom, after: nextFrom, severity: "danger", breaking: true, relationId });
    const previousTo = relationEndpointKey(before, previous.to);
    const nextTo = relationEndpointKey(after, next.to);
    if (previousTo !== nextTo) push({ id: changeId("relation", relationId, "to", "changed"), kind: "changed", entityType: "relation", path: `${path}.to`, title: `Relation ${next.name} target changed`, before: previousTo, after: nextTo, severity: "danger", breaking: true, relationId });
    if (previous.cardinality !== next.cardinality) push({ id: changeId("relation", relationId, "cardinality", "changed"), kind: "changed", entityType: "relation", path: `${path}.cardinality`, title: `Relation ${next.name} cardinality changed`, before: previous.cardinality, after: next.cardinality, severity: "warning", breaking: true, relationId });
    if (previous.onDelete !== next.onDelete) push({ id: changeId("relation", relationId, "onDelete", "changed"), kind: "changed", entityType: "relation", path: `${path}.onDelete`, title: `Relation ${next.name} ON DELETE changed`, before: optional(previous.onDelete), after: optional(next.onDelete), severity: "warning", breaking: true, relationId });
    if (previous.onUpdate !== next.onUpdate) push({ id: changeId("relation", relationId, "onUpdate", "changed"), kind: "changed", entityType: "relation", path: `${path}.onUpdate`, title: `Relation ${next.name} ON UPDATE changed`, before: optional(previous.onUpdate), after: optional(next.onUpdate), severity: "warning", breaking: true, relationId });
    if (previous.description !== next.description) push({ id: changeId("relation", relationId, "description", "changed"), kind: "changed", entityType: "relation", path: `${path}.description`, title: `Relation ${next.name} description changed`, before: optional(previous.description), after: optional(next.description), severity: "info", relationId });
  }

  const enumMatch = matchEntities(before.enums, after.enums, [
    { reason: "id", beforeKey: (item) => item.id },
    { reason: "name", beforeKey: (item) => item.name },
  ]);
  for (const item of enumMatch.removed) push({ id: changeId("enum", item.id, "removed"), kind: "removed", entityType: "enum", path: `enums.${item.id}`, title: `Enum ${item.name} removed`, before: item, severity: "danger", destructive: true, breaking: true, enumId: item.id });
  for (const item of enumMatch.added) push({ id: changeId("enum", item.id, "added"), kind: "added", entityType: "enum", path: `enums.${item.id}`, title: `Enum ${item.name} added`, after: item, severity: "info", enumId: item.id });
  for (const enumPair of enumMatch.matches) {
    const previous = enumPair.before;
    const next = enumPair.after;
    const enumId = previous.id;
    const path = `enums.${next.id}`;
    if (previous.name !== next.name) push({ id: changeId("enum", enumId, "name", "renamed"), kind: "renamed", entityType: "enum", path: `${path}.name`, title: `Enum ${previous.name} renamed to ${next.name}`, before: previous.name, after: next.name, severity: "warning", breaking: true, enumId });
    const previousSet = new Set(previous.values);
    const nextSet = new Set(next.values);
    for (const value of previous.values.filter((item) => !nextSet.has(item)).sort(compareText)) push({ id: changeId("enum_value", enumId, value, "removed"), kind: "removed", entityType: "enum_value", path: `${path}.values.${value}`, title: `Enum value ${next.name}.${value} removed`, before: value, severity: "danger", destructive: true, breaking: true, enumId });
    for (const value of next.values.filter((item) => !previousSet.has(item)).sort(compareText)) push({ id: changeId("enum_value", enumId, value, "added"), kind: "added", entityType: "enum_value", path: `${path}.values.${value}`, title: `Enum value ${next.name}.${value} added`, after: value, severity: "warning", enumId });
    if (previous.values.length === next.values.length && previous.values.every((value) => nextSet.has(value)) && valueChanged(previous.values, next.values)) push({ id: changeId("enum", enumId, "order", "changed"), kind: "changed", entityType: "enum", path: `${path}.values`, title: `Enum ${next.name} value order changed`, before: previous.values, after: next.values, severity: "warning", enumId });
    if (previous.description !== next.description) push({ id: changeId("enum", enumId, "description", "changed"), kind: "changed", entityType: "enum", path: `${path}.description`, title: `Enum ${next.name} description changed`, before: optional(previous.description), after: optional(next.description), severity: "info", enumId });
  }

  const entityOrder: Record<DiffEntityType, number> = { project: 0, table: 1, column: 2, relation: 3, index: 4, enum: 5, enum_value: 6 };
  changes.sort((left, right) => entityOrder[left.entityType] - entityOrder[right.entityType] || compareText(left.path, right.path) || compareText(left.id, right.id));
  warnings.sort((left, right) => compareText(left.path ?? "", right.path ?? "") || compareText(left.code, right.code));
  const summary: SchemaDiffSummary = {
    added: changes.filter((change) => change.kind === "added").length,
    removed: changes.filter((change) => change.kind === "removed").length,
    changed: changes.filter((change) => change.kind === "changed").length,
    renamed: changes.filter((change) => change.kind === "renamed").length,
    destructive: changes.filter((change) => change.destructive).length,
    breaking: changes.filter((change) => change.breaking).length,
  };
  return { changes, summary, warnings };
}
