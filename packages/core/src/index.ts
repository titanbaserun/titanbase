// ---------------------------------------------------------------------------
// @titanbase/core — public API
//
// This is the portable schema format. It defines the .titan.json structure,
// validates it, and provides diagnostics. No React, no UI, no side effects.
//
// Consumers:
//   - @titanbase/editor (visual editor)
//   - @titanbase/export-postgres (SQL code gen)
//   - Future: CLI, other exporters, cloud sync
// ---------------------------------------------------------------------------

// Types — the .titan.json data model
export {
  TITAN_VERSION,
  type TitanDialect,
  type RelationCardinality,
  type ReferentialAction,
  type TitanColumn,
  type TitanIndex,
  type TitanTable,
  type TitanEnum,
  type TitanRelationEndpoint,
  type TitanRelation,
  type TitanPosition,
  type TitanSchema,
  type DiagnosticSeverity,
  type TitanDiagnostic,
} from "./types";

// Zod schemas — runtime parsing and validation of .titan.json files
export {
  titanColumnSchema,
  titanIndexSchema,
  titanTableSchema,
  titanEnumSchema,
  titanRelationSchema,
  titanSchemaSchema,
} from "./schema";

// Diagnostics — semantic validation beyond Zod structural checks
export { diagnoseSchema, validateTitanSchema } from "./diagnostics";

// Normalization — canonical form for deterministic output
export { normalizeSchema } from "./normalize";
