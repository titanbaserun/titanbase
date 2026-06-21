import { ArrowLeft, ArrowRight, BookOpen, Database, FilePlus, FileSql, FolderOpen, Layout, Table } from "@phosphor-icons/react";
import { useState } from "react";
import type { SchemaTemplate } from "./template-types";

interface WelcomeScreenProps {
  templates: SchemaTemplate[];
  initialShowTemplates?: boolean;
  onBlank: () => void;
  onOpen: () => void;
  onImportSql: () => void;
  onTemplate: (template: SchemaTemplate) => void;
}

function SchemaPreview() {
  return <div className="welcome-preview" aria-label="Example relational schema preview">
    <div className="preview-table preview-table--customers"><header><Table size={15} /><strong>customers</strong></header><span><b>PK</b> id <em>uuid</em></span><span>email <em>text</em></span></div>
    <span className="preview-relation preview-relation--customers" aria-hidden="true" />
    <div className="preview-table preview-table--orders"><header><Table size={15} /><strong>orders</strong></header><span><b>PK</b> id <em>uuid</em></span><span><b>FK</b> customer_id <em>uuid</em></span><span>total <em>numeric</em></span></div>
    <span className="preview-relation preview-relation--items" aria-hidden="true" />
    <div className="preview-table preview-table--items"><header><Table size={15} /><strong>order_items</strong></header><span><b>FK</b> order_id <em>uuid</em></span><span>quantity <em>integer</em></span></div>
    <small>Portable schema · PostgreSQL</small>
  </div>;
}

export function WelcomeScreen({ templates, initialShowTemplates = false, onBlank, onOpen, onImportSql, onTemplate }: WelcomeScreenProps) {
  const [showTemplates, setShowTemplates] = useState(initialShowTemplates);

  return <main className="welcome-screen">
    <header className="welcome-header"><div className="welcome-logo"><img className="theme-logo theme-logo--light" src="/Titan.svg" alt="Titanbase" /><img className="theme-logo theme-logo--dark" src="/titanbase_light.svg" alt="Titanbase" /></div><span>Visual schema designer</span><div className="welcome-header-actions"><a className="docs-link" href="https://www.titanbase.run" target="_blank" rel="noreferrer" title="Titanbase"><img className="brand-mark-icon" src="/titanbase-mark.svg" alt="" /> <span>Website</span></a><a className="docs-link" href="https://docs.titanbase.run" target="_blank" rel="noreferrer"><BookOpen size={17} /> <span>Docs</span></a><a className="docs-link github-docs-link" href="https://github.com/titanbaserun/titanbase" target="_blank" rel="noreferrer" aria-label="Titanbase on GitHub" title="Titanbase on GitHub"><img src="/github.svg" alt="" /> <span>GitHub</span></a></div></header>
    <section className={`welcome-content ${showTemplates ? "welcome-content--templates" : ""}`}>
      {showTemplates ? <>
        <div className="template-heading">
          <button className="template-back" type="button" onClick={() => setShowTemplates(false)}><ArrowLeft size={15} /> Back</button>
          <div className="welcome-kicker"><Database size={17} weight="duotone" /> Schema templates</div>
          <h1>Choose a starting schema</h1>
          <p>Start from a practical relational model, then customize it visually.</p>
        </div>
        <div className="template-gallery">{templates.map((template) => {
          const columns = template.schema.tables.reduce((total, table) => total + table.columns.length, 0);
          return <button key={template.id} onClick={() => onTemplate(template)}>
            <span className="template-icon"><Layout size={20} weight="duotone" /></span>
            <strong>{template.name}</strong>
            <small>{template.description}</small>
            <em>{template.schema.tables.length} tables · {template.schema.relations.length} relations · {columns} columns</em>
          </button>;
        })}</div>
      </> : <>
        <div className="welcome-hero">
          <div className="welcome-copy">
            <div className="welcome-kicker"><Database size={17} weight="duotone" /> Local-first · Open-source · Portable .titan.json</div>
            <h1>Design your database schema visually</h1>
            <p>Create a portable .titan.json schema, edit it locally, and export developer-ready SQL.</p>
          </div>
          <SchemaPreview />
        </div>
        <div className="welcome-choices">
          <button className="welcome-choice welcome-choice--recommended" onClick={onBlank}>
            <span className="welcome-choice-icon"><FilePlus size={22} weight="duotone" /></span>
            <i className="welcome-choice-badge">Recommended</i>
            <strong>Blank schema</strong>
            <small>Start from an empty relational schema.</small>
            <span className="welcome-choice-cta">Create schema <ArrowRight size={13} weight="bold" /></span>
          </button>
          <button className="welcome-choice" onClick={() => setShowTemplates(true)}>
            <span className="welcome-choice-icon"><Layout size={22} weight="duotone" /></span>
            <strong>Use template</strong>
            <small>Start from Blog, SaaS, Ecommerce, CRM, Analytics, and more.</small>
            <span className="welcome-choice-cta">Browse templates <ArrowRight size={13} weight="bold" /></span>
          </button>
          <button className="welcome-choice" onClick={onOpen}>
            <span className="welcome-choice-icon"><FolderOpen size={22} weight="duotone" /></span>
            <strong>Open .titan.json</strong>
            <small>Continue from an existing Titanbase schema file.</small>
            <span className="welcome-choice-cta">Open file <ArrowRight size={13} weight="bold" /></span>
          </button>
          <button className="welcome-choice" onClick={onImportSql}>
            <span className="welcome-choice-icon"><FileSql size={22} weight="duotone" /></span>
            <strong>Import .sql</strong>
            <small>Convert a local PostgreSQL schema file into an editable Titanbase project.</small>
            <span className="welcome-choice-cta">Import SQL <ArrowRight size={13} weight="bold" /></span>
          </button>
        </div>
      </>}
    </section>
    <footer className="welcome-footer">Open-source core · No account required · Your schema stays on this device</footer>
  </main>;
}
