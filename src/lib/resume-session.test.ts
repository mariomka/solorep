import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "@/test/helpers";
import type { ActiveSessionRecord } from "./db";
import { db } from "./db";
import {
  AUTO_RESUME_WINDOW_MS,
  findAutoResumableSession,
} from "./resume-session";
import type { DayItemPhase } from "./routine-schema";
import { parseRoutine } from "./routine-schema";
import { startSession } from "./session-store";

const routine = parseRoutine({
  id: "mini",
  name: "Mini",
  exercises: { "push-up": { name: "Flexiones" } },
  days: [
    {
      id: "day-1",
      name: "Día 1",
      exercises: [
        { exercise: "push-up", rest: 5, sets: [{ reps: 10 }, { reps: 8 }] },
      ],
    },
  ],
});

async function seedRoutine(): Promise<void> {
  await db.routines.put({
    id: routine.id,
    routine,
    importedAt: Date.now(),
  });
}

/**
 * Three single-set work items. `finalItemPhase` is the migration this change
 * asks routine owners to perform: it keeps the day id, the item count and the
 * plan length, but moves where the postponement queue lands.
 */
async function seedPhasedRoutine(finalItemPhase?: DayItemPhase): Promise<void> {
  const phased = parseRoutine({
    id: "phased",
    name: "Phased",
    exercises: {
      "item-a": { name: "Ejercicio A" },
      "item-b": { name: "Ejercicio B" },
      "item-c": { name: "Ejercicio C" },
    },
    days: [
      {
        id: "phased-day",
        name: "Día con fases",
        exercises: [
          { exercise: "item-a", rest: 60, sets: [{ reps: 10 }] },
          { exercise: "item-b", rest: 60, sets: [{ reps: 10 }] },
          {
            exercise: "item-c",
            phase: finalItemPhase,
            rest: 60,
            sets: [{ reps: 10 }],
          },
        ],
      },
    ],
  });
  await db.routines.put({ id: phased.id, routine: phased, importedAt: 1 });
}

function completedEntryAt(
  stepIndex: number,
  slotKey: string,
  exerciseKey: string,
): ActiveSessionRecord["completed"][number] {
  return {
    stepIndex,
    slotKey,
    primaryExerciseKey: exerciseKey,
    exerciseKey,
    setIndex: 0,
    reps: 10,
    completedAt: Date.now(),
  };
}

beforeEach(clearDatabase);

describe("findAutoResumableSession", () => {
  it("returns the target for a session with recent activity", async () => {
    await seedRoutine();
    await startSession(routine.id, "day-1", 0);

    await expect(findAutoResumableSession()).resolves.toEqual({
      routineId: "mini",
      dayIndex: 0,
    });
  });

  it("returns undefined without an active session", async () => {
    await seedRoutine();

    await expect(findAutoResumableSession()).resolves.toBeUndefined();
  });

  it("returns undefined when the last activity is outside the window", async () => {
    await seedRoutine();
    await startSession(routine.id, "day-1", 0);
    await db.activeSession.update("current", {
      updatedAt: Date.now() - AUTO_RESUME_WINDOW_MS - 1,
    });

    await expect(findAutoResumableSession()).resolves.toBeUndefined();
  });

  it("returns undefined when the postponement queue no longer addresses the day's items", async () => {
    await seedRoutine();
    await startSession(routine.id, "day-1", 0);

    // The day's only item: a valid queue keeps the session resumable.
    await db.activeSession.update("current", { postponed: [0] });
    await expect(findAutoResumableSession()).resolves.toEqual({
      routineId: "mini",
      dayIndex: 0,
    });

    await db.activeSession.update("current", { postponed: [5] });
    await expect(findAutoResumableSession()).resolves.toBeUndefined();

    await db.activeSession.update("current", { postponed: [0, 0] });
    await expect(findAutoResumableSession()).resolves.toBeUndefined();
  });

  it("returns undefined when the pointer is beyond the day's plan", async () => {
    await seedRoutine();
    await startSession(routine.id, "day-1", 0);

    // The day's only item has two sets, so the plan has two steps.
    await db.activeSession.update("current", { currentStepIndex: 2 });
    await expect(findAutoResumableSession()).resolves.toEqual({
      routineId: "mini",
      dayIndex: 0,
    });

    await db.activeSession.update("current", { currentStepIndex: 3 });
    await expect(findAutoResumableSession()).resolves.toBeUndefined();
  });

  it("keeps a postponed session whose completed sets still resolve to their slot", async () => {
    await seedPhasedRoutine();
    await startSession("phased", "phased-day", 0);
    // Postpone A, log the sets of B and C: order is B, C, A, so the entries at
    // steps 0 and 1 belong to B and C.
    await db.activeSession.update("current", {
      postponed: [0],
      currentStepIndex: 2,
      completed: [
        completedEntryAt(0, "1:0", "item-b"),
        completedEntryAt(1, "2:0", "item-c"),
      ],
    });

    await expect(findAutoResumableSession()).resolves.toEqual({
      routineId: "phased",
      dayIndex: 0,
    });
  });

  it("returns undefined when a re-imported phase moves the completed sets onto other exercises", async () => {
    await seedPhasedRoutine();
    await startSession("phased", "phased-day", 0);
    await db.activeSession.update("current", {
      postponed: [0],
      currentStepIndex: 2,
      completed: [
        completedEntryAt(0, "1:0", "item-b"),
        completedEntryAt(1, "2:0", "item-c"),
      ],
    });

    // Same day id, same item count, same plan length: only C's phase changed,
    // which moves the queue's landing point to B, A, C. Step 1 now belongs to
    // A, so C's logged set would silently become A's.
    await seedPhasedRoutine("cooldown");

    await expect(findAutoResumableSession()).resolves.toBeUndefined();
  });

  it("returns undefined when the session no longer matches its routine", async () => {
    await startSession(routine.id, "day-1", 0);

    // No routine record at all.
    await expect(findAutoResumableSession()).resolves.toBeUndefined();

    // A record whose day at the stored index has a different id.
    await seedRoutine();
    await db.activeSession.update("current", { dayId: "day-gone" });
    await expect(findAutoResumableSession()).resolves.toBeUndefined();
  });
});
