"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useReactFlow, ReactFlowProvider, SelectionMode, type Edge, type Node } from "@xyflow/react";
import { ArrowArcLeft, ArrowArcRight, BracketsCurly, CheckCircle, Copy, Database, DownloadSimple, FloppyDisk, FolderOpen, Link, MagnifyingGlass, Moon, Plus, Sun, Table as TableIcon, TreeStructure, WarningCircle } from "@phosphor-icons/react";
import { diagnoseSchema, normalizeSchema, type TitanDiagnostic, type TitanEnum, type TitanIndex, type TitanRelation, type TitanSchema, type TitanTable } from "@titanbase/core";
import { exportPostgres } from "@titanbase/export-postgres";
import { Badge, Button, Input, Textarea } from "@titanbase/ui";
import { SchemaInspector } from "./inspectors";
import { applySchemaMutation, selectionForDiagnostic, useSchemaHistory, type EditorSelection, type MultiSelection } from "./schema-state";
import { TableNodeView, type TableNode } from "./table-node";

const nodeTypes = { tableNode: TableNodeView };
const STORAGE_KEY = "titanbase:schema";
const THEME_KEY = "titanbase:theme";

const nextId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;

const emptyMultiSelection: MultiSelection = { tableIds: new Set(), relationIds: new Set() };

