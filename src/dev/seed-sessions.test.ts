import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { clearDatabase } from "@/test/helpers";
import { seedSessions } from "./seed-sessions";

const routine = {
  id: "seed-routine",
  name: "Seed",
  exercises: {
    "bench-press": { name: "Press banca" },
    plank: { name: "Plancha" },
  },
  days: [
    {
      id: "day-1",
      name: "Día 1",
      exercises: [
        {
          exercise: "bench-press",
          rest: 90,
          sets: [
            { reps: 10, weight: 20 },
            { reps: 8, weight: 20 },
          ],
        },
        { exercise: "plank", rest: 60, sets: [{ duration: 45 }] },
      ],
    },
  ],
};

describe("seedSessions", () => {
  beforeEach(clearDatabase);

  it("replaces sessions with one per routine day per week, ramping weight", async () => {
    await db.routines.add({
      id: routine.id,
      routine,
      importedAt: Date.now(),
    });
    await db.sessions.add({
      routineId: "old",
      dayId: "old",
      startedAt: 1,
      finishedAt: 2,
      entries: [],
    });

    const count = await seedSessions(4);

    expect(count).toBe(4);
    const sessions = await db.sessions.orderBy("finishedAt").toArray();
    expect(sessions).toHaveLength(4);
    expect(sessions.every((s) => s.routineId === routine.id)).toBe(true);

    const benchWeights = sessions.map(
      (s) => s.entries.find((e) => e.exerciseKey === "bench-press")?.weight,
    );
    expect(benchWeights).toEqual([20, 20, 22.5, 22.5]);

    const finishTimes = sessions.map((s) => s.finishedAt);
    expect(finishTimes).toEqual([...finishTimes].sort((a, b) => a - b));
    expect(finishTimes.every((t) => t < Date.now())).toBe(true);
  });

  it("throws when no routine is imported", async () => {
    await expect(seedSessions()).rejects.toThrow(/import a routine/i);
  });
});
