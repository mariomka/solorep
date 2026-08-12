import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { db } from "./db";
import { buildExportEnvelope } from "./export-store";
import { parseRoutine } from "./routine-schema";

const routine = parseRoutine(fullbody3d);

beforeEach(clearDatabase);

async function seedAllTables(): Promise<void> {
  await db.routines.put({ id: routine.id, routine, importedAt: 1000 });
  await db.progress.put({ routineId: routine.id, currentDayIndex: 1 });
  await db.sessions.add({
    routineId: routine.id,
    dayId: "day-1",
    startedAt: 2000,
    finishedAt: 3000,
    entries: [
      {
        exerciseKey: "back-squat",
        setIndex: 0,
        reps: 10,
        weight: 60,
        completedAt: 2500,
      },
    ],
  });
  await db.lastUsed.put({
    exerciseKey: "back-squat",
    weight: 60,
    updatedAt: 3000,
  });
  await db.activeSession.put({
    id: "current",
    routineId: routine.id,
    dayId: "day-2",
    dayIndex: 1,
    startedAt: 4000,
    currentStepIndex: 0,
    swaps: {},
    completed: [],
    updatedAt: 4000,
  });
}

describe("buildExportEnvelope", () => {
  it("exports every row of the four durable tables in a versioned envelope", async () => {
    await seedAllTables();

    const envelope = await buildExportEnvelope();

    expect(envelope.version).toBe(2);
    expect(envelope.version).toBe(db.verno);
    expect(new Date(envelope.exportedAt).toISOString()).toBe(
      envelope.exportedAt,
    );

    expect(envelope.data.routines).toEqual([
      { id: routine.id, routine, importedAt: 1000 },
    ]);
    expect(envelope.data.progress).toEqual([
      { routineId: routine.id, currentDayIndex: 1 },
    ]);
    expect(envelope.data.sessions).toHaveLength(1);
    expect(envelope.data.sessions[0]).toMatchObject({
      routineId: routine.id,
      dayId: "day-1",
      startedAt: 2000,
      finishedAt: 3000,
    });
    expect(envelope.data.lastUsed).toEqual([
      { exerciseKey: "back-squat", weight: 60, updatedAt: 3000 },
    ]);
  });

  it("excludes the active session", async () => {
    await seedAllTables();

    const envelope = await buildExportEnvelope();

    expect(envelope.data).not.toHaveProperty("activeSession");
    expect(JSON.stringify(envelope)).not.toContain('"current"');
  });

  it("exports empty tables as empty arrays", async () => {
    const envelope = await buildExportEnvelope();

    expect(envelope.data).toEqual({
      routines: [],
      progress: [],
      sessions: [],
      lastUsed: [],
    });
  });
});
