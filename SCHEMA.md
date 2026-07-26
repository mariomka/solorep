# Routine JSON Schema (draft)

The contract between routine-authoring agents and the app. Validated with Zod on import — the Zod schema in code will be the source of truth; this doc explains semantics.

## Example

```jsonc
{
  "id": "fullbody-3d",              // unique slug, identity of the routine
  "name": "Full Body — 3 días",
  "description": "Optional free text",
  "exercises": {
    // Catalog: every key used in days[] must exist here.
    // `datasetId` is the exercise id in https://github.com/hasaneyldrm/exercises-dataset
    // (e.g. "0025"); the app resolves the GIF and the localized instructions from it.
    // `note` is optional, limited to 200 characters, and appears below the exercise media.
    "bench-press": {
      "name": "Press banca",
      "datasetId": "0025",
      "note": "Mantén las escápulas retraídas durante toda la serie."
    },
    "dumbbell-press": { "name": "Press mancuernas" },
    "goblet-squat": { "name": "Goblet Squat" },
    "plank": { "name": "Plancha" },
    "jumping-jacks": { "name": "Jumping Jacks" },
    "quad-stretch": { "name": "Estiramiento de cuádriceps" }
  },
  "days": [
    {
      "id": "day-1",                // stable id for progress tracking
      "name": "Empuje",
      "exercises": [
        {
          "phase": "warmup",        // omit for the working sets; see Phases
          "exercise": "jumping-jacks",
          "rest": 0,
          "sets": [{ "reps": 30 }]
        },
        {
          "exercise": "bench-press",
          "alternatives": ["dumbbell-press"],
          "rest": 90,               // seconds between sets
          "sets": [
            { "reps": 12, "weight": 20 },
            { "reps": 10, "weight": 25 },
            { "reps": 8,  "weight": 30 }
          ]
        },
        {
          "exercise": "plank",
          "rest": 60,
          "sets": [
            { "duration": 45 },     // time-based set, seconds
            { "duration": 45 }
          ]
        },
        {
          // Superset: members alternate within a round, no rest between them;
          // `rest` applies after each full round.
          "superset": [
            {
              "exercise": "biceps-curl",
              "alternatives": ["hammer-curl"],
              "sets": [
                { "reps": 12, "weight": 10 },
                { "reps": 12, "weight": 10 },
                { "reps": 10, "weight": 12 }
              ]
            },
            {
              "exercise": "triceps-pushdown",
              "sets": [
                { "reps": 12, "weight": 20 },
                { "reps": 12, "weight": 20 },
                { "reps": 10, "weight": 25 }
              ]
            }
          ],
          "rest": 90
        },
        {
          "phase": "cooldown",
          "exercise": "quad-stretch",
          "rest": 0,
          "sets": [{ "duration": 30 }]
        }
      ]
    }
  ]
}
```

## Semantics

- **Exercise key** (`bench-press`) is the global identity: last-used values and history
  are stored per key, shared across routines and days.
- **Exercise note** (`note`) is optional catalog copy for a short execution cue or
  routine-specific reminder. It is limited to 200 characters and appears below the
  exercise GIF; it remains visible when no media is available and while a timed set's
  countdown is running.
- **Set**: either `{ reps, weight? }` or `{ duration, weight? }` — never both `reps`
  and `duration`. `weight` optional (bodyweight). Always an array, one entry per set —
  explicit, supports pyramids, and verbosity is free when agents author the JSON.
- **Routine values are suggestions.** At runtime the app overlays the last-used values
  for that exercise key (per set index; extra sets fall back to the last known value).
  Edits during a session persist as the new last-used.
- **Alternatives**: swapping to an alternative tracks under the *alternative's* key —
  each exercise keeps its own history.
- **Phase** (`"warmup" | "work" | "cooldown"`, optional, defaults to `"work"`) classifies a
  day item. Omit it on working sets and set it only on warm-up and cool-down items, so the
  annotated items are the exceptional ones. Routines authored before the field existed are
  treated as all-`work`, which is exactly their old behavior.

  It exists because the app must know which items are the actual training:

  - **Only `work` items can be postponed.** Warm-ups and stretches need no machine, so
    "someone is using it" never applies to them. Without the field the app offered to
    postpone every single-set stretch, because a 1-set item's first set is also its only
    one and the postpone guard keys off the first set.
  - **A postponed exercise lands right before the first `cooldown` item**, not at the end
    of the day. Ending a session with a heavy lift after eight stretches is not a workout.
    A day with no cool-down keeps the queue at the end.

  Phases are expected in `warmup → work → cooldown` order. Nothing enforces it, but a
  `work` item placed after a cool-down cannot be postponed: the queue lands ahead of it,
  so moving it would send it backwards past sets already logged.

- **Days are a loop.** The app stores a pointer per routine (next day index) and
  advances it when a session is completed. Manual day selection always possible.
- **`rest`**: seconds between sets of that exercise. Rest between exercises: the user
  advances manually (gym reality: moving stations takes variable time).
- **Supersets**: a day item can be `{ "superset": [members], "rest", "phase"? }` instead
  of a single exercise (`phase` behaves exactly as on a plain exercise; members carry no
  phase of their own). Rounds = length of each member's `sets` array — all members must
  have the same length (validated on import). Execution alternates members within a
  round (A1 → B1 → rest → A2 → B2 → rest…). No rest between members inside a round.
  Works for circuits too (3+ members). Alternatives and last-used tracking behave
  exactly like standalone exercises.

## Open questions

- **Per-side exercises** (e.g. lunges): convention for now — reps means "per side" if
  the exercise name says so. Could be an explicit flag later.
- **AMRAP / to-failure sets**: not modeled; could be `{ "reps": "max" }` later.
