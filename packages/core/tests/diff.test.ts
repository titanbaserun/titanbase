import { describe, expect, it } from "vitest";
import { diffSchemas, type SchemaDiffChange, type TitanSchema } from "../src";

function schema(): TitanSchema {
  return {
    titanVersion: "1.0",
    project: { id: "shop", name: "Shop", description: "Store schema" },
    dialect: "postgres",
    tables: [
      {
        id: "users",
        name: "users",
        description: "Customers",
        columns: [
          { id: "users.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true, default: "gen_random_uuid()" },
          { id: "users.email", name: "email", type: "text", nullable: false, primaryKey: false, unique: true },
        ],
        indexes: [{ id: "users.email.idx", name: "users_email_idx", table: "users", columns: ["users.email"], unique: false, method: "btree" }],
      },
      {
        id: "orders",
        name: "orders",
        columns: [
          { id: "orders.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true },
          { id: "orders.user_id", name: "user_id", type: "uuid", nullable: false, primaryKey: false, unique: false },
          { id: "orders.status", name: "status", type: "order_status", nullable: false, primaryKey: false, unique: false, default: "'pending'" },
        ],
        indexes: [{ id: "orders.user.idx", name: "orders_user_idx", table: "orders", columns: ["orders.user_id"], unique: false, method: "btree" }],
      },
    ],
    enums: [{ id: "order_status", name: "order_status", values: ["pending", "paid"] }],
    relations: [{ id: "orders_user", name: "orders_user", from: { table: "orders", columns: ["orders.user_id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "many-to-one", onDelete: "cascade", onUpdate: "restrict" }],
    metadata: { editor: { tablePositions: { users: { x: 20, y: 40 }, orders: { x: 400, y: 40 } } } },
  };
}

const clone = () => structuredClone(schema());
const find = (changes: SchemaDiffChange[], fragment: string) => changes.find((change) => change.path.includes(fragment));

describe("project diff", () => {
  it("detects project name changes", () => {
    const after = clone();
    after.project.name = "Commerce";
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ entityType: "project", path: "project.name", severity: "info", before: "Shop", after: "Commerce" }));
  });

  it("marks dialect changes as breaking warnings", () => {
    const after = clone();
    after.dialect = "mysql";
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ path: "project.dialect", severity: "warning", breaking: true }));
  });
});

describe("table diff", () => {
  it("detects added tables", () => {
    const after = clone();
    after.tables.push({ id: "products", name: "products", columns: [], indexes: [] });
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "added", entityType: "table", tableId: "products", severity: "info" }));
  });

  it("marks removed tables as destructive", () => {
    const after = clone();
    after.tables = after.tables.filter((table) => table.id !== "orders");
    after.relations = [];
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "removed", entityType: "table", tableId: "orders", destructive: true, breaking: true }));
  });

  it("detects a table rename by stable id", () => {
    const after = clone();
    after.tables[0]!.name = "customers";
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "renamed", entityType: "table", before: "users", after: "customers", breaking: true }));
  });

  it("detects table description changes", () => {
    const after = clone();
    after.tables[0]!.description = "Application users";
    expect(find(diffSchemas(schema(), after).changes, "tables.users.description")).toMatchObject({ severity: "info" });
  });

  it("uses a conservative table rename heuristic", () => {
    const after = clone();
    after.tables[0]!.id = "customers";
    after.tables[0]!.name = "customers";
    after.tables[0]!.columns = after.tables[0]!.columns.map((column) => ({ ...column, id: column.id.replace("users", "customers") }));
    after.tables[0]!.indexes = [];
    after.relations = [];
    const result = diffSchemas(schema(), after);
    expect(result.changes).toContainEqual(expect.objectContaining({ kind: "renamed", entityType: "table", before: "users", after: "customers" }));
    expect(result.warnings.map((warning) => warning.code)).toContain("heuristic_table_rename");
  });
});

