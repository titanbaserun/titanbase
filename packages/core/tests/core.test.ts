import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createEmptySchema, diagnoseSchema, normalizeSchema, validateTitanSchema, type TitanSchema } from "../src";

const validSchema: TitanSchema = {
  titanVersion: "1.0",
  project: { id: "blog", name: "Blog" },
  dialect: "postgres",
  tables: [{
    id: "users",
    name: "users",
    columns: [{ id: "users.id", name: "id", type: "UUID", nullable: false, primaryKey: true, unique: true }],
    indexes: [],
  }],
  enums: [],
  relations: [],
  metadata: { editor: { tablePositions: { users: { x: 20, y: 40 } } } },
};

describe("TitanSchema validation", () => {
  it("creates a valid empty schema", () => {
    const empty = createEmptySchema();
    expect(empty.project.name).toBe("Untitled Schema");
    expect(empty.dialect).toBe("postgres");
    expect(empty.tables).toEqual([]);
    expect(validateTitanSchema(empty)).toMatchObject({ success: true, diagnostics: [] });
  });

  // --- Fixture validation ---
  for (const example of ["blog/blog.titan.json", "saas/saas.titan.json", "ecommerce/ecommerce.titan.json", "project-management/project-management.titan.json", "messaging/messaging.titan.json"]) {
    it(`validates the ${example} fixture`, () => {
      const fixture = JSON.parse(readFileSync(new URL(`../../../examples/${example}`, import.meta.url), "utf8"));
      const result = validateTitanSchema(fixture);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }

  // --- Normalization ---
  it("validates and normalizes a valid schema", () => {
    expect(validateTitanSchema(validSchema).success).toBe(true);
    expect(normalizeSchema(validSchema).tables[0]?.columns[0]?.type).toBe("uuid");
  });

  // --- Duplicate detection ---
  it("finds duplicate table names in same namespace", () => {
    const dup = structuredClone(validSchema);
    dup.tables.push({ id: "users2", name: "users", columns: [], indexes: [] });
    dup.metadata.editor.tablePositions.users2 = { x: 100, y: 0 };
    const codes = diagnoseSchema(dup).map((d) => d.code);
    expect(codes).toContain("table.duplicate-name");
  });

  it("finds duplicate columns", () => {
    const dup = structuredClone(validSchema);
    dup.tables[0]?.columns.push({ id: "users.id2", name: "ID", type: "uuid", nullable: false, primaryKey: false, unique: false });
    expect(diagnoseSchema(dup)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "column.duplicate-name" })]));
  });

  it("finds duplicate relation names", () => {
    const dup = structuredClone(validSchema);
    dup.relations = [
      { id: "rel-1", name: "owner", from: { table: "users", columns: ["users.id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "one-to-one" },
      { id: "rel-2", name: "OWNER", from: { table: "users", columns: ["users.id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "one-to-one" },
    ];
    expect(diagnoseSchema(dup).map((d) => d.code)).toContain("relation.duplicate-name");
  });

  it("finds duplicate enum names", () => {
    const dup = structuredClone(validSchema);
    dup.enums = [
      { id: "role1", name: "role", values: ["admin"] },
      { id: "role2", name: "ROLE", values: ["user"] },
    ];
    expect(diagnoseSchema(dup).map((d) => d.code)).toContain("enum.duplicate-name");
  });

  // --- Relation validation ---
  it("finds broken relation references to missing tables", () => {
    const broken = structuredClone(validSchema);
    broken.relations.push({ id: "rel", name: "broken", from: { table: "missing", columns: ["missing.id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "many-to-one" });
    expect(validateTitanSchema(broken).success).toBe(false);
    expect(diagnoseSchema(broken).map((d) => d.code)).toContain("relation.invalid-table");
  });

  it("finds broken relation references to missing columns", () => {
    const broken = structuredClone(validSchema);
    broken.relations.push({ id: "rel", name: "self_ref", from: { table: "users", columns: ["users.ghost"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "one-to-one" });
    expect(diagnoseSchema(broken).map((d) => d.code)).toContain("relation.invalid-column");
  });

  it("finds relations with mismatched column count", () => {
    const broken = structuredClone(validSchema);
    broken.relations.push({ id: "rel", name: "mismatch", from: { table: "users", columns: ["users.id"] }, to: { table: "users", columns: ["users.id", "users.id"] }, cardinality: "one-to-one" });
    expect(diagnoseSchema(broken).map((d) => d.code)).toContain("relation.column-count");
  });

  // --- Index validation ---
  it("validates index columns, names, and PostgreSQL methods", () => {
    const invalid = structuredClone(validSchema);
    invalid.tables[0]!.indexes = [
      { id: "idx-1", name: "users_idx", table: "users", columns: ["users.id", "users.id"], unique: false, method: "rtree" },
      { id: "idx-2", name: "USERS_IDX", table: "users", columns: ["users.missing"], unique: false },
    ];
    const codes = diagnoseSchema(invalid).map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(["index.duplicate-name", "index.duplicate-column", "index.invalid-column", "index.unsupported-method"]));
  });

  it("detects index pointing to wrong table", () => {
    const invalid = structuredClone(validSchema);
    invalid.tables[0]!.indexes = [
      { id: "idx-1", name: "bad_idx", table: "other_table", columns: ["users.id"], unique: false },
    ];
    expect(diagnoseSchema(invalid).map((d) => d.code)).toContain("index.invalid-table");
  });

  // --- Enum validation ---
  it("rejects duplicate and empty enum values", () => {
    const dup = structuredClone(validSchema);
    dup.enums = [{ id: "role", name: "role", values: ["admin", "admin"] }];
    expect(diagnoseSchema(dup).map((d) => d.code)).toContain("enum.duplicate-value");
    dup.enums[0]!.values = [];
    expect(validateTitanSchema(dup).success).toBe(false);
  });

  // --- Metadata validation ---
  it("rejects stale editor positions", () => {
    const stale = structuredClone(validSchema);
    stale.metadata.editor.tablePositions.ghost = { x: 0, y: 0 };
    expect(diagnoseSchema(stale).map((d) => d.code)).toContain("metadata.invalid-table");
  });

  it("warns about tables with no editor position", () => {
    const missing = structuredClone(validSchema);
    missing.tables.push({ id: "posts", name: "posts", columns: [], indexes: [] });
    // No position for "posts"
    const warnings = diagnoseSchema(missing).filter((d) => d.severity === "warning");
    expect(warnings.map((d) => d.code)).toContain("metadata.missing-position");
  });

  // --- Unknown type warning ---
  it("warns about unknown column types", () => {
    const unknown = structuredClone(validSchema);
    unknown.tables[0]!.columns[0]!.type = "vector";
    const warnings = diagnoseSchema(unknown).filter((d) => d.severity === "warning");
    expect(warnings.map((d) => d.code)).toContain("column.unknown-type");
  });

  it("does not warn about enum types used by columns", () => {
    const withEnum = structuredClone(validSchema);
    withEnum.enums = [{ id: "status", name: "status", values: ["active"] }];
    withEnum.tables[0]!.columns.push({ id: "users.status", name: "status", type: "status", nullable: false, primaryKey: false, unique: false });
    const warnings = diagnoseSchema(withEnum).filter((d) => d.code === "column.unknown-type");
    expect(warnings).toHaveLength(0);
  });

  // --- entityId field ---
  it("includes entityId in diagnostics", () => {
    const dup = structuredClone(validSchema);
    dup.tables[0]?.columns.push({ id: "users.id2", name: "id", type: "uuid", nullable: false, primaryKey: false, unique: false });
    const issue = diagnoseSchema(dup).find((d) => d.code === "column.duplicate-name");
    expect(issue?.entityId).toBe("users.id2");
  });
});
