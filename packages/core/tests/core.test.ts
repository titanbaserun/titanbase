import { describe, expect, it } from "vitest";
import { createEmptySchema, diagnoseSchema, normalizeSchema, validateTitanSchema, type TitanSchema } from "../src";
import { loadExampleSchemas } from "../../../test-utils/example-schemas";

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

const diagnosticCodes = (schema: unknown) => diagnoseSchema(schema).map((diagnostic) => diagnostic.code);

function schemaWithRelation() {
  const schema = structuredClone(validSchema);
  schema.tables.push({
    id: "posts",
    name: "posts",
    description: "Published posts.",
    columns: [
      { id: "posts.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true },
      { id: "posts.user_id", name: "user_id", type: "uuid", nullable: false, primaryKey: false, unique: false },
    ],
    indexes: [],
  });
  schema.metadata.editor.tablePositions.posts = { x: 300, y: 40 };
  schema.relations.push({ id: "posts_user", name: "posts_user", from: { table: "posts", columns: ["posts.user_id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "many-to-one" });
  return schema;
}

describe("TitanSchema validation", () => {
  it("creates a valid empty schema", () => {
    const empty = createEmptySchema();
    expect(empty.project.name).toBe("Untitled Schema");
    expect(empty.dialect).toBe("postgres");
    expect(empty.tables).toEqual([]);
    expect(validateTitanSchema(empty)).toMatchObject({ success: true, diagnostics: [] });
  });

  // --- Fixture validation ---
  for (const example of loadExampleSchemas()) {
    it(`validates the ${example.name} fixture without errors`, () => {
      const result = validateTitanSchema(example.schema);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      expect(errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }

  it("keeps template warnings intentional", () => {
    const summary: Record<string, string[]> = {};
    for (const example of loadExampleSchemas()) {
      const codes = diagnoseSchema(example.schema).filter((diagnostic) => diagnostic.severity !== "error").map((diagnostic) => diagnostic.code);
      if (codes.length) summary[example.name] = codes;
    }
    expect(summary).toEqual({
      "ai-model-registry/ai-model-registry": ["enum.unsafe-value"],
      "crm/crm": ["column.nullable-unique"],
    });
  });

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

  describe("project diagnostics", () => {
    it("reports a missing project name", () => {
      const schema = { ...structuredClone(validSchema), project: { id: validSchema.project.id } };
      expect(diagnosticCodes(schema)).toContain("project.missing-name");
    });

    it("reports an unsupported dialect", () => {
      const schema = { ...structuredClone(validSchema), dialect: "oracle" };
      expect(diagnosticCodes(schema)).toContain("project.unsupported-dialect");
    });
  });

  describe("table and column diagnostics", () => {
    it("warns for tables without a primary key and empty tables", () => {
      const noPrimaryKey = structuredClone(validSchema);
      noPrimaryKey.tables[0]!.columns[0]!.primaryKey = false;
      expect(diagnosticCodes(noPrimaryKey)).toContain("table.no-primary-key");
      const empty = structuredClone(validSchema);
      empty.tables[0]!.columns = [];
      expect(diagnosticCodes(empty)).toContain("table.no-columns");
    });

    it("reports nullable primary keys and missing enum references", () => {
      const schema = structuredClone(validSchema);
      schema.tables[0]!.columns[0]!.nullable = true;
      schema.tables[0]!.columns.push({ id: "users.role", name: "role", type: "missing_enum", nullable: false, primaryKey: false, unique: false });
      expect(diagnosticCodes(schema)).toEqual(expect.arrayContaining(["column.nullable-primary-key", "column.missing-enum"]));
    });

    it("warns for unknown types and incompatible defaults", () => {
      const schema = structuredClone(validSchema);
      schema.tables[0]!.columns.push({ id: "users.score", name: "score", type: "vector", nullable: false, primaryKey: false, unique: false });
      schema.tables[0]!.columns.push({ id: "users.active", name: "active", type: "boolean", nullable: false, primaryKey: false, unique: false, default: "'yes'" });
      expect(diagnosticCodes(schema)).toEqual(expect.arrayContaining(["column.unknown-type", "column.default-type-mismatch"]));
    });
  });

  describe("relation diagnostics", () => {
    it("reports missing targets, count mismatches, and type mismatches", () => {
      const missingTable = schemaWithRelation();
      missingTable.relations[0]!.to.table = "missing";
      expect(diagnosticCodes(missingTable)).toContain("relation.invalid-table");
      const missingColumn = schemaWithRelation();
      missingColumn.relations[0]!.to.columns = ["users.missing"];
      expect(diagnosticCodes(missingColumn)).toContain("relation.invalid-column");
      const countMismatch = schemaWithRelation();
      countMismatch.relations[0]!.to.columns.push("users.id");
      expect(diagnosticCodes(countMismatch)).toContain("relation.column-count");
      const typeMismatch = schemaWithRelation();
      typeMismatch.tables[1]!.columns[1]!.type = "integer";
      expect(diagnosticCodes(typeMismatch)).toContain("relation.type-mismatch");
    });

    it("warns for unindexed foreign keys and invalid SET NULL", () => {
      const schema = schemaWithRelation();
      schema.relations[0]!.onDelete = "set-null";
      expect(diagnosticCodes(schema)).toEqual(expect.arrayContaining(["relation.unindexed-foreign-key", "relation.set-null-non-nullable"]));
    });

    it("reports relations targeting non-unique columns", () => {
      const schema = schemaWithRelation();
      schema.tables[0]!.columns.push({ id: "users.email", name: "email", type: "uuid", nullable: false, primaryKey: false, unique: false });
      schema.relations[0]!.to.columns = ["users.email"];
      expect(diagnosticCodes(schema)).toContain("relation.non-unique-target");
    });
  });

  describe("index diagnostics", () => {
    it("reports missing and duplicate index columns", () => {
      const schema = structuredClone(validSchema);
      schema.tables[0]!.indexes.push({ id: "broken", name: "broken", table: "users", columns: ["users.missing", "users.missing"], unique: false });
      expect(diagnosticCodes(schema)).toEqual(expect.arrayContaining(["index.invalid-column", "index.duplicate-column"]));
    });

    it("warns for duplicate definitions and non-Postgres partial indexes", () => {
      const schema = structuredClone(validSchema);
      schema.dialect = "mysql";
      schema.tables[0]!.indexes = [
        { id: "one", name: "one", table: "users", columns: ["users.id"], unique: false },
        { id: "two", name: "two", table: "users", columns: ["users.id"], unique: false, where: "id IS NOT NULL" },
      ];
      expect(diagnosticCodes(schema)).toEqual(expect.arrayContaining(["index.duplicate-definition", "index.partial-dialect"]));
    });
  });

  describe("enum and metadata diagnostics", () => {
    it("reports duplicate names, missing values, duplicate values, and unused enums", () => {
      const duplicate = structuredClone(validSchema);
      duplicate.enums = [{ id: "one", name: "role", values: ["admin", "admin"] }, { id: "two", name: "ROLE", values: ["user"] }];
      expect(diagnosticCodes(duplicate)).toEqual(expect.arrayContaining(["enum.duplicate-name", "enum.duplicate-value", "enum.unused"]));
      const empty = structuredClone(validSchema);
      empty.enums = [{ id: "empty", name: "empty", values: [] }];
      expect(diagnosticCodes(empty)).toContain("enum.no-values");
    });

    it("warns for stale editor metadata", () => {
      const schema = structuredClone(validSchema);
      schema.metadata.editor.tablePositions.missing = { x: 0, y: 0 };
      const issue = diagnoseSchema(schema).find((diagnostic) => diagnostic.code === "metadata.invalid-table");
      expect(issue).toMatchObject({ severity: "warning", entityType: "metadata", tableId: "missing" });
    });
  });
});
