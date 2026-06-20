import { ArrowLeft, Columns, Database, Key, Link, ListBullets, Plus, Table as TableIcon, Trash } from "@phosphor-icons/react";
import type { RelationCardinality, ReferentialAction, TitanEnum, TitanIndex, TitanRelation, TitanSchema, TitanTable } from "@titanbase/core";
import { Badge, Button, Input, Select, Textarea } from "@titanbase/ui";
import type { ColumnPatch, EditorSelection, EnumPatch, IndexPatch, RelationPatch, SchemaMutation } from "./schema-state";

interface InspectorProps {
  schema: TitanSchema;
  selection: EditorSelection;
  commit: (mutation: SchemaMutation) => void;
  select: (selection: EditorSelection) => void;
  createColumn: (table: TitanTable) => void;
  createIndex: (table: TitanTable) => void;
}

const textOrUndefined = (value: string) => value.trim() ? value : undefined;

function InspectorHeading({ eyebrow, title, icon, onBack }: { eyebrow: string; title: string; icon: React.ReactNode; onBack?: () => void }) {
  return <div className="inspector-heading">
    <div className="inspector-title-wrap">{onBack ? <button className="back-button" onClick={onBack} aria-label="Back to table"><ArrowLeft size={17} /></button> : null}<div><span>{eyebrow}</span><h2>{title}</h2></div></div>
    {icon}
  </div>;
}

function TableInspector({ schema, table, commit, select, createColumn, createIndex }: { table: TitanTable } & Pick<InspectorProps, "schema" | "commit" | "select" | "createColumn" | "createIndex">) {
  return <div className="inspector-content">
    <InspectorHeading eyebrow="Table" title={table.name} icon={<TableIcon size={23} weight="duotone" />} />
    <label className="field-label">Name<Input value={table.name} onChange={(event) => commit({ type: "table.update", tableId: table.id, patch: { name: event.target.value } })} /></label>
    <label className="field-label">Description<Textarea rows={3} value={table.description ?? ""} onChange={(event) => commit({ type: "table.update", tableId: table.id, patch: { description: textOrUndefined(event.target.value) } })} /></label>

    <div className="section-heading"><div><span>Columns</span><small>{table.columns.length} fields</small></div><Button onClick={() => createColumn(table)}><Plus size={16} /> Add column</Button></div>
    <div className="object-list">
      {table.columns.length ? table.columns.map((column) => <button className="object-row" key={column.id} onClick={() => select({ kind: "column", tableId: table.id, columnId: column.id })}>
        <span className="object-row__icon">{column.primaryKey ? <Key size={15} weight="fill" /> : <Columns size={15} />}</span>
        <span><strong>{column.name}</strong><small>{column.type}</small></span>
        <span className="object-row__badges">{column.primaryKey ? <Badge tone="blue">PK</Badge> : null}{column.unique ? <Badge tone="green">UQ</Badge> : null}</span>
      </button>) : <div className="inline-empty">No columns yet.</div>}
    </div>

    <div className="section-heading"><div><span>Indexes</span><small>{table.indexes.length} defined</small></div><Button onClick={() => createIndex(table)}><Plus size={16} /> Add index</Button></div>
    <div className="object-list">
      {table.indexes.length ? table.indexes.map((index) => <button className="object-row" key={index.id} onClick={() => select({ kind: "index", tableId: table.id, indexId: index.id })}>
        <span className="object-row__icon"><ListBullets size={16} /></span>
        <span><strong>{index.name}</strong><small>{index.method ?? "btree"} · {index.columns.length} column{index.columns.length === 1 ? "" : "s"}</small></span>
        {index.unique ? <Badge tone="green">Unique</Badge> : null}
      </button>) : <div className="inline-empty">No indexes defined.</div>}
    </div>

    <div className="section-heading"><div><span>Schema objects</span><small>{schema.relations.length} relations · {schema.enums.length} enums</small></div></div>
    <div className="object-list">
      {schema.relations.filter((relation) => relation.from.table === table.id || relation.to.table === table.id).map((relation) => <button className="object-row" key={relation.id} onClick={() => select({ kind: "relation", relationId: relation.id })}><span className="object-row__icon"><Link size={16} /></span><span><strong>{relation.name}</strong><small>{relation.cardinality}</small></span></button>)}
      {schema.enums.map((enumDefinition) => <button className="object-row" key={enumDefinition.id} onClick={() => select({ kind: "enum", enumId: enumDefinition.id })}><span className="object-row__icon"><Database size={16} /></span><span><strong>{enumDefinition.name}</strong><small>{enumDefinition.values.length} values</small></span></button>)}
      {!schema.relations.some((relation) => relation.from.table === table.id || relation.to.table === table.id) && !schema.enums.length ? <div className="inline-empty">No related schema objects.</div> : null}
    </div>
  </div>;
}

