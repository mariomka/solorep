import { describe, expect, it } from "vitest";
import fullbody3d from "../../examples/fullbody-3d.json";
import type { RoutineDay } from "./routine-schema";
import { parseRoutine } from "./routine-schema";
import type { WorkoutStep } from "./session-plan";
import {
  appendPostponedItems,
  buildDayPlan,
  computeSummary,
  findItemStartIndex,
  findNextSlotStepIndex,
  isPostponedOrderValid,
  resolveItemIndexesBefore,
  resolveItemOrder,
  resolveNextSlotExerciseKey,
  resolvePostponeAvailability,
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

/** Five plain items whose set counts and rests identify each block. */
function fiveItemDay(): RoutineDay {
  const exerciseKeys = [
    "bench-press",
    "overhead-press",
    "lat-pulldown",
    "barbell-row",
    "biceps-curl",
  ];

  return {
    id: "day-1",
    name: "Cinco ejercicios",
    exercises: exerciseKeys.map((exercise, itemIndex) => ({
      exercise,
      rest: (itemIndex + 1) * 10,
      sets: Array.from({ length: itemIndex + 1 }, (_set, setIndex) => ({
        reps: 10 + setIndex,
      })),
    })),
  };
}

/** Three items where the middle one is a 2-member, 3-round superset. */
function supersetInTheMiddleDay(): RoutineDay {
  return {
    id: "day-1",
    name: "Superserie intermedia",
    exercises: [
      { exercise: "bench-press", rest: 90, sets: [{ reps: 10 }] },
      {
        superset: [
          {
            exercise: "biceps-curl",
            sets: [{ reps: 12 }, { reps: 12 }, { reps: 10 }],
          },
          {
            exercise: "triceps-pushdown",
            sets: [{ reps: 12 }, { reps: 12 }, { reps: 10 }],
          },
        ],
        rest: 75,
      },
      { exercise: "plank", rest: 60, sets: [{ duration: 45 }] },
    ],
  };
}

/**
 * The real routines' shape: single-set warm-ups, multi-set work, single-set
 * stretches. The single-set detail is the crux -- a 1-set item's first set is
 * also its only one, so the first-set postpone guard alone would offer
 * "Aplazar" on every stretch.
 *
 * Item blocks: 0-1 warm-up (1 step each), 2 work (3), 3 work (2), 4 work (2),
 * 5-6 cool-down (1 each) -- 11 steps, natural block starts 0, 1, 2, 5, 7, 9, 10.
 */
function phasedDay(): RoutineDay {
  return {
    id: "day-1",
    name: "Con fases",
    exercises: [
      {
        phase: "warmup",
        exercise: "jumping-jacks",
        rest: 0,
        sets: [{ reps: 30 }],
      },
      { phase: "warmup", exercise: "cat-cow", rest: 0, sets: [{ reps: 10 }] },
      {
        exercise: "belt-squat",
        rest: 120,
        sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
      },
      { exercise: "chest-press", rest: 90, sets: [{ reps: 10 }, { reps: 10 }] },
      { exercise: "leg-press", rest: 90, sets: [{ reps: 12 }, { reps: 12 }] },
      {
        phase: "cooldown",
        exercise: "quad-stretch",
        rest: 0,
        sets: [{ duration: 30 }],
      },
      {
        phase: "cooldown",
        exercise: "lat-stretch",
        rest: 0,
        sets: [{ duration: 30 }],
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

describe("buildDayPlan with postponed items", () => {
  const naturalItemIndexes = [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4];

  it("moves a postponed block to the end keeping its natural item identity", () => {
    const day = fiveItemDay();
    const naturalPlan = buildDayPlan(day);

    const steps = buildDayPlan(day, [1]);

    expect(steps).toHaveLength(naturalPlan.length);
    expect(steps.map((step) => step.itemIndex)).toEqual([
      0, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 1, 1,
    ]);
    // The moved block keeps its own exercise, set indexes, and rests.
    const postponedBlock = steps.slice(13);
    expect(postponedBlock.map((step) => step.primaryExerciseKey)).toEqual([
      "overhead-press",
      "overhead-press",
    ]);
    expect(postponedBlock.map((step) => step.setIndex)).toEqual([0, 1]);
    expect(postponedBlock.map((step) => step.restAfterSeconds)).toEqual([
      20,
      null,
    ]);
    // Rest stays per item, so the block that now ends the day is unchanged.
    expect(steps.map((step) => step.restAfterSeconds)).toEqual([
      null,
      30,
      30,
      null,
      40,
      40,
      40,
      null,
      50,
      50,
      50,
      50,
      null,
      20,
      null,
    ]);
  });

  it("appends several postponed blocks in postponement order", () => {
    const steps = buildDayPlan(fiveItemDay(), [1, 2]);

    expect(steps.map((step) => step.itemIndex)).toEqual([
      0, 3, 3, 3, 3, 4, 4, 4, 4, 4, 1, 1, 2, 2, 2,
    ]);
  });

  it("respects a queue whose order differs from the natural one", () => {
    const steps = buildDayPlan(fiveItemDay(), [2, 1]);

    expect(steps.map((step) => step.itemIndex)).toEqual([
      0, 3, 3, 3, 3, 4, 4, 4, 4, 4, 2, 2, 2, 1, 1,
    ]);
  });

  it("falls back to the natural order for an invalid queue", () => {
    const day = fiveItemDay();

    for (const invalidQueue of [[9], [1, 1], [-1], [1.5]]) {
      const steps = buildDayPlan(day, invalidQueue);

      expect(steps.map((step) => step.itemIndex)).toEqual(naturalItemIndexes);
    }
  });
});

describe("isPostponedOrderValid", () => {
  it("accepts an absent, empty, or valid queue", () => {
    const day = fiveItemDay();

    expect(isPostponedOrderValid(day, undefined)).toBe(true);
    expect(isPostponedOrderValid(day, [])).toBe(true);
    expect(isPostponedOrderValid(day, [4, 0])).toBe(true);
  });

  it("rejects out-of-range, duplicate, negative, and fractional entries", () => {
    const day = fiveItemDay();

    expect(isPostponedOrderValid(day, [5])).toBe(false);
    expect(isPostponedOrderValid(day, [1, 1])).toBe(false);
    expect(isPostponedOrderValid(day, [-1])).toBe(false);
    expect(isPostponedOrderValid(day, [1.5])).toBe(false);
  });
});

describe("resolveItemOrder", () => {
  it("lists pending items in natural order followed by the postponed queue", () => {
    const day = fiveItemDay();

    expect(resolveItemOrder(day, undefined)).toEqual([0, 1, 2, 3, 4]);
    expect(resolveItemOrder(day, [1, 3])).toEqual([0, 2, 4, 1, 3]);
    expect(resolveItemOrder(day, [9])).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("appendPostponedItems", () => {
  it("appends new items to the queue tail", () => {
    expect(appendPostponedItems([], [1])).toEqual([1]);
    expect(appendPostponedItems([1], [3])).toEqual([1, 3]);
  });

  it("moves an already postponed item to the end", () => {
    expect(appendPostponedItems([1, 2], [1])).toEqual([2, 1]);
  });

  it("keeps the argument order when appending several items", () => {
    expect(appendPostponedItems([4], [2, 0])).toEqual([4, 2, 0]);
  });
});

describe("findItemStartIndex", () => {
  it("finds the block start in the reordered plan and -1 when absent", () => {
    const plan = buildDayPlan(fiveItemDay(), [1]);

    expect(findItemStartIndex(plan, 1)).toBe(13);
    expect(findItemStartIndex(plan, 2)).toBe(1);
    expect(findItemStartIndex(plan, 9)).toBe(-1);
  });
});

describe("resolveItemIndexesBefore", () => {
  it("returns the intervening blocks in plan order, excluding the target", () => {
    const plan = buildDayPlan(fiveItemDay(), [1]);

    // Plan order is 0, 2, 3, 4, 1: pulling item 1 forward from step 1 has to
    // push everything scheduled in front of it.
    expect(resolveItemIndexesBefore(fiveItemDay(), plan, 1, 1)).toEqual([
      2, 3, 4,
    ]);
    expect(resolveItemIndexesBefore(fiveItemDay(), plan, 4, 4)).toEqual([3]);
  });

  it("returns nothing when the target already sits at the pointer", () => {
    const plan = buildDayPlan(fiveItemDay(), [1]);

    expect(resolveItemIndexesBefore(fiveItemDay(), plan, 1, 2)).toEqual([]);
    expect(resolveItemIndexesBefore(fiveItemDay(), plan, 13, 1)).toEqual([]);
  });
});

describe("resolvePostponeAvailability", () => {
  it("allows a reorder only at the frontier on an item's first step", () => {
    const day = supersetInTheMiddleDay();
    const plan = buildDayPlan(day);
    const availabilityAt = (stepIndex: number, frontier: number) =>
      resolvePostponeAvailability({
        day,
        postponed: [],
        plan,
        stepIndex,
        frontier,
      });

    // Step 1 starts the superset: round 1, member 0.
    expect(availabilityAt(1, 1).canReorderPlan).toBe(true);
    // Step 2 is member 1 of the same round.
    expect(availabilityAt(2, 2).canReorderPlan).toBe(false);
    // Step 3 is member 0 again, but of round 2.
    expect(availabilityAt(3, 3).canReorderPlan).toBe(false);
    // Below the frontier the pointer sits on a correction.
    expect(availabilityAt(1, 2).canReorderPlan).toBe(false);
  });

  it("returns both flags false when the step is out of range", () => {
    const day = supersetInTheMiddleDay();
    const plan = buildDayPlan(day);

    expect(
      resolvePostponeAvailability({
        day,
        postponed: [],
        plan,
        stepIndex: plan.length,
        frontier: plan.length,
      }),
    ).toEqual({
      canReorderPlan: false,
      isReorderRedundant: false,
    });
  });

  it("flags a reorder that would rebuild the very same order", () => {
    const day = supersetInTheMiddleDay();
    const plan = buildDayPlan(day);
    const redundancyAt = (
      currentPlan: WorkoutStep[],
      postponed: number[],
      stepIndex: number,
    ) =>
      resolvePostponeAvailability({
        day,
        postponed,
        plan: currentPlan,
        stepIndex,
        frontier: stepIndex,
      }).isReorderRedundant;

    // The superset can still move behind the plank.
    expect(redundancyAt(plan, [], 1)).toBe(false);
    // Step 7 is the plank, the plan's final block: queueing it changes nothing.
    expect(redundancyAt(plan, [], 7)).toBe(true);

    const reorderedPlan = buildDayPlan(day, [1]);

    // The superset now ends the day: it starts at step 2, after item 0 and
    // the plank, so postponing it again is a no-op.
    expect(redundancyAt(reorderedPlan, [1], 2)).toBe(true);
    // The plank at step 1 still has the queued superset to swap places with.
    expect(redundancyAt(reorderedPlan, [1], 1)).toBe(false);
  });
});

describe("findNextSlotStepIndex", () => {
  it("returns the first step of the next slot, -1 on the day's last slot", () => {
    const plan = buildDayPlan(supersetInTheMiddleDay());

    // Step 0 is item 0's only set; the superset's first member follows.
    expect(findNextSlotStepIndex(plan, 0)).toBe(1);
    // Inside a round the next slot is the other member, and the next round
    // starts the first member's slot again.
    expect(findNextSlotStepIndex(plan, 1)).toBe(2);
    expect(findNextSlotStepIndex(plan, 2)).toBe(3);
    // Step 6 closes the superset; step 7 is the plank, the day's last slot.
    expect(findNextSlotStepIndex(plan, 6)).toBe(7);
    expect(findNextSlotStepIndex(plan, 7)).toBe(-1);
    expect(findNextSlotStepIndex(plan, plan.length)).toBe(-1);
  });

  it("follows the reordered plan after a postponement", () => {
    const plan = buildDayPlan(supersetInTheMiddleDay(), [1]);

    // Order is item 0, the plank, then the postponed superset (step 2).
    expect(findNextSlotStepIndex(plan, 1)).toBe(2);
  });
});

describe("resolveNextSlotExerciseKey", () => {
  function twoExerciseDay(): RoutineDay {
    return {
      id: "day-1",
      name: "Empuje",
      exercises: [
        {
          exercise: "bench-press",
          rest: 90,
          sets: [{ reps: 12 }, { reps: 10 }],
        },
        {
          exercise: "overhead-press",
          alternatives: ["dumbbell-shoulder-press"],
          rest: 90,
          sets: [{ reps: 10 }],
        },
      ],
    };
  }

  it("returns the next exercise while inside an earlier exercise's sets", () => {
    const plan = buildDayPlan(twoExerciseDay());

    expect(resolveNextSlotExerciseKey(plan, 0, {})).toBe("overhead-press");
    expect(resolveNextSlotExerciseKey(plan, 1, {})).toBe("overhead-press");
  });

  it("returns undefined on the day's last slot", () => {
    const plan = buildDayPlan(twoExerciseDay());

    expect(resolveNextSlotExerciseKey(plan, 2, {})).toBeUndefined();
  });

  it("applies the session swap of the upcoming slot", () => {
    const plan = buildDayPlan(twoExerciseDay());

    expect(
      resolveNextSlotExerciseKey(plan, 0, {
        "1:0": "dumbbell-shoulder-press",
      }),
    ).toBe("dumbbell-shoulder-press");
  });

  it("alternates members within a superset", () => {
    const plan = buildDayPlan(supersetDay());

    expect(resolveNextSlotExerciseKey(plan, 0, {})).toBe("triceps-pushdown");
    expect(resolveNextSlotExerciseKey(plan, 1, {})).toBe("biceps-curl");
    expect(resolveNextSlotExerciseKey(plan, 4, {})).toBe("triceps-pushdown");
    expect(resolveNextSlotExerciseKey(plan, 5, {})).toBeUndefined();
  });

  it("returns undefined when the current step is out of range", () => {
    const plan = buildDayPlan(twoExerciseDay());

    expect(resolveNextSlotExerciseKey(plan, 3, {})).toBeUndefined();
  });

  it("follows the reordered plan after a postponement", () => {
    const plan = buildDayPlan(fiveItemDay(), [1]);

    // Item 4 now closes the scheduled blocks (steps 8-12) and is followed by
    // the postponed item 1.
    expect(resolveNextSlotExerciseKey(plan, 12, {})).toBe("overhead-press");
    expect(resolveNextSlotExerciseKey(plan, 0, {})).toBe("lat-pulldown");
    expect(resolveNextSlotExerciseKey(plan, 14, {})).toBeUndefined();
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

  describe("with a session precedent", () => {
    const plannedFirstSet = { reps: 10, weight: 50 };

    it("carries a deviated weight over to the next set", () => {
      const prefill = resolvePrefill({ reps: 8, weight: 60 }, undefined, 1, {
        plannedSet: plannedFirstSet,
        setIndex: 0,
        weight: 55,
      });

      expect(prefill).toEqual({ reps: 8, weight: 55 });
    });

    it("keeps the planned progression when the prefilled weight was confirmed", () => {
      const prefill = resolvePrefill({ reps: 8, weight: 60 }, undefined, 1, {
        plannedSet: plannedFirstSet,
        setIndex: 0,
        weight: 50,
      });

      expect(prefill).toEqual({ reps: 8, weight: 60 });
    });

    it("judges deviation against the last-used baseline, not the plan", () => {
      const lastUsedSets = [
        { reps: 10, weight: 52.5 },
        { reps: 8, weight: 55 },
      ];

      const confirmed = resolvePrefill(
        { reps: 8, weight: 60 },
        lastUsedSets,
        1,
        { plannedSet: plannedFirstSet, setIndex: 0, weight: 52.5 },
      );
      expect(confirmed).toEqual({ reps: 8, weight: 55 });

      const deviated = resolvePrefill(
        { reps: 8, weight: 60 },
        lastUsedSets,
        1,
        { plannedSet: plannedFirstSet, setIndex: 0, weight: 57.5 },
      );
      expect(deviated).toEqual({ reps: 8, weight: 57.5 });
    });

    it("carries a removed weight over as bodyweight", () => {
      const prefill = resolvePrefill({ reps: 8, weight: 60 }, undefined, 1, {
        plannedSet: plannedFirstSet,
        setIndex: 0,
        weight: undefined,
      });

      expect(prefill).toEqual({ reps: 8 });
      expect("weight" in prefill).toBe(false);
    });
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

describe("day item phases", () => {
  /** Item index of every step, in plan order, deduped into block order. */
  function blockOrderOf(plan: WorkoutStep[]): number[] {
    return plan
      .filter(
        (step, stepIndex) => plan[stepIndex - 1]?.itemIndex !== step.itemIndex,
      )
      .map((step) => step.itemIndex);
  }

  function availabilityAt(
    day: RoutineDay,
    postponed: number[],
    stepIndex: number,
  ) {
    const plan = buildDayPlan(day, postponed);
    return resolvePostponeAvailability({
      day,
      postponed,
      plan,
      stepIndex,
      frontier: stepIndex,
    });
  }

  it("lands a postponed work item before the cool-down, not at the end of the day", () => {
    const day = phasedDay();

    expect(resolveItemOrder(day, [2])).toEqual([0, 1, 3, 4, 2, 5, 6]);
    expect(blockOrderOf(buildDayPlan(day, [2]))).toEqual([0, 1, 3, 4, 2, 5, 6]);
    // Two queued items keep their postponement order, still ahead of the
    // stretches.
    expect(resolveItemOrder(day, [2, 3])).toEqual([0, 1, 4, 2, 3, 5, 6]);
  });

  it("appends at the end of a day that has no cool-down", () => {
    // fiveItemDay has no phases, so every item is work and the queue is the
    // plan's tail -- the behavior that predates phases.
    expect(resolveItemOrder(fiveItemDay(), [1])).toEqual([0, 2, 3, 4, 1]);
  });

  it("refuses to postpone a warm-up or a stretch even though each is a single set", () => {
    const day = phasedDay();

    // Block starts: warm-ups at steps 0 and 1, stretches at steps 9 and 10.
    expect(availabilityAt(day, [], 0).canReorderPlan).toBe(false);
    expect(availabilityAt(day, [], 1).canReorderPlan).toBe(false);
    expect(availabilityAt(day, [], 9).canReorderPlan).toBe(false);
    expect(availabilityAt(day, [], 10).canReorderPlan).toBe(false);
    // The work items in between are postponable.
    expect(availabilityAt(day, [], 2).canReorderPlan).toBe(true);
    expect(availabilityAt(day, [], 5).canReorderPlan).toBe(true);
  });

  it("refuses to postpone a work item that sits after a cool-down", () => {
    // Postponing it would land it before the cool-down -- backwards, below the
    // pointer, where the completed entries keyed by stepIndex live.
    const strandedWorkDay: RoutineDay = {
      id: "day-1",
      name: "Trabajo tras el estiramiento",
      exercises: [
        { exercise: "belt-squat", rest: 90, sets: [{ reps: 8 }] },
        {
          phase: "cooldown",
          exercise: "quad-stretch",
          rest: 0,
          sets: [{ duration: 30 }],
        },
        { exercise: "leg-press", rest: 90, sets: [{ reps: 12 }] },
      ],
    };

    expect(availabilityAt(strandedWorkDay, [], 0).canReorderPlan).toBe(true);
    expect(availabilityAt(strandedWorkDay, [], 2).canReorderPlan).toBe(false);
  });

  it("flags postponing the last work item as redundant", () => {
    const day = phasedDay();

    // Item 4 is the last work item: the queue lands exactly where it sits.
    expect(availabilityAt(day, [], 7).isReorderRedundant).toBe(true);
    // Item 2 still has work behind it to move past.
    expect(availabilityAt(day, [], 2).isReorderRedundant).toBe(false);
  });

  it("is not redundant when a queued item can slide into place", () => {
    const day = phasedDay();
    // Queue holds item 2, so the order is 0, 1, 3, 4, 2, 5, 6 and item 4's
    // block starts at step 4. Postponing 4 lets 2 slide forward.
    expect(resolveItemOrder(day, [2, 4])).toEqual([0, 1, 3, 2, 4, 5, 6]);
    expect(availabilityAt(day, [2], 4).isReorderRedundant).toBe(false);
  });

  it("rejects a queue holding anything but work items", () => {
    const day = phasedDay();

    expect(isPostponedOrderValid(day, [2, 3])).toBe(true);
    expect(isPostponedOrderValid(day, [0])).toBe(false); // warm-up
    expect(isPostponedOrderValid(day, [5])).toBe(false); // cool-down
    expect(isPostponedOrderValid(day, [2, 5])).toBe(false);
    // An invalid queue is ignored rather than trusted.
    expect(resolveItemOrder(day, [5])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(blockOrderOf(buildDayPlan(day, [0, 2]))).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("never pushes a warm-up or a stretch into the queue when pulling an item forward", () => {
    // Non-canonical order: the warm-up at item 2 sits between two work items,
    // so with item 0 queued it lands between the pointer and the queued block
    // -- the only way a non-work item is ever in the scanned range.
    const warmupBetweenWorkDay: RoutineDay = {
      id: "day-1",
      name: "Calentamiento intercalado",
      exercises: [
        { exercise: "belt-squat", rest: 90, sets: [{ reps: 8 }] },
        { exercise: "chest-press", rest: 90, sets: [{ reps: 10 }] },
        { phase: "warmup", exercise: "cat-cow", rest: 0, sets: [{ reps: 10 }] },
        { exercise: "leg-press", rest: 90, sets: [{ reps: 12 }] },
        {
          phase: "cooldown",
          exercise: "quad-stretch",
          rest: 0,
          sets: [{ duration: 30 }],
        },
      ],
    };
    const plan = buildDayPlan(warmupBetweenWorkDay, [0]);
    expect(blockOrderOf(plan)).toEqual([1, 2, 3, 0, 4]);

    // Pulling item 0 back to the pointer pushes the work in front of it, and
    // must leave the warm-up out: queueing it would make the whole queue
    // invalid, silently dropping every postponement made so far.
    const itemIndexesBefore = resolveItemIndexesBefore(
      warmupBetweenWorkDay,
      plan,
      0,
      0,
    );
    expect(itemIndexesBefore).not.toContain(2);
    expect(itemIndexesBefore).toEqual([1, 3]);
  });
});
