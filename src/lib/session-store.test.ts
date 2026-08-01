import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { db } from "./db";
import { parseRoutine } from "./routine-schema";
import {
  clearRest,
  discardActiveSession,
  finishSession,
  getActiveSession,
  recordSetCompletion,
  recordSwap,
  setPostponedItems,
  startSession,
} from "./session-store";

const routine = parseRoutine(fullbody3d);

function completionIdentity(
  primaryExerciseKey: string,
  slotKey = "0:0",
): { slotKey: string; primaryExerciseKey: string } {
  return { slotKey, primaryExerciseKey };
}

beforeEach(clearDatabase);

describe("startSession", () => {
  it("creates the singleton row and a second start overwrites it", async () => {
    await startSession("fullbody-3d", "day-1", 0);

    const first = await getActiveSession();
    expect(first).toMatchObject({
      id: "current",
      routineId: "fullbody-3d",
      dayId: "day-1",
      dayIndex: 0,
      currentStepIndex: 0,
      swaps: {},
      postponed: [],
      completed: [],
    });

    await startSession("upper-lower", "day-2", 1);

    await expect(db.activeSession.count()).resolves.toBe(1);
    const second = await getActiveSession();
    expect(second).toMatchObject({
      id: "current",
      routineId: "upper-lower",
      dayId: "day-2",
      dayIndex: 1,
      currentStepIndex: 0,
      swaps: {},
      postponed: [],
      completed: [],
    });
  });
});

describe("recordSetCompletion", () => {
  it("writes the completed entry, and re-recording a step overwrites it without regressing the frontier", async () => {
    await startSession("fullbody-3d", "day-1", 0);

    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });

    const afterFirst = await getActiveSession();
    expect(afterFirst?.completed).toHaveLength(1);
    expect(afterFirst?.completed[0]).toMatchObject({
      stepIndex: 0,
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });
    expect(afterFirst?.currentStepIndex).toBe(1);

    // Advance the frontier, then back-edit step 0.
    await recordSetCompletion({
      stepIndex: 1,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 1,
      reps: 8,
      weight: 55,
    });
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 12,
      weight: 45,
    });

    const afterBackEdit = await getActiveSession();
    expect(afterBackEdit?.completed).toHaveLength(2);
    const editedEntry = afterBackEdit?.completed.find(
      (entry) => entry.stepIndex === 0,
    );
    expect(editedEntry).toMatchObject({ reps: 12, weight: 45 });
    expect(afterBackEdit?.currentStepIndex).toBe(2);
  });

  it("does not touch lastUsed: that write belongs to finishSession", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await db.lastUsed.put({
      exerciseKey: "back-squat",
      sets: [{ reps: 5, weight: 100 }],
      updatedAt: 123,
    });

    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });
    await recordSetCompletion({
      stepIndex: 1,
      ...completionIdentity("bench-press", "1:0"),
      exerciseKey: "bench-press",
      setIndex: 0,
      reps: 8,
      weight: 40,
    });

    const existingRecord = await db.lastUsed.get("back-squat");
    expect(existingRecord).toEqual({
      exerciseKey: "back-squat",
      sets: [{ reps: 5, weight: 100 }],
      updatedAt: 123,
    });
    await expect(db.lastUsed.get("bench-press")).resolves.toBeUndefined();
  });

  it("stores the rest deadline and drops it on a completion without one", async () => {
    await startSession("fullbody-3d", "day-1", 0);

    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      restEndsAt: 1_234_567,
    });

    const resting = await getActiveSession();
    expect(resting?.restEndsAt).toBe(1_234_567);

    await recordSetCompletion({
      stepIndex: 1,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 1,
      reps: 8,
    });

    const afterSecond = await getActiveSession();
    expect(afterSecond).toBeDefined();
    expect(afterSecond !== undefined && "restEndsAt" in afterSecond).toBe(
      false,
    );
  });
});

