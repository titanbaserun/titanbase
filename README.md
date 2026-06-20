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

## Packages

| Package | Description | Published |
|---------|-------------|-----------|
| `@titanbase/core` | Schema types, Zod validation, diagnostics | Yes |
| `@titanbase/editor` | React visual editor component | Yes |
| `@titanbase/export-postgres` | PostgreSQL DDL generator | Yes |
| `@titanbase/ui` | Shared UI primitives | Yes |

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
- Export PostgreSQL SQL
- Validate schema with diagnostics
- Undo/redo, keyboard shortcuts, dark mode
- CLI (planned)
- Export to Prisma/Drizzle/Mermaid/DBML (planned)
- Import from `.sql` file (planned)
- Store in Git

**Paid / Titanbase Cloud** — team and enterprise value:

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
  export-postgres/   PostgreSQL DDL code generator
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
   │  Canvas + Inspector   │   │  (postgres, mysql, ...)  │
   │  Mutation engine      │   └─────────────────────────┘
   │  Undo/redo history    │
   └───────────┬───────────┘
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
