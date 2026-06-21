# Titanbase Roadmap

Titanbase is an open-source, local-first visual schema designer for relational databases.

This roadmap describes the current direction, not a fixed release schedule. Priorities may change based on contributor feedback, real-world usage, and implementation constraints.

## Product Principles

- [x] Local-first by default.
- [x] `.titan.json` remains the portable source of truth.
- [x] The visual editor and generated code must represent the same schema.
- [x] Core schema tooling stays open source and usable without an account.
- [x] The local web editor, desktop app, CLI, schema format, and exporters should remain useful without Titanbase Cloud.
- [x] Cloud, collaboration, authentication, billing, and AI are not required for the local product.

## Current Focus

- [x] Finish and harden the local web editor before expanding into desktop, CLI, or cloud workflows.
- [ ] Harden the local editor UX and validation.
- [x] Add Mermaid, Prisma, and Drizzle exporters with focused tests.
- [ ] Document the `.titan.json` format.
- [ ] Add SQL import and schema diff foundations.
- [ ] Package the proven local workflow as a desktop application.
- [ ] Add CLI and automation workflows after the public APIs stabilize.

---

## Phase 1 — Local Web Editor MVP

### Core Schema

- [x] TypeScript `TitanSchema` model.
- [x] Zod schema validation.
- [x] Schema normalization.
- [x] Project, table, column, relation, index, and enum models.
- [x] Editor metadata and persisted table positions.
- [x] Valid empty-schema factory.
- [x] Basic diagnostics.
- [x] Example schemas and validation tests.

### Editor Foundations

- [x] React visual schema editor.
- [x] React Flow canvas derived from `TitanSchema` and editor metadata.
- [x] Blank schema flow.
- [x] Template picker.
- [x] Open existing `.titan.json` files.
- [x] Local save/load.
- [x] Browser autosave preference.
- [x] Dirty-state tracking.
- [x] Safe navigation for unsaved schemas.
- [x] Undo/redo history for schema mutations.
- [x] Keyboard shortcuts.
- [x] Search and auto-layout actions.
- [x] Automatic fit view after loading templates.

### Schema Editing

- [x] Add, edit, and delete tables.
- [x] Add, edit, and delete columns.
- [x] Edit column name, type, default, description, nullability, primary key, and uniqueness.
- [x] Create, edit, and delete relations.
- [x] Edit relation endpoints, cardinality, referential actions, and description.
- [x] Create, edit, and delete indexes.
- [x] PostgreSQL index methods, partial index clauses, and multi-column indexes.
- [x] Create, edit, and delete enums.
- [x] Reference enums from column types.

### Canvas and Inspector UX

- [x] Project Overview inspector.
- [x] Context-aware table, column, relation, index, and enum inspectors.
- [x] Collapsible and pinnable inspector sidebar.
- [x] Hover-preview inspector mode.
- [x] Persisted inspector preferences.
- [x] Empty canvas state and quick actions.
- [x] Compact table cards.
- [x] PK, FK, UQ, IDX, and NN badges.
- [x] Foreign-key row highlighting.
- [x] Explicit relation labels such as `orders.customer_id -> customers.id`.
- [x] Compact relation cardinality labels.
- [x] Theme-aware relation edge styling.
- [x] Compact schema status and validation bar.
- [x] Light, dark, and system theme preferences.
- [x] Theme-aware canvas, panels, badges, relations, and code previews.

### Validation and Export

- [x] Grouped validation panel.
- [x] Select related schema objects from validation issues.
- [x] Titan JSON export preview, copy, and download.
- [x] PostgreSQL SQL export preview, copy, and download.
- [x] PostgreSQL relations, enums, indexes, defaults, comments, and constraints.
- [x] Export warnings and validation status.
- [x] Slugified export filenames.
- [ ] Add advanced relation diagnostics.
- [ ] Add dialect-specific type and default diagnostics.
- [ ] Detect unsafe or contradictory constraints.
- [ ] Improve diagnostics for composite keys and composite relations.
- [x] Export Mermaid ERD.
- [x] Export Prisma schema.
- [x] Export Drizzle schema.

### MVP Hardening

- [x] Unit tests for schema mutations and undo/redo.
- [x] Unit tests for schema statistics, FK detection, index detection, and relation labels.
- [x] PostgreSQL exporter tests.
- [x] Mermaid, Prisma, and Drizzle exporter tests across every example schema.
- [x] Exporter edge-case coverage for identifiers, warnings, relations, indexes, defaults, and empty schemas.
- [x] App settings persistence tests.
- [ ] Add component-level tests for critical editor workflows.
- [ ] Add automated browser tests for blank, template, edit, save, and export flows.
- [ ] Add accessibility pass for keyboard navigation and focus management.
- [ ] Add large-schema performance benchmarks.
- [ ] Test schema compatibility and migrations between Titan format versions.

---

## Phase 2 — Exporters, Import, and Schema as Code

### Additional Exporters

- [x] Export Mermaid ER diagrams.
- [x] Export Prisma schema files.
- [x] Export Drizzle PostgreSQL schema files.
- [x] Use all example schemas as deterministic exporter fixtures.
- [x] Add exporter warning coverage for unsupported features.
- [x] Add exporter tests for Blog, SaaS, Ecommerce, Marketplace, CRM, Analytics, and all additional templates.
- [ ] Add round-trip-style tests where practical.
- [ ] Export DBML.

