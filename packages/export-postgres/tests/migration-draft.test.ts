import { describe, expect, it } from "vitest";
import { createEmptySchema, type TitanSchema } from "@titanbase/core";
import { generatePostgresMigrationDraft } from "../src";

function baseSchema(): TitanSchema {
  const schema = createEmptySchema({ id: "draft", name: "Draft Test" });
  schema.tables = [{
    id: "users", name: "users", columns: [
      { id: "users.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true },
      { id: "users.email", name: "email", type: "text", nullable: true, primaryKey: false, unique: false },
    ], indexes: [],
  }];
  return schema;
}

function draft(mutator: (schema: TitanSchema) => void) {
  const before = baseSchema();
  const after = structuredClone(before);
  mutator(after);
  return generatePostgresMigrationDraft(before, after);
}

describe("PostgreSQL migration draft", () => {
  it("uses a deterministic header, filename and empty result", () => {
    const schema = baseSchema();
    const result = generatePostgresMigrationDraft(schema, schema);
    expect(result.filename).toBe("draft-test-migration-draft.sql");
    expect(result.sql).toContain("-- Titanbase PostgreSQL migration draft");
    expect(result.sql).toContain("-- Review carefully before running in production.");
    expect(result.sql).not.toMatch(/20\d\d-/);
    expect(result.sql).toContain("No migration statements generated");
    expect(result.statements).toEqual([]);
  });

  it("creates and drops tables with a danger warning", () => {
    const added = draft((schema) => schema.tables.push({ id: "posts", name: "posts", columns: [{ id: "posts.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true }], indexes: [] }));
    expect(added.sql).toContain('CREATE TABLE "posts"');
    const removed = draft((schema) => { schema.tables = []; });
    expect(removed.sql).toContain('DROP TABLE "users";');
    expect(removed.warnings).toContainEqual(expect.objectContaining({ code: "table_drop_data_loss", severity: "danger" }));
    expect(removed.statements).toContainEqual(expect.objectContaining({ destructive: true, breaking: true }));
  });

  it("renames tables", () => {
    const result = draft((schema) => { schema.tables[0]!.name = "accounts"; });
    expect(result.sql).toContain('ALTER TABLE "users" RENAME TO "accounts";');
  });

  it("adds and drops columns with required-column and data-loss warnings", () => {
    const added = draft((schema) => schema.tables[0]!.columns.push({ id: "users.handle", name: "handle", type: "text", nullable: false, primaryKey: false, unique: false }));
    expect(added.sql).toContain('ALTER TABLE "users" ADD COLUMN "handle" text NOT NULL;');
    expect(added.warnings).toContainEqual(expect.objectContaining({ code: "required_column_without_default", severity: "danger" }));
    const removed = draft((schema) => { schema.tables[0]!.columns = schema.tables[0]!.columns.filter((column) => column.name !== "email"); });
    expect(removed.sql).toContain('ALTER TABLE "users" DROP COLUMN "email";');
    expect(removed.warnings).toContainEqual(expect.objectContaining({ code: "column_drop_data_loss" }));
  });

  it("renames columns", () => {
    const result = draft((schema) => { schema.tables[0]!.columns[1]!.name = "contact_email"; });
    expect(result.sql).toContain('RENAME COLUMN "email" TO "contact_email"');
  });

  it("changes a column type and warns about casts", () => {
    const result = draft((schema) => { schema.tables[0]!.columns[1]!.type = "uuid"; });
    expect(result.sql).toContain('ALTER COLUMN "email" TYPE uuid;');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "column_type_change_review", severity: "danger" }));
  });

  it("sets and drops NOT NULL", () => {
    const set = draft((schema) => { schema.tables[0]!.columns[1]!.nullable = false; });
    expect(set.sql).toContain('ALTER COLUMN "email" SET NOT NULL;');
    expect(set.warnings).toContainEqual(expect.objectContaining({ code: "set_not_null_review" }));
    const before = baseSchema(); before.tables[0]!.columns[1]!.nullable = false;
    const after = structuredClone(before); after.tables[0]!.columns[1]!.nullable = true;
    expect(generatePostgresMigrationDraft(before, after).sql).toContain('ALTER COLUMN "email" DROP NOT NULL;');
  });

  it("sets and drops defaults", () => {
    const set = draft((schema) => { schema.tables[0]!.columns[1]!.default = "'unknown'"; });
    expect(set.sql).toContain("SET DEFAULT 'unknown'");
    const before = baseSchema(); before.tables[0]!.columns[1]!.default = "now()";
    const after = structuredClone(before); delete after.tables[0]!.columns[1]!.default;
    expect(generatePostgresMigrationDraft(before, after).sql).toContain("DROP DEFAULT");
  });

  it("adds and drops unique constraints with inferred-name warnings", () => {
    const add = draft((schema) => { schema.tables[0]!.columns[1]!.unique = true; });
    expect(add.sql).toContain('ADD CONSTRAINT "users_email_key" UNIQUE ("email")');
    expect(add.warnings).toContainEqual(expect.objectContaining({ code: "inferred_unique_constraint_name" }));
    const before = baseSchema(); before.tables[0]!.columns[1]!.unique = true;
    const after = structuredClone(before); after.tables[0]!.columns[1]!.unique = false;
    expect(generatePostgresMigrationDraft(before, after).sql).toContain('DROP CONSTRAINT "users_email_key"');
  });

  it("replaces primary key constraints", () => {
    const result = draft((schema) => {
      schema.tables[0]!.columns[0]!.primaryKey = false;
      schema.tables[0]!.columns[1]!.primaryKey = true;
    });
    expect(result.sql).toContain('DROP CONSTRAINT "users_pkey"');
    expect(result.sql).toContain('ADD CONSTRAINT "users_pkey" PRIMARY KEY ("email")');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "inferred_primary_key_name", severity: "danger" }));
  });

  it("creates enums, renames them and adds values", () => {
    const created = draft((schema) => schema.enums.push({ id: "status", name: "status", values: ["active", "disabled"] }));
    expect(created.sql).toContain('CREATE TYPE "status" AS ENUM (\'active\', \'disabled\')');
    const before = baseSchema(); before.enums = [{ id: "status", name: "status", values: ["active"] }];
    const renamed = structuredClone(before); renamed.enums[0]!.name = "account_status";
    expect(generatePostgresMigrationDraft(before, renamed).sql).toContain('ALTER TYPE "status" RENAME TO "account_status"');
    const extended = structuredClone(before); extended.enums[0]!.values.push("disabled");
    expect(generatePostgresMigrationDraft(before, extended).sql).toContain('ALTER TYPE "status" ADD VALUE \'disabled\'');
  });

  it("does not generate unsafe enum value or enum removal SQL", () => {
    const before = baseSchema(); before.enums = [{ id: "status", name: "status", values: ["active", "disabled"] }];
    const valueRemoved = structuredClone(before); valueRemoved.enums[0]!.values = ["active"];
    const valueResult = generatePostgresMigrationDraft(before, valueRemoved);
    expect(valueResult.sql).not.toContain("DROP VALUE");
    expect(valueResult.warnings).toContainEqual(expect.objectContaining({ code: "enum_value_removal_not_generated", severity: "danger" }));
    const enumRemoved = structuredClone(before); enumRemoved.enums = [];
    const enumResult = generatePostgresMigrationDraft(before, enumRemoved);
    expect(enumResult.sql).not.toContain("DROP TYPE");
    expect(enumResult.warnings).toContainEqual(expect.objectContaining({ code: "enum_removal_not_generated" }));
  });

  it("adds, drops and recreates indexes", () => {
    const add = draft((schema) => schema.tables[0]!.indexes.push({ id: "users.email.idx", name: "users_email_idx", table: "users", columns: ["users.email"], unique: false, method: "btree", where: "email IS NOT NULL" }));
    expect(add.sql).toContain('CREATE INDEX "users_email_idx" ON "users" USING btree ("email")');
    expect(add.sql).toContain("WHERE email IS NOT NULL");
    const before = baseSchema(); before.tables[0]!.indexes = [{ id: "users.email.idx", name: "users_email_idx", table: "users", columns: ["users.email"], unique: false }];
    const removed = structuredClone(before); removed.tables[0]!.indexes = [];
    expect(generatePostgresMigrationDraft(before, removed).sql).toContain('DROP INDEX "users_email_idx"');
    const changed = structuredClone(before); changed.tables[0]!.indexes[0]!.unique = true;
    const changedResult = generatePostgresMigrationDraft(before, changed);
    expect(changedResult.sql).toContain('DROP INDEX "users_email_idx"');
    expect(changedResult.sql).toContain('CREATE UNIQUE INDEX "users_email_idx"');
    expect(changedResult.warnings).toContainEqual(expect.objectContaining({ code: "index_recreated" }));
  });

  it("adds, drops, renames and recreates foreign keys", () => {
    const before = baseSchema();
    before.tables.push({ id: "posts", name: "posts", columns: [{ id: "posts.user_id", name: "user_id", type: "uuid", nullable: false, primaryKey: false, unique: false }], indexes: [] });
    const after = structuredClone(before);
    after.relations = [{ id: "posts_user", name: "posts_user_fkey", from: { table: "posts", columns: ["posts.user_id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "many-to-one", onDelete: "cascade" }];
    expect(generatePostgresMigrationDraft(before, after).sql).toContain('ADD CONSTRAINT "posts_user_fkey" FOREIGN KEY');
    const renamed = structuredClone(after); renamed.relations[0]!.name = "posts_author_fkey";
    expect(generatePostgresMigrationDraft(after, renamed).sql).toContain('RENAME CONSTRAINT "posts_user_fkey" TO "posts_author_fkey"');
    const changed = structuredClone(after); changed.relations[0]!.onDelete = "restrict";
    const changedResult = generatePostgresMigrationDraft(after, changed);
    expect(changedResult.sql).toContain('DROP CONSTRAINT "posts_user_fkey"');
    expect(changedResult.sql).toContain("ON DELETE RESTRICT");
    const removed = structuredClone(after); removed.relations = [];
    expect(generatePostgresMigrationDraft(after, removed).warnings).toContainEqual(expect.objectContaining({ code: "foreign_key_drop", severity: "danger" }));
  });

  it("generates table and column comments unless disabled", () => {
    const result = draft((schema) => {
      schema.tables[0]!.description = "Application users";
      schema.tables[0]!.columns[1]!.description = "Contact address";
    });
    expect(result.sql).toContain('COMMENT ON TABLE "users" IS \'Application users\'');
    expect(result.sql).toContain('COMMENT ON COLUMN "users"."email" IS \'Contact address\'');
    const disabled = generatePostgresMigrationDraft(baseSchema(), (() => { const value = baseSchema(); value.tables[0]!.description = "Users"; return value; })(), { includeComments: false });
    expect(disabled.sql).not.toContain("COMMENT ON");
  });

  it("places destructive cleanup after foreign-key and index operations", () => {
    const before = baseSchema();
    before.tables.push({ id: "posts", name: "posts", columns: [{ id: "posts.user_id", name: "user_id", type: "uuid", nullable: false, primaryKey: false, unique: false }], indexes: [{ id: "posts.user.idx", name: "posts_user_idx", table: "posts", columns: ["posts.user_id"], unique: false }] });
    before.relations = [{ id: "posts_user", name: "posts_user_fkey", from: { table: "posts", columns: ["posts.user_id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "many-to-one" }];
    const after = structuredClone(before);
    after.relations = [];
    after.tables[1]!.indexes = [];
    after.tables[1]!.columns = [];
    const sql = generatePostgresMigrationDraft(before, after).sql;
    expect(sql.indexOf('DROP CONSTRAINT "posts_user_fkey"')).toBeLessThan(sql.indexOf('DROP COLUMN "user_id"'));
    expect(sql.indexOf('DROP INDEX "posts_user_idx"')).toBeLessThan(sql.indexOf('DROP COLUMN "user_id"'));
    expect(sql).toContain("-- Destructive cleanup");
  });

  it("warns for non-PostgreSQL dialects", () => {
    const before = baseSchema(); before.dialect = "mysql";
    const after = structuredClone(before); after.project.name = "Changed";
    expect(generatePostgresMigrationDraft(before, after).warnings).toContainEqual(expect.objectContaining({ code: "before_dialect_not_postgres" }));
  });

  it("is deterministic and does not mutate its inputs", () => {
    const before = baseSchema();
    const after = structuredClone(before); after.tables[0]!.columns[1]!.nullable = false;
    const beforeSnapshot = JSON.stringify(before); const afterSnapshot = JSON.stringify(after);
    expect(generatePostgresMigrationDraft(before, after)).toEqual(generatePostgresMigrationDraft(before, after));
    expect(JSON.stringify(before)).toBe(beforeSnapshot);
    expect(JSON.stringify(after)).toBe(afterSnapshot);
  });
});