function diagnosticGroup(issue: TitanDiagnostic, schema: TitanSchema) {
  const parts = issue.path.split(".");
  const index = Number(parts[1]);
  if (parts[0] === "tables") return schema.tables[index]?.name ?? "Tables";
  if (parts[0] === "relations") return schema.relations[index]?.name ?? "Relations";
  if (parts[0] === "enums") return schema.enums[index]?.name ?? "Enums";
  if (parts[0] === "metadata") return "Editor metadata";
  return "Schema";
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

// ---------------------------------------------------------------------------
// SchemaEditorProps — public API for embedding the editor.
//
// For local use: pass `initialSchema` only (localStorage save/load built-in).
// For cloud use: pass `onSave` to intercept saves, `onSchemaChange` for
// real-time sync. The editor remains the single source of truth for the
// current schema state; cloud layers should not mutate it externally.
// ---------------------------------------------------------------------------

export interface SchemaEditorProps {
  /** Initial schema to load into the editor. */
  initialSchema: TitanSchema;
  /** Called when user triggers save (Ctrl+S or Save button). If provided, replaces localStorage save. */
  onSave?: (schema: TitanSchema) => void | Promise<void>;
  /** Called on every schema change (debounce externally if needed). */
  onSchemaChange?: (schema: TitanSchema) => void;
  /** If true, hides the local save/load buttons (for cloud-managed mode). */
  cloudMode?: boolean;
}

function SchemaEditorInner({ initialSchema, onSave, onSchemaChange, cloudMode }: SchemaEditorProps) {
  const history = useSchemaHistory(normalizeSchema(initialSchema));
  const { schema } = history;
  const [selection, setSelection] = useState<EditorSelection>(() => schema.tables[1] ? { kind: "table", tableId: schema.tables[1].id } : schema.tables[0] ? { kind: "table", tableId: schema.tables[0].id } : null);
  const [multiSelection, setMultiSelection] = useState<MultiSelection>(emptyMultiSelection);
  const [preview, setPreview] = useState<"json" | "sql" | null>(null);
  const [notice, setNotice] = useState("Example loaded");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(THEME_KEY) === "dark";
  });
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const dragStart = useRef<TitanSchema | null>(null);
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const reactFlow = useReactFlow();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  // Notify parent of schema changes (for cloud sync)
  useEffect(() => {
    onSchemaChange?.(schema);
  }, [schema, onSchemaChange]);

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
        if (searchOpen) { setSearchOpen(false); setSearchQuery(""); }
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
        if (onSave) {
          onSave(schemaRef.current);
          setNotice("Saved");
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(schemaRef.current));
          setNotice("Saved locally");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [history, selection, multiSelection, searchOpen]);

  const diagnostics = useMemo(() => diagnoseSchema(schema), [schema]);
  const sqlResult = useMemo(() => exportPostgres(schema), [schema]);
  const previewContent = preview === "sql" ? sqlResult.sql : JSON.stringify(schema, null, 2);
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
    position: schema.metadata.editor.tablePositions[table.id] ?? { x: 80 + index * 320, y: 100 + index * 90 },
    data: { table, onSelectColumn: selectColumn, ...(selectedTableId === table.id && selectedColumnId ? { selectedColumnId } : {}) },
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
      label: relation.name.replaceAll("_", " "),
      type: "smoothstep",
      animated: isHovered,
      selected: isSelected,
      style: { stroke: isSelected || isHovered ? "#078b37" : "#0bad45", strokeWidth: isSelected ? 2.75 : isHovered ? 2.25 : 1.75 },
      labelStyle: { fill: "#56615b", fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: darkMode ? "#1a2b1f" : "#f8faf8", fillOpacity: 0.94 },
    };
  }), [schema.relations, selectedRelationId, multiSelection.relationIds, hoveredEdgeId, darkMode]);

  const addTable = () => {
    const id = nextId("table");
    const count = schema.tables.length + 1;
    const table: TitanTable = { id, name: `table_${count}`, description: "New schema table.", columns: [{ id: `${id}.id`, name: "id", type: "uuid", nullable: false, primaryKey: true, unique: true, default: "gen_random_uuid()" }], indexes: [] };
    history.commit({ type: "table.add", table, position: { x: 140 + count * 38, y: 110 + count * 32 } });
    setSelection({ kind: "table", tableId: id });
    setNotice(`${table.name} added`);
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

  const saveLocal = () => {
    if (onSave) {
      onSave(schema);
      setNotice("Saved");
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
      setNotice("Saved locally");
    }
  };

  const loadLocal = () => {
    if (cloudMode) return;
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return setNotice("No local save found");
    try {
      const loaded = normalizeSchema(JSON.parse(value));
      history.reset(loaded);
      setSelection(loaded.tables[0] ? { kind: "table", tableId: loaded.tables[0].id } : null);
      setNotice("Local schema loaded");
    } catch { setNotice("Local save is invalid"); }
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const loaded = normalizeSchema(JSON.parse(await file.text()));
      history.reset(loaded);
      setSelection(loaded.tables[0] ? { kind: "table", tableId: loaded.tables[0].id } : null);
      setNotice(`${file.name} loaded`);
    } catch { setNotice("Could not load schema"); }
    event.target.value = "";
  };

  const copyPreview = async () => {
    await navigator.clipboard.writeText(previewContent);
    setNotice(`${preview === "sql" ? "SQL" : "JSON"} copied`);
  };

  const download = () => {
    const isSql = preview === "sql";
    const blob = new Blob([previewContent], { type: isSql ? "text/sql" : "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${schema.project.id}.${isSql ? "sql" : "titan.json"}`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
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

  const onNodeDrag = (_: unknown, node: Node) => {
    const next = applySchemaMutation(schemaRef.current, { type: "position.update", tableId: node.id, position: node.position });
    schemaRef.current = next;
    history.replace(next);
  };

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

  return <main className={`editor-shell ${darkMode ? "dark" : ""}`} data-theme={darkMode ? "dark" : "light"}>
    <header className="editor-toolbar">
      <div className="brand-lockup"><img src="/Titan.svg" alt="Titanbase" /></div>
      <div className="file-status"><BracketsCurly size={17} /><strong>{schema.project.id}.titan.json</strong><span className="status-dot" />{notice}</div>
      <div className="toolbar-actions">
        <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo} title="Undo (Ctrl+Z)"><ArrowArcLeft size={18} /><span className="action-label">Undo</span></Button>
        <Button variant="ghost" disabled={!history.canRedo} onClick={history.redo} title="Redo (Ctrl+Shift+Z)"><ArrowArcRight size={18} /><span className="action-label">Redo</span></Button>
        <Button variant="ghost" onClick={saveLocal} title="Save locally (Ctrl+S)"><FloppyDisk size={18} /><span className="action-label">Save</span></Button>
        {!cloudMode && <Button variant="ghost" onClick={loadLocal} title="Load local save"><FolderOpen size={18} /><span className="action-label">Load</span></Button>}
        <Button variant="ghost" onClick={() => { setSearchOpen(!searchOpen); if (!searchOpen) setTimeout(() => searchInput.current?.focus(), 50); }} title="Search (Ctrl+F)"><MagnifyingGlass size={18} /></Button>
        <Button variant="ghost" onClick={runAutoLayout} title="Auto-layout tables"><TreeStructure size={18} /></Button>
        <Button variant="ghost" onClick={() => setDarkMode(!darkMode)} title="Toggle dark mode">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</Button>
        <Button variant="primary" onClick={addTable}><Plus size={18} /> Table</Button>
        <Button onClick={createRelation}><Link size={18} /> Relation</Button>
        <Button onClick={createEnum}><Database size={18} /> Enum</Button>
        <Button onClick={() => setPreview("json")}><BracketsCurly size={18} /> Export</Button>
      </div>
      <input ref={fileInput} className="sr-only" type="file" accept=".json,.titan.json" onChange={importJson} />
    </header>

    {searchOpen && <div className="search-bar">
      <MagnifyingGlass size={16} />
      <Input ref={searchInput} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter tables and columns..." aria-label="Search tables" />
      <Button variant="ghost" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>Esc</Button>
      {filteredTableIds !== null && <span className="search-count">{filteredTableIds.size} of {schema.tables.length} tables</span>}
    </div>}

    <div className="editor-workspace">
      <section className="canvas" aria-label="Schema canvas">
        <ReactFlow<TableNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)} onEdgeMouseLeave={() => setHoveredEdgeId(null)} onPaneClick={() => { setSelection(null); setMultiSelection(emptyMultiSelection); setPreview(null); }} onNodeDragStart={() => { dragStart.current = schemaRef.current; }} onNodeDrag={onNodeDrag} onNodeDragStop={() => { if (dragStart.current) history.commitFrom(dragStart.current, schemaRef.current); dragStart.current = null; }} fitView minZoom={0.35} maxZoom={1.8} selectionOnDrag panOnDrag={[1]} selectionMode={SelectionMode.Partial}>
          <Background variant={BackgroundVariant.Dots} color={darkMode ? "#2d3d32" : "#cfd8d1"} gap={22} size={1.2} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(node) => node.id === selectedTableId || multiSelection.tableIds.has(node.id) ? "#0bad45" : darkMode ? "#3a4d3f" : "#b9c4bc"} maskColor={darkMode ? "rgba(20,30,22,.78)" : "rgba(248,250,248,.78)"} />
        </ReactFlow>
        <Button className="canvas-import" onClick={() => fileInput.current?.click()}><FolderOpen size={17} /> Open JSON</Button>
        {hoveredRelation && <div className="relation-tooltip">
          <strong>{hoveredRelation.name}</strong>
          <span>{hoveredRelation.from} → {hoveredRelation.to}</span>
          <small>{hoveredRelation.cardinality}</small>
        </div>}
        {multiSelection.tableIds.size + multiSelection.relationIds.size > 0 && <div className="multi-select-badge">{multiSelection.tableIds.size + multiSelection.relationIds.size} selected — press Delete to remove</div>}
        {!schema.tables.length ? <div className="canvas-empty"><TableIcon size={34} weight="duotone" /><h2>Start with a table</h2><p>Add your first table or open a `.titan.json` schema.</p><Button variant="primary" onClick={addTable}><Plus size={17} /> Add table</Button></div> : null}
      </section>

      <aside className="inspector">
        {preview ? <div className="preview-panel">
          <div className="inspector-heading"><div><span>Export preview</span><h2>{preview === "sql" ? "PostgreSQL SQL" : "Titan JSON"}</h2></div><Button variant="ghost" onClick={() => setPreview(null)}>Close</Button></div>
          <div className="preview-tabs"><button className={preview === "json" ? "active" : ""} onClick={() => setPreview("json")}>Titan JSON</button><button className={preview === "sql" ? "active" : ""} onClick={() => setPreview("sql")}>PostgreSQL SQL</button></div>
          {diagnostics.some((d) => d.severity === "error") && <div className="export-validation-warning"><WarningCircle size={16} weight="fill" /> Schema has {diagnostics.filter((d) => d.severity === "error").length} validation error{diagnostics.filter((d) => d.severity === "error").length === 1 ? "" : "s"}. Output may be incomplete.</div>}
          <Textarea readOnly spellCheck={false} value={previewContent} className="code-preview" />
          {preview === "sql" && sqlResult.warnings.length ? <div className="export-warnings">{sqlResult.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
          <div className="preview-actions"><Button onClick={copyPreview}><Copy size={18} /> Copy</Button><Button variant="primary" onClick={download}><DownloadSimple size={18} /> Download</Button></div>
        </div> : <SchemaInspector schema={schema} selection={selection} commit={history.commit} select={(next) => { setSelection(next); setPreview(null); }} createColumn={createColumn} createIndex={createIndex} />}
      </aside>
    </div>

    <footer className="diagnostics-panel">
      <div className="diagnostics-header"><div className="diagnostic-summary">{diagnostics.some((issue) => issue.severity === "error") ? <WarningCircle size={21} weight="fill" /> : <CheckCircle size={21} weight="fill" />}<strong>{diagnostics.length ? `${diagnostics.length} validation issue${diagnostics.length === 1 ? "" : "s"}` : "Schema valid"}</strong><span>{diagnostics.length ? "Review issues by schema object" : "No validation issues found"}</span></div><div className="schema-stats">{schema.tables.length} tables <i /> {schema.tables.reduce((sum, table) => sum + table.columns.length, 0)} columns <i /> {schema.relations.length} relations <i /> {schema.enums.length} enums</div></div>
      {diagnostics.length ? <div className="diagnostic-groups">{groupedDiagnostics.map(([group, issues]) => <section key={group}><h3>{group}<Badge tone={issues?.some((issue) => issue.severity === "error") ? "amber" : "neutral"}>{issues?.length ?? 0}</Badge></h3>{issues?.map((issue) => <button key={`${issue.code}-${issue.path}`} onClick={() => { const next = selectionForDiagnostic(issue.path, schema); if (next) { setSelection(next); setPreview(null); } }}><Badge tone={issue.severity === "error" ? "amber" : "neutral"}>{issue.severity}</Badge><span><strong>{issue.message}</strong><code>{issue.path}</code></span></button>)}</section>)}</div> : <div className="validation-empty"><CheckCircle size={18} /> Everything is structurally valid. Keep designing.</div>}
    </footer>
  </main>;
}

export function SchemaEditor(props: SchemaEditorProps) {
  return <ReactFlowProvider><SchemaEditorInner {...props} /></ReactFlowProvider>;
}
