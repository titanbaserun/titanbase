import { describe, expect, it } from "vitest";
import { addRecentFileEntry, isPostgresSqlPath, isTitanbaseSchemaPath, normalizeExportExtensions, validateTitanJsonContent } from "./file-utils";

describe("desktop file safety helpers", () => {
  it("recognizes supported schema and SQL paths", () => {
    expect(isTitanbaseSchemaPath("project.titan.json")).toBe(true);
    expect(isTitanbaseSchemaPath("project.txt")).toBe(false);
    expect(isPostgresSqlPath("schema.SQL")).toBe(true);
    expect(isPostgresSqlPath("schema.sh")).toBe(false);
  });

  it("rejects invalid JSON and non-Titan JSON", () => {
    expect(validateTitanJsonContent("{")) .toContain("valid JSON");
    expect(validateTitanJsonContent('{"hello":"world"}')).toContain("not a Titanbase schema");
    expect(validateTitanJsonContent('{"titanVersion":"1.0","project":{},"tables":[],"relations":[],"enums":[]}')).toBeUndefined();
  });

  it("allows only known export extensions", () => {
    expect(normalizeExportExtensions(["sql", "ts", "exe", 1])).toEqual(["sql", "ts"]);
  });

  it("deduplicates and limits recent files deterministically", () => {
    const existing = Array.from({ length: 10 }, (_, index) => ({ filePath: `/tmp/${index}.json`, displayName: `${index}.json`, lastOpenedAt: `2026-01-${String(index + 1).padStart(2, "0")}` }));
    const updated = addRecentFileEntry(existing, "/tmp/5.json", "2026-06-22T00:00:00.000Z");
    expect(updated).toHaveLength(10);
    expect(updated[0]).toEqual({ filePath: "/tmp/5.json", displayName: "5.json", lastOpenedAt: "2026-06-22T00:00:00.000Z" });
    expect(updated.filter((item) => item.filePath === "/tmp/5.json")).toHaveLength(1);
  });
});
