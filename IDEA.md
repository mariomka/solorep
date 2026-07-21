# Solorep — Idea

Workout app for the gym. 100% frontend, static, deployable to GitHub Pages. No backend, no accounts, no hosting to maintain.

## Core concept

- Routines are authored externally (with AI agents or by hand) and exported as **JSON**.
- The app **imports** that JSON and becomes the training companion: pick a routine, pick a day, execute it exercise by exercise.
- Multiple routines can be imported and stored locally.

## Routine JSON

- A routine spans a full week or more: it is a **loop of N days** (e.g. 3 training days). The app stores a pointer to "which day am I on" per routine and advances it after each completed session. The user can override and pick any day manually (e.g. skipped Wednesday, doing it Thursday).
- Every exercise is referenced by a **stable key** (e.g. `goblet-squat`). This key is the identity used for tracking across routines and over time.
- Each exercise entry in a routine defines: sets, reps (or duration for time-based exercises), suggested weight, rest times, and optional **alternatives** (other exercise keys the user can swap to on the fly).
- The routine may suggest a value (e.g. 20 kg), but the app always shows the **last value actually used** for that exercise key, if one exists. Reps are editable too.

## Execution flow

1. Open app → choose routine → choose day (default: the next day in the loop).
2. For each exercise, show:
   - Name + animation: GIFs from [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
     (1,324 exercises, MIT code/data, GIFs © GymVisual). Routine's `media` field = dataset
     exercise id; the app resolves the GIF filename via the dataset's `exercises.json` and
     caches media offline via the service worker. Spanish instructions come for free.
   - Sets / reps / weight (or duration) — **editable inline**; edits are persisted as "last used" for that key.
   - Alternatives selector if the exercise defines them.
   - **Continue** and **Back** buttons.
3. Rest periods between sets/exercises with a countdown.
4. Time-based exercises run a timer; last 5 seconds get a **big, bold countdown** (5-4-3-2-1) with beep/vibration.
5. Finish the day → session is logged, day pointer advances.

## Persistence (all local)

- **IndexedDB** (not localStorage): structured data, async, no 5 MB ceiling, proper querying for history.
- Stored data:
  - Imported routines (the raw JSON + metadata).
  - Per-routine progress (current day in the loop).
  - **Last-used values** per exercise key (weight, reps, duration).
  - **Session history** (every completed set with its values + timestamp) — enables future progress/evolution charts and export. Not a v1 priority, but the data is captured from day one.
- Export/import of the whole local DB as JSON (backup / portability).

## Timers with the phone locked (Android)

Reality check: a web page **cannot reliably run JS while the screen is locked**. Native workout apps can because they run in the background. The web approach:

- **Screen Wake Lock API**: keep the screen on while a workout session is active. This is what workout web apps actually do. Supported in Chrome for Android.
- Beeps via **Web Audio** + **Vibration API** for the countdown. Short beeps mix with music playing from another app (Spotify etc.) — at most a brief audio duck, music keeps playing.
- If the user locks the phone anyway, the timer resyncs on unlock using timestamps (no drift, but no beep while locked).

## PWA

- Installable (add to home screen), offline-first via service worker. Feels like an app, ships like a static site.

## Stack

- **React** (latest) + **TypeScript** (latest, type-checking with `tsgo` — the native compiler preview).
- **Vite** for build, **vite-plugin-pwa** for PWA.
- **shadcn/ui** + Tailwind for components.
- **Dexie** (IndexedDB) for storage.
- **Zod** for routine JSON validation on import.
- **Vitest + Testing Library** (unit/component), **Playwright** (e2e).
- **Husky**: pre-commit → lint + format; pre-push → tests.
- **Biome** for lint + format (single fast tool).
- Deploy: GitHub Actions → GitHub Pages.
