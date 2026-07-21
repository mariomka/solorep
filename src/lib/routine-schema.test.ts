import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { parseRoutine, routineSchema } from "./routine-schema";

type RoutineInput = z.input<typeof routineSchema>;

function validRoutine(): RoutineInput {
  return {
    id: "fullbody-3d",
    name: "Full Body — 3 días",
    exercises: {
      "bench-press": { name: "Press banca", datasetId: "0025" },
      "dumbbell-press": { name: "Press mancuernas" },
      plank: { name: "Plancha" },
      "biceps-curl": { name: "Curl bíceps" },
      "hammer-curl": { name: "Curl martillo" },
      "triceps-pushdown": { name: "Extensión tríceps polea" },
    },
    days: [
      {
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
          {
            exercise: "plank",
            rest: 60,
            sets: [{ duration: 45 }, { duration: 45 }],
          },
          {
            superset: [
              {
                exercise: "biceps-curl",
                alternatives: ["hammer-curl"],
                sets: [
                  { reps: 12, weight: 10 },
                  { reps: 10, weight: 12 },
                ],
              },
              {
                exercise: "triceps-pushdown",
                sets: [
                  { reps: 12, weight: 20 },
                  { reps: 10, weight: 25 },
                ],
              },
            ],
            rest: 90,
          },
        ],
      },
    ],
  };
}

describe("routineSchema", () => {
  it("parses a valid routine with exercises, time-based sets and supersets", () => {
    const routine = parseRoutine(validRoutine());

    expect(routine.id).toBe("fullbody-3d");
    expect(routine.days[0].exercises).toHaveLength(3);
  });

  it("rejects a set with both reps and duration", () => {
    const routine = validRoutine();
    routine.days[0].exercises[1] = {
      exercise: "plank",
      rest: 60,
      sets: [{ reps: 10, duration: 45 }],
    };

    expect(routineSchema.safeParse(routine).success).toBe(false);
  });

  it("rejects an exercise key missing from the catalog", () => {
    const routine = validRoutine();
    routine.days[0].exercises.push({
      exercise: "goblet-squat",
      rest: 60,
      sets: [{ reps: 12 }],
    });

    const result = routineSchema.safeParse(routine);

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("goblet-squat");
  });

  it("rejects an alternative key missing from the catalog", () => {
    const routine = validRoutine();
    routine.days[0].exercises[0] = {
      exercise: "bench-press",
      alternatives: ["machine-chest-press"],
      rest: 90,
      sets: [{ reps: 12, weight: 20 }],
    };

    expect(routineSchema.safeParse(routine).success).toBe(false);
  });

  it("rejects superset members with mismatched set counts", () => {
    const routine = validRoutine();
    routine.days[0].exercises[2] = {
      superset: [
        { exercise: "biceps-curl", sets: [{ reps: 12, weight: 10 }] },
        {
          exercise: "triceps-pushdown",
          sets: [
            { reps: 12, weight: 20 },
            { reps: 10, weight: 25 },
          ],
        },
      ],
      rest: 90,
    };

    expect(routineSchema.safeParse(routine).success).toBe(false);
  });

  it("rejects a superset with a single member", () => {
    const routine = validRoutine();
    routine.days[0].exercises[2] = {
      superset: [{ exercise: "biceps-curl", sets: [{ reps: 12 }] }],
      rest: 90,
    };

    expect(routineSchema.safeParse(routine).success).toBe(false);
  });

  it("rejects non-kebab-case exercise keys", () => {
    const routine = validRoutine();
    routine.exercises["Bench Press"] = { name: "Press banca" };

    expect(routineSchema.safeParse(routine).success).toBe(false);
  });

  it("rejects empty sets", () => {
    const routine = validRoutine();
    routine.days[0].exercises[1] = { exercise: "plank", rest: 60, sets: [] };

    expect(routineSchema.safeParse(routine).success).toBe(false);
  });
});
