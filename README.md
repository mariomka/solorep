# Solorep

> [!WARNING]
> Work in progress — not usable yet.

Gym workout PWA. Import routines as JSON, train, track your last-used weights and reps. 100% frontend, deployed on GitHub Pages.

- [SCHEMA.md](SCHEMA.md) — routine JSON format

## Stack

React 19 · TypeScript (`tsgo`) · Vite · Tailwind 4 + shadcn/ui · Dexie (IndexedDB) · Zod · vite-plugin-pwa

## Development

```sh
bun install
bun run dev
```

| Command | |
| --- | --- |
| `bun run typecheck` | Type-check with tsgo |
| `bun run lint` / `lint:fix` | Biome lint + format check |
| `bun run test` | Vitest unit/component tests |
| `bun run e2e` | Playwright e2e (needs `bunx playwright install chromium` once) |
| `bun run build` | Type-check + production build |

Git hooks (husky): pre-commit runs Biome on staged files, pre-push runs the test suite.

## Deploy

Push to `main` → GitHub Actions builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`). Enable Pages with source "GitHub Actions" in the repo settings once.

## Exercise media

Exercise GIFs come from [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (1,324 exercises, GIFs © GymVisual). The routine's `media` field is the dataset exercise id.
