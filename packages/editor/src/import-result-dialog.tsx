import { CheckCircle, Copy, FileSql, WarningCircle, X } from "@phosphor-icons/react";
import type { ImportWarning } from "@titanbase/import-postgres";
import { Badge, Button } from "@titanbase/ui";

interface ImportResultDialogProps {
  sourceName: string;
  warnings: ImportWarning[];
  errors: ImportWarning[];
  onClose: () => void;
}

const details = (items: ImportWarning[]) => items.map((item) => [item.code, item.line ? `line ${item.line}` : "", item.message, item.statement].filter(Boolean).join(" · ")).join("\n");

export function ImportResultDialog({ sourceName, warnings, errors, onClose }: ImportResultDialogProps) {
  const failed = errors.length > 0;
  const items = failed ? errors : warnings;
  const copyDetails = async () => navigator.clipboard.writeText(details(items));

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="import-result-modal" role="dialog" aria-modal="true" aria-labelledby="import-result-title">
      <header>
        <div><span>PostgreSQL import</span><h2 id="import-result-title">{failed ? "Could not import SQL" : "SQL import complete"}</h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Close import result"><X size={18} /></button>
      </header>
      <div className={`import-result-summary ${failed ? "import-result-summary--error" : ""}`}>
        {failed ? <WarningCircle size={21} weight="fill" /> : <CheckCircle size={21} weight="fill" />}
        <span><strong>{failed ? "Your current schema was not replaced" : "The imported schema is ready to edit"}</strong><small><FileSql size={13} /> {sourceName}</small></span>
      </div>
      <p>{failed ? "Titanbase could not safely parse this file. Review the details below and fix the SQL before trying again." : `${warnings.length} unsupported or partially imported item${warnings.length === 1 ? "" : "s"}. Everything else was imported locally in your browser.`}</p>
      <div className="import-result-list">
        {items.map((item, index) => <article key={`${item.code}-${item.line ?? 0}-${index}`}>
          <Badge tone={failed ? "amber" : item.severity === "info" ? "blue" : "neutral"}>{failed ? "error" : item.severity ?? "warning"}</Badge>
          <span><strong>{item.message}</strong><small><code>{item.code}</code>{item.line ? `Line ${item.line}` : null}</small>{item.statement ? <pre>{item.statement}</pre> : null}</span>
        </article>)}
      </div>
      <footer>{items.length ? <Button onClick={copyDetails}><Copy size={16} /> Copy details</Button> : null}<Button variant="primary" onClick={onClose}>{failed ? "Close" : "Continue editing"}</Button></footer>
    </section>
  </div>;
}
