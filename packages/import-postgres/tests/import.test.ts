import { describe, expect, it } from "vitest";
import { diagnoseSchema } from "@titanbase/core";
import { exportPostgres } from "@titanbase/export-postgres";
import { exportMermaid } from "@titanbase/export-mermaid";
import { exportPrisma } from "@titanbase/export-prisma";
import { exportDrizzle } from "@titanbase/export-drizzle";
import { importPostgresSql } from "../src/index";

const imported = (sql: string) => {
  const result = importPostgresSql(sql, { sourceName: "example.sql" });
  expect(result.errors).toEqual([]);
  expect(result.schema).toBeDefined();
  return result;
};

describe("PostgreSQL enums", () => {
  it("imports a simple enum", () => {
    const result = imported("CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped');");
    expect(result.schema?.enums[0]).toMatchObject({ name: "order_status", values: ["pending", "paid", "shipped"] });
  });

  it("preserves quoted enum names and escaped values", () => {
    const result = imported(`CREATE TYPE "OrderStatus" AS ENUM ('pending', 'customer''s choice');`);
    expect(result.schema?.enums[0]).toMatchObject({ name: "OrderStatus", values: ["pending", "customer's choice"] });
  });

  it("warns and removes duplicate enum values", () => {
    const result = imported("CREATE TYPE status AS ENUM ('new', 'new');");
    expect(result.warnings.map((item) => item.code)).toContain("duplicate_enum_value");
    expect(result.schema?.enums[0]?.values).toEqual(["new"]);
  });
});

describe("CREATE TABLE", () => {
  it("imports columns, primary keys, nullability, unique and defaults", () => {
    const result = imported(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        name text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const table = result.schema?.tables[0];
    expect(table?.name).toBe("users");
    expect(table?.columns.find((column) => column.name === "id")).toMatchObject({ type: "uuid", nullable: false, primaryKey: true, default: "gen_random_uuid()" });
    expect(table?.columns.find((column) => column.name === "email")).toMatchObject({ type: "text", nullable: false, unique: true });
    expect(table?.columns.find((column) => column.name === "name")?.nullable).toBe(true);
    expect(table?.columns.find((column) => column.name === "created_at")?.default).toBe("now()");
  });

  it("imports table-level primary and single-column unique constraints", () => {
    const result = imported(`CREATE TABLE users (id uuid, email text, CONSTRAINT users_pkey PRIMARY KEY (id), UNIQUE (email));`);
    const [id, email] = result.schema!.tables[0]!.columns;
    expect(id).toMatchObject({ primaryKey: true, nullable: false });
    expect(email?.unique).toBe(true);
  });

  it("preserves composite unique constraints as unique indexes", () => {
    const result = imported(`CREATE TABLE memberships (account_id uuid, user_id uuid, CONSTRAINT memberships_key UNIQUE (account_id, user_id));`);
    expect(result.schema?.tables[0]?.indexes[0]).toMatchObject({ name: "memberships_key", unique: true });
    expect(result.schema?.tables[0]?.indexes[0]?.columns).toHaveLength(2);
  });

  it("preserves quoted and schema-qualified identifiers", () => {
    const result = imported(`CREATE TABLE public."User" ("id" uuid PRIMARY KEY, "createdAt" timestamptz);`);
    expect(result.schema?.tables[0]).toMatchObject({ schema: "public", name: "User" });
    expect(result.schema?.tables[0]?.columns.map((column) => column.name)).toEqual(["id", "createdAt"]);
  });

  it("maps imported enum column types", () => {
    const result = imported(`CREATE TYPE "OrderStatus" AS ENUM ('pending'); CREATE TABLE orders (id uuid PRIMARY KEY, status "OrderStatus" NOT NULL);`);
    expect(result.schema?.tables[0]?.columns[1]).toMatchObject({ type: "orderstatus", nullable: false });
  });
});

describe("foreign keys", () => {
  const customers = `CREATE TABLE customers (id uuid PRIMARY KEY);`;

  it("imports inline foreign keys", () => {
    const result = imported(`${customers} CREATE TABLE orders (id uuid PRIMARY KEY, customer_id uuid REFERENCES customers(id));`);
    expect(result.schema?.relations[0]).toMatchObject({ name: "orders_customer_id_fkey", cardinality: "many-to-one" });
  });

  it("imports named table-level foreign keys and referential actions", () => {
    const result = imported(`${customers}
      CREATE TABLE orders (id uuid PRIMARY KEY, customer_id uuid,
        CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE ON UPDATE RESTRICT
      );`);
    expect(result.schema?.relations[0]).toMatchObject({ name: "orders_customer_id_fkey", onDelete: "cascade", onUpdate: "restrict" });
  });

  it("imports SET NULL", () => {
    const result = imported(`${customers} CREATE TABLE orders (id uuid PRIMARY KEY, customer_id uuid REFERENCES customers(id) ON DELETE SET NULL);`);
    expect(result.schema?.relations[0]?.onDelete).toBe("set-null");
  });

  it("warns when the referenced table is missing", () => {
    const result = imported(`CREATE TABLE orders (id uuid PRIMARY KEY, customer_id uuid REFERENCES customers(id));`);
    expect(result.warnings.map((item) => item.code)).toContain("missing_referenced_table");
    expect(result.schema?.relations).toEqual([]);
  });
});

describe("indexes", () => {
  const table = `CREATE TABLE orders (id uuid PRIMARY KEY, customer_id uuid, created_at timestamptz, status text);`;

  it("imports simple and unique indexes", () => {
    const result = imported(`${table} CREATE INDEX idx_orders_customer_id ON orders (customer_id); CREATE UNIQUE INDEX idx_orders_created ON orders (created_at);`);
    expect(result.schema?.tables[0]?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "idx_orders_customer_id", unique: false }),
      expect.objectContaining({ name: "idx_orders_created", unique: true }),
    ]));
  });

  it("imports index methods and partial predicates", () => {
    const result = imported(`${table} CREATE INDEX idx_orders_paid ON orders USING btree (status) WHERE status = 'paid';`);
    expect(result.schema?.tables[0]?.indexes[0]).toMatchObject({ method: "btree", where: "status = 'paid'" });
  });

  it("warns and skips expression indexes", () => {
    const result = imported(`CREATE TABLE users (id uuid PRIMARY KEY, email text); CREATE INDEX idx_lower_email ON users (lower(email));`);
    expect(result.warnings.map((item) => item.code)).toContain("expression_index");
    expect(result.schema?.tables[0]?.indexes).toEqual([]);
  });

  it("resolves indexes on schema-qualified tables", () => {
    const result = imported(`CREATE TABLE app.orders (id uuid PRIMARY KEY, created_at timestamptz); CREATE INDEX idx_created ON app.orders (created_at);`);
    expect(result.schema?.tables[0]?.indexes[0]?.name).toBe("idx_created");
  });
});

