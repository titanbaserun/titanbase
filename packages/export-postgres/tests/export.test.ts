import { describe, expect, it } from "vitest";
import type { TitanSchema } from "@titanbase/core";
import { exportPostgres } from "../src";

const schema: TitanSchema = {
  titanVersion: "1.0",
  project: { id: "test", name: "Test" },
  dialect: "postgres",
  enums: [{ id: "role", name: "Role", values: ["admin", "member"], description: "Account access level." }],
  tables: [
    { id: "users", name: "users", description: "Application users.", columns: [
      { id: "users.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true },
      { id: "users.role", name: "role", type: "role", nullable: false, primaryKey: false, unique: false, default: "'member'" },
    ], indexes: [] },
    { id: "posts", name: "posts", columns: [
      { id: "posts.id", name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true },
      { id: "posts.user_id", name: "user_id", type: "uuid", nullable: false, primaryKey: false, unique: false },
    ], indexes: [{ id: "posts.user_idx", name: "posts_user_idx", table: "posts", columns: ["posts.user_id"], unique: false, method: "hash", where: "user_id IS NOT NULL", description: "Speeds author lookups." }] },
  ],
  relations: [{ id: "posts_user", name: "posts_user", from: { table: "posts", columns: ["posts.user_id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "many-to-one", onDelete: "cascade", onUpdate: "restrict", description: "Every post has an author." }],
  metadata: { editor: { tablePositions: { users: { x: 0, y: 0 }, posts: { x: 300, y: 0 } } } },
};

describe("PostgreSQL exporter", () => {
  it("exports enums, tables, indexes and foreign keys", () => {
    const result = exportPostgres(schema);
    expect(result.warnings).toEqual([]);
    expect(result.sql).toContain('CREATE TYPE "Role" AS ENUM');
    expect(result.sql).toContain('"role" "Role" NOT NULL');
    expect(result.sql).toContain('CONSTRAINT "users_pkey" PRIMARY KEY ("id")');
    expect(result.sql).toContain('CREATE INDEX "posts_user_idx" ON "posts" USING hash ("user_id") WHERE user_id IS NOT NULL');
    expect(result.sql).toContain('COMMENT ON INDEX "posts_user_idx"');
    expect(result.sql).toContain('ON DELETE CASCADE');
    expect(result.sql).toContain('ON UPDATE RESTRICT');
    expect(result.sql).toContain('COMMENT ON CONSTRAINT "posts_user"');
  });

  it("exports COMMENT ON TABLE and COMMENT ON COLUMN", () => {
    const result = exportPostgres(schema);
    expect(result.sql).toContain('COMMENT ON TABLE "users" IS \'Application users.\'');
    expect(result.sql).toContain('COMMENT ON TYPE "Role" IS \'Account access level.\'');
  });

  it("is deterministic", () => {
    expect(exportPostgres(schema).sql).toBe(exportPostgres(schema).sql);
  });

  it("warns and falls back for unknown types", () => {
    const unknown = structuredClone(schema);
    unknown.tables[0]!.columns[0]!.type = "vector";
    const result = exportPostgres(unknown);
    expect(result.warnings[0]).toContain('unknown type "vector"');
    expect(result.sql).toContain('"id" text');
  });

  it("generates CREATE SCHEMA for tables with schema field", () => {
    const withSchema = structuredClone(schema);
    withSchema.tables[0]!.schema = "auth";
    const result = exportPostgres(withSchema);
    expect(result.sql).toContain('CREATE SCHEMA IF NOT EXISTS "auth"');
    expect(result.sql).toContain('CREATE TABLE "auth"."users"');
  });

  it("quotes identifiers with special characters", () => {
    const special = structuredClone(schema);
    special.tables[0]!.columns[0]!.name = 'user "name"';
    const result = exportPostgres(special);
    expect(result.sql).toContain('"user ""name"""');
  });

  it("skips relations referencing missing tables", () => {
    const broken = structuredClone(schema);
    broken.relations.push({ id: "bad", name: "bad_rel", from: { table: "ghost", columns: ["ghost.id"] }, to: { table: "users", columns: ["users.id"] }, cardinality: "one-to-one" });
    const result = exportPostgres(broken);
    expect(result.warnings.some((w) => w.includes("bad_rel"))).toBe(true);
  });

  it("skips indexes with missing columns", () => {
    const broken = structuredClone(schema);
    broken.tables[1]!.indexes.push({ id: "bad_idx", name: "bad_idx", table: "posts", columns: ["posts.ghost"], unique: false });
    const result = exportPostgres(broken);
    expect(result.warnings.some((w) => w.includes("bad_idx"))).toBe(true);
  });

  it("handles composite primary keys", () => {
    const composite: TitanSchema = {
      ...schema,
      tables: [{
        id: "join_table", name: "user_roles",
        columns: [
          { id: "ur.user_id", name: "user_id", type: "uuid", nullable: false, primaryKey: true, unique: false },
          { id: "ur.role_id", name: "role_id", type: "uuid", nullable: false, primaryKey: true, unique: false },
        ],
        indexes: [],
      }],
      relations: [],
      enums: [],
      metadata: { editor: { tablePositions: { join_table: { x: 0, y: 0 } } } },
    };
    const result = exportPostgres(composite);
    expect(result.sql).toContain('PRIMARY KEY ("user_id", "role_id")');
  });

  it("warns for non-postgres dialect", () => {
    const mysql = structuredClone(schema);
    mysql.dialect = "mysql";
    const result = exportPostgres(mysql);
    expect(result.warnings.some((w) => w.includes("mysql"))).toBe(true);
  });

  it("handles NOT NULL and DEFAULT correctly", () => {
    const result = exportPostgres(schema);
    expect(result.sql).toContain('"user_id" uuid NOT NULL');
    expect(result.sql).toContain("DEFAULT 'member'");
  });

  it("handles UNIQUE constraint on non-PK column", () => {
    const withUnique = structuredClone(schema);
    withUnique.tables[0]!.columns.push({ id: "users.email", name: "email", type: "text", nullable: false, primaryKey: false, unique: true });
    const result = exportPostgres(withUnique);
    expect(result.sql).toContain('"email" text NOT NULL UNIQUE');
  });
});
