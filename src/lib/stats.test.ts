import { describe, expect, it } from "vitest";
import type { RoutineRecord, SessionRecord } from "@/lib/db";
import {
  aggregateTrainedExercises,
  bucketProgressionPoints,
  buildExerciseNameMap,
  buildExerciseProgression,
  filterProgressionPoints,
  groupSessionEntries,
  resolveExerciseName,
} from "@/lib/stats";

function makeSession(
  finishedAt: number,
  entries: SessionRecord["entries"],
): SessionRecord {
  return {
    id: finishedAt,
    routineId: "routine",
    dayId: "day-1",
    startedAt: finishedAt - 60_000,
    finishedAt,
    entries,
  };
}

function makeEntry(
  exerciseKey: string,
  values: { reps?: number; duration?: number; weight?: number },
  setIndex = 0,
): SessionRecord["entries"][number] {
  return { exerciseKey, setIndex, completedAt: 0, ...values };
}

function makeRoutineRecord(
  id: string,
  importedAt: number,
  exercises: Record<string, string>,
): RoutineRecord {
  return {
    id,
    importedAt,
    routine: {
      id,
      name: id,
      exercises: Object.fromEntries(
        Object.entries(exercises).map(([key, name]) => [key, { name }]),
      ),
      days: [
        {
          id: "day-1",
          name: "Día 1",
          exercises: [
            {
              exercise: Object.keys(exercises)[0],
              rest: 0,
              sets: [{ reps: 1 }],
            },
          ],
        },
      ],
    },
  };
}

describe("aggregateTrainedExercises", () => {
  it("returns an empty list for no sessions", () => {
    expect(aggregateTrainedExercises([])).toEqual([]);
  });

  it("dedupes keys, keeps the latest finishedAt, and sorts most recent first", () => {
    const sessions = [
      makeSession(1000, [
        makeEntry("squat", { reps: 5 }),
        makeEntry("bench-press", { reps: 5 }),
      ]),
      makeSession(3000, [makeEntry("squat", { reps: 5 })]),
      makeSession(2000, [makeEntry("bench-press", { reps: 5 })]),
    ];

    expect(aggregateTrainedExercises(sessions)).toEqual([
      { exerciseKey: "squat", lastTrainedAt: 3000 },
      { exerciseKey: "bench-press", lastTrainedAt: 2000 },
    ]);
  });
});

describe("buildExerciseProgression", () => {
  it("picks weight when any entry ever logged weight and skips bodyweight-only sessions", () => {
    const sessions = [
      makeSession(1000, [makeEntry("squat", { reps: 10 })]),
      makeSession(2000, [makeEntry("squat", { reps: 8, weight: 60 })]),
    ];

    expect(buildExerciseProgression(sessions, "squat")).toEqual({
      metric: "weight",
      points: [{ finishedAt: 2000, value: 60 }],
    });
  });

  it("takes the max weight per session across multiple sets", () => {
    const sessions = [
      makeSession(1000, [
        makeEntry("squat", { reps: 8, weight: 60 }, 0),
        makeEntry("squat", { reps: 6, weight: 70 }, 1),
        makeEntry("squat", { reps: 10, weight: 50 }, 2),
      ]),
    ];

    expect(buildExerciseProgression(sessions, "squat").points).toEqual([
      { finishedAt: 1000, value: 70 },
    ]);
  });

  it("falls back to reps when no entry ever logged weight", () => {
    const sessions = [
      makeSession(1000, [
        makeEntry("push-up", { reps: 10 }, 0),
        makeEntry("push-up", { reps: 12 }, 1),
      ]),
    ];

    expect(buildExerciseProgression(sessions, "push-up")).toEqual({
      metric: "reps",
      points: [{ finishedAt: 1000, value: 12 }],
    });
  });

  it("falls back to duration when there are no weights and no reps", () => {
    const sessions = [
      makeSession(1000, [makeEntry("plank", { duration: 45 })]),
    ];

    expect(buildExerciseProgression(sessions, "plank")).toEqual({
      metric: "duration",
      points: [{ finishedAt: 1000, value: 45 }],
    });
  });

  it("returns one point for a single session", () => {
    const sessions = [
      makeSession(1000, [makeEntry("squat", { reps: 5, weight: 80 })]),
    ];

    expect(buildExerciseProgression(sessions, "squat").points).toHaveLength(1);
  });

  it("sorts points by finishedAt ascending regardless of input order", () => {
    const sessions = [
      makeSession(3000, [makeEntry("squat", { reps: 5, weight: 90 })]),
      makeSession(1000, [makeEntry("squat", { reps: 5, weight: 70 })]),
      makeSession(2000, [makeEntry("squat", { reps: 5, weight: 80 })]),
    ];

    expect(buildExerciseProgression(sessions, "squat").points).toEqual([
      { finishedAt: 1000, value: 70 },
      { finishedAt: 2000, value: 80 },
      { finishedAt: 3000, value: 90 },
    ]);
  });
});

