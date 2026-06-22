import { ArrowsLeftRight, CheckCircle, Copy, FileSql, WarningCircle, X } from "@phosphor-icons/react";
import type { DiffEntityType, SchemaDiffChange, SchemaDiffResult } from "@titanbase/core";
import { Badge, Button } from "@titanbase/ui";

type DiffModalProps = {
  currentName: string;
  selectedName: string;
  onClose: () => void;
  onSelect: (change: SchemaDiffChange) => void;
  canSelect: (change: SchemaDiffChange) => boolean;
  onGenerateDraft?: () => void;
} & ({ result: SchemaDiffResult; error?: never } | { result?: never; error: string });

const groupOrder = ["project", "table", "column", "relation", "index", "enum"] as const;
const groupLabels: Record<(typeof groupOrder)[number], string> = { project: "Project", table: "Tables", column: "Columns", relation: "Relations", index: "Indexes", enum: "Enums" };
const groupFor = (entityType: DiffEntityType) => entityType === "enum_value" ? "enum" : entityType;

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return JSON.stringify(value, null, 2);
}

export function DiffModal(props: DiffModalProps) {
  const failed = Boolean(props.error);
  const result = props.result;
  const groups = result ? groupOrder.map((group) => ({ group, changes: result.changes.filter((change) => groupFor(change.entityType) === group) })).filter((entry) => entry.changes.length) : [];
  const copy = async () => {
    const content = props.error ?? JSON.stringify(result, null, 2);
    await navigator.clipboard.writeText(content);
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <section className="diff-modal" role="dialog" aria-modal="true" aria-labelledby="diff-modal-title">
      <header><div><span>Schema Diff · Experimental</span><h2 id="diff-modal-title">{failed ? "Could not compare schemas" : "Compare schemas"}</h2></div><button className="modal-close" onClick={props.onClose} aria-label="Close schema diff"><X size={18} /></button></header>
      <div className="diff-sources"><span><small>Current schema</small><strong>{props.currentName}</strong></span><ArrowsLeftRight size={20} /><span><small>Selected schema</small><strong>{props.selectedName}</strong></span></div>

      {props.error ? <div className="diff-error"><WarningCircle size={20} weight="fill" /><span><strong>The selected file is not a valid TitanSchema.</strong><small>{props.error}</small></span></div> : null}

      {result ? <>
        <div className="diff-summary">
          <div><strong>{result.summary.added}</strong><span>Added</span></div><div><strong>{result.summary.removed}</strong><span>Removed</span></div><div><strong>{result.summary.changed}</strong><span>Changed</span></div><div><strong>{result.summary.renamed}</strong><span>Renamed</span></div><div className="diff-summary--danger"><strong>{result.summary.destructive}</strong><span>Destructive</span></div><div className="diff-summary--warning"><strong>{result.summary.breaking}</strong><span>Breaking</span></div>
        </div>
        {result.warnings.length ? <details className="diff-warnings"><summary>{result.warnings.length} matching warning{result.warnings.length === 1 ? "" : "s"}</summary>{result.warnings.map((warning) => <p key={`${warning.code}-${warning.path ?? ""}`}><code>{warning.code}</code>{warning.message}</p>)}</details> : null}
        <div className="diff-changes">
          {!result.changes.length ? <div className="diff-empty"><CheckCircle size={20} weight="fill" /><span><strong>No semantic changes</strong><small>Editor positions and other canvas-only metadata are ignored.</small></span></div> : groups.map(({ group, changes }) => <section key={group}><h3>{groupLabels[group]}<Badge tone="neutral">{changes.length}</Badge></h3>{changes.map((change) => {
            const selectable = props.canSelect(change);
            return <button key={change.id} className="diff-change" disabled={!selectable} onClick={() => props.onSelect(change)} title={selectable ? "Select this object in the current schema" : undefined}>
              <span className={`diff-severity diff-severity--${change.severity}`}>{change.severity}</span>
              <span className="diff-change__body"><span className="diff-change__title"><strong>{change.title}</strong><span><Badge tone="neutral">{change.kind}</Badge>{change.destructive ? <Badge tone="amber">Destructive</Badge> : null}{change.breaking ? <Badge tone="blue">Breaking</Badge> : null}</span></span>
                {(change.before !== undefined || change.after !== undefined) && change.kind !== "added" && change.kind !== "removed" ? <span className="diff-values"><code>{displayValue(change.before)}</code><b>→</b><code>{displayValue(change.after)}</code></span> : null}
                <small>{change.path}</small>
              </span>
            </button>;
          })}</section>)}
        </div>
      </> : null}
      <footer><Button onClick={copy}><Copy size={16} /> Copy {failed ? "error" : "diff JSON"}</Button>{result && props.onGenerateDraft ? <Button variant="primary" onClick={props.onGenerateDraft}><FileSql size={16} /> Generate migration draft</Button> : null}<Button onClick={props.onClose}>Close</Button></footer>
    </section>
  </div>;
}
