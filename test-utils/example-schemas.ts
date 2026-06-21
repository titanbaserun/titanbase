import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TitanSchema } from "../packages/core/src";

const examplesDirectory = fileURLToPath(new URL("../examples/", import.meta.url));

function findSchemas(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return findSchemas(path);
    return entry.name.endsWith(".titan.json") ? [path] : [];
  });
}

export function loadExampleSchemas() {
  return findSchemas(examplesDirectory).sort().map((path) => ({
    name: path.slice(examplesDirectory.length + 1).replace(/\.titan\.json$/, ""),
    schema: JSON.parse(readFileSync(path, "utf8")) as TitanSchema,
  }));
}