describe("buildExerciseNameMap / resolveExerciseName", () => {
  it("resolves catalog names", () => {
    const nameMap = buildExerciseNameMap([
      makeRoutineRecord("a", 1000, { squat: "Sentadilla" }),
    ]);

    expect(resolveExerciseName("squat", nameMap)).toBe("Sentadilla");
  });

  it("lets the latest importedAt win on key collisions", () => {
    const nameMap = buildExerciseNameMap([
      makeRoutineRecord("b", 2000, { squat: "Sentadilla con barra" }),
      makeRoutineRecord("a", 1000, { squat: "Sentadilla" }),
    ]);

    expect(resolveExerciseName("squat", nameMap)).toBe("Sentadilla con barra");
  });

  it("humanizes a kebab key on a catalog miss", () => {
    expect(resolveExerciseName("bench-press", new Map())).toBe("Bench press");
  });
});

describe("groupSessionEntries", () => {
  it("groups interleaved superset entries in first-appearance order", () => {
    const entries = [
      makeEntry("curl", { reps: 10 }, 0),
      makeEntry("triceps", { reps: 10 }, 0),
      makeEntry("curl", { reps: 8 }, 1),
      makeEntry("triceps", { reps: 8 }, 1),
    ];

    const groups = groupSessionEntries(entries);

    expect(groups.map((group) => group.exerciseKey)).toEqual([
      "curl",
      "triceps",
    ]);
    expect(groups[0].sets.map((set) => set.setIndex)).toEqual([0, 1]);
    expect(groups[1].sets.map((set) => set.setIndex)).toEqual([0, 1]);
  });

  it("returns an empty list for no entries", () => {
    expect(groupSessionEntries([])).toEqual([]);
  });
});

describe("filterProgressionPoints", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = 1_000 * DAY_MS;
  const points = [
    { finishedAt: now - 400 * DAY_MS, value: 50 },
    { finishedAt: now - 90 * DAY_MS, value: 60 },
    { finishedAt: now - 10 * DAY_MS, value: 70 },
  ];

  it("keeps only points inside the 3m window, including the boundary", () => {
    expect(filterProgressionPoints(points, "3m", now)).toEqual([
      { finishedAt: now - 90 * DAY_MS, value: 60 },
      { finishedAt: now - 10 * DAY_MS, value: 70 },
    ]);
  });

  it("keeps only points inside the 1y window", () => {
    expect(filterProgressionPoints(points, "1y", now)).toEqual([
      { finishedAt: now - 90 * DAY_MS, value: 60 },
      { finishedAt: now - 10 * DAY_MS, value: 70 },
    ]);
  });

  it('returns the input unchanged for "all"', () => {
    expect(filterProgressionPoints(points, "all", now)).toBe(points);
  });
});

describe("bucketProgressionPoints", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = 1_000 * DAY_MS;

  it("collapses same-week points to the max point with its own timestamp", () => {
    const points = [
      { finishedAt: now - 6 * DAY_MS, value: 80 },
      { finishedAt: now - 4 * DAY_MS, value: 70 },
      { finishedAt: now - 2 * DAY_MS, value: 75 },
    ];

    expect(bucketProgressionPoints(points, now)).toEqual([
      { finishedAt: now - 6 * DAY_MS, value: 80 },
    ]);
  });

  it("keeps the later point when same-week values tie", () => {
    const points = [
      { finishedAt: now - 6 * DAY_MS, value: 80 },
      { finishedAt: now - 2 * DAY_MS, value: 80 },
    ];

    expect(bucketProgressionPoints(points, now)).toEqual([
      { finishedAt: now - 2 * DAY_MS, value: 80 },
    ]);
  });

  it("preserves ascending order across buckets", () => {
    const points = [
      { finishedAt: now - 20 * DAY_MS, value: 50 },
      { finishedAt: now - 16 * DAY_MS, value: 55 },
      { finishedAt: now - 9 * DAY_MS, value: 60 },
      { finishedAt: now - 2 * DAY_MS, value: 65 },
    ];

    expect(bucketProgressionPoints(points, now)).toEqual([
      { finishedAt: now - 16 * DAY_MS, value: 55 },
      { finishedAt: now - 9 * DAY_MS, value: 60 },
      { finishedAt: now - 2 * DAY_MS, value: 65 },
    ]);
  });

  it("leaves sparse points (one per week) unchanged", () => {
    const points = [
      { finishedAt: now - 15 * DAY_MS, value: 50 },
      { finishedAt: now - 8 * DAY_MS, value: 55 },
      { finishedAt: now - 1 * DAY_MS, value: 60 },
    ];

    expect(bucketProgressionPoints(points, now)).toEqual(points);
  });
});