function ColumnInspector({ schema, table, columnId, commit, select }: { schema: TitanSchema; table: TitanTable; columnId: string } & Pick<InspectorProps, "commit" | "select">) {
  const column = table.columns.find((item) => item.id === columnId);
  if (!column) return <EmptyInspector />;
  const update = (patch: ColumnPatch) => commit({ type: "column.update", tableId: table.id, columnId: column.id, patch });
  return <div className="inspector-content">
    <InspectorHeading eyebrow={`Column · ${table.name}`} title={column.name} icon={<Columns size={23} weight="duotone" />} onBack={() => select({ kind: "table", tableId: table.id })} />
    <label className="field-label">Name<Input value={column.name} onChange={(event) => update({ name: event.target.value })} /></label>
    <label className="field-label">Type<Input list="titan-column-types" value={column.type} onChange={(event) => update({ type: event.target.value })} /></label>
    <datalist id="titan-column-types">{["uuid", "text", "integer", "bigint", "boolean", "numeric", "date", "timestamp", "timestamptz", "jsonb", ...schema.enums.map((item) => item.name)].map((type) => <option value={type} key={type} />)}</datalist>
    <label className="field-label">Default<Input value={column.default ?? ""} placeholder="e.g. now()" onChange={(event) => update({ default: textOrUndefined(event.target.value) })} /></label>
    <label className="field-label">Description<Textarea rows={3} value={column.description ?? ""} onChange={(event) => update({ description: textOrUndefined(event.target.value) })} /></label>
    <div className="toggle-grid">
      <label><input type="checkbox" checked={column.nullable} onChange={(event) => update({ nullable: event.target.checked })} /><span><strong>Nullable</strong><small>Allow null values</small></span></label>
      <label><input type="checkbox" checked={column.primaryKey} onChange={(event) => update({ primaryKey: event.target.checked })} /><span><strong>Primary key</strong><small>Identify each row</small></span></label>
      <label><input type="checkbox" checked={column.unique} onChange={(event) => update({ unique: event.target.checked })} /><span><strong>Unique</strong><small>Reject duplicate values</small></span></label>
    </div>
  </div>;
}

const cardinalities: RelationCardinality[] = ["one-to-one", "one-to-many", "many-to-one", "many-to-many"];
const actions: Array<ReferentialAction | ""> = ["", "cascade", "restrict", "set-null", "set-default", "no-action"];

