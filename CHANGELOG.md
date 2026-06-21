# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0]

### Added

#### Editor
- Added per-action call-to-action affordances on the start screen cards (Create schema, Browse templates, Open file, Import SQL) that reveal on hover.
- Added an explicit responsive viewport configuration for correct mobile rendering and safe-area handling.
- Added actionable project, table, column, relation, index, enum, and metadata diagnostics.
- Added diagnostic entity context, help text, severity counts, issue codes, and direct object selection.
- Added local PostgreSQL `.sql` import entry points to the start screen, toolbar, empty canvas, and Project Overview.
- Added a non-blocking import report for unsupported SQL and a failure state that preserves the current schema.

#### Importers
- Added `@titanbase/import-postgres` with deterministic browser-safe PostgreSQL DDL parsing.
- Added support for enums, tables, column and table constraints, foreign keys, indexes, comments, quoted identifiers, and namespaces.
- Added line-aware warnings for unsupported statements, expression indexes, unsupported constraints, and unresolved references.
- Added 25 importer tests, including a PostgreSQL import/export integration scenario.

### Changed

- Reworked the start screen action cards into a balanced, uniform grid with consistent icons, a refined "Recommended" badge, and equal heights.
- Made the start screen scrollable on mobile and stacked the hero, header, and cards for small viewports.
- Compacted the editor toolbar (smaller logo, tighter spacing and controls) and moved the Website and Docs links to the end of the toolbar as icon-only buttons with tooltips.
- Shortened the toolbar "Import SQL" action label to "Import".
- Made the editor toolbar horizontally scrollable so all actions stay reachable on narrow screens.

### Fixed

- Fixed the start screen cards rendering as an unbalanced 3 + 1 layout; they now reflow cleanly across breakpoints (4 → 2 → 1 columns) with no orphaned card.
- Fixed the editor canvas not panning on touch devices by removing the oversized shell `min-width` that pushed content beyond the viewport.
- Fixed the inspector sidebar being clipped off-screen and its collapse control becoming unreachable on narrower windows.
- Fixed the start screen header overlapping the Docs/GitHub actions on small screens.
- Fixed the oversized website mark icon by setting explicit dimensions.

## [0.3.0]

### Added

#### Exporters
- Added `@titanbase/export-mermaid` for Mermaid ER diagrams.
- Added `@titanbase/export-prisma` for Prisma schema files.
- Added `@titanbase/export-drizzle` for Drizzle PostgreSQL schema files.
- Added shared `ExportFile`, `ExportWarning`, and `ExportResult` contracts to `@titanbase/core`.
- Added deterministic exporter coverage across all example schemas.
- Added reserved-word, identifier-collision, enum, relation, index, default, and empty-schema tests.

#### Editor
- Added Mermaid, Prisma, and Drizzle tabs to the export modal.
- Added per-target warnings, previews, copy actions, and file downloads.
- Added Clipboard API fallback behavior for restricted browsers.
- Added pinnable, collapsible, and hover-preview inspector behavior.
- Added project overview, blank-schema flow, richer table cards, relation labels, and compact status bar.

### Changed

- Light mode is now the default theme for new and reset editor settings.
- Improved Mermaid identifier collision handling and relation diagnostics.
- Improved Prisma identifier mapping, enum defaults, unique constraints, and ambiguous relation handling.
- Improved Drizzle dependency ordering, reserved identifiers, safe defaults, minimal imports, and cyclic relation warnings.
- Updated README and roadmap to reflect the available local exporters and current product scope.
- Improved all example schemas with non-redundant unique constraints and indexes for foreign keys.

### Fixed

- Prevented generated Prisma relations from referencing non-unique target fields.
- Prevented duplicate Prisma unique constraints when a column is already unique.
- Prevented unsafe Drizzle forward and self references from producing brittle generated code.
- Prevented long exporter warnings from overflowing the export modal.
- Fixed the missing plus icon in the empty-canvas Add Table action.
- Hid the minimap for empty schemas and improved minimap node visibility in both themes.

## [0.2.0]

### Added

#### @titanbase/core
- `createEmptySchema()` factory for generating valid blank projects.
- `normalizeSchema()` improvements for deterministic output.
- `TITAN_VERSION` constant export.

#### @titanbase/editor
- Welcome screen with template selection and recent file access.
- Project overview panel showing schema statistics.
- Export modal with clipboard and file download support.
- Settings dialog for editor preferences (grid snap, minimap, theme).
- Leave/replace confirmation dialogs for unsaved changes.
- Schema visual utilities for auto-layout and viewport fitting.

#### @titanbase/export-postgres
- No functional changes (version bump only to stay in sync).

#### Examples
- 11 new sample schemas covering diverse domains:
  - `crm` — Sales CRM with pipelines, stages, activities, and contacts.
  - `learning-app` — Online learning platform with courses, modules, enrollments.
  - `analytics-events` — Product analytics with sessions, events, funnels, dashboards.
  - `healthcare` — Clinic management with appointments, medical records, audit log.
  - `marketplace` — Online marketplace with seller profiles, listings, orders, reviews.
  - `content-platform` — CMS with articles, categories, tags, nested comments.
  - `ai-model-registry` — ML model versioning, experiments, deployments.
  - `hr-management` — HR system with departments, employees, leave, performance reviews.
  - `booking-system` — Venue booking with resources, availability rules, payments.
  - `social-network` — Social platform with follows, posts, likes, notifications.
  - `inventory-management` — Warehouse inventory with zones, stock levels, movements.

#### Project
- Apache-2.0 license (replaces MIT).
- CONTRIBUTING.md with dev setup, branch naming, and exporter authoring guide.
- CODE_OF_CONDUCT.md (Contributor Covenant 2.1).
- SECURITY.md with vulnerability reporting policy.
- GitHub CI workflow (typecheck, test, build on push/PR).
- Issue templates for bugs, feature requests, and exporter requests.
- Pull request template with review checklist.

### Changed

- License changed from MIT to Apache-2.0.
- Improved README with clearer embedding examples.

## [0.1.0] 

### Added

- Initial release with `@titanbase/core`, `@titanbase/ui`, `@titanbase/editor`, `@titanbase/export-postgres`.
- Portable `.titan.json` schema format (v1.0).
- Zod-based runtime validation and diagnostics.
- PostgreSQL DDL code generation.
- React-based visual schema editor with ReactFlow canvas.
- Next.js host application (`apps/web`).
- Five starter example schemas: blog, ecommerce, messaging, project-management, saas.

[0.4.0]: https://github.com/titanbaserun/titanbase/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/titanbaserun/titanbase/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/titanbaserun/titanbase/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/titanbaserun/titanbase/releases/tag/v0.1.0
