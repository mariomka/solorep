# Testing

## How It Works

- Unit/component: Vitest + Testing Library on jsdom, globals enabled. `src/test/setup.ts` wires jest-dom and `fake-indexeddb/auto`.
- Shared helpers in `src/test/helpers.ts`: `clearDatabase()` (iterates `db.tables`, so future tables are covered automatically), `makeRoutineFile()`, `makeMalformedRoutineFile()`.
- E2E: Playwright in `e2e/`, single `mobile-chrome` (Pixel 7) project. Its webServer builds and serves the production bundle on port 4173.
- Example routines in `examples/` are validated against the real Zod schema by `src/lib/example-routines.test.ts`, so samples cannot drift from the contract.

## Key Conventions

- `beforeEach(clearDatabase)` in every suite touching the DB -- fake-indexeddb persists state within a test file (Vitest isolates files per worker, so no cross-file bleed).
- Schema upgrades are tested in `src/lib/db.test.ts`: it seeds through a Dexie instance declaring only the OLD version, closes it, then opens the app's `db` so the real upgrade path runs. That suite deletes the database in `beforeEach` instead of clearing it, since a fresh install would skip the upgrade entirely and prove nothing.
- Content driven by `useLiveQuery`: use `findBy*` / `waitFor`, never `getBy*` -- first render is `undefined` and `getBy*` will flake.
- `findBy*` waits for the ELEMENT, not for its text. `expect(await screen.findByTestId("x")).toHaveTextContent("new")` is only safe the first time that element appears; when an interaction CHANGES the text of an element already on screen, the query resolves instantly against the stale text and the assertion is a coin flip. Wrap every content transition in `waitFor(() => expect(screen.getByTestId("x")).toHaveTextContent("new"))`. This was a real flake: the two swap tests in `workout-screen.test.tsx` failed ~20% of the time under CPU pressure, because the name only repaints once `recordSwap` resolves.
- Test behavior, not implementation (user-visible output, interactions, persisted state -- not internal calls or CSS utility classes). Never assert Tailwind classes with `toHaveClass`; verify styling visually.
- Accessibility is required in the implementation, but is not tested with dedicated assertions.
- Select DOM elements exclusively through `data-test` attributes. Never couple test selectors to CSS classes, visible copy, accessibility attributes, or document structure.

## Gotchas

- `bun run test`, NEVER `bun test` -- Bun's native runner ignores the Vitest config entirely.
- userEvent v14 `upload()` silently skips the `change` event when `input.files` is unchanged -- this is why the `input.value` reset exists and how its regression test works.
- Real IndexedDB persistence (data surviving a reload) is only provable in e2e -- fake-indexeddb dies with the process. `e2e/import-routine.spec.ts` covers it.
- Playwright browsers need a one-time `bunx playwright install chromium` per machine.
- The location hash bleeds across tests within a file (jsdom shares the window). `src/test/setup.ts` resets it in a global `beforeEach` via `window.history.replaceState(null, "", "#/")` -- never `location.hash = ...`, which pushes a history entry per test and pollutes `history.back()` assertions.
- The lastUsed overlay (weight only -- reps and duration always come from the routine) does NOT apply within a session: `lastUsed` only lands at `finishSession`, so a first-ever session prefills the routine's planned values throughout (and discarded sessions leave no trace). The overlay kicks in on the NEXT session. E2e volume assertions rely on this (see the 740 kg comment in `e2e/workout-session.spec.ts`). The one in-session carry-over is weight DEVIATION: a logged weight that differs from what that set was prefilled with carries to the exercise's later sets (`resolvePrefill`'s session precedent); confirming the prefill carries nothing, which is why the e2e volume still pins planned values.