describe("clearRest", () => {
  it("removes only the rest deadline", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      restEndsAt: 1_234_567,
    });

    await clearRest();

    const session = await getActiveSession();
    expect(session).toBeDefined();
    expect(session !== undefined && "restEndsAt" in session).toBe(false);
    expect(session?.completed).toHaveLength(1);
    expect(session?.currentStepIndex).toBe(1);
  });

  it("is a no-op without a session or without a deadline", async () => {
    await expect(clearRest()).resolves.toBeUndefined();

    await startSession("fullbody-3d", "day-1", 0);
    const before = await getActiveSession();
    await clearRest();
    const after = await getActiveSession();
    expect(after).toEqual(before);
  });
});

describe("recordSwap", () => {
  it("sets a swap entry and clears it with null", async () => {
    await startSession("fullbody-3d", "day-1", 0);

    await recordSwap(2, 0, "front-squat");
    await recordSwap(3, 1, "leg-press");

    const afterSet = await getActiveSession();
    expect(afterSet?.swaps).toEqual({
      "2:0": "front-squat",
      "3:1": "leg-press",
    });

    await recordSwap(2, 0, null);

    const afterClear = await getActiveSession();
    expect(afterClear?.swaps).toEqual({ "3:1": "leg-press" });
  });
});

describe("setPostponedItems", () => {
  it("stores the queue without touching the pointer or the completed entries", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });
    const before = await getActiveSession();

    await setPostponedItems([2, 1]);

    const after = await getActiveSession();
    expect(after?.postponed).toEqual([2, 1]);
    expect(after?.currentStepIndex).toBe(before?.currentStepIndex);
    expect(after?.completed).toEqual(before?.completed);
    expect(after?.swaps).toEqual(before?.swaps);
    expect(after?.updatedAt).toBeGreaterThanOrEqual(before?.updatedAt ?? 0);
  });

  it("replaces the persisted queue wholesale, repairing a stale one", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    // A queue the plan would never apply (duplicated, out of range).
    await db.activeSession.update("current", { postponed: [9, 9] });

    await setPostponedItems([1]);

    const session = await getActiveSession();
    expect(session?.postponed).toEqual([1]);
  });

  it("throws without an active session", async () => {
    await expect(setPostponedItems([1])).rejects.toThrow(
      "No active session to postpone items in.",
    );
  });

  it("preserves a persisted rest deadline", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      restEndsAt: 1_234_567,
    });

    await setPostponedItems([1]);

    const session = await getActiveSession();
    expect(session?.restEndsAt).toBe(1_234_567);
  });
});