describe("comments", () => {
  it("imports table and column descriptions", () => {
    const result = imported(`
      CREATE TABLE public.users (id uuid PRIMARY KEY, email text);
      COMMENT ON TABLE public.users IS 'Application users';
      COMMENT ON COLUMN public.users.email IS 'User email address';
    `);
    expect(result.schema?.tables[0]?.description).toBe("Application users");
    expect(result.schema?.tables[0]?.columns[1]?.description).toBe("User email address");
  });

  it("warns for unsupported comment targets", () => {
    const result = imported(`CREATE TABLE users (id uuid PRIMARY KEY); COMMENT ON DATABASE app IS 'App';`);
    expect(result.warnings.map((item) => item.code)).toContain("unsupported_comment");
  });
});

describe("unsupported and invalid SQL", () => {
  it.each(["CREATE VIEW active_users AS SELECT 1", "CREATE EXTENSION pgcrypto", "ALTER TABLE users ADD COLUMN name text"])("warns for %s", (sql) => {
    const result = imported(sql);
    expect(result.warnings[0]).toMatchObject({ code: "unsupported_statement", line: 1 });
  });

  it("reports the source line for unsupported statements", () => {
    const result = imported("\n\nCREATE TABLE users (id uuid PRIMARY KEY);\n\nCREATE VIEW active_users AS SELECT * FROM users;");
    expect(result.warnings.find((item) => item.code === "unsupported_statement")?.line).toBe(5);
  });

  it("returns a clear fatal error for invalid SQL", () => {
    const result = importPostgresSql("CREATE TABLE users (");
    expect(result.schema).toBeUndefined();
    expect(result.errors[0]?.code).toBe("parse_failure");
  });
});

describe("integration", () => {
  const sql = `
    CREATE TYPE plan AS ENUM ('free', 'pro');
    CREATE TABLE public.accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      plan plan NOT NULL DEFAULT 'free'
    );
    CREATE TABLE public.members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      email text NOT NULL UNIQUE,
      CONSTRAINT members_account_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX members_account_idx ON public.members (account_id);
    COMMENT ON TABLE public.accounts IS 'Customer workspaces';
  `;

  it("imports and exports a realistic SaaS schema", () => {
    const result = imported(sql);
    const exported = exportPostgres(result.schema!);
    expect(exported.sql).toContain('CREATE TABLE "public"."accounts"');
    expect(exported.sql).toContain('CONSTRAINT "members_account_fkey"');
    expect(exported.sql).toContain('CREATE INDEX "members_account_idx"');
  });

  it("feeds an imported schema to every local exporter", () => {
    const result = imported(sql);
    expect(exportMermaid(result.schema!).files[0]?.content).toContain("erDiagram");
    expect(exportPrisma(result.schema!).files[0]?.content).toContain("model Accounts");
    expect(exportDrizzle(result.schema!).files[0]?.content).toContain("pgTable");
  });

  it("produces no validation errors for supported clean input", () => {
    const result = imported(sql);
    expect(diagnoseSchema(result.schema!).filter((item) => item.severity === "error")).toEqual([]);
  });

  it("derives project name and deterministic positions from the filename", () => {
    const first = importPostgresSql(sql, { sourceName: "saas-schema.sql" });
    const second = importPostgresSql(sql, { sourceName: "saas-schema.sql" });
    expect(first.schema?.project.name).toBe("saas-schema");
    expect(first.schema).toEqual(second.schema);
    expect(Object.keys(first.schema!.metadata.editor.tablePositions)).toHaveLength(2);
  });
});
