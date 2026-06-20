import type { RelationCardinality, TitanRelation, TitanSchema, TitanTable } from "@titanbase/core";

export interface SchemaStatistics {
  tables: number;
  columns: number;
  relations: number;
  indexes: number;
  enums: number;
}

export function getSchemaStatistics(schema: TitanSchema): SchemaStatistics {
  return {
    tables: schema.tables.length,
    columns: schema.tables.reduce((total, table) => total + table.columns.length, 0),
    relations: schema.relations.length,
    indexes: schema.tables.reduce((total, table) => total + table.indexes.length, 0),
    enums: schema.enums.length,
  };
}

export function isForeignKeyColumn(schema: TitanSchema, tableId: string, columnId: string): boolean {
  return schema.relations.some((relation) => relation.from.table === tableId && relation.from.columns.includes(columnId));
}

export function isIndexedColumn(table: TitanTable, columnId: string): boolean {
  return table.indexes.some((index) => index.columns.includes(columnId));
}

export function compactCardinality(cardinality: RelationCardinality): string {
  return ({
    "one-to-one": "1:1",
    "one-to-many": "1:N",
    "many-to-one": "N:1",
    "many-to-many": "N:M",
  })[cardinality];
}

export function createRelationLabel(schema: TitanSchema, relation: TitanRelation): string {
  const fromTable = schema.tables.find((table) => table.id === relation.from.table);
  const toTable = schema.tables.find((table) => table.id === relation.to.table);
  const fromColumns = relation.from.columns.map((id) => fromTable?.columns.find((column) => column.id === id)?.name ?? id).join(", ");
  const toColumns = relation.to.columns.map((id) => toTable?.columns.find((column) => column.id === id)?.name ?? id).join(", ");
  return `${fromTable?.name ?? relation.from.table}.${fromColumns} → ${toTable?.name ?? relation.to.table}.${toColumns} · ${compactCardinality(relation.cardinality)}`;
}