describe("column diff", () => {
  it("treats a nullable added column as informational", () => {
    const after = clone();
    after.tables[0]!.columns.push({ id: "users.name", name: "name", type: "text", nullable: true, primaryKey: false, unique: false });
    expect(find(diffSchemas(schema(), after).changes, "users.name")).toMatchObject({ kind: "added", severity: "info" });
  });

  it("marks a required added column without default as breaking", () => {
    const after = clone();
    after.tables[0]!.columns.push({ id: "users.name", name: "name", type: "text", nullable: false, primaryKey: false, unique: false });
    expect(find(diffSchemas(schema(), after).changes, "users.name")).toMatchObject({ kind: "added", severity: "warning", breaking: true });
  });

  it("marks removed columns as destructive and breaking", () => {
    const after = clone();
    after.tables[0]!.columns = after.tables[0]!.columns.filter((column) => column.id !== "users.email");
    after.tables[0]!.indexes = [];
    expect(find(diffSchemas(schema(), after).changes, "users.email")).toMatchObject({ kind: "removed", destructive: true, breaking: true });
  });

  it("detects column renames by stable id", () => {
    const after = clone();
    after.tables[0]!.columns[1]!.name = "email_address";
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "renamed", entityType: "column", before: "email", after: "email_address" }));
  });

  it("detects incompatible type changes as destructive", () => {
    const after = clone();
    after.tables[0]!.columns[1]!.type = "integer";
    expect(find(diffSchemas(schema(), after).changes, ".type")).toMatchObject({ severity: "danger", destructive: true, breaking: true });
  });

  it("detects nullability changes", () => {
    const after = clone();
    after.tables[0]!.columns[1]!.nullable = true;
    expect(find(diffSchemas(schema(), after).changes, ".nullable")).toMatchObject({ severity: "info", before: false, after: true });
  });

  it("marks nullable to required as breaking", () => {
    const before = clone();
    before.tables[0]!.columns[1]!.nullable = true;
    const result = diffSchemas(before, schema());
    expect(find(result.changes, ".nullable")).toMatchObject({ severity: "warning", breaking: true });
  });

  it("detects default changes", () => {
    const after = clone();
    after.tables[0]!.columns[1]!.default = "'unknown'";
    expect(find(diffSchemas(schema(), after).changes, ".default")).toMatchObject({ severity: "warning" });
  });

  it("marks primary key changes as destructive", () => {
    const after = clone();
    after.tables[0]!.columns[0]!.primaryKey = false;
    expect(find(diffSchemas(schema(), after).changes, ".primaryKey")).toMatchObject({ severity: "danger", destructive: true, breaking: true });
  });

  it("marks added uniqueness as breaking", () => {
    const after = clone();
    after.tables[1]!.columns[1]!.unique = true;
    expect(find(diffSchemas(schema(), after).changes, ".unique")).toMatchObject({ severity: "warning", breaking: true });
  });
});

describe("relation diff", () => {
  it("detects added relations", () => {
    const before = clone();
    before.relations = [];
    expect(diffSchemas(before, schema()).changes).toContainEqual(expect.objectContaining({ kind: "added", entityType: "relation", severity: "warning" }));
  });

  it("marks removed relations as destructive", () => {
    const after = clone();
    after.relations = [];
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "removed", entityType: "relation", destructive: true, breaking: true }));
  });

  it("detects relation endpoint changes", () => {
    const after = clone();
    after.relations[0]!.to.columns = ["users.email"];
    expect(find(diffSchemas(schema(), after).changes, ".to")).toMatchObject({ severity: "danger", breaking: true });
  });

  it("detects ON DELETE and ON UPDATE changes", () => {
    const after = clone();
    after.relations[0]!.onDelete = "restrict";
    after.relations[0]!.onUpdate = "cascade";
    const changes = diffSchemas(schema(), after).changes;
    expect(find(changes, ".onDelete")).toMatchObject({ severity: "warning", breaking: true });
    expect(find(changes, ".onUpdate")).toMatchObject({ severity: "warning", breaking: true });
  });
});

