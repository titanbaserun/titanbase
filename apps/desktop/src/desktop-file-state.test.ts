import { describe, expect, it } from "vitest";
import { createDesktopFileState, importedSqlFileState, openedTitanFileState, savedTitanFileState } from "./desktop-file-state";

describe("desktop file state", () => {
  it("starts as a clean blank project", () => {
    expect(createDesktopFileState()).toEqual({ isDirty: false, sourceKind: "blank" });
  });

  it("tracks opened Titan files as clean and file-backed", () => {
    expect(openedTitanFileState("/schemas/app.titan.json", "app.titan.json")).toEqual({ currentFilePath: "/schemas/app.titan.json", currentFileName: "app.titan.json", isDirty: false, sourceKind: "titan-json" });
  });

  it("keeps SQL imports dirty and without a Titan file path", () => {
    const state = importedSqlFileState("database.titan.json");
    expect(state).toEqual({ currentFileName: "database.titan.json", isDirty: true, sourceKind: "postgres-sql" });
    expect(state.currentFilePath).toBeUndefined();
  });

  it("tracks successful Save As deterministically", () => {
    expect(savedTitanFileState("/schemas/app.titan.json", "app.titan.json", "2026-06-22T12:00:00.000Z")).toEqual({ currentFilePath: "/schemas/app.titan.json", currentFileName: "app.titan.json", isDirty: false, lastSavedAt: "2026-06-22T12:00:00.000Z", sourceKind: "titan-json" });
  });
});
