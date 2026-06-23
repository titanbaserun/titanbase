import { CheckCircle, Copy, DownloadSimple, FileSql, WarningCircle, X } from "@phosphor-icons/react";
import type { MigrationDraftResult } from "@titanbase/export-postgres";
import { Badge, Button } from "@titanbase/ui";

interface MigrationDraftModalProps {
  currentName: string;
  selectedName: string;
  result: MigrationDraftResult;
  onClose: () => void;
  onDownload?: (result: MigrationDraftResult) => void;
}

async function copyText(content: string) {
  try { await navigator.clipboard.writeText(content); }
  catch {
    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export function MigrationDraftModal({ currentName, selectedName, result, onClose, onDownload }: MigrationDraftModalProps) {
  const download = () => {
    if (onDownload) return onDownload(result);
    const url = URL.createObjectURL(new Blob([result.sql], { type: "text/sql;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="migration-draft-modal" role="dialog" aria-modal="true" aria-labelledby="migration-draft-title">
      <header><div><span>Migration Preview · Draft only</span><h2 id="migration-draft-title">PostgreSQL migration draft</h2></div><button className="modal-close" onClick={onClose} aria-label="Close migration draft"><X size={18} /></button></header>
      <div className="migration-draft-source"><FileSql size={19} /><span><strong>{currentName} → {selectedName}</strong><small>{result.filename}</small></span></div>
      <div className="migration-draft-notice"><WarningCircle size={19} weight="fill" /><span><strong>Review before running</strong><small>This SQL is a local draft, not a production-safe migration. Titanbase never executes it.</small></span></div>

      {result.warnings.length ? <details className="migration-draft-warnings" open><summary><WarningCircle size={15} /> {result.warnings.length} review item{result.warnings.length === 1 ? "" : "s"}</summary><div>{result.warnings.map((warning, index) => <article key={`${warning.code}-${warning.path ?? ""}-${index}`}><Badge tone={warning.severity === "danger" ? "amber" : warning.severity === "info" ? "blue" : "neutral"}>{warning.severity}</Badge><span><strong>{warning.message}</strong><small><code>{warning.code}</code>{warning.path ? <code>{warning.path}</code> : null}</small></span></article>)}</div></details> : <div className="migration-draft-clean"><CheckCircle size={17} weight="fill" /> No generator warnings. Review the SQL and your data assumptions before use.</div>}

      <div className="migration-draft-actions"><span>{result.statements.length} generated statement{result.statements.length === 1 ? "" : "s"}</span><Button onClick={() => copyText(result.sql)}><Copy size={16} /> Copy SQL</Button><Button variant="primary" onClick={download}><DownloadSimple size={16} /> Download draft</Button></div>
      <pre className="migration-draft-code"><code>{result.sql}</code></pre>
    </section>
  </div>;
}
