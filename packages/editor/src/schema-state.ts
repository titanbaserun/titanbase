import { useReducer } from "react";
import type { TitanColumn, TitanEnum, TitanIndex, TitanPosition, TitanRelation, TitanSchema, TitanTable } from "@titanbase/core";

export type EditorSelection =
  | { kind: "table"; tableId: string }
  | { kind: "column"; tableId: string; columnId: string }
  | { kind: "relation"; relationId: string }
  | { kind: "index"; tableId: string; indexId: string }
  | { kind: "enum"; enumId: string }
  | null;

export type MultiSelection = {
  tableIds: Set<string>;
  relationIds: Set<string>;
};

export type TablePatch = { name?: string; schema?: string | undefined; description?: string | undefined };
export type ColumnPatch = { name?: string; type?: string; nativeType?: string | undefined; nullable?: boolean; primaryKey?: boolean; unique?: boolean; default?: string | undefined; description?: string | undefined };
export type RelationPatch = { name?: string; from?: TitanRelation["from"]; to?: TitanRelation["to"]; cardinality?: TitanRelation["cardinality"]; onDelete?: TitanRelation["onDelete"] | undefined; onUpdate?: TitanRelation["onUpdate"] | undefined; description?: string | undefined };
export type IndexPatch = { name?: string; columns?: string[]; unique?: boolean; method?: string | undefined; where?: string | undefined; description?: string | undefined };
export type EnumPatch = { name?: string; values?: string[]; description?: string | undefined };

export type SchemaMutation =
  | { type: "table.add"; table: TitanTable; position: TitanPosition }
  | { type: "table.update"; tableId: string; patch: TablePatch }
  | { type: "table.delete"; tableId: string }
  | { type: "column.add"; tableId: string; column: TitanColumn }
  | { type: "column.update"; tableId: string; columnId: string; patch: ColumnPatch }
  | { type: "column.delete"; tableId: string; columnId: string }
  | { type: "column.reorder"; tableId: string; columnId: string; toIndex: number }
  | { type: "relation.add"; relation: TitanRelation }
  | { type: "relation.update"; relationId: string; patch: RelationPatch }
  | { type: "relation.delete"; relationId: string }
  | { type: "index.add"; tableId: string; index: TitanIndex }
  | { type: "index.update"; tableId: string; indexId: string; patch: IndexPatch }
  | { type: "index.delete"; tableId: string; indexId: string }
  | { type: "enum.add"; enumDefinition: TitanEnum }
  | { type: "enum.update"; enumId: string; patch: EnumPatch }
  | { type: "enum.delete"; enumId: string }
  | { type: "position.update"; tableId: string; position: TitanPosition };

export function applySchemaMutation(schema: TitanSchema, mutation: SchemaMutation): TitanSchema {
  switch (mutation.type) {
    // ----- Tables -----

    case "table.add":
      return {
        ...schema,
        tables: [...schema.tables, mutation.table],
        metadata: { editor: { tablePositions: { ...schema.metadata.editor.tablePositions, [mutation.table.id]: mutation.position } } },
      };

    case "table.update":
      return { ...schema, tables: schema.tables.map((t) => t.id === mutation.tableId ? mergePatch(t, mutation.patch) : t) };

    case "table.delete": {
      // Cascade: remove relations that reference this table, and its editor position.
      // Indexes are stored inside the table so they're removed implicitly.
      const { [mutation.tableId]: _, ...remainingPositions } = schema.metadata.editor.tablePositions;
      return {
        ...schema,
        tables: schema.tables.filter((t) => t.id !== mutation.tableId),
        relations: schema.relations.filter((r) => r.from.table !== mutation.tableId && r.to.table !== mutation.tableId),
        metadata: { editor: { tablePositions: remainingPositions } },
      };
    }

    case "column.add":
      return { ...schema, tables: schema.tables.map((t) => t.id === mutation.tableId ? { ...t, columns: [...t.columns, mutation.column] } : t) };

    case "column.update":
      return { ...schema, tables: schema.tables.map((t) => t.id === mutation.tableId ? { ...t, columns: t.columns.map((c) => c.id === mutation.columnId ? mergePatch(c, mutation.patch) : c) } : t) };

    case "column.delete": {
      return {
        ...schema,
        tables: schema.tables.map((t) => {
          if (t.id !== mutation.tableId) return t;
          return {
            ...t,
            columns: t.columns.filter((c) => c.id !== mutation.columnId),
            indexes: t.indexes
              .map((idx) => ({ ...idx, columns: idx.columns.filter((id) => id !== mutation.columnId) }))
              .filter((idx) => idx.columns.length > 0),
          };
        }),
        relations: schema.relations.filter((r) =>
          !r.from.columns.includes(mutation.columnId) && !r.to.columns.includes(mutation.columnId)
        ),
      };
    }

    case "column.reorder": {
      return { ...schema, tables: schema.tables.map((t) => {
        if (t.id !== mutation.tableId) return t;
        const columns = [...t.columns];
        const fromIndex = columns.findIndex((c) => c.id === mutation.columnId);
        if (fromIndex === -1) return t;
        const [moved] = columns.splice(fromIndex, 1);
        columns.splice(mutation.toIndex, 0, moved!);
        return { ...t, columns };
      }) };
    }

    // ----- Relations -----

    case "relation.add":
      return { ...schema, relations: [...schema.relations, mutation.relation] };

    case "relation.update":
      return { ...schema, relations: schema.relations.map((r) => r.id === mutation.relationId ? mergePatch(r, mutation.patch) : r) };

    case "relation.delete":
      return { ...schema, relations: schema.relations.filter((r) => r.id !== mutation.relationId) };

    // ----- Indexes -----

    case "index.add":
      return { ...schema, tables: schema.tables.map((t) => t.id === mutation.tableId ? { ...t, indexes: [...t.indexes, mutation.index] } : t) };

    case "index.update":
      return { ...schema, tables: schema.tables.map((t) => t.id === mutation.tableId ? { ...t, indexes: t.indexes.map((idx) => idx.id === mutation.indexId ? mergePatch(idx, mutation.patch) : idx) } : t) };

    case "index.delete":
      return { ...schema, tables: schema.tables.map((t) => t.id === mutation.tableId ? { ...t, indexes: t.indexes.filter((idx) => idx.id !== mutation.indexId) } : t) };

    // ----- Enums -----

    case "enum.add":
      return { ...schema, enums: [...schema.enums, mutation.enumDefinition] };

    case "enum.update":
      return { ...schema, enums: schema.enums.map((e) => e.id === mutation.enumId ? mergePatch(e, mutation.patch) : e) };

    case "enum.delete": {
      const enumDef = schema.enums.find((e) => e.id === mutation.enumId);
      const enumName = enumDef?.name.toLowerCase();
      const convertColumn = (c: TitanColumn): TitanColumn =>
        enumName && c.type.toLowerCase() === enumName ? { ...c, type: "text" } : c;
      return {
        ...schema,
        tables: enumName
          ? schema.tables.map((t) => ({ ...t, columns: t.columns.map(convertColumn) }))
          : schema.tables,
        enums: schema.enums.filter((e) => e.id !== mutation.enumId),
      };
    }

    // ----- Positions -----

    case "position.update":
      return { ...schema, metadata: { editor: { tablePositions: { ...schema.metadata.editor.tablePositions, [mutation.tableId]: mutation.position } } } };
  }
}

