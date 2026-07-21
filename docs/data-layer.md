# Data Layer (Dexie / IndexedDB)

## How It Works

- `src/lib/db.ts` -- Dexie subclass + record interfaces, no business logic. `src/lib/routine-store.ts` -- all mutations, one transaction per operation.
- Tables: `routines` (pk `id`, index `importedAt`), `progress` (pk `routineId`), `lastUsed` (pk `exerciseKey`), `sessions` (`++id`, indexes `routineId`, `finishedAt`).
- `lastUsed` and `sessions` are keyed by exercise key and GLOBAL across routines -- they intentionally survive routine deletion.
- `lastUsed.sets` is an array indexed by set number; the future workout screen overlays these over routine-suggested values, extra sets fall back to the last known value.
- Validation (Zod `routineSchema` in `src/lib/routine-schema.ts`) happens before any DB write; error paths must leave the DB untouched.

## Key Conventions (user-decided, do not relitigate)

- Re-importing an existing routine id overwrites the definition but preserves progress, lastUsed, and sessions. If the new version has fewer days than the progress pointer, the pointer resets to 0.
- Deleting a routine removes only its `routines` + `progress` rows.
- Routine list order: `orderBy("importedAt")`, oldest first.

## Gotchas

- Dexie schema v1 becomes a contract the moment real users have data: any shape change then requires a new `version(n)` with an upgrade function. Pre-release, editing v1 in place is fine.
- `useLiveQuery` returns `undefined` on first render -- components must branch `undefined` (loading) vs `[]` (empty) explicitly.
- Dexie liveQuery observes transactions natively; never add manual state-syncing or refresh logic on top.
- `sessions` and `lastUsed` have no writers yet -- the workout execution screen will be the first.
