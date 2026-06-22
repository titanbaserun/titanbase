# Titanbase

Open-source visual schema designer for relational databases.  
Design schemas locally, save them as `.titan.json`, export to SQL and developer tools.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/editor`.

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm typecheck    # TypeScript checks
pnpm test         # Run all tests
```

## Diagnostics

Titanbase validates schemas locally before export. Errors identify broken or unsafe schema structure that should be fixed. Warnings highlight portability, indexing, naming, and default-value risks. Info messages describe limitations that may require adjustments in ORM exporters. Diagnostics include stable codes and entity references so the editor can open the related table, column, relation, index, or enum.

Exporter warnings remain target-specific: core diagnostics explain general schema risks, while each exporter reports features it cannot represent exactly.

## PostgreSQL SQL import

Titanbase can import a local PostgreSQL `.sql` schema file directly in the browser. The MVP supports enums, tables, primary and unique constraints, inline and table-level foreign keys, indexes, comments, defaults, quoted identifiers, and basic namespaces. Unsupported statements are skipped with line-aware import warnings instead of blocking the supported schema.

SQL import is a local file conversion workflow. Titanbase does not connect to a live database, request credentials, execute migrations, or upload the selected file.

## Schema Diff and Migration Drafts — Experimental

Use **Compare** in the editor toolbar to compare the current schema with another local `.titan.json` file. Titanbase normalizes both schemas, ignores editor positions, and reports deterministic project, table, column, relation, index, enum, and enum-value changes. Potentially destructive or breaking changes are labeled explicitly.

From a diff result, **Generate migration draft** creates deterministic PostgreSQL SQL for supported changes, including tables, columns, foreign keys, indexes, enum additions, renames, and comments. Destructive operations are clearly marked, while unsafe enum removals are left as warnings without generated SQL.

Migration drafts are review artifacts, not production-safe migrations. Titanbase never executes them, modifies either compared file, connects to a database, or uploads schema data.

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| `@titanbase/core` | Schema types, Zod validation, diagnostics, structural diff | Workspace package |
| `@titanbase/editor` | React visual editor component | Workspace package |
| `@titanbase/export-postgres` | PostgreSQL DDL and migration-draft generator | Workspace package |
| `@titanbase/export-mermaid` | Mermaid ER diagram generator | Workspace package |
| `@titanbase/export-prisma` | Prisma schema generator | Workspace package |
| `@titanbase/export-drizzle` | Drizzle PostgreSQL schema generator | Workspace package |
| `@titanbase/import-postgres` | PostgreSQL DDL to normalized `TitanSchema` importer | Workspace package |
| `@titanbase/ui` | Shared UI primitives | Workspace package |

`apps/web` is the local editor host app (Next.js, not published to npm).

## Embedding

```tsx
import { SchemaEditor } from "@titanbase/editor";

<SchemaEditor
  initialSchema={schema}
  onSchemaChange={setSchema}
/>
```

## Open-core boundary

**Free / open-source** — a fully functional local tool:

- Create and edit schemas visually
- Tables, columns, relations, indexes, enums
- Save/load `.titan.json` files
- Import local PostgreSQL `.sql` schema files
- Compare two `.titan.json` schemas locally
- Generate and download local PostgreSQL migration drafts
- Export Titan JSON
- Export PostgreSQL SQL
- Export Mermaid ER diagrams
- Export Prisma schemas
- Export Drizzle PostgreSQL schemas
- Review export warnings for unsupported or ambiguous schema features
- Validate schema with diagnostics
- Undo/redo, keyboard shortcuts, dark mode
- CLI (planned)
- Export to DBML (planned)
- Store in Git

**Possible future / Titanbase Cloud (not implemented)** — potential team and enterprise value:

- Cloud projects & team workspaces
- Realtime collaboration
- Comments & schema review workflow
- Version history & diff
- AI schema review & docs generation
- Live database import & drift detection
- Saved database connections
- GitHub PR integration
- Migration workflows
- SSO & audit log

## Project structure

```
packages/
  core/              .titan.json types, Zod schemas, diagnostics, normalization
  editor/            React visual editor (ReactFlow + inspector)
  export-drizzle/    Drizzle PostgreSQL schema generator
  export-mermaid/    Mermaid ER diagram generator
  export-postgres/   PostgreSQL DDL code generator
  export-prisma/     Prisma schema generator
  import-postgres/   Local PostgreSQL DDL importer
  ui/                Button, Input, Select, Badge, etc.
apps/
  web/               Local editor host app (Next.js, not a published package)
examples/            Sample schemas (blog, ecommerce, saas, messaging, PM)
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  @titanbase/core                                         │
│  Types · Zod validation · Diagnostics · Normalization    │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
   ┌───────────▼──────────┐   ┌──────────▼──────────────┐
   │  @titanbase/editor    │   │  @titanbase/export-*     │
   │  React component      │   │  Code generators         │
   │  Canvas + Inspector   │   │  Postgres · Mermaid      │
   │  Mutation engine      │   │  Prisma · Drizzle        │
   └───────────┬───────────┘   └─────────────────────────┘
               │                          ▲
               │              ┌──────────┴──────────────┐
               │              │ @titanbase/import-      │
               │              │ postgres · local DDL    │
               │              └─────────────────────────┘
               │
   ┌───────────▼───────────┐
   │  @titanbase/web        │   ← open source host app
   │  or                    │
   │  titanbase-cloud       │   ← private, adds auth/sync/AI
   └────────────────────────┘
```

**Principle:** `@titanbase/core` is the schema standard. Everything else consumes it. The editor is a pure React component with no server dependencies — cloud features are added externally via props, never baked in.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, branch naming, and how to add exporters or examples.

## Security

See [SECURITY.md](SECURITY.md). Do not open public issues for vulnerabilities.

## License

Apache-2.0
