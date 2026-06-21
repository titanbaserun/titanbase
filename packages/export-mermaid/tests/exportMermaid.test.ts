import { describe, expect, it } from "vitest";
import type { TitanSchema } from "@titanbase/core";
import blog from "../../../examples/blog/blog.titan.json";
import { exportMermaid } from "../src";
import { createEmptySchema } from "@titanbase/core";
import { loadExampleSchemas } from "../../../test-utils/example-schemas";

const schema = blog as TitanSchema;

describe("Mermaid exporter", () => {
  it.each(loadExampleSchemas())("exports $name deterministically", ({ schema: example }) => {
    const first = exportMermaid(example);
    const second = exportMermaid(example);
    expect(first.files[0]?.path).toBe("schema.mmd");
    expect(first.files[0]?.content).toContain("erDiagram");
    expect(first).toEqual(second);
  });

  it("exports the Blog example as an ER diagram", () => {
    const result = exportMermaid(schema);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("schema.mmd");
    expect(result.files[0]?.content).toContain("erDiagram");
    expect(result.files[0]?.content).toContain("users {");
    expect(result.files[0]?.content).toContain("posts");
    expect(result.files[0]?.content).toContain("--");
  });

  it("is deterministic", () => {
    expect(exportMermaid(schema)).toEqual(exportMermaid(schema));
  });

  it("warns for unsupported index details without throwing", () => {
    const modified = structuredClone(schema);
    modified.tables[0]!.indexes.push({ id: "complex", name: "complex", table: modified.tables[0]!.id, columns: modified.tables[0]!.columns.slice(0, 2).map((column) => column.id), unique: false, method: "gin", where: "id IS NOT NULL" });
    const result = exportMermaid(modified);
    expect(result.files[0]?.content).toContain("erDiagram");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("keeps colliding identifiers stable and handles an empty schema", () => {
    const modified = structuredClone(schema);
    modified.tables[0]!.name = "sales-data";
    modified.tables[1]!.name = "sales data";
    const result = exportMermaid(modified);
    expect(result.files[0]?.content).toContain("sales_data {");
    expect(result.files[0]?.content).toContain("sales_data_2 {");
    expect(result.warnings.some((warning) => warning.code === "MERMAID_IDENTIFIER_COLLISION")).toBe(true);
    expect(exportMermaid(createEmptySchema()).files[0]?.content).toBe("erDiagram\n");
  });
});
