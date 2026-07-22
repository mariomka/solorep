# Data Layer (Dexie / IndexedDB)

## How It Works

- `src/lib/db.ts` -- Dexie subclass + record interfaces, no business logic. `src/lib/routine-store.ts` (import/delete) and `src/lib/session-store.ts` (active session lifecycle) -- all mutations, one transaction per operation.
- Tables: `routines` (pk `id`, index `importedAt`), `progress` (pk `routineId`), `lastUsed` (pk `exerciseKey`), `sessions` (`++id`, indexes `routineId`, `finishedAt`), `activeSession` (pk `id`).
- `activeSession` is a singleton: its only row always has id `"current"` -- one active session app-wide. `startSession` overwrites it, `finishSession` archives it into `sessions` (dropping execution-only identity fields), advances `progress` with wraparound, and deletes it.
- `activeSession.restEndsAt` (epoch ms) persists the running rest across PWA kills: written by `recordSetCompletion` when a rest follows (and dropped otherwise, so a stale deadline never survives a completion), removed by `clearRest` when the rest finishes or is skipped. On resume the workout enters the remaining rest, or the set directly when the deadline elapsed.
- Day selection and the day overview are read-only. `startSession` runs only from the overview's `Empezar entrenamiento` action, so navigating back never leaves a resumable session behind.
- `lastUsed` and `sessions` are keyed by exercise key and GLOBAL across routines -- they intentionally survive routine deletion.
- `lastUsed.sets` is an array indexed by set number; the set screen overlays these over routine-suggested values (`resolvePrefill` in `src/lib/session-plan.ts`), extra sets fall back to the last known value. Within a session, a logged weight that deviates from its own prefill carries over to the exercise's later sets (session precedent); a confirmed prefill does not, so planned/lastUsed per-set progressions survive.
- Validation (Zod `routineSchema` in `src/lib/routine-schema.ts`) happens before any DB write; error paths must leave the DB untouched.

## Key Conventions (user-decided, do not relitigate)

- Re-importing an existing routine id overwrites the definition but preserves progress, lastUsed, and sessions. If the new version has fewer days than the progress pointer, the pointer resets to 0.
- Deleting a routine removes only its `routines` + `progress` rows.
- Routine list order: `orderBy("importedAt")`, oldest first.

## Gotchas

- Dexie schema v1 becomes a contract the moment real users have data: any shape change then requires a new `version(n)` with an upgrade function. Pre-release, editing v1 in place is fine.
- `useLiveQuery` returns `undefined` on first render -- components must branch `undefined` (loading) vs `[]` (empty) explicitly.
- Dexie liveQuery observes transactions natively; never add manual state-syncing or refresh logic on top.
- `sessions` and `lastUsed` are both written by `session-store`'s `finishSession` (in its single transaction) -- never write them from UI code directly. `recordSetCompletion` touches only `activeSession`, so a discarded session leaves no trace.
- Completed entries retain their planned slot identity (`itemIndex:memberIndex`). At finish, every set in that slot is attributed to the slot's final session alternative, so a mid-exercise swap cannot split history or `lastUsed` across keys.
- `finishSession` resolves the completed `dayId` in the latest imported routine and advances to the following day in that latest order. If the completed day no longer exists, the transaction aborts without archiving, advancing, writing `lastUsed`, or deleting the active session.
- `finishSession` derives `lastUsed` from the normalized completed entries (grouped by final effective key, ordered by set index; same key + setIndex collisions resolve last-completed wins) and pads gaps below `setIndex` with the last known value, or the new values when the record had none.
