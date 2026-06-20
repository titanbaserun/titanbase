# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/titanbaserun/titanbase/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/titanbaserun/titanbase/releases/tag/v0.1.0