describe("finishSession", () => {
  beforeEach(async () => {
    await db.routines.put({
      id: routine.id,
      routine,
      importedAt: Date.now(),
    });
  });

  it("archives the session without stepIndex, advances progress, and deletes the singleton", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });

    await finishSession();

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      routineId: "fullbody-3d",
      dayId: "day-1",
    });
    expect(sessions[0].entries).toHaveLength(1);
    expect(sessions[0].entries[0]).toMatchObject({
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });
    expect(sessions[0].entries[0]).not.toHaveProperty("stepIndex");
    expect(sessions[0].entries[0]).not.toHaveProperty("slotKey");
    expect(sessions[0].entries[0]).not.toHaveProperty("primaryExerciseKey");

    const progress = await db.progress.get("fullbody-3d");
    expect(progress?.currentDayIndex).toBe(1);

    await expect(db.activeSession.count()).resolves.toBe(0);
  });

  it("wraps progress back to day 0 when finishing the last day", async () => {
    await startSession("fullbody-3d", "day-3", 2);

    await finishSession();

    const progress = await db.progress.get("fullbody-3d");
    expect(progress?.currentDayIndex).toBe(0);
  });

  it("advances from the completed day id in the latest shortened and reordered routine", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    const latestRoutine = {
      ...routine,
      days: [routine.days[2], routine.days[0]],
    };
    await db.routines.put({
      id: latestRoutine.id,
      routine: latestRoutine,
      importedAt: Date.now(),
    });

    await finishSession();

    const progress = await db.progress.get("fullbody-3d");
    expect(progress?.currentDayIndex).toBe(0);
  });

  it("leaves every table unchanged when the completed day no longer exists", async () => {
    await db.progress.put({
      routineId: "fullbody-3d",
      currentDayIndex: 2,
    });
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });
    const latestRoutine = {
      ...routine,
      days: routine.days.slice(1),
    };
    await db.routines.put({
      id: latestRoutine.id,
      routine: latestRoutine,
      importedAt: Date.now(),
    });

    await expect(finishSession()).rejects.toThrow("completed day is missing");

    await expect(db.activeSession.count()).resolves.toBe(1);
    await expect(db.sessions.count()).resolves.toBe(0);
    await expect(db.lastUsed.count()).resolves.toBe(0);
    const progress = await db.progress.get("fullbody-3d");
    expect(progress?.currentDayIndex).toBe(2);
  });

  it("derives lastUsed from the completed entries at finish time", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });
    await recordSetCompletion({
      stepIndex: 1,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 1,
      reps: 8,
      weight: 55,
    });
    await recordSetCompletion({
      stepIndex: 2,
      ...completionIdentity("bench-press", "1:0"),
      exerciseKey: "bench-press",
      setIndex: 0,
      reps: 12,
      weight: 30,
    });

    await expect(db.lastUsed.count()).resolves.toBe(0);

    await finishSession();

    const squatRecord = await db.lastUsed.get("back-squat");
    expect(squatRecord?.sets).toEqual([
      { reps: 10, weight: 55 },
      { reps: 8, weight: 55 },
    ]);
    const benchRecord = await db.lastUsed.get("bench-press");
    expect(benchRecord?.sets).toEqual([{ reps: 12, weight: 30 }]);
  });

  it("stores the session's last weight on every set, reps stay per set", async () => {
    // Weight is a per-exercise value: bumping it mid-exercise makes it the
    // weight the whole exercise starts at next session.
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 15,
    });
    await recordSetCompletion({
      stepIndex: 1,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 1,
      reps: 8,
      weight: 20,
    });

    await finishSession();

    const record = await db.lastUsed.get("back-squat");
    expect(record?.sets).toEqual([
      { reps: 10, weight: 20 },
      { reps: 8, weight: 20 },
    ]);
  });

  it("strips the stored weight when the exercise was logged without one", async () => {
    await db.lastUsed.put({
      exerciseKey: "back-squat",
      sets: [
        { reps: 10, weight: 50 },
        { reps: 10, weight: 50 },
      ],
      updatedAt: 123,
    });
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 12,
    });

    await finishSession();

    const record = await db.lastUsed.get("back-squat");
    expect(record?.sets).toEqual([{ reps: 12 }, { reps: 10 }]);
  });

  it("pads lastUsed gaps with the last known value, or the new values when the record had none", async () => {
    await db.lastUsed.put({
      exerciseKey: "bench-press",
      sets: [{ reps: 12, weight: 30 }],
      updatedAt: 123,
    });
    await startSession("fullbody-3d", "day-1", 0);
    // No prior record: gaps below setIndex are padded with the new values.
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 2,
      reps: 10,
      weight: 50,
    });
    // Existing record: gaps are padded with the last known value.
    await recordSetCompletion({
      stepIndex: 1,
      ...completionIdentity("bench-press", "1:0"),
      exerciseKey: "bench-press",
      setIndex: 3,
      reps: 6,
      weight: 40,
    });

    await finishSession();

    const freshRecord = await db.lastUsed.get("back-squat");
    expect(freshRecord?.sets).toEqual([
      { reps: 10, weight: 50 },
      { reps: 10, weight: 50 },
      { reps: 10, weight: 50 },
    ]);
    const paddedRecord = await db.lastUsed.get("bench-press");
    expect(paddedRecord?.sets).toEqual([
      { reps: 12, weight: 40 },
      { reps: 12, weight: 40 },
      { reps: 12, weight: 40 },
      { reps: 6, weight: 40 },
    ]);
  });

  it("writes lastUsed only under the effective key when a set was completed on a swapped alternative", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSwap(0, 0, "leg-press");
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "leg-press",
      setIndex: 0,
      reps: 10,
      weight: 90,
    });

    await finishSession();

    const alternativeRecord = await db.lastUsed.get("leg-press");
    expect(alternativeRecord?.sets).toEqual([{ reps: 10, weight: 90 }]);
    // The primary key never leaks values it did not log.
    await expect(db.lastUsed.get("back-squat")).resolves.toBeUndefined();
  });

  it("attributes every set in a slot to its final alternative after a mid-exercise swap", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });
    await recordSwap(0, 0, "leg-press");
    await recordSetCompletion({
      stepIndex: 1,
      ...completionIdentity("back-squat"),
      exerciseKey: "leg-press",
      setIndex: 1,
      reps: 8,
      weight: 90,
    });

    await finishSession();

    const archivedSession = await db.sessions.toCollection().first();
    expect(archivedSession?.entries).toEqual([
      expect.objectContaining({
        exerciseKey: "leg-press",
        setIndex: 0,
        reps: 10,
        weight: 50,
      }),
      expect.objectContaining({
        exerciseKey: "leg-press",
        setIndex: 1,
        reps: 8,
        weight: 90,
      }),
    ]);
    const alternativeRecord = await db.lastUsed.get("leg-press");
    expect(alternativeRecord?.sets).toEqual([
      { reps: 10, weight: 90 },
      { reps: 8, weight: 90 },
    ]);
    await expect(db.lastUsed.get("back-squat")).resolves.toBeUndefined();
  });

  it("scopes a final swap to one occurrence when the primary key repeats", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });
    await recordSwap(0, 0, "leg-press");
    await recordSetCompletion({
      stepIndex: 1,
      ...completionIdentity("back-squat", "4:0"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 6,
      weight: 70,
    });

    await finishSession();

    const archivedSession = await db.sessions.toCollection().first();
    expect(archivedSession?.entries.map((entry) => entry.exerciseKey)).toEqual([
      "leg-press",
      "back-squat",
    ]);
    await expect(db.lastUsed.get("leg-press")).resolves.toMatchObject({
      sets: [{ reps: 10, weight: 50 }],
    });
    await expect(db.lastUsed.get("back-squat")).resolves.toMatchObject({
      sets: [{ reps: 6, weight: 70 }],
    });
  });

  it("resolves same key + setIndex collisions with the last-completed entry", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    // Two day items hitting the same exercise at the same set index: entries
    // land on different steps but collide in lastUsed.
    await db.activeSession.update("current", {
      completed: [
        {
          stepIndex: 3,
          ...completionIdentity("back-squat", "2:0"),
          exerciseKey: "back-squat",
          setIndex: 0,
          reps: 8,
          weight: 60,
          completedAt: 2_000,
        },
        {
          stepIndex: 0,
          ...completionIdentity("back-squat"),
          exerciseKey: "back-squat",
          setIndex: 0,
          reps: 10,
          weight: 50,
          completedAt: 1_000,
        },
      ],
      currentStepIndex: 4,
    });

    await finishSession();

    const record = await db.lastUsed.get("back-squat");
    expect(record?.sets).toEqual([{ reps: 8, weight: 60 }]);
  });
});

describe("discardActiveSession", () => {
  it("removes only the singleton row and leaves other tables untouched", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await db.progress.put({ routineId: "fullbody-3d", currentDayIndex: 1 });
    await db.lastUsed.put({
      exerciseKey: "back-squat",
      sets: [{ reps: 10, weight: 50 }],
      updatedAt: 123,
    });
    await db.sessions.add({
      routineId: "fullbody-3d",
      dayId: "day-1",
      startedAt: 1,
      finishedAt: 2,
      entries: [],
    });

    await discardActiveSession();

    await expect(db.activeSession.count()).resolves.toBe(0);
    await expect(db.progress.count()).resolves.toBe(1);
    await expect(db.lastUsed.count()).resolves.toBe(1);
    await expect(db.sessions.count()).resolves.toBe(1);
  });

  it("leaves no trace of a discarded session's completed sets", async () => {
    await startSession("fullbody-3d", "day-1", 0);
    await recordSetCompletion({
      stepIndex: 0,
      ...completionIdentity("back-squat"),
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });

    await discardActiveSession();

    await expect(db.activeSession.count()).resolves.toBe(0);
    await expect(db.lastUsed.count()).resolves.toBe(0);
    await expect(db.sessions.count()).resolves.toBe(0);
  });
});
