import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabase,
  makeMalformedRoutineFile,
  makeRoutineFile,
} from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { db } from "./db";
import { deleteRoutine, importRoutineFromFile } from "./routine-store";

beforeEach(clearDatabase);

describe("importRoutineFromFile", () => {
  it("imports a valid routine and initializes progress at day 0", async () => {
    const result = await importRoutineFromFile(makeRoutineFile(fullbody3d));

    expect(result.ok).toBe(true);
    await expect(db.routines.count()).resolves.toBe(1);

    const progress = await db.progress.get("fullbody-3d");
    expect(progress).toEqual({
      routineId: "fullbody-3d",
      currentDayIndex: 0,
    });
  });

  it("re-imports the same routine keeping in-range progress and unrelated data", async () => {
    await importRoutineFromFile(makeRoutineFile(fullbody3d));
    await db.progress.put({ routineId: "fullbody-3d", currentDayIndex: 2 });
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

    const renamed = structuredClone(fullbody3d);
    renamed.name = "Full Body renombrada";
    const result = await importRoutineFromFile(makeRoutineFile(renamed));

    expect(result.ok).toBe(true);
    await expect(db.routines.count()).resolves.toBe(1);

    const record = await db.routines.get("fullbody-3d");
    expect(record?.routine.name).toBe("Full Body renombrada");

    const progress = await db.progress.get("fullbody-3d");
    expect(progress?.currentDayIndex).toBe(2);

    await expect(db.lastUsed.count()).resolves.toBe(1);
    await expect(db.sessions.count()).resolves.toBe(1);
  });

  it("resets progress to 0 when the day pointer falls out of range", async () => {
    await importRoutineFromFile(makeRoutineFile(fullbody3d));
    await db.progress.put({ routineId: "fullbody-3d", currentDayIndex: 2 });

    const shortened = structuredClone(fullbody3d);
    shortened.days = shortened.days.slice(0, 1);
    const result = await importRoutineFromFile(makeRoutineFile(shortened));

    expect(result.ok).toBe(true);

    const progress = await db.progress.get("fullbody-3d");
    expect(progress?.currentDayIndex).toBe(0);
  });

  it("rejects malformed JSON without touching the database", async () => {
    const result = await importRoutineFromFile(makeMalformedRoutineFile());

    expect(result).toEqual({
      ok: false,
      error: "El archivo no es JSON válido.",
    });
    await expect(db.routines.count()).resolves.toBe(0);
    await expect(db.progress.count()).resolves.toBe(0);
  });

  it("rejects a schema-invalid routine without touching the database", async () => {
    const invalid = structuredClone(fullbody3d);
    invalid.days[0].exercises[0].exercise = "unknown-exercise";

    const result = await importRoutineFromFile(makeRoutineFile(invalid));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(
        'exercise key "unknown-exercise" is not defined in the exercises catalog',
      );
    }
    await expect(db.routines.count()).resolves.toBe(0);
    await expect(db.progress.count()).resolves.toBe(0);
  });
});

describe("deleteRoutine", () => {
  it("removes the routine and its progress but keeps unrelated data", async () => {
    await importRoutineFromFile(makeRoutineFile(fullbody3d));
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

    await deleteRoutine("fullbody-3d");

    await expect(db.routines.count()).resolves.toBe(0);
    await expect(db.progress.count()).resolves.toBe(0);
    await expect(db.lastUsed.count()).resolves.toBe(1);
    await expect(db.sessions.count()).resolves.toBe(1);
  });
});
