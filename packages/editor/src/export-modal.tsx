import { Check, Copy, DownloadSimple, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { TitanDiagnostic } from "@titanbase/core";
import { Badge, Button } from "@titanbase/ui";
import type { ExportTarget } from "./export-utils";

interface ExportModalProps {
  tab: ExportTarget;
  content: string;
  diagnostics: TitanDiagnostic[];
  warnings: string[];
  onTab: (tab: ExportTarget) => void;
  onClose: () => void;
  onCopy: () => void | boolean | Promise<void | boolean>;
  onDownload: () => void;
}

const targetDetails = {
  json: { name: "Titan JSON", description: "Portable Titanbase schema file." },
  sql: { name: "PostgreSQL", description: "PostgreSQL DDL SQL." },
  mermaid: { name: "Mermaid", description: "ER diagram for Markdown and documentation." },
  prisma: { name: "Prisma", description: "Prisma ORM schema." },
  drizzle: { name: "Drizzle", description: "Drizzle ORM PostgreSQL schema." },
} as const;

const targets = Object.entries(targetDetails) as [ExportTarget, (typeof targetDetails)[ExportTarget]][];

export function ExportModal({ tab, content, diagnostics, warnings, onTab, onClose, onCopy, onDownload }: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const errors = diagnostics.filter((issue) => issue.severity === "error");
  const target = targetDetails[tab];

  useEffect(() => setCopied(false), [tab]);

  const copy = async () => {
    const copiedSuccessfully = await onCopy();
    if (copiedSuccessfully === false) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <header><div><span>Export schema</span><h2 id="export-title">Export schema</h2></div><button className="modal-close" aria-label="Close export" onClick={onClose}><X size={18} /></button></header>
      <div className="export-tabs" role="tablist">{targets.map(([id, details]) => <button key={id} className={tab === id ? "active" : ""} role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>{details.name}</button>)}</div>
      <div className="export-target"><div><strong>{target.name}</strong><small>{target.description}</small></div><Badge tone={errors.length ? "amber" : "green"}>{errors.length ? `${errors.length} errors` : "Valid"}</Badge>{warnings.length ? <Badge tone="amber">{warnings.length} warning{warnings.length === 1 ? "" : "s"}</Badge> : null}</div>
      {errors.length ? <div className="export-validation-warning"><WarningCircle size={16} weight="fill" /> Schema has validation issues. Export may be incomplete.</div> : null}
      <div className="export-actions"><Button onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy"}</Button><Button variant="primary" onClick={onDownload}><DownloadSimple size={16} /> Download</Button><Button variant="ghost" onClick={onClose}>Close</Button></div>
      {warnings.length ? <details className="export-warnings"><summary>Warnings ({warnings.length})</summary>{warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</details> : null}
      <pre className="export-code" tabIndex={0}><code>{content}</code></pre>
    </section>
  </div>;
}
