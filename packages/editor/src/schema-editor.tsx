"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useReactFlow, ReactFlowProvider, type Edge, type Node, type NodeChange } from "@xyflow/react";
import { ArrowArcLeft, ArrowArcRight, ArrowsLeftRight, BookOpen, BracketsCurly, CaretDoubleRight, CheckCircle, Database, DownloadSimple, FilePlus, FileSql, FloppyDisk, FolderOpen, Gear, Link, MagnifyingGlass, Moon, Plus, PushPin, PushPinSlash, SidebarSimple, Sun, Table as TableIcon, TreeStructure, WarningCircle } from "@phosphor-icons/react";
import { createEmptySchema, diagnoseSchema, diffSchemas, normalizeSchema, type SchemaDiffChange, type SchemaDiffResult, type TitanDiagnostic, type TitanEnum, type TitanIndex, type TitanRelation, type TitanSchema, type TitanTable } from "@titanbase/core";
import { exportDrizzle } from "@titanbase/export-drizzle";
import { exportMermaid } from "@titanbase/export-mermaid";
import { exportPostgres, generatePostgresMigrationDraft, type MigrationDraftResult } from "@titanbase/export-postgres";
import { exportPrisma } from "@titanbase/export-prisma";
import { importPostgresSql, type ImportWarning } from "@titanbase/import-postgres";
import { Badge, Button, Input } from "@titanbase/ui";
import { ExportModal } from "./export-modal";
import { createExportFilename, type ExportTarget } from "./export-utils";
import { SchemaInspector } from "./inspectors";
import { LeaveDialog } from "./leave-dialog";
import { ProjectOverview } from "./project-overview";
import { ReplaceDialog } from "./replace-dialog";
import { applySchemaMutation, selectionForDiagnostic, useSchemaHistory, type EditorSelection, type MultiSelection } from "./schema-state";
import { createRelationLabel, getSchemaStatistics, isForeignKeyColumn, isIndexedColumn } from "./schema-visuals";
import { TableNodeView, type TableNode } from "./table-node";
import type { SchemaTemplate } from "./template-types";
import { WelcomeScreen } from "./welcome-screen";
import { SettingsDialog } from "./settings-dialog";
import { ImportResultDialog } from "./import-result-dialog";
import { fallbackEditorSettings, type EditorAppSettings, type ResolvedTheme } from "./settings";
import { DiffModal } from "./diff-modal";
import { MigrationDraftModal } from "./migration-draft-modal";

const nodeTypes = { tableNode: TableNodeView };
const STORAGE_KEY = "titanbase:schema";

const nextId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;

const emptyMultiSelection: MultiSelection = { tableIds: new Set(), relationIds: new Set() };

function diagnosticGroup(issue: TitanDiagnostic, schema: TitanSchema) {
  if (issue.tableId) return schema.tables.find((table) => table.id === issue.tableId)?.name ?? "Tables";
  if (issue.relationId) return schema.relations.find((relation) => relation.id === issue.relationId)?.name ?? "Relations";
  if (issue.enumId) return schema.enums.find((item) => item.id === issue.enumId)?.name ?? "Enums";
  const parts = issue.path.split(".");
  const index = Number(parts[1]);
  if (parts[0] === "tables") return schema.tables[index]?.name ?? "Tables";
  if (parts[0] === "relations") return schema.relations[index]?.name ?? "Relations";
  if (parts[0] === "enums") return schema.enums[index]?.name ?? "Enums";
  if (parts[0] === "metadata") return "Editor metadata";
  return "Schema";
}

function inspectorContextTitle(selection: EditorSelection) {
  if (!selection) return "Project Overview";
  const titles = { table: "Table", column: "Column", relation: "Relation", enum: "Enum", index: "Index" } as const;
  return titles[selection.kind];
}

function autoLayout(schema: TitanSchema): Record<string, { x: number; y: number }> {
  const cols = Math.max(3, Math.ceil(Math.sqrt(schema.tables.length)));
  const gapX = 380;
  const gapY = 320;
  const positions: Record<string, { x: number; y: number }> = {};
  for (let i = 0; i < schema.tables.length; i++) {
    const table = schema.tables[i]!;
    positions[table.id] = { x: 80 + (i % cols) * gapX, y: 80 + Math.floor(i / cols) * gapY };
  }
  return positions;
}

export interface SchemaEditorProps {
  initialSchema: TitanSchema;
  templates?: SchemaTemplate[];
  settings?: EditorAppSettings;
  resolvedTheme?: ResolvedTheme;
  onSettingsChange?: (settings: EditorAppSettings) => void;
  onResetSettings?: () => void;
}