/** Shallow merge a patch into an object. Undefined values remove the key. */
function mergePatch<T extends object>(value: T, patch: object): T {
  const next = { ...value } as Record<string, unknown>;
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) delete next[key];
    else next[key] = patchValue;
  }
  return next as T;
}

export interface SchemaHistoryState {
  past: TitanSchema[];
  present: TitanSchema;
  future: TitanSchema[];
}

export type SchemaHistoryAction =
  | { type: "commit"; mutation: SchemaMutation }
  | { type: "replace"; schema: TitanSchema }
  | { type: "commit-from"; before: TitanSchema; schema: TitanSchema }
  | { type: "reset"; schema: TitanSchema }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 80;

export function schemaHistoryReducer(state: SchemaHistoryState, action: SchemaHistoryAction): SchemaHistoryState {
  switch (action.type) {
    case "commit": {
      const present = applySchemaMutation(state.present, action.mutation);
      if (present === state.present) return state;
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present, future: [] };
    }
    case "replace":
      // Used for live updates (e.g. dragging) that shouldn't create undo entries.
      return { ...state, present: action.schema };
    case "commit-from":
      // Used for batch operations: record a single undo entry for multiple mutations.
      return { past: [...state.past, action.before].slice(-HISTORY_LIMIT), present: action.schema, future: [] };
    case "reset":
      // Used when loading a completely new schema (import, template switch).
      return { past: [], present: action.schema, future: [] };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future].slice(0, HISTORY_LIMIT) };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: next, future: state.future.slice(1) };
    }
  }
}

export function useSchemaHistory(initialSchema: TitanSchema) {
  const [history, dispatch] = useReducer(schemaHistoryReducer, { past: [], present: initialSchema, future: [] });
  return {
    schema: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit: (mutation: SchemaMutation) => dispatch({ type: "commit", mutation }),
    replace: (schema: TitanSchema) => dispatch({ type: "replace", schema }),
    commitFrom: (before: TitanSchema, schema: TitanSchema) => dispatch({ type: "commit-from", before, schema }),
    reset: (schema: TitanSchema) => dispatch({ type: "reset", schema }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
  };
}

export function selectionForDiagnostic(path: string, schema: TitanSchema): EditorSelection {
  const parts = path.split(".");
  const entityIndex = Number(parts[1]);
  if (parts[0] === "tables" && Number.isInteger(entityIndex)) {
    const table = schema.tables[entityIndex];
    if (!table) return null;
    if (parts[2] === "columns") {
      const column = table.columns[Number(parts[3])];
      return column ? { kind: "column", tableId: table.id, columnId: column.id } : { kind: "table", tableId: table.id };
    }
    if (parts[2] === "indexes") {
      const index = table.indexes[Number(parts[3])];
      return index ? { kind: "index", tableId: table.id, indexId: index.id } : { kind: "table", tableId: table.id };
    }
    return { kind: "table", tableId: table.id };
  }
  if (parts[0] === "relations" && Number.isInteger(entityIndex)) {
    const relation = schema.relations[entityIndex];
    return relation ? { kind: "relation", relationId: relation.id } : null;
  }
  if (parts[0] === "enums" && Number.isInteger(entityIndex)) {
    const enumDefinition = schema.enums[entityIndex];
    return enumDefinition ? { kind: "enum", enumId: enumDefinition.id } : null;
  }
  const tableId = parts[3];
  return parts[0] === "metadata" && tableId && schema.tables.some((t) => t.id === tableId) ? { kind: "table", tableId } : null;
}