### Import

- [ ] Import PostgreSQL from a `.sql` file.
- [ ] Convert imported SQL into normalized `TitanSchema` objects.
- [ ] Show unsupported SQL statements and import warnings.
- [ ] Drag and drop `.titan.json` and `.sql` files in the web editor.
- [ ] Preserve comments, defaults, indexes, enums, and referential actions where possible.

### Diff and Migration Foundations

- [ ] Structural schema diff engine.
- [ ] Visual added, removed, and changed object states.
- [ ] Compare two `.titan.json` files.
- [ ] Migration draft preview.
- [ ] Destructive-change warnings.
- [ ] Stable object matching and rename detection.
- [ ] Export migration draft as PostgreSQL SQL.

### Schema Format

- [ ] Publish the `.titan.json` format specification.
- [ ] Publish a versioned JSON Schema.
- [ ] Document normalization and compatibility rules.
- [ ] Document deterministic serialization rules.
- [ ] Add schema formatting utilities.
- [ ] Add import/export round-trip fixtures.
- [ ] Define compatibility rules for future Titan schema versions.

### Templates

- [x] Initial practical template library.
- [x] Blog, SaaS, Ecommerce, Marketplace, CRM, Analytics, and additional examples.
- [x] Template cards with table, relation, and column statistics.
- [ ] Add template documentation and design notes.
- [ ] Add community template contribution guidelines.
- [ ] Add template versioning and compatibility checks.

---

## Phase 3 — Desktop App

- [x] Titanbase Desktop should be free and open source.
- [x] Desktop app should not require an account or cloud backend.
- [ ] Evaluate Electron and Tauri against Titanbase requirements.
- [ ] Package the editor as a desktop application.
- [ ] Open and save `.titan.json` directly from the filesystem.
- [ ] Recent files.
- [ ] Drag and drop `.titan.json` and `.sql` files.
- [ ] Native export actions.
- [ ] Native app menu and keyboard shortcuts.
- [ ] File-change detection and reload prompts.
- [ ] Crash-safe local drafts.
- [ ] Offline-first local workflow.
- [ ] macOS, Windows, and Linux release builds.
- [ ] Signed releases and automatic update strategy.

---

## Phase 4 — CLI and Automation

- [x] CLI should use the same public schema and exporter APIs as the editor.
- [ ] Define the stable public API for `@titanbase/core`.
- [ ] `titanbase validate`.
- [ ] `titanbase export`.
- [ ] `titanbase diff`.
- [ ] `titanbase import`.
- [ ] Machine-readable diagnostics output.
- [ ] Deterministic exit codes.
- [ ] GitHub Action for schema validation.
- [ ] CI examples for GitHub Actions and other common providers.
- [ ] Package releases for npm and supported system package managers.

---

## Phase 5 — Documentation and Public Launch

- [x] Open-source repository foundations.
- [x] README, contributing guide, security policy, and code of conduct.
- [x] Example schema library.
- [x] Public roadmap.
- [x] Issue and feature-request templates.
- [ ] Complete schema format documentation.
- [ ] Editor user guide.
- [ ] Exporter and contributor guides.
- [ ] Release policy.
- [ ] Website polish.
- [ ] Product screenshots.
- [ ] Short demo video.
- [ ] Hosted public editor demo.
- [ ] GitHub Discussions.
- [ ] First tagged public release after MVP hardening.
- [ ] Product Hunt and Hacker News launch preparation.

---

## Future — Titanbase Cloud

- [x] Titanbase Cloud is a possible future product layer for teams.
- [x] Titanbase Cloud must not be required to use the local editor, `.titan.json` format, exporters, desktop app, or CLI.
- [x] The open-source product should remain fully useful without an account.
- [x] Cloud, collaboration, authentication, billing, and AI are intentionally out of scope for the immediate local-first OSS roadmap.

### Collaboration

- [ ] Cloud projects and team workspaces.
- [ ] Realtime collaboration.
- [ ] Comments and schema review workflows.
- [ ] Version history.
- [ ] Shareable read-only schema links.
- [ ] GitHub pull request comments.

### Database Workflows

- [ ] Live database import.
- [ ] Schema drift detection.
- [ ] Saved database connections.
- [ ] Environment comparison.
- [ ] Advanced migration review and approval workflows.

### Organization and Security

- [ ] Authentication and account management.
- [ ] Billing and subscription management.
- [ ] SSO.
- [ ] Roles and permissions.
- [ ] Audit log.
- [ ] Data retention and deletion controls.

### Optional AI Features

- [ ] AI schema review.
- [ ] AI-generated schema documentation.
- [ ] Natural-language schema exploration.
- [ ] Migration risk explanations.

---

## Not Planned for the Immediate Local MVP

- [ ] Cloud accounts or mandatory sign-in.
- [ ] Billing.
- [ ] Realtime collaboration.
- [ ] Hosted database credentials.
- [ ] AI-dependent editor functionality.
- [ ] Automatic production database migrations.
- [ ] Managed database hosting.
- [ ] Custom database engine.
- [x] These may be explored later, but they must not block or weaken Titanbase's local-first open-source workflow.
