import { describe, expect, it } from "vitest";
import fullbody3d from "../../examples/fullbody-3d.json";
import type { RoutineDay } from "./routine-schema";
import { parseRoutine } from "./routine-schema";
import {
  buildDayPlan,
  computeSummary,
  resolvePrefill,
  swapKey,
} from "./session-plan";

function plainExerciseDay(): RoutineDay {
  return {
    id: "day-1",
    name: "Empuje",
    exercises: [
      {
        exercise: "bench-press",
        alternatives: ["dumbbell-press"],
        rest: 90,
        sets: [
          { reps: 12, weight: 20 },
          { reps: 10, weight: 25 },
          { reps: 8, weight: 30 },
        ],
      },
    ],
  };
}

function supersetDay(): RoutineDay {
  return {
    id: "day-1",
    name: "Brazos",
    exercises: [
      {
        superset: [
          {
            exercise: "biceps-curl",
            alternatives: ["hammer-curl"],
            sets: [
              { reps: 12, weight: 10 },
              { reps: 12, weight: 10 },
              { reps: 10, weight: 12 },
            ],
          },
          {
            exercise: "triceps-pushdown",
            sets: [
              { reps: 12, weight: 20 },
              { reps: 12, weight: 20 },
              { reps: 10, weight: 25 },
            ],
          },
        ],
        rest: 90,
      },
    ],
  };
}

function circuitDay(): RoutineDay {
  return {
    id: "day-1",
    name: "Circuito",
    exercises: [
      {
        superset: [
          { exercise: "squat", sets: [{ reps: 12 }, { reps: 12 }] },
          { exercise: "push-up", sets: [{ reps: 10 }, { reps: 10 }] },
          { exercise: "plank", sets: [{ duration: 45 }, { duration: 45 }] },
        ],
        rest: 60,
      },
    ],
  };
}

describe("buildDayPlan", () => {
  it("emits one step per set for a plain exercise, with rest between sets and null after the last", () => {
    const steps = buildDayPlan(plainExerciseDay());

    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.restAfterSeconds)).toEqual([90, 90, null]);
    expect(steps.map((step) => step.setIndex)).toEqual([0, 1, 2]);
    expect(steps[0].itemIndex).toBe(0);
    expect(steps[0].memberIndex).toBe(0);
    expect(steps[0].primaryExerciseKey).toBe("bench-press");
    expect(steps[0].alternatives).toEqual(["dumbbell-press"]);
    expect(steps[0].plannedSet).toEqual({ reps: 12, weight: 20 });
  });

  it("alternates superset members within a round, resting only after the last member of non-final rounds", () => {
    const steps = buildDayPlan(supersetDay());

    expect(steps).toHaveLength(6);
    expect(steps.map((step) => step.primaryExerciseKey)).toEqual([
      "biceps-curl",
      "triceps-pushdown",
      "biceps-curl",
      "triceps-pushdown",
      "biceps-curl",
      "triceps-pushdown",
    ]);
    expect(steps.map((step) => step.memberIndex)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(steps.map((step) => step.setIndex)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(steps.map((step) => step.restAfterSeconds)).toEqual([
      null,
      90,
      null,
      90,
      null,
      null,
    ]);
    expect(steps[0].alternatives).toEqual(["hammer-curl"]);
    expect(steps[1].alternatives).toEqual([]);
  });

  it("handles a 3-member circuit, resting only after the full first round", () => {
    const steps = buildDayPlan(circuitDay());

    expect(steps).toHaveLength(6);
    expect(steps.map((step) => step.primaryExerciseKey)).toEqual([
      "squat",
      "push-up",
      "plank",
      "squat",
      "push-up",
      "plank",
    ]);
    expect(steps.map((step) => step.restAfterSeconds)).toEqual([
      null,
      null,
      60,
      null,
      null,
      null,
    ]);
  });

  it("flattens a mixed day from the example routine with null rest at every item boundary", () => {
    const routine = parseRoutine(fullbody3d);
    const dayB = routine.days[1];

    const steps = buildDayPlan(dayB);

    // deadlift (4) + overhead-press (3) + lat-pulldown (3) + superset 2×3 (6)
    expect(steps).toHaveLength(16);

    expect(steps[3].primaryExerciseKey).toBe("deadlift");
    expect(steps[3].restAfterSeconds).toBeNull();
    expect(steps[4].primaryExerciseKey).toBe("overhead-press");
    expect(steps[4].restAfterSeconds).toBe(90);
    expect(steps[6].restAfterSeconds).toBeNull();
    expect(steps[9].primaryExerciseKey).toBe("lat-pulldown");
    expect(steps[9].restAfterSeconds).toBeNull();

    const supersetSteps = steps.slice(10);
    expect(supersetSteps.map((step) => step.primaryExerciseKey)).toEqual([
      "biceps-curl",
      "triceps-pushdown",
      "biceps-curl",
      "triceps-pushdown",
      "biceps-curl",
      "triceps-pushdown",
    ]);
    expect(supersetSteps.map((step) => step.restAfterSeconds)).toEqual([
      null,
      75,
      null,
      75,
      null,
      null,
    ]);
    expect(supersetSteps.every((step) => step.itemIndex === 3)).toBe(true);
  });
});

