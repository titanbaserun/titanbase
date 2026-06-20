import { BracketsCurly, CheckCircle, Database, FolderOpen, Link, Plus, Table, WarningCircle } from "@phosphor-icons/react";
import type { TitanDiagnostic, TitanDialect, TitanSchema } from "@titanbase/core";
import { Button, Input, Select, Textarea } from "@titanbase/ui";
import { getSchemaStatistics } from "./schema-visuals";
import type { SchemaMutation } from "./schema-state";

interface ProjectOverviewProps {
  schema: TitanSchema;
  filename: string;
  diagnostics: TitanDiagnostic[];
  commit: (mutation: SchemaMutation) => void;
  onAddTable: () => void;
  onAddRelation: () => void;
  onAddEnum: () => void;
  onExport: (tab: "json" | "sql") => void;
  onOpen: () => void;
  onTemplates: () => void;
}

const dialects: TitanDialect[] = ["postgres", "mysql", "sqlite", "generic"];
const optionalText = (value: string) => value.trim() ? value : undefined;

export function ProjectOverview(props: ProjectOverviewProps) {
  const { schema, filename, diagnostics, commit } = props;
  const stats = getSchemaStatistics(schema);
  const errors = diagnostics.filter((issue) => issue.severity === "error");
  const isBlank = stats.tables === 0;
  return <div className={`inspector-content project-overview ${isBlank ? "project-overview--new" : ""}`}>
    <div className="inspector-heading"><div><span>Project overview</span><h2>{schema.project.name}</h2></div><Database size={24} weight="duotone" /></div>
    <div className={`project-health ${errors.length ? "project-health--error" : ""}`}>{errors.length ? <WarningCircle size={18} weight="fill" /> : <CheckCircle size={18} weight="fill" />}<span><strong>{errors.length ? `${errors.length} validation error${errors.length === 1 ? "" : "s"}` : "Schema is valid"}</strong><small>{filename}</small></span></div>

    <div className="project-stats">
      <div><strong>{stats.tables}</strong><span>Tables</span></div><div><strong>{stats.columns}</strong><span>Columns</span></div><div><strong>{stats.relations}</strong><span>Relations</span></div><div><strong>{stats.indexes}</strong><span>Indexes</span></div><div><strong>{stats.enums}</strong><span>Enums</span></div>
    </div>

    <div className="overview-section"><h3>Project settings</h3>
      <label className="field-label">Project name<Input value={schema.project.name} onChange={(event) => commit({ type: "project.update", patch: { name: event.target.value } })} /></label>
      <label className="field-label">Dialect<Select value={schema.dialect} onChange={(event) => commit({ type: "dialect.update", dialect: event.target.value as TitanDialect })}>{dialects.map((dialect) => <option value={dialect} key={dialect}>{dialect === "postgres" ? "PostgreSQL" : dialect[0]!.toUpperCase() + dialect.slice(1)}</option>)}</Select></label>
      <label className="field-label">Description<Textarea rows={3} placeholder="No description yet" value={schema.project.description ?? ""} onChange={(event) => commit({ type: "project.update", patch: { description: optionalText(event.target.value) } })} /></label>
    </div>

    <div className="overview-section"><h3>Quick actions</h3><div className="overview-actions">
      <Button variant="primary" onClick={props.onAddTable}><Plus size={16} /> Add table</Button>
      <Button onClick={props.onAddRelation}><Link size={16} /> Add relation</Button>
      <Button onClick={props.onAddEnum}><Database size={16} /> Add enum</Button>
      <Button onClick={() => props.onExport("json")}><BracketsCurly size={16} /> Export schema</Button>
      <Button onClick={props.onOpen}><FolderOpen size={16} /> Open JSON</Button>
      <Button onClick={props.onTemplates}><Table size={16} /> Use template</Button>
    </div></div>
  </div>;
}
