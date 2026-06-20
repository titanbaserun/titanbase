import { describe, expect, it } from "vitest";
import type { TitanSchema } from "@titanbase/core";
import { applySchemaMutation, schemaHistoryReducer, type SchemaHistoryState } from "../src/schema-state";

const base: TitanSchema = {
  titanVersion: "1.0",
  project: { id: "test", name: "Test" },
  dialect: "postgres",
  tables: [
    {
      id: "users", name: "users",
      columns: [
        { id: "users.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true },
        { id: "users.email", name: "email", type: "text", nullable: false, primaryKey: false, unique: true },
      ],
      indexes: [{ id: "users.email_idx", name: "users_email_idx", table: "users", columns: ["users.email"], unique: true }],
    },
    {
      id: "posts", name: "posts",
      columns: [
        { id: "posts.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true },
        { id: "posts.user_id", name: "user_id", type: "uuid", nullable: false, primaryKey: false, unique: false },
      ],
      indexes: [],
    },
  ],
  enums: [{ id: "role", name: "role", values: ["admin", "member"] }],
  relations: [
    { id: "posts_user", name: "posts_user", from: { table: "posts", columns: ["posts.user_id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "many-to-one", onDelete: "cascade" },
  ],
  metadata: { editor: { tablePositions: { users: { x: 0, y: 0 }, posts: { x: 300, y: 0 } } } },
};

describe("applySchemaMutation", () => {
  // --- Table mutations ---

  it("adds a table with position", () => {
    const table = { id: "comments", name: "comments", columns: [], indexes: [] };
    const next = applySchemaMutation(base, { type: "table.add", table, position: { x: 100, y: 200 } });
    expect(next.tables).toHaveLength(3);
    expect(next.tables[2]?.name).toBe("comments");
    expect(next.metadata.editor.tablePositions.comments).toEqual({ x: 100, y: 200 });
  });

  it("updates a table", () => {
    const next = applySchemaMutation(base, { type: "table.update", tableId: "users", patch: { name: "accounts" } });
    expect(next.tables[0]?.name).toBe("accounts");
  });

  it("deletes a table and cascades relations + positions", () => {
    const next = applySchemaMutation(base, { type: "table.delete", tableId: "users" });
    expect(next.tables).toHaveLength(1);
    expect(next.tables[0]?.id).toBe("posts");
    // Relation referencing users is removed
    expect(next.relations).toHaveLength(0);
    // Position is removed
    expect(next.metadata.editor.tablePositions.users).toBeUndefined();
    expect(next.metadata.editor.tablePositions.posts).toBeDefined();
  });

  // --- Column mutations ---

  it("adds a column", () => {
    const col = { id: "users.name", name: "name", type: "text", nullable: false, primaryKey: false, unique: false };
    const next = applySchemaMutation(base, { type: "column.add", tableId: "users", column: col });
    expect(next.tables[0]?.columns).toHaveLength(3);
  });

  it("updates a column without mutating original", () => {
    const next = applySchemaMutation(base, { type: "column.update", tableId: "users", columnId: "users.id", patch: { description: "Primary key." } });
    expect(next.tables[0]?.columns[0]?.description).toBe("Primary key.");
    expect(base.tables[0]?.columns[0]?.description).toBeUndefined();
  });

  it("deletes a column and removes it from indexes", () => {
    const next = applySchemaMutation(base, { type: "column.delete", tableId: "users", columnId: "users.email" });
    expect(next.tables[0]?.columns).toHaveLength(1);
    // Index that only referenced email is removed (becomes empty)
    expect(next.tables[0]?.indexes).toHaveLength(0);
  });

  it("deletes a column and removes dependent relations", () => {
    const next = applySchemaMutation(base, { type: "column.delete", tableId: "posts", columnId: "posts.user_id" });
    // Relation posts_user references posts.user_id, should be removed
    expect(next.relations).toHaveLength(0);
  });

  it("reorders columns", () => {
    const next = applySchemaMutation(base, { type: "column.reorder", tableId: "users", columnId: "users.email", toIndex: 0 });
    expect(next.tables[0]?.columns[0]?.id).toBe("users.email");
    expect(next.tables[0]?.columns[1]?.id).toBe("users.id");
  });

  // --- Relation mutations ---

  it("adds a relation", () => {
    const relation = { id: "new_rel", name: "new_rel", from: { table: "posts", columns: ["posts.id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "one-to-one" as const };
    const next = applySchemaMutation(base, { type: "relation.add", relation });
    expect(next.relations).toHaveLength(2);
  });

  it("updates a relation", () => {
    const next = applySchemaMutation(base, { type: "relation.update", relationId: "posts_user", patch: { onDelete: "restrict" } });
    expect(next.relations[0]?.onDelete).toBe("restrict");
  });

  it("deletes a relation", () => {
    const next = applySchemaMutation(base, { type: "relation.delete", relationId: "posts_user" });
    expect(next.relations).toHaveLength(0);
  });

  // --- Index mutations ---

  it("adds an index", () => {
    const index = { id: "posts.user_idx", name: "posts_user_idx", table: "posts", columns: ["posts.user_id"], unique: false };
    const next = applySchemaMutation(base, { type: "index.add", tableId: "posts", index });
    expect(next.tables[1]?.indexes).toHaveLength(1);
  });

  it("updates an index", () => {
    const next = applySchemaMutation(base, { type: "index.update", tableId: "users", indexId: "users.email_idx", patch: { unique: false } });
    expect(next.tables[0]?.indexes[0]?.unique).toBe(false);
  });

  it("deletes an index", () => {
    const next = applySchemaMutation(base, { type: "index.delete", tableId: "users", indexId: "users.email_idx" });
    expect(next.tables[0]?.indexes).toHaveLength(0);
  });

  // --- Enum mutations ---

  it("adds an enum", () => {
    const next = applySchemaMutation(base, { type: "enum.add", enumDefinition: { id: "status", name: "status", values: ["active", "inactive"] } });
    expect(next.enums).toHaveLength(2);
  });

  it("updates an enum", () => {
    const next = applySchemaMutation(base, { type: "enum.update", enumId: "role", patch: { values: ["admin", "member", "viewer"] } });
    expect(next.enums[0]?.values).toHaveLength(3);
  });

  it("deletes an enum and converts referencing columns to text", () => {
    // Add a column that uses the enum type
    const withEnumCol = applySchemaMutation(base, {
      type: "column.add", tableId: "users",
      column: { id: "users.role", name: "role", type: "role", nullable: false, primaryKey: false, unique: false },
    });
    const next = applySchemaMutation(withEnumCol, { type: "enum.delete", enumId: "role" });
    expect(next.enums).toHaveLength(0);
    // Column type converted to "text"
    const roleCol = next.tables[0]?.columns.find((c) => c.id === "users.role");
    expect(roleCol?.type).toBe("text");
  });

  // --- Position mutations ---

  it("updates table position", () => {
    const next = applySchemaMutation(base, { type: "position.update", tableId: "users", position: { x: 50, y: 75 } });
    expect(next.metadata.editor.tablePositions.users).toEqual({ x: 50, y: 75 });
  });
});

describe("schemaHistoryReducer", () => {
  const initial: SchemaHistoryState = { past: [], present: base, future: [] };

  it("commit pushes to history and clears future", () => {
    const s1 = schemaHistoryReducer(initial, { type: "commit", mutation: { type: "table.update", tableId: "users", patch: { name: "accounts" } } });
    expect(s1.past).toHaveLength(1);
    expect(s1.present.tables[0]?.name).toBe("accounts");
    expect(s1.future).toHaveLength(0);
  });

  it("undo restores previous state and puts current in future", () => {
    const s1 = schemaHistoryReducer(initial, { type: "commit", mutation: { type: "table.update", tableId: "users", patch: { name: "accounts" } } });
    const s2 = schemaHistoryReducer(s1, { type: "undo" });
    expect(s2.present.tables[0]?.name).toBe("users");
    expect(s2.future).toHaveLength(1);
  });

  it("redo goes forward", () => {
    const s1 = schemaHistoryReducer(initial, { type: "commit", mutation: { type: "table.update", tableId: "users", patch: { name: "accounts" } } });
    const s2 = schemaHistoryReducer(s1, { type: "undo" });
    const s3 = schemaHistoryReducer(s2, { type: "redo" });
    expect(s3.present.tables[0]?.name).toBe("accounts");
    expect(s3.future).toHaveLength(0);
  });

  it("replace does not push to history", () => {
    const s1 = schemaHistoryReducer(initial, { type: "replace", schema: { ...base, tables: [] } });
    expect(s1.past).toHaveLength(0);
    expect(s1.present.tables).toHaveLength(0);
  });

  it("commit-from records a single undo entry for batch operations", () => {
    const after = applySchemaMutation(applySchemaMutation(base, { type: "table.delete", tableId: "users" }), { type: "table.delete", tableId: "posts" });
    const s1 = schemaHistoryReducer(initial, { type: "commit-from", before: base, schema: after });
    expect(s1.past).toHaveLength(1);
    expect(s1.present.tables).toHaveLength(0);
    const s2 = schemaHistoryReducer(s1, { type: "undo" });
    expect(s2.present.tables).toHaveLength(2);
  });

  it("reset clears all history", () => {
    const s1 = schemaHistoryReducer(initial, { type: "commit", mutation: { type: "enum.add", enumDefinition: { id: "x", name: "x", values: ["a"] } } });
    const s2 = schemaHistoryReducer(s1, { type: "reset", schema: base });
    expect(s2.past).toHaveLength(0);
    expect(s2.future).toHaveLength(0);
    expect(s2.present).toBe(base);
  });

  it("undo at empty past is no-op", () => {
    const s = schemaHistoryReducer(initial, { type: "undo" });
    expect(s).toBe(initial);
  });

  it("redo at empty future is no-op", () => {
    const s = schemaHistoryReducer(initial, { type: "redo" });
    expect(s).toBe(initial);
  });
});
