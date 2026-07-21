# Agent Guidelines

Solorep -- local-only gym workout PWA. Routines are authored externally as JSON, imported into the app, and tracked in IndexedDB. No backend, no accounts. Deployed to GitHub Pages.

## Tech Stack

React 19, TypeScript (type-check via `tsgo`), Vite 8, Tailwind 4 + shadcn/ui, Dexie (IndexedDB), Zod 4, Vitest + Testing Library, Playwright. Bun is the package manager and script runner. Biome for lint + format.

## Commands

- `bun run dev` -- dev server
- `bun run test` -- unit/component tests (NEVER `bun test`: that invokes Bun's own runner, not Vitest)
- `bun run e2e` -- Playwright e2e (mobile-chrome, builds + serves prod bundle on 4173)
- `bun run typecheck` / `bun run lint` / `bun run lint:fix`
- `bun run build` -- typecheck + production build

Git hooks enforce gates: pre-commit runs Biome on staged files, pre-push runs tests.

## Guidelines

- Code, identifiers, comments, commit messages: English. UI copy: Spanish.
- Explicit over implicit: named booleans over inline conditions.
- Commits are ONE line, imperative mood.

## Further Reading

**IMPORTANT: Read the relevant docs before working on the corresponding area.**

- `IDEA.md` -- Product concept, decided behaviors, execution flow
- `SCHEMA.md` -- Routine JSON contract and semantics
- `docs/data-layer.md` -- Dexie tables, import/delete semantics, liveQuery rules
- `docs/ui.md` -- Component conventions, shadcn usage, error display
- `docs/testing.md` -- fake-indexeddb resets, flake traps, e2e setup
- `docs/ci-deploy.md` -- Workflow step order, Pages base path, phone testing
