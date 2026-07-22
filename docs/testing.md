# Testing

## How It Works

- Unit/component: Vitest + Testing Library on jsdom, globals enabled. `src/test/setup.ts` wires jest-dom and `fake-indexeddb/auto`.
- Shared helpers in `src/test/helpers.ts`: `clearDatabase()` (iterates `db.tables`, so future tables are covered automatically), `makeRoutineFile()`, `makeMalformedRoutineFile()`.
- E2E: Playwright in `e2e/`, single `mobile-chrome` (Pixel 7) project. Its webServer builds and serves the production bundle on port 4173.
- Example routines in `examples/` are validated against the real Zod schema by `src/lib/example-routines.test.ts`, so samples cannot drift from the contract.

## Key Conventions

- `beforeEach(clearDatabase)` in every suite touching the DB -- fake-indexeddb persists state within a test file (Vitest isolates files per worker, so no cross-file bleed).
- Content driven by `useLiveQuery`: use `findBy*` / `waitFor`, never `getBy*` -- first render is `undefined` and `getBy*` will flake.
- Test behavior, not implementation (user-visible output, interactions, persisted state -- not internal calls or CSS utility classes). Never assert Tailwind classes with `toHaveClass`; verify styling visually.
- Accessibility is required in the implementation, but is not tested with dedicated assertions.
- Select DOM elements exclusively through `data-test` attributes. Never couple test selectors to CSS classes, visible copy, accessibility attributes, or document structure.

## Gotchas

- `bun run test`, NEVER `bun test` -- Bun's native runner ignores the Vitest config entirely.
- userEvent v14 `upload()` silently skips the `change` event when `input.files` is unchanged -- this is why the `input.value` reset exists and how its regression test works.
- Real IndexedDB persistence (data surviving a reload) is only provable in e2e -- fake-indexeddb dies with the process. `e2e/import-routine.spec.ts` covers it.
- Playwright browsers need a one-time `bunx playwright install chromium` per machine.
- The lastUsed overlay does NOT apply within a session: `lastUsed` only lands at `finishSession`, so a first-ever session prefills the routine's planned values throughout (and discarded sessions leave no trace). The overlay kicks in on the NEXT session. E2e volume assertions rely on this (see the 740 kg comment in `e2e/workout-session.spec.ts`). The one in-session carry-over is weight DEVIATION: a logged weight that differs from what that set was prefilled with carries to the exercise's later sets (`resolvePrefill`'s session precedent); confirming the prefill carries nothing, which is why the e2e volume still pins planned values.
