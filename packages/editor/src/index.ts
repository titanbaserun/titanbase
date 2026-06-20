// ---------------------------------------------------------------------------
// @titanbase/editor — public API
//
// React component for local-first visual schema editing.
//
// Consumers:
//   - @titanbase/web (local Next.js app, open source)
// ---------------------------------------------------------------------------

// Main component
export { SchemaEditor, type SchemaEditorProps } from "./schema-editor";

// Mutation engine — useful for programmatic schema manipulation and tests.
export {
  applySchemaMutation,
  type SchemaMutation,
  type TablePatch,
  type ColumnPatch,
  type RelationPatch,
  type IndexPatch,
  type EnumPatch,
  type ProjectPatch,
} from "./schema-state";

// Selection types — useful for external inspector panels or deep-linking
export { type EditorSelection, type MultiSelection } from "./schema-state";

export { getSchemaStatistics, isForeignKeyColumn, isIndexedColumn, compactCardinality, createRelationLabel, type SchemaStatistics } from "./schema-visuals";
export { type SchemaTemplate } from "./template-types";
export { fallbackEditorSettings, type EditorAppSettings, type ThemePreference, type ResolvedTheme } from "./settings";
export { createExportFilename, slugifyExportName, type ExportTarget } from "./export-utils";
