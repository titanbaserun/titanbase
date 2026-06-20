# Contributing to Titanbase

Thanks for your interest in contributing. This guide covers everything you need to get started.

## Local development

```bash
git clone https://github.com/titanbaserun/titanbase.git
cd titanbase
pnpm install
pnpm dev
```

Open `http://localhost:3000/editor` to see the visual editor.

### Commands

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Start Next.js dev server + watch packages |
| `pnpm build` | Production build of all packages |
| `pnpm typecheck` | TypeScript strict checks |
| `pnpm test` | Run all tests (vitest) |

All three gates (`typecheck`, `test`, `build`) must pass before submitting a PR.

## Branch naming

```
feat/short-description
fix/short-description
docs/short-description
refactor/short-description
```

Always branch from `main`. Keep branches short-lived.

## Commit style

Use conventional-ish commits. No strict enforcement, but follow this pattern:

```
feat: add MySQL exporter
fix: relation delete not cascading indexes
docs: add saas example schema
refactor: extract column SQL generation
test: add composite PK export test
```

Keep the first line under 72 characters. Add detail in the body if needed.

## How to add examples

1. Create a directory under `examples/` (e.g. `examples/crm/`)
2. Add a `.titan.json` file following the existing schema format
3. Add the fixture path to the test loop in `packages/core/tests/core.test.ts`
4. Run `pnpm test` to verify it validates cleanly

## How to add exporters

Exporters live in `packages/export-<dialect>/`. To add one:

1. Create `packages/export-<name>/` with the same structure as `export-postgres`
2. Accept a `TitanSchema` from `@titanbase/core`, return `{ output: string; warnings: string[] }`
3. Add tests covering common DDL patterns
4. The editor integration (preview tab) comes later — focus on the pure function first

## What's out of scope

This repository is the **open-source core**. The following belong in a separate private repo and should not be added here:

- Authentication / user accounts
- Cloud storage / team features
- Billing / subscriptions
- AI features (review, generation)
- Database connection management
- Real-time collaboration
- GitHub App / PR integration

If you're unsure whether something belongs here, open an issue to discuss first.

## Code style

- TypeScript strict mode, no `any`
- Prefer explicit exports over barrel `*` re-exports
- Keep packages focused: `core` has no React, `editor` has no server code
- Write tests for new logic (vitest)
- No linter configured yet — just match existing style

## Questions?

Open a GitHub issue or discussion. We're friendly.