function RelationInspector({ schema, relation, commit, select }: { schema: TitanSchema; relation: TitanRelation } & Pick<InspectorProps, "commit" | "select">) {
  const update = (patch: RelationPatch) => commit({ type: "relation.update", relationId: relation.id, patch });
  const fromTable = schema.tables.find((table) => table.id === relation.from.table);
  const toTable = schema.tables.find((table) => table.id === relation.to.table);
  const changeTable = (side: "from" | "to", tableId: string) => {
    const table = schema.tables.find((item) => item.id === tableId);
    if (!table?.columns[0]) return;
    update({ [side]: { table: table.id, columns: [table.columns[0].id] } });
  };
  return <div className="inspector-content">
    <InspectorHeading eyebrow="Relation" title={relation.name} icon={<Link size={23} weight="duotone" />} />
    <label className="field-label">Name<Input value={relation.name} onChange={(event) => update({ name: event.target.value })} /></label>
    <div className="endpoint-grid">
      <fieldset><legend>Source</legend><Select aria-label="Source table" value={relation.from.table} onChange={(event) => changeTable("from", event.target.value)}>{schema.tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</Select><Select aria-label="Source column" value={relation.from.columns[0]} onChange={(event) => update({ from: { ...relation.from, columns: [event.target.value] } })}>{fromTable?.columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</Select></fieldset>
      <fieldset><legend>Target</legend><Select aria-label="Target table" value={relation.to.table} onChange={(event) => changeTable("to", event.target.value)}>{schema.tables.map((table) => <option value={table.id} key={table.id}>{table.name}</option>)}</Select><Select aria-label="Target column" value={relation.to.columns[0]} onChange={(event) => update({ to: { ...relation.to, columns: [event.target.value] } })}>{toTable?.columns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</Select></fieldset>
    </div>
    <label className="field-label">Cardinality<Select value={relation.cardinality} onChange={(event) => update({ cardinality: event.target.value as RelationCardinality })}>{cardinalities.map((value) => <option value={value} key={value}>{value}</option>)}</Select></label>
    <div className="form-grid"><label className="field-label">On delete<Select value={relation.onDelete ?? ""} onChange={(event) => update({ onDelete: (event.target.value || undefined) as ReferentialAction | undefined })}>{actions.map((value) => <option value={value} key={value || "none"}>{value || "not set"}</option>)}</Select></label><label className="field-label">On update<Select value={relation.onUpdate ?? ""} onChange={(event) => update({ onUpdate: (event.target.value || undefined) as ReferentialAction | undefined })}>{actions.map((value) => <option value={value} key={value || "none"}>{value || "not set"}</option>)}</Select></label></div>
    <label className="field-label">Description<Textarea rows={3} value={relation.description ?? ""} onChange={(event) => update({ description: textOrUndefined(event.target.value) })} /></label>
    <Button className="danger-button" onClick={() => { commit({ type: "relation.delete", relationId: relation.id }); select(null); }}><Trash size={17} /> Delete relation</Button>
  </div>;
}

const indexMethods = ["btree", "hash", "gin", "gist", "brin"];

function IndexInspector({ table, index, commit, select }: { table: TitanTable; index: TitanIndex } & Pick<InspectorProps, "commit" | "select">) {
  const update = (patch: IndexPatch) => commit({ type: "index.update", tableId: table.id, indexId: index.id, patch });
  const toggleColumn = (columnId: string, checked: boolean) => update({ columns: checked ? [...index.columns, columnId] : index.columns.filter((id) => id !== columnId) });
  return <div className="inspector-content">
    <InspectorHeading eyebrow={`Index · ${table.name}`} title={index.name} icon={<ListBullets size={23} weight="duotone" />} onBack={() => select({ kind: "table", tableId: table.id })} />
    <label className="field-label">Name<Input value={index.name} onChange={(event) => update({ name: event.target.value })} /></label>
    <label className="field-label">Method<Select value={index.method ?? "btree"} onChange={(event) => update({ method: event.target.value })}>{indexMethods.map((method) => <option value={method} key={method}>{method}</option>)}</Select></label>
    <fieldset className="check-list"><legend>Columns</legend>{table.columns.map((column) => <label key={column.id}><input type="checkbox" checked={index.columns.includes(column.id)} onChange={(event) => toggleColumn(column.id, event.target.checked)} /><span>{column.name}</span></label>)}</fieldset>
    <label className="toggle-single"><input type="checkbox" checked={index.unique} onChange={(event) => update({ unique: event.target.checked })} /><span>Unique index</span></label>
    <label className="field-label">Where clause<Input value={index.where ?? ""} placeholder="e.g. published_at IS NOT NULL" onChange={(event) => update({ where: textOrUndefined(event.target.value) })} /></label>
    <label className="field-label">Description<Textarea rows={3} value={index.description ?? ""} onChange={(event) => update({ description: textOrUndefined(event.target.value) })} /></label>
    <Button className="danger-button" onClick={() => { commit({ type: "index.delete", tableId: table.id, indexId: index.id }); select({ kind: "table", tableId: table.id }); }}><Trash size={17} /> Delete index</Button>
  </div>;
}

function EnumInspector({ enumDefinition, commit, select }: { enumDefinition: TitanEnum } & Pick<InspectorProps, "commit" | "select">) {
  const update = (patch: EnumPatch) => commit({ type: "enum.update", enumId: enumDefinition.id, patch });
  return <div className="inspector-content">
    <InspectorHeading eyebrow="Enum" title={enumDefinition.name} icon={<Database size={23} weight="duotone" />} />
    <label className="field-label">Name<Input value={enumDefinition.name} onChange={(event) => update({ name: event.target.value })} /></label>
    <label className="field-label">Description<Textarea rows={3} value={enumDefinition.description ?? ""} onChange={(event) => update({ description: textOrUndefined(event.target.value) })} /></label>
    <div className="section-heading section-heading--flush"><div><span>Values</span><small>{enumDefinition.values.length} defined</small></div><Button onClick={() => update({ values: [...enumDefinition.values, `value_${enumDefinition.values.length + 1}`] })}><Plus size={16} /> Add value</Button></div>
    <div className="enum-values">{enumDefinition.values.map((value, index) => <div key={`${index}-${value}`}><Input aria-label={`Enum value ${index + 1}`} value={value} onChange={(event) => update({ values: enumDefinition.values.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /><button aria-label={`Remove enum value ${value}`} onClick={() => update({ values: enumDefinition.values.filter((_, itemIndex) => itemIndex !== index) })}><Trash size={16} /></button></div>)}</div>
    <Button className="danger-button" onClick={() => { commit({ type: "enum.delete", enumId: enumDefinition.id }); select(null); }}><Trash size={17} /> Delete enum</Button>
  </div>;
}

export function EmptyInspector() {
  return <div className="empty-inspector"><TableIcon size={32} /><h2>Select an object</h2><p>Choose a table, column, relation, index, or enum to edit its schema properties.</p></div>;
}

export function SchemaInspector(props: InspectorProps) {
  const { schema, selection } = props;
  if (!selection) return <EmptyInspector />;
  if (selection.kind === "relation") {
    const relation = schema.relations.find((item) => item.id === selection.relationId);
    return relation ? <RelationInspector {...props} relation={relation} /> : <EmptyInspector />;
  }
  if (selection.kind === "enum") {
    const enumDefinition = schema.enums.find((item) => item.id === selection.enumId);
    return enumDefinition ? <EnumInspector {...props} enumDefinition={enumDefinition} /> : <EmptyInspector />;
  }
  const table = schema.tables.find((item) => item.id === selection.tableId);
  if (!table) return <EmptyInspector />;
  if (selection.kind === "column") return <ColumnInspector {...props} table={table} columnId={selection.columnId} />;
  if (selection.kind === "index") {
    const index = table.indexes.find((item) => item.id === selection.indexId);
    return index ? <IndexInspector {...props} table={table} index={index} /> : <TableInspector {...props} table={table} />;
  }
  return <TableInspector {...props} table={table} />;
}
