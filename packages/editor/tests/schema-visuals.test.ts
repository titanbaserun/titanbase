import { describe, expect, it } from "vitest";
import type { TitanSchema } from "@titanbase/core";
import { compactCardinality, createRelationLabel, getSchemaStatistics, isForeignKeyColumn, isIndexedColumn } from "../src/schema-visuals";

const schema: TitanSchema = {
  titanVersion: "1.0",
  project: { id: "shop", name: "Shop" },
  dialect: "postgres",
  tables: [
    { id: "customers", name: "customers", columns: [{ id: "customers.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true }], indexes: [] },
    { id: "orders", name: "orders", columns: [
      { id: "orders.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true },
      { id: "orders.customer_id", name: "customer_id", type: "uuid", nullable: false, primaryKey: false, unique: false },
    ], indexes: [{ id: "orders.customer_idx", name: "orders_customer_idx", table: "orders", columns: ["orders.customer_id"], unique: false }] },
  ],
  relations: [{ id: "orders_customer", name: "orders_customer", from: { table: "orders", columns: ["orders.customer_id"] }, to: { table: "customers", columns: ["customers.id"] }, cardinality: "many-to-one" }],
  enums: [{ id: "status", name: "status", values: ["open", "paid"] }],
  metadata: { editor: { tablePositions: { customers: { x: 0, y: 0 }, orders: { x: 300, y: 0 } } } },
};

describe("schema visual helpers", () => {
  it("detects foreign key columns", () => {
    expect(isForeignKeyColumn(schema, "orders", "orders.customer_id")).toBe(true);
    expect(isForeignKeyColumn(schema, "orders", "orders.id")).toBe(false);
  });

  it("detects indexed columns", () => {
    expect(isIndexedColumn(schema.tables[1]!, "orders.customer_id")).toBe(true);
    expect(isIndexedColumn(schema.tables[1]!, "orders.id")).toBe(false);
  });

  it("creates explicit relation labels", () => {
    expect(createRelationLabel(schema, schema.relations[0]!)).toBe("orders.customer_id → customers.id · N:1");
    expect(compactCardinality("many-to-many")).toBe("N:M");
  });

  it("calculates schema statistics", () => {
    expect(getSchemaStatistics(schema)).toEqual({ tables: 2, columns: 3, relations: 1, indexes: 1, enums: 1 });
  });
});
