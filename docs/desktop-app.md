# Titanbase Desktop App

Status: MVP

Titanbase Desktop is the free and open-source local app for designing relational database schemas with Titanbase. It packages the shared editor from this monorepo into an Electron application and works independently from the hosted website.

## What It Is

- A local-first visual schema designer.
- An offline-capable desktop app for `.titan.json` projects.
- A filesystem-based workflow for opening, saving, importing, comparing, and exporting schema files.
- A free OSS part of Titanbase, with no account required.

## What Works Today

- Open and save local `.titan.json` files.
- Save As to a new `.titan.json` path.
- Import local PostgreSQL `.sql` schema files.
- Export Titan JSON, PostgreSQL, Mermaid, Prisma, Drizzle, and migration draft files locally.
- Compare the current schema with another `.titan.json` file.
- Preview PostgreSQL migration drafts generated from schema diffs.
- Recent files.
- Drag and drop for `.titan.json` and `.sql` files.
- Native app menu and keyboard shortcuts.
- Unsaved-change prompts for replacing or closing a dirty schema.

## What Is Not Included

- No cloud backend.
- No account, auth, billing, or teams.
- No telemetry.
- No live database connections.
- No saved database credentials.
- No migration execution.
- No signed or notarized release builds yet.
- No automatic updates yet.

## Security Model

- Filesystem access stays in the Electron main/preload layer.
- The renderer does not use Node filesystem APIs directly.
- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- The preload bridge exposes only narrow Titanbase file actions.
- External links are restricted to trusted Titanbase documentation and repository URLs.
- Production builds load the bundled local renderer from disk, not the hosted website.

## Known Limitations

- The desktop app is still experimental.
- macOS packages are currently unsigned and not notarized.
- Windows and Linux package targets are configured but not fully release-tested.
- File-change detection and reload prompts are not implemented yet.
- Crash-safe local draft recovery is not implemented yet.

## Roadmap

- Harden macOS, Windows, and Linux distribution builds.
- Add signed and notarized releases.
- Add automatic updates.
- Add file-change detection for opened `.titan.json` files.
- Add crash-safe local drafts.
- Polish installers and release documentation.
