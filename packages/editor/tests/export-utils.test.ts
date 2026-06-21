import { describe, expect, it } from "vitest";
import { createExportFilename, slugifyExportName } from "../src/export-utils";

describe("export filenames", () => {
  it("slugifies project names", () => {
    expect(slugifyExportName("Customer Billing v2")).toBe("customer-billing-v2");
    expect(slugifyExportName("  Café / CRM  ")).toBe("cafe-crm");
  });

  it("uses target-specific extensions", () => {
    expect(createExportFilename("My Schema", "json")).toBe("my-schema.titan.json");
    expect(createExportFilename("My Schema", "sql")).toBe("my-schema.sql");
    expect(createExportFilename("My Schema", "mermaid")).toBe("my-schema.mmd");
    expect(createExportFilename("My Schema", "prisma")).toBe("schema.prisma");
    expect(createExportFilename("My Schema", "drizzle")).toBe("schema.ts");
  });
});
