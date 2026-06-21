import { describe, expect, it } from "vitest";
import { createEmptySchema, type TitanSchema } from "@titanbase/core";
import saas from "../../../examples/saas/saas.titan.json";
import { exportPrisma } from "../src";
import { loadExampleSchemas } from "../../../test-utils/example-schemas";

const schema = saas as TitanSchema;

describe("Prisma exporter", () => {
  it.each(loadExampleSchemas())("exports $name deterministically", ({ schema: example }) => {
    const first = exportPrisma(example);
    const second = exportPrisma(example);
    expect(first.files[0]?.path).toBe("schema.prisma");
    expect(first.files[0]?.content).toContain("datasource db");
    expect(first).toEqual(second);
  });

  it("exports the SaaS example", () => {
    const result = exportPrisma(schema);
    const content = result.files[0]?.content ?? "";
    expect(result.files[0]?.path).toBe("schema.prisma");
    expect(content).toContain("datasource db");
    expect(content).toContain("generator client");
    expect(content).toContain("model Accounts");
    expect(content).toContain("enum Plan");
  });

  it("is deterministic", () => {
    expect(exportPrisma(schema)).toEqual(exportPrisma(schema));
  });

  it("falls back with warnings for unsupported types and defaults", () => {
    const modified = structuredClone(schema);
    modified.tables[0]!.columns[0]!.type = "vector";
    modified.tables[0]!.columns[0]!.default = "custom_database_function()";
    const result = exportPrisma(modified);
    expect(result.files[0]?.content).toContain("String");
    expect(result.warnings.some((warning) => warning.code === "PRISMA_UNSUPPORTED_TYPE")).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "PRISMA_UNSUPPORTED_DEFAULT")).toBe(true);
  });

  it("maps reserved, unsafe, and duplicate identifiers", () => {
    const modified = structuredClone(schema);
    modified.tables[0]!.name = "model";
    modified.tables[1]!.name = "model!";
    modified.tables[0]!.columns[0]!.name = "default";
    modified.tables[0]!.columns[1]!.name = "order-id";
    modified.enums[0]!.name = "enum";
    modified.enums[0]!.values = ["in-progress", "in progress", "1st"];
    modified.tables[0]!.columns[2]!.type = "enum";
    modified.tables[0]!.columns[2]!.default = "'in-progress'";
    const content = exportPrisma(modified).files[0]?.content ?? "";
    expect(content).toContain("model Model_");
    expect(content).toContain("model Model_2");
    expect(content).toContain('default_ String @id @default(uuid()) @db.Uuid @map("default")');
    expect(content).toContain('orderId String @map("order-id")');
    expect(content).toContain("enum Enum_");
    expect(content).toContain('in_progress2 @map("in progress")');
  });

  it("warns instead of emitting ambiguous relations and supports empty schemas", () => {
    const modified = structuredClone(schema);
    modified.relations[0]!.cardinality = "many-to-many";
    const result = exportPrisma(modified);
    expect(result.warnings.some((warning) => warning.code === "PRISMA_AMBIGUOUS_RELATION")).toBe(true);
    const empty = exportPrisma(createEmptySchema()).files[0]?.content ?? "";
    expect(empty).toContain("datasource db");
    expect(empty).not.toContain("model ");
  });
});
