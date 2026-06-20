// ---------------------------------------------------------------------------
// @titanbase/editor — public API
//
// React component for visual schema editing. Designed to be embedded in any
// React app. In local mode it uses localStorage; in cloud mode the host app
// provides persistence callbacks via SchemaEditorProps.
//
// Consumers:
//   - @titanbase/web (local Next.js app, open source)
//   - titanbase-cloud (private, uses onSave/onSchemaChange/cloudMode)
// ---------------------------------------------------------------------------

// Main component
export { SchemaEditor, type SchemaEditorProps } from "./schema-editor";

// Mutation engine — useful for programmatic schema manipulation (CLI, tests)
export {
  applySchemaMutation,
  type SchemaMutation,
  type TablePatch,
  type ColumnPatch,
  type RelationPatch,
  type IndexPatch,
  type EnumPatch,
} from "./schema-state";

// Selection types — useful for external inspector panels or deep-linking
export { type EditorSelection, type MultiSelection } from "./schema-state";