function SchemaEditorInner({ initialSchema, templates = [], settings = fallbackEditorSettings, resolvedTheme = "light", onSettingsChange, onResetSettings }: SchemaEditorProps) {
  const normalizedInitial = useMemo(() => normalizeSchema(initialSchema), [initialSchema]);
  const history = useSchemaHistory(normalizedInitial);
  const { schema } = history;
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [multiSelection, setMultiSelection] = useState<MultiSelection>(emptyMultiSelection);
  const [preview, setPreview] = useState<ExportTarget | null>(null);
  const [notice, setNotice] = useState("Saved");
  const [filename, setFilename] = useState(schema.tables.length ? `${schema.project.id}.titan.json` : "untitled.titan.json");
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(schema));
  const [requiresJsonSave, setRequiresJsonSave] = useState(false);
  const [showWelcome, setShowWelcome] = useState(schema.tables.length === 0);
  const [welcomeTemplates, setWelcomeTemplates] = useState(false);
  const [fitRevision, setFitRevision] = useState(0);
  const [validationOpen, setValidationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [importReport, setImportReport] = useState<{ sourceName: string; warnings: ImportWarning[]; errors: ImportWarning[] } | null>(null);
  const [diffReport, setDiffReport] = useState<{ selectedName: string; selectedSchema?: TitanSchema; result?: SchemaDiffResult; error?: string } | null>(null);
  const [migrationDraft, setMigrationDraft] = useState<{ selectedName: string; result: MigrationDraftResult } | null>(null);
  const [inspectorPreview, setInspectorPreview] = useState(false);
  const [narrowInspector, setNarrowInspector] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const jsonFileInput = useRef<HTMLInputElement>(null);
  const sqlFileInput = useRef<HTMLInputElement>(null);
  const compareFileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const dragStart = useRef<TitanSchema | null>(null);
  const replaceAction = useRef<(() => void) | null>(null);
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const reactFlow = useReactFlow();
  const darkMode = resolvedTheme === "dark";
  const minimapNodeColor = darkMode ? "#58647c" : "#9bb8a3";
  const minimapSelectedColor = darkMode ? "#60a5fa" : "#0bad45";
  const minimapMaskColor = darkMode ? "rgba(17, 17, 24, 0.72)" : "rgba(248, 250, 248, 0.7)";
  const inspectorVisible = settings.inspectorOpen || inspectorPreview;
  const inspectorPinnedOpen = settings.inspectorPinned && settings.inspectorOpen && !narrowInspector;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setNarrowInspector(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 190);
    return () => window.clearTimeout(timeout);
  }, [inspectorPinnedOpen]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  const currentSnapshot = useMemo(() => JSON.stringify(schema), [schema]);
  const isDirty = savedSnapshot !== currentSnapshot;
  const saveStatus = requiresJsonSave ? "Unsaved .titan.json" : isDirty ? "Unsaved changes" : notice === "Saved locally" ? "Saved locally" : "Saved";

  useEffect(() => {
    if (!settings.autosave || !isDirty || showWelcome) return;
    const timeout = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, currentSnapshot);
      if (!requiresJsonSave) setSavedSnapshot(currentSnapshot);
      setNotice(requiresJsonSave ? "Local draft saved" : "Saved locally");
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [currentSnapshot, isDirty, requiresJsonSave, settings.autosave, showWelcome]);

  useEffect(() => {
    if (!settings.autoFitViewOnLoad || showWelcome || !schema.tables.length) return;
    const timeout = window.setTimeout(() => reactFlow.fitView({ padding: 0.2, minZoom: 0.65, maxZoom: 1.05, duration: 320 }), 80);
    return () => window.clearTimeout(timeout);
  }, [fitRevision, reactFlow, schema.tables.length, settings.autoFitViewOnLoad, showWelcome]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";

      // Undo: Ctrl/Cmd+Z
      if (meta && event.key === "z" && !event.shiftKey && !isInput) {
        event.preventDefault();
        history.undo();
        return;
      }
      // Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
      if ((meta && event.key === "z" && event.shiftKey) || (meta && event.key === "y")) {
        event.preventDefault();
        history.redo();
        return;
      }
      // Search: Ctrl/Cmd+F
      if (meta && event.key === "f" && !isInput) {
        event.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInput.current?.focus(), 50);
        return;
      }
      // Escape: close search or deselect
      if (event.key === "Escape") {
        if (migrationDraft) setMigrationDraft(null);
        else if (diffReport) setDiffReport(null);
        else if (importReport) setImportReport(null);
        else if (replaceOpen) { setReplaceOpen(false); replaceAction.current = null; }
        else if (leaveOpen) setLeaveOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (preview) setPreview(null);
        else if (inspectorVisible && !inspectorPinnedOpen) {
          setInspectorPreview(false);
          onSettingsChange?.({ ...settings, inspectorOpen: false });
        }
        else if (searchOpen) { setSearchOpen(false); setSearchQuery(""); }
        else { setSelection(null); setMultiSelection(emptyMultiSelection); }
        return;
      }
      // Delete/Backspace: delete selected item
      if ((event.key === "Delete" || event.key === "Backspace") && !isInput) {
        event.preventDefault();
        // Multi-delete
        if (multiSelection.tableIds.size > 0 || multiSelection.relationIds.size > 0) {
          let current = schemaRef.current;
          for (const tableId of multiSelection.tableIds) {
            current = applySchemaMutation(current, { type: "table.delete", tableId });
          }
          for (const relationId of multiSelection.relationIds) {
            current = applySchemaMutation(current, { type: "relation.delete", relationId });
          }
          history.commitFrom(schemaRef.current, current);
          setSelection(null);
          setMultiSelection(emptyMultiSelection);
          setNotice(`Deleted ${multiSelection.tableIds.size + multiSelection.relationIds.size} items`);
          return;
        }
        // Single delete
        if (selection?.kind === "table") {
          history.commit({ type: "table.delete", tableId: selection.tableId });
          setSelection(null);
          setNotice("Table deleted");
        } else if (selection?.kind === "column") {
          history.commit({ type: "column.delete", tableId: selection.tableId, columnId: selection.columnId });
          setSelection({ kind: "table", tableId: selection.tableId });
          setNotice("Column deleted");
        } else if (selection?.kind === "relation") {
          history.commit({ type: "relation.delete", relationId: selection.relationId });
          setSelection(null);
          setNotice("Relation deleted");
        } else if (selection?.kind === "index") {
          history.commit({ type: "index.delete", tableId: selection.tableId, indexId: selection.indexId });
          setSelection({ kind: "table", tableId: selection.tableId });
          setNotice("Index deleted");
        } else if (selection?.kind === "enum") {
          history.commit({ type: "enum.delete", enumId: selection.enumId });
          setSelection(null);
          setNotice("Enum deleted");
        }
        return;
      }
      // Ctrl/Cmd+S: save
      if (meta && event.key === "s" && !isInput) {
        event.preventDefault();
        const serialized = JSON.stringify(schemaRef.current);
        localStorage.setItem(STORAGE_KEY, serialized);
        setSavedSnapshot(serialized);
        setNotice("Saved locally");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [history, selection, multiSelection, preview, searchOpen, leaveOpen, replaceOpen, importReport, diffReport, migrationDraft, settingsOpen, inspectorVisible, inspectorPinnedOpen, settings, onSettingsChange]);

  const diagnostics = useMemo(() => diagnoseSchema(schema), [schema]);
  const diagnosticErrors = useMemo(() => diagnostics.filter((issue) => issue.severity === "error"), [diagnostics]);
  const diagnosticWarnings = useMemo(() => diagnostics.filter((issue) => issue.severity === "warning"), [diagnostics]);
  const sqlResult = useMemo(() => exportPostgres(schema), [schema]);
  const mermaidResult = useMemo(() => exportMermaid(schema), [schema]);
  const prismaResult = useMemo(() => exportPrisma(schema), [schema]);
  const drizzleResult = useMemo(() => exportDrizzle(schema), [schema]);
  const exportPreview = useMemo(() => {
    if (preview === "sql") return { content: sqlResult.sql, warnings: sqlResult.warnings };
    if (preview === "mermaid") return { content: mermaidResult.files[0]?.content ?? "", warnings: mermaidResult.warnings.map((warning) => warning.message) };
    if (preview === "prisma") return { content: prismaResult.files[0]?.content ?? "", warnings: prismaResult.warnings.map((warning) => warning.message) };
    if (preview === "drizzle") return { content: drizzleResult.files[0]?.content ?? "", warnings: drizzleResult.warnings.map((warning) => warning.message) };
    return { content: JSON.stringify(schema, null, 2), warnings: [] };
  }, [drizzleResult, mermaidResult, preview, prismaResult, schema, sqlResult]);
  const previewContent = exportPreview.content;
  const groupedDiagnostics = useMemo(() => Object.entries(diagnostics.reduce<Record<string, TitanDiagnostic[]>>((groups, issue) => {
    const group = diagnosticGroup(issue, schema);
    (groups[group] ??= []).push(issue);
    return groups;
  }, {})), [diagnostics, schema]);

  // Search filtering
  const filteredTableIds = useMemo(() => {
    if (!searchQuery.trim()) return null; // null means show all
    const q = searchQuery.toLowerCase();
    return new Set(schema.tables.filter((t) => t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q))).map((t) => t.id));
  }, [schema.tables, searchQuery]);

  const selectColumn = useCallback((tableId: string, columnId: string) => setSelection({ kind: "column", tableId, columnId }), []);
  const selectedTableId = selection && "tableId" in selection ? selection.tableId : null;
  const selectedColumnId = selection?.kind === "column" ? selection.columnId : undefined;
  const selectedRelationId = selection?.kind === "relation" ? selection.relationId : null;

  const nodes = useMemo<TableNode[]>(() => schema.tables.map((table, index) => ({
    id: table.id,
    type: "tableNode",
    position: schema.metadata.editor.tablePositions[table.id] ?? { x: 80 + index * 340, y: 100 + index * 90 },
    width: 330,
    height: 46 + table.columns.length * 37,
    data: {
      table,
      foreignKeyColumnIds: new Set(table.columns.filter((column) => isForeignKeyColumn(schema, table.id, column.id)).map((column) => column.id)),
      indexedColumnIds: new Set(table.columns.filter((column) => isIndexedColumn(table, column.id)).map((column) => column.id)),
      onSelectColumn: selectColumn,
      ...(selectedTableId === table.id && selectedColumnId ? { selectedColumnId } : {}),
    },
    selected: table.id === selectedTableId || multiSelection.tableIds.has(table.id),
    hidden: filteredTableIds !== null && !filteredTableIds.has(table.id),
  })), [schema, selectColumn, selectedColumnId, selectedTableId, multiSelection.tableIds, filteredTableIds]);

  const edges = useMemo<Edge[]>(() => schema.relations.map((relation) => {
    const isSelected = relation.id === selectedRelationId || multiSelection.relationIds.has(relation.id);
    const isHovered = relation.id === hoveredEdgeId;
    return {
      id: relation.id,
      source: relation.from.table,
      target: relation.to.table,
      label: createRelationLabel(schema, relation),
      type: "smoothstep",
      animated: false,
      selected: isSelected,
      style: { stroke: isSelected || isHovered ? "var(--relation-selected)" : "var(--relation)", strokeWidth: isSelected ? 2.2 : isHovered ? 1.65 : 1.15, opacity: isSelected || isHovered ? 1 : 0.66 },
      labelStyle: { fill: "var(--muted-foreground)", fontSize: 10, fontWeight: 650 },
      labelBgStyle: { fill: "var(--panel)", fillOpacity: 0.97 },
      labelBgPadding: [7, 5] as [number, number],
      labelBgBorderRadius: 5,
    };
  }), [schema, selectedRelationId, multiSelection.relationIds, hoveredEdgeId]);

  const addTable = () => {
    const id = nextId("table");
    const count = schema.tables.length + 1;
    const table: TitanTable = { id, name: `table_${count}`, description: "New schema table.", columns: [{ id: `${id}.id`, name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true, default: "gen_random_uuid()" }], indexes: [] };
    history.commit({ type: "table.add", table, position: { x: 140 + count * 38, y: 110 + count * 32 } });
    setSelection({ kind: "table", tableId: id });
    setNotice(`${table.name} added`);
    if (!schema.tables.length) setFitRevision((revision) => revision + 1);
  };

  const createColumn = (table: TitanTable) => {
    const id = nextId(`${table.id}.column`);
    history.commit({ type: "column.add", tableId: table.id, column: { id, name: `column_${table.columns.length + 1}`, type: "text", nullable: true, primaryKey: false, unique: false } });
    setSelection({ kind: "column", tableId: table.id, columnId: id });
    setNotice("Column added");
  };

  const createRelation = () => {
    const fromTable = schema.tables[0];
    const toTable = schema.tables[1];
    if (!fromTable?.columns[0] || !toTable?.columns[0]) return setNotice("Add two tables with columns first");
    const id = nextId("relation");
    const relation: TitanRelation = { id, name: `${fromTable.name}_${toTable.name}`, from: { table: fromTable.id, columns: [fromTable.columns[0].id] }, to: { table: toTable.id, columns: [toTable.columns[0].id] }, cardinality: "many-to-one", onDelete: "no-action", onUpdate: "no-action" };
    history.commit({ type: "relation.add", relation });
    setSelection({ kind: "relation", relationId: id });
    setPreview(null);
    setNotice("Relation added");
  };

  const createIndex = (table: TitanTable) => {
    if (!table.columns[0]) return setNotice("Add a column before creating an index");
    const id = nextId(`${table.id}.index`);
    const index: TitanIndex = { id, name: `${table.name}_${table.indexes.length + 1}_idx`, table: table.id, columns: [table.columns[0].id], unique: false, method: "btree" };
    history.commit({ type: "index.add", tableId: table.id, index });
    setSelection({ kind: "index", tableId: table.id, indexId: id });
    setNotice("Index added");
  };

  const createEnum = () => {
    const id = nextId("enum");
    const enumDefinition: TitanEnum = { id, name: `enum_${schema.enums.length + 1}`, values: ["value_1"] };
    history.commit({ type: "enum.add", enumDefinition });
    setSelection({ kind: "enum", enumId: id });
    setPreview(null);
    setNotice("Enum added");
  };

  const requestReplace = (action: () => void) => {
    if (showWelcome || !isDirty) return action();
    replaceAction.current = action;
    setReplaceOpen(true);
  };

  const replaceProject = (nextSchema: TitanSchema, nextFilename: string, nextNotice: string, markDirty = false) => {
    const normalized = normalizeSchema(nextSchema);
    history.reset(normalized);
    schemaRef.current = normalized;
    setSelection(null);
    setMultiSelection(emptyMultiSelection);
    setFilename(nextFilename);
    setSavedSnapshot(markDirty ? "" : JSON.stringify(normalized));
    setRequiresJsonSave(markDirty);
    setNotice(nextNotice);
    setShowWelcome(false);
    setWelcomeTemplates(false);
    setPreview(null);
    setValidationOpen(false);
    setFitRevision((revision) => revision + 1);
  };

  const startBlank = () => {
    requestReplace(() => replaceProject(createEmptySchema(), "untitled.titan.json", "Saved"));
  };

  const startTemplate = (template: SchemaTemplate) => {
    requestReplace(() => replaceProject(template.schema, `${template.id}.titan.json`, "Saved"));
  };

  const showTemplatePicker = () => {
    requestReplace(() => { setWelcomeTemplates(true); setShowWelcome(true); });
  };

  const requestOpenJson = () => {
    requestReplace(() => jsonFileInput.current?.click());
  };

  const requestImportSql = () => {
    requestReplace(() => sqlFileInput.current?.click());
  };

  const requestCompare = () => compareFileInput.current?.click();

  const saveLocal = () => {
    const serialized = JSON.stringify(schema);
    localStorage.setItem(STORAGE_KEY, serialized);
    if (!requiresJsonSave) setSavedSnapshot(serialized);
    setNotice(requiresJsonSave ? "Local draft saved" : "Saved locally");
  };

  const loadLocal = () => {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return setNotice("No local save found");
    requestReplace(() => {
      try {
        const loaded = normalizeSchema(JSON.parse(value));
        replaceProject(loaded, `${loaded.project.id}.titan.json`, "Saved locally");
      } catch { setNotice("Local save is invalid"); }
    });
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const loaded = normalizeSchema(JSON.parse(await file.text()));
      replaceProject(loaded, file.name, "Saved");
    } catch { setNotice("Could not load schema"); }
    event.target.value = "";
  };

  const importSql = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = importPostgresSql(await file.text(), { sourceName: file.name });
    if (!result.schema || result.errors.length) {
      setImportReport({ sourceName: file.name, warnings: result.warnings, errors: result.errors.length ? result.errors : [{ code: "import_failed", message: "Titanbase could not create a schema from this SQL file." }] });
      event.target.value = "";
      return;
    }
    const outputName = `${file.name.replace(/\.(?:sql|psql)$/i, "") || "imported-schema"}.titan.json`;
    replaceProject(result.schema, outputName, `Imported ${file.name}`, true);
    if (result.warnings.length) setImportReport({ sourceName: file.name, warnings: result.warnings, errors: [] });
    event.target.value = "";
  };

  const compareJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const selectedSchema = normalizeSchema(JSON.parse(await file.text()));
      setDiffReport({ selectedName: file.name, selectedSchema, result: diffSchemas(schemaRef.current, selectedSchema) });
    } catch (error) {
      setDiffReport({ selectedName: file.name, error: error instanceof Error ? error.message : "Could not read the selected schema." });
    }
    event.target.value = "";
  };

  const selectionForDiff = (change: SchemaDiffChange): EditorSelection => {
    if (change.columnId) {
      const table = schema.tables.find((item) => item.columns.some((column) => column.id === change.columnId));
      if (table) return { kind: "column", tableId: table.id, columnId: change.columnId };
    }
    if (change.indexId) {
      const table = schema.tables.find((item) => item.indexes.some((index) => index.id === change.indexId));
      if (table) return { kind: "index", tableId: table.id, indexId: change.indexId };
    }
    if (change.tableId && schema.tables.some((table) => table.id === change.tableId)) return { kind: "table", tableId: change.tableId };
    if (change.relationId && schema.relations.some((relation) => relation.id === change.relationId)) return { kind: "relation", relationId: change.relationId };
    if (change.enumId && schema.enums.some((item) => item.id === change.enumId)) return { kind: "enum", enumId: change.enumId };
    return null;
  };

  const selectDiffChange = (change: SchemaDiffChange) => {
    const next = selectionForDiff(change);
    if (!next) return;
    setSelection(next);
    setMultiSelection(emptyMultiSelection);
    setDiffReport(null);
    setPreview(null);
  };

  const generateMigrationDraft = () => {
    if (!diffReport?.selectedSchema) return;
    setMigrationDraft({ selectedName: diffReport.selectedName, result: generatePostgresMigrationDraft(schemaRef.current, diffReport.selectedSchema) });
    setDiffReport(null);
  };

  const copyPreview = async () => {
    const labels: Record<ExportTarget, string> = { json: "JSON", sql: "PostgreSQL", mermaid: "Mermaid", prisma: "Prisma", drizzle: "Drizzle" };
    try {
      await navigator.clipboard.writeText(previewContent);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = previewContent;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) {
        setNotice("Copy permission blocked");
        return false;
      }
    }
    setNotice(`${labels[preview ?? "json"]} copied`);
    return true;
  };

  const downloadContent = (target: ExportTarget, content: string) => {
    const mimeTypes: Record<ExportTarget, string> = {
      json: "application/json",
      sql: "text/sql",
      mermaid: "text/plain",
      prisma: "text/plain",
      drizzle: "text/typescript",
    };
    const blob = new Blob([content], { type: mimeTypes[target] });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = createExportFilename(schema.project.name, target);
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    if (!requiresJsonSave || target === "json") setSavedSnapshot(JSON.stringify(schema));
    if (target === "json") setRequiresJsonSave(false);
    setNotice("Saved");
  };

  const download = () => downloadContent(preview ?? "json", previewContent);

  const returnToWelcome = () => {
    const empty = normalizeSchema(createEmptySchema());
    history.reset(empty);
    schemaRef.current = empty;
    setSavedSnapshot(JSON.stringify(empty));
    setRequiresJsonSave(false);
    setFilename("untitled.titan.json");
    setSelection(null);
    setMultiSelection(emptyMultiSelection);
    setPreview(null);
    setSettingsOpen(false);
    setLeaveOpen(false);
    setImportReport(null);
    setDiffReport(null);
    setWelcomeTemplates(false);
    setShowWelcome(true);
    setNotice("Saved");
  };

  const requestLogoNavigation = () => {
    if (isDirty) setLeaveOpen(true);
    else returnToWelcome();
  };

  const saveAndLeave = () => {
    const content = JSON.stringify(schema, null, 2);
    downloadContent("json", content);
    returnToWelcome();
  };

  const clearLocalDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    setNotice("Local draft cleared");
  };

  const toggleTheme = () => onSettingsChange?.({ ...settings, theme: darkMode ? "light" : "dark" });

  const openInspector = () => {
    setInspectorPreview(false);
    onSettingsChange?.({ ...settings, inspectorOpen: true });
  };

  const collapseInspector = () => {
    setInspectorPreview(false);
    onSettingsChange?.({ ...settings, inspectorOpen: false });
  };

  const toggleInspectorPin = () => {
    if (settings.inspectorPinned) {
      onSettingsChange?.({ ...settings, inspectorPinned: false, inspectorOpen: false });
      setInspectorPreview(true);
      return;
    }
    setInspectorPreview(false);
    onSettingsChange?.({ ...settings, inspectorPinned: true, inspectorOpen: true });
  };

  const closeInspectorOverlay = () => {
    if (settings.inspectorPinned) return;
    setInspectorPreview(false);
    if (settings.inspectorOpen) onSettingsChange?.({ ...settings, inspectorOpen: false });
  };

  const runAutoLayout = () => {
    const positions = autoLayout(schema);
    let current = schemaRef.current;
    for (const [tableId, position] of Object.entries(positions)) {
      current = applySchemaMutation(current, { type: "position.update", tableId, position });
    }
    history.commitFrom(schemaRef.current, current);
    setTimeout(() => reactFlow.fitView({ duration: 300 }), 50);
    setNotice("Auto-layout applied");
  };

  const onNodesChange = useCallback((changes: NodeChange<TableNode>[]) => {
    let next = schemaRef.current;
    let moved = false;
    for (const change of changes) {
      if (change.type !== "position" || !change.position) continue;
      next = applySchemaMutation(next, { type: "position.update", tableId: change.id, position: change.position });
      moved = true;
    }
    if (!moved) return;
    schemaRef.current = next;
    history.replace(next);
  }, [history]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const event = _ as React.MouseEvent;
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      // Multi-select with shift/cmd
      setMultiSelection((prev) => {
        const next = new Set(prev.tableIds);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return { ...prev, tableIds: next };
      });
    } else {
      setMultiSelection(emptyMultiSelection);
      setSelection({ kind: "table", tableId: node.id });
      setPreview(null);
    }
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const event = _ as React.MouseEvent;
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      setMultiSelection((prev) => {
        const next = new Set(prev.relationIds);
        if (next.has(edge.id)) next.delete(edge.id);
        else next.add(edge.id);
        return { ...prev, relationIds: next };
      });
    } else {
      setMultiSelection(emptyMultiSelection);
      setSelection({ kind: "relation", relationId: edge.id });
      setPreview(null);
    }
  }, []);

  // Relation hover tooltip
  const hoveredRelation = useMemo(() => {
    if (!hoveredEdgeId) return null;
    const rel = schema.relations.find((r) => r.id === hoveredEdgeId);
    if (!rel) return null;
    const fromTable = schema.tables.find((t) => t.id === rel.from.table);
    const toTable = schema.tables.find((t) => t.id === rel.to.table);
    const fromCols = rel.from.columns.map((id) => fromTable?.columns.find((c) => c.id === id)?.name ?? id);
    const toCols = rel.to.columns.map((id) => toTable?.columns.find((c) => c.id === id)?.name ?? id);
    return { name: rel.name, from: `${fromTable?.name ?? "?"}.${fromCols.join(", ")}`, to: `${toTable?.name ?? "?"}.${toCols.join(", ")}`, cardinality: rel.cardinality };
  }, [hoveredEdgeId, schema]);

  const statistics = useMemo(() => getSchemaStatistics(schema), [schema]);

  if (showWelcome) return <>
    <WelcomeScreen templates={templates} initialShowTemplates={welcomeTemplates} onBlank={startBlank} onOpen={requestOpenJson} onImportSql={requestImportSql} onTemplate={startTemplate} />
    <input ref={jsonFileInput} className="sr-only" type="file" accept=".json,.titan.json,application/json" onChange={importJson} />
    <input ref={sqlFileInput} className="sr-only" type="file" accept=".sql,.psql,text/sql,application/sql" onChange={importSql} />
    {importReport ? <ImportResultDialog {...importReport} onClose={() => setImportReport(null)} /> : null}
  </>;

  return <main className={`editor-shell ${darkMode ? "dark" : ""} ${inspectorPinnedOpen ? "editor-shell--inspector-pinned" : ""}`} data-theme={resolvedTheme}>
    <header className="editor-toolbar">
      <button className="brand-lockup" onClick={requestLogoNavigation} title="Return to start screen"><img className="theme-logo theme-logo--light" src="/Titan.svg" alt="Titanbase" /><img className="theme-logo theme-logo--dark" src="/titanbase_light.svg" alt="Titanbase" /></button>
      <div className="file-status"><BracketsCurly size={17} /><span><strong>{schema.project.name}</strong><small>{filename}</small></span><span className={`status-dot ${isDirty ? "status-dot--dirty" : ""}`} /><em>{saveStatus}</em></div>
      <div className="toolbar-actions">
        <div className="toolbar-group"><Button variant="ghost" disabled={!history.canUndo} onClick={history.undo} title="Undo (Ctrl+Z)"><ArrowArcLeft size={18} /><span className="action-label">Undo</span></Button><Button variant="ghost" disabled={!history.canRedo} onClick={history.redo} title="Redo (Ctrl+Shift+Z)"><ArrowArcRight size={18} /><span className="action-label">Redo</span></Button></div>
        <div className="toolbar-group"><Button variant="ghost" onClick={startBlank} title="New schema"><FilePlus size={18} /><span className="action-label">New</span></Button><Button variant="ghost" onClick={saveLocal} title="Save locally (Ctrl+S)"><FloppyDisk size={18} /><span className="action-label">Save</span></Button><Button variant="ghost" onClick={loadLocal} title="Load local draft"><FolderOpen size={18} /><span className="action-label">Load</span></Button><Button variant="ghost" onClick={requestImportSql} title="Import a local PostgreSQL SQL file"><FileSql size={18} /><span className="action-label">Import</span></Button><Button variant="ghost" onClick={requestCompare} title="Compare current schema with another .titan.json"><ArrowsLeftRight size={18} /><span className="action-label">Compare</span></Button><Button className="export-toolbar-button" onClick={() => setPreview("json")} title="Export and download schema files"><DownloadSimple size={18} /> Export</Button></div>
        <div className="toolbar-group toolbar-group--add"><Button variant="primary" onClick={addTable}><Plus size={18} /> Table</Button><Button onClick={createRelation}><Link size={18} /> Relation</Button><Button onClick={createEnum}><Database size={18} /> Enum</Button></div>
        <div className="toolbar-group"><Button variant="ghost" onClick={() => { setSearchOpen(!searchOpen); if (!searchOpen) setTimeout(() => searchInput.current?.focus(), 50); }} title="Search (Ctrl+F)"><MagnifyingGlass size={18} /></Button><Button variant="ghost" onClick={runAutoLayout} title="Auto-layout tables"><TreeStructure size={18} /></Button><Button variant="ghost" onClick={() => setSettingsOpen(true)} title="Settings"><Gear size={18} /></Button><Button variant="ghost" onClick={toggleTheme} title="Toggle theme">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</Button></div>
        <div className="toolbar-group"><a className="docs-link docs-link--icon" href="https://www.titanbase.run" target="_blank" rel="noreferrer" title="Titanbase" aria-label="Titanbase website"><img className="brand-mark-icon" src="/titanbase-mark.svg" alt="" /></a><a className="docs-link docs-link--icon" href="https://docs.titanbase.run" target="_blank" rel="noreferrer" title="Docs" aria-label="Documentation"><BookOpen size={18} /></a></div>
      </div>
      <input ref={jsonFileInput} className="sr-only" type="file" accept=".json,.titan.json,application/json" onChange={importJson} />
      <input ref={sqlFileInput} className="sr-only" type="file" accept=".sql,.psql,text/sql,application/sql" onChange={importSql} />
      <input ref={compareFileInput} className="sr-only" type="file" accept=".json,.titan.json,application/json" onChange={compareJson} />
    </header>

    {searchOpen && <div className="search-bar">
      <MagnifyingGlass size={16} />
      <Input ref={searchInput} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter tables and columns..." aria-label="Search tables" />
      <Button variant="ghost" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>Esc</Button>
      {filteredTableIds !== null && <span className="search-count">{filteredTableIds.size} of {schema.tables.length} tables</span>}
    </div>}

    <div className={`editor-workspace ${inspectorPinnedOpen ? "editor-workspace--inspector-pinned" : ""}`}>
      <section className="canvas" aria-label="Schema canvas">
        <ReactFlow<TableNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)} onEdgeMouseLeave={() => setHoveredEdgeId(null)} onPaneClick={() => { setSelection(null); setMultiSelection(emptyMultiSelection); setPreview(null); }} onNodeDragStart={() => { dragStart.current = schemaRef.current; }} onNodeDragStop={() => { if (dragStart.current) history.commitFrom(dragStart.current, schemaRef.current); dragStart.current = null; }} fitView minZoom={0.35} maxZoom={1.8} selectionOnDrag={false} panOnDrag panOnScroll zoomOnScroll={false} proOptions={{ hideAttribution: true }}>
          {settings.showGrid ? <Background variant={BackgroundVariant.Dots} color="var(--canvas-grid)" gap={22} size={1.2} /> : null}
          <Controls showInteractive={false} />
          {settings.showMinimap && schema.tables.length ? <MiniMap pannable zoomable nodeColor={(node) => node.id === selectedTableId || multiSelection.tableIds.has(node.id) ? minimapSelectedColor : minimapNodeColor} maskColor={minimapMaskColor} /> : null}
        </ReactFlow>
        <Button className="canvas-import" onClick={() => jsonFileInput.current?.click()}><FolderOpen size={17} /> Open JSON</Button>
        {hoveredRelation && <div className="relation-tooltip">
          <strong>{hoveredRelation.name}</strong>
          <span>{hoveredRelation.from} → {hoveredRelation.to}</span>
          <small>{hoveredRelation.cardinality}</small>
        </div>}
        {multiSelection.tableIds.size + multiSelection.relationIds.size > 0 && <div className="multi-select-badge">{multiSelection.tableIds.size + multiSelection.relationIds.size} selected — press Delete to remove</div>}
        {!schema.tables.length ? <div className="canvas-empty"><TableIcon size={34} weight="duotone" /><h2>Start designing your schema</h2><p>Add your first table, start from a template, open a .titan.json file, or import PostgreSQL DDL.</p><div><Button variant="primary" onClick={addTable}><Plus size={17} /> Add Table</Button><Button onClick={showTemplatePicker}>Use Template</Button><Button onClick={requestOpenJson}><FolderOpen size={17} /> Open JSON</Button><Button onClick={requestImportSql}><FileSql size={17} /> Import SQL</Button></div><small>Tip: SQL import runs locally and never connects to your database.</small></div> : null}
      </section>

      {!inspectorVisible ? <button className="inspector-handle" aria-label="Open inspector" title="Open inspector" onClick={openInspector} onMouseEnter={() => { if (!settings.inspectorPinned && settings.inspectorHover) setInspectorPreview(true); }}><SidebarSimple size={18} /><span>Inspector</span></button> : null}
      {inspectorVisible ? <aside className={`inspector ${inspectorPinnedOpen ? "inspector--pinned" : "inspector--overlay"}`} onMouseLeave={closeInspectorOverlay}>
        <header className="inspector-shell-header"><strong>{inspectorContextTitle(selection)}</strong><div><button aria-label={settings.inspectorPinned ? "Unpin sidebar" : "Pin sidebar"} title={settings.inspectorPinned ? "Unpin sidebar" : "Pin sidebar"} onClick={toggleInspectorPin}>{settings.inspectorPinned ? <PushPinSlash size={16} /> : <PushPin size={16} />}</button><button aria-label="Collapse sidebar" title="Collapse sidebar" onClick={collapseInspector}><CaretDoubleRight size={16} /></button></div></header>
        <div className="inspector-body">{selection ? <SchemaInspector schema={schema} selection={selection} commit={history.commit} select={setSelection} createColumn={createColumn} createIndex={createIndex} /> : <ProjectOverview schema={schema} filename={filename} diagnostics={diagnostics} commit={history.commit} onAddTable={addTable} onAddRelation={createRelation} onAddEnum={createEnum} onExport={setPreview} onOpen={requestOpenJson} onImportSql={requestImportSql} onTemplates={showTemplatePicker} />}</div>
      </aside> : null}
    </div>

    <footer className={`diagnostics-panel ${validationOpen ? "diagnostics-panel--open" : ""}`}>
      <button className="diagnostics-header" onClick={() => setValidationOpen((open) => !open)}><div className="diagnostic-summary">{diagnosticErrors.length ? <WarningCircle size={19} weight="fill" /> : diagnosticWarnings.length ? <WarningCircle size={19} /> : <CheckCircle size={19} weight="fill" />}<strong>{diagnosticErrors.length ? "Schema has errors" : diagnosticWarnings.length ? "Schema valid with warnings" : "Schema valid"}</strong><span>{diagnosticErrors.length} errors</span><span>{diagnosticWarnings.length} warnings</span><span>{saveStatus}</span></div><div className="schema-stats">{statistics.tables} tables <i /> {statistics.columns} columns <i /> {statistics.relations} relations <i /> {statistics.indexes} indexes <i /> {statistics.enums} enums</div></button>
      {validationOpen ? diagnostics.length ? <div className="diagnostic-groups">{groupedDiagnostics.map(([group, issues]) => <section key={group}><h3>{group}<Badge tone={issues?.some((issue) => issue.severity === "error") ? "amber" : issues?.some((issue) => issue.severity === "warning") ? "neutral" : "blue"}>{issues?.length ?? 0}</Badge></h3>{issues?.map((issue) => <button key={`${issue.code}-${issue.path}`} onClick={() => { const next = selectionForDiagnostic(issue, schema); if (next) { setSelection(next); setPreview(null); } }}><Badge tone={issue.severity === "error" ? "amber" : issue.severity === "info" ? "blue" : "neutral"}>{issue.severity}</Badge><span><strong>{issue.message}</strong>{issue.help ? <small>{issue.help}</small> : null}<span className="diagnostic-meta"><code>{issue.code}</code><code>{issue.path}</code></span></span></button>)}</section>)}</div> : <div className="diagnostics-empty"><CheckCircle size={18} weight="fill" /><span><strong>No validation issues</strong><small>Your schema is structurally valid and ready to export.</small></span></div> : null}
    </footer>
    {preview ? <ExportModal tab={preview} content={previewContent} diagnostics={diagnostics} warnings={exportPreview.warnings} onTab={setPreview} onClose={() => setPreview(null)} onCopy={copyPreview} onDownload={download} /> : null}
    {settingsOpen && onSettingsChange ? <SettingsDialog settings={settings} onChange={onSettingsChange} onClearDraft={clearLocalDraft} onReset={() => { onResetSettings?.(); setNotice("Settings reset"); }} onClose={() => setSettingsOpen(false)} /> : null}
    {leaveOpen ? <LeaveDialog onSaveAndLeave={saveAndLeave} onLeave={returnToWelcome} onCancel={() => setLeaveOpen(false)} /> : null}
    {replaceOpen ? <ReplaceDialog onReplace={() => { const action = replaceAction.current; replaceAction.current = null; setReplaceOpen(false); action?.(); }} onCancel={() => { replaceAction.current = null; setReplaceOpen(false); }} /> : null}
    {importReport ? <ImportResultDialog {...importReport} onClose={() => setImportReport(null)} /> : null}
    {diffReport ? diffReport.result ? <DiffModal currentName={filename} selectedName={diffReport.selectedName} result={diffReport.result} onClose={() => setDiffReport(null)} canSelect={(change) => Boolean(selectionForDiff(change))} onSelect={selectDiffChange} onGenerateDraft={generateMigrationDraft} /> : <DiffModal currentName={filename} selectedName={diffReport.selectedName} error={diffReport.error ?? "Could not compare schemas."} onClose={() => setDiffReport(null)} canSelect={() => false} onSelect={() => undefined} /> : null}
    {migrationDraft ? <MigrationDraftModal currentName={filename} selectedName={migrationDraft.selectedName} result={migrationDraft.result} onClose={() => setMigrationDraft(null)} /> : null}
  </main>;
}

export function SchemaEditor(props: SchemaEditorProps) {
  return <ReactFlowProvider><SchemaEditorInner {...props} /></ReactFlowProvider>;
}