describe("index diff", () => {
  it("detects added indexes", () => {
    const before = clone();
    before.tables[1]!.indexes = [];
    expect(diffSchemas(before, schema()).changes).toContainEqual(expect.objectContaining({ kind: "added", entityType: "index", severity: "info" }));
  });

  it("detects removed indexes", () => {
    const after = clone();
    after.tables[1]!.indexes = [];
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "removed", entityType: "index", severity: "warning" }));
  });

  it("detects index column changes", () => {
    const after = clone();
    after.tables[1]!.indexes[0]!.columns = ["orders.status"];
    expect(find(diffSchemas(schema(), after).changes, ".columns")).toMatchObject({ entityType: "index", severity: "warning" });
  });

  it("marks unique index additions as breaking", () => {
    const after = clone();
    after.tables[1]!.indexes.push({ id: "orders.status.unique", name: "orders_status_unique", table: "orders", columns: ["orders.status"], unique: true, method: "btree" });
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "added", entityType: "index", breaking: true }));
  });

  it("detects partial index changes", () => {
    const after = clone();
    after.tables[1]!.indexes[0]!.where = "status = 'paid'";
    expect(find(diffSchemas(schema(), after).changes, ".where")).toMatchObject({ severity: "warning" });
  });
});

describe("enum diff", () => {
  it("detects added enums", () => {
    const before = clone();
    before.enums = [];
    expect(diffSchemas(before, schema()).changes).toContainEqual(expect.objectContaining({ kind: "added", entityType: "enum", severity: "info" }));
  });

  it("marks removed enums as destructive", () => {
    const after = clone();
    after.enums = [];
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "removed", entityType: "enum", destructive: true, breaking: true }));
  });

  it("detects added enum values", () => {
    const after = clone();
    after.enums[0]!.values.push("shipped");
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "added", entityType: "enum_value", after: "shipped", severity: "warning" }));
  });

  it("marks removed enum values as destructive", () => {
    const after = clone();
    after.enums[0]!.values = ["pending"];
    expect(diffSchemas(schema(), after).changes).toContainEqual(expect.objectContaining({ kind: "removed", entityType: "enum_value", before: "paid", destructive: true, breaking: true }));
  });

  it("represents enum value renames as removed and added", () => {
    const after = clone();
    after.enums[0]!.values = ["pending", "settled"];
    const changes = diffSchemas(schema(), after).changes.filter((change) => change.entityType === "enum_value");
    expect(changes.map((change) => change.kind).sort()).toEqual(["added", "removed"]);
  });

  it("detects enum value order changes", () => {
    const after = clone();
    after.enums[0]!.values.reverse();
    expect(find(diffSchemas(schema(), after).changes, "enums.order_status.values")).toMatchObject({ kind: "changed", severity: "warning" });
  });
});

describe("determinism and metadata", () => {
  it("returns identical ordered changes for repeated calls", () => {
    const after = clone();
    after.project.name = "Commerce";
    after.tables[0]!.columns[1]!.nullable = true;
    expect(diffSchemas(schema(), after)).toEqual(diffSchemas(schema(), after));
  });

  it("ignores input collection order", () => {
    const before = clone();
    const after = clone();
    after.tables.reverse();
    for (const table of after.tables) { table.columns.reverse(); table.indexes.reverse(); }
    after.enums.reverse();
    after.relations.reverse();
    expect(diffSchemas(before, after).changes).toEqual([]);
  });

  it("ignores editor table positions", () => {
    const after = clone();
    after.metadata.editor.tablePositions.users = { x: 999, y: -400 };
    expect(diffSchemas(schema(), after).changes).toEqual([]);
  });

  it("does not mutate inputs", () => {
    const before = clone();
    const after = clone();
    after.tables[0]!.name = "customers";
    const beforeSnapshot = structuredClone(before);
    const afterSnapshot = structuredClone(after);
    diffSchemas(before, after);
    expect(before).toEqual(beforeSnapshot);
    expect(after).toEqual(afterSnapshot);
  });

  it("computes summary counters", () => {
    const after = clone();
    after.tables[0]!.columns = after.tables[0]!.columns.filter((column) => column.id !== "users.email");
    after.tables[0]!.indexes = [];
    const summary = diffSchemas(schema(), after).summary;
    expect(summary.removed).toBe(2);
    expect(summary.destructive).toBe(1);
    expect(summary.breaking).toBe(1);
  });
});