describe("swapKey", () => {
  it("builds the item:member identity", () => {
    expect(swapKey(0, 0)).toBe("0:0");
    expect(swapKey(3, 1)).toBe("3:1");
  });
});

describe("resolvePrefill", () => {
  it("uses the last-used values at the exact set index", () => {
    const prefill = resolvePrefill(
      { reps: 10, weight: 40 },
      [
        { reps: 10, weight: 42.5 },
        { reps: 8, weight: 45 },
      ],
      1,
    );

    expect(prefill).toEqual({ reps: 8, weight: 45 });
  });

  it("falls back to the last known value for extra sets", () => {
    const prefill = resolvePrefill(
      { reps: 10, weight: 40 },
      [
        { reps: 10, weight: 42.5 },
        { reps: 8, weight: 45 },
      ],
      4,
    );

    expect(prefill).toEqual({ reps: 8, weight: 45 });
  });

  it("uses the routine values when history is undefined", () => {
    const prefill = resolvePrefill({ reps: 10, weight: 40 }, undefined, 0);

    expect(prefill).toEqual({ reps: 10, weight: 40 });
  });

  it("uses the routine values when history is empty", () => {
    const prefill = resolvePrefill({ reps: 10, weight: 40 }, [], 0);

    expect(prefill).toEqual({ reps: 10, weight: 40 });
  });

  it("keeps planned reps when the history entry is duration-only, overlaying its weight", () => {
    const prefill = resolvePrefill(
      { reps: 10, weight: 40 },
      [{ duration: 45, weight: 12 }],
      0,
    );

    expect(prefill).toEqual({ reps: 10, weight: 12 });
  });

  it("keeps planned duration when the history entry is reps-only, overlaying its weight", () => {
    const prefill = resolvePrefill(
      { duration: 45, weight: 10 },
      [{ reps: 12, weight: 8 }],
      0,
    );

    expect(prefill).toEqual({ duration: 45, weight: 8 });
  });

  it("keeps weight undefined for bodyweight sets with no weight anywhere", () => {
    const prefill = resolvePrefill({ reps: 12 }, [{ reps: 15 }], 0);

    expect(prefill).toEqual({ reps: 15 });
    expect("weight" in prefill).toBe(false);
  });
});

describe("computeSummary", () => {
  it("sums reps × weight over sets having both, counting all sets", () => {
    const summary = computeSummary([
      { reps: 10, weight: 40 },
      { reps: 8, weight: 45 },
      { reps: 12 },
      { duration: 45 },
      { duration: 60, weight: 10 },
    ]);

    expect(summary).toEqual({ setsCompleted: 5, totalVolume: 760 });
  });

  it("returns zeros for an empty session", () => {
    expect(computeSummary([])).toEqual({ setsCompleted: 0, totalVolume: 0 });
  });
});
