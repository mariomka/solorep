import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

/** `lastUsed` as schema v1 wrote it: one entry per set, each with a weight. */
interface LegacyLastUsedRecord {
  exerciseKey: string;
  sets: Array<{ reps?: number; duration?: number; weight?: number }>;
  updatedAt: number;
}

/**
 * Writes records through a v1-only Dexie instance, so opening the app's `db`
 * afterwards runs the real upgrade path instead of a fresh v2 install.
 */
async function seedSchemaV1(
  records: LegacyLastUsedRecord[],
  progressRecords: Array<{ routineId: string; currentDayIndex: number }> = [],
): Promise<void> {
  const legacyDb = new Dexie("solorep");
  legacyDb.version(1).stores({
    routines: "id, importedAt",
    progress: "routineId",
    lastUsed: "exerciseKey",
    sessions: "++id, routineId, finishedAt",
    activeSession: "id",
  });
  await legacyDb.table("lastUsed").bulkPut(records);
  await legacyDb.table("progress").bulkPut(progressRecords);
  legacyDb.close();
}

describe("lastUsed v2 upgrade", () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete("solorep");
  });

  it("keeps the last weight of a record left non-uniform by the per-set rule", async () => {
    await seedSchemaV1([
      {
        exerciseKey: "belt-squat",
        sets: [
          { reps: 4, weight: 15 },
          { reps: 4, weight: 20 },
          { reps: 4, weight: 20 },
        ],
        updatedAt: 123,
      },
    ]);

    await db.open();

    const record = await db.lastUsed.get("belt-squat");
    expect(record).toEqual({
      exerciseKey: "belt-squat",
      weight: 20,
      updatedAt: 123,
    });
    expect("sets" in (record as object)).toBe(false);
  });

  it("ignores trailing entries with no weight and leaves bodyweight records without one", async () => {
    await seedSchemaV1([
      {
        exerciseKey: "chest-press",
        sets: [{ reps: 8, weight: 45 }, { reps: 8 }],
        updatedAt: 1,
      },
      {
        exerciseKey: "plank",
        sets: [{ duration: 45 }, { duration: 45 }],
        updatedAt: 2,
      },
    ]);

    await db.open();

    await expect(db.lastUsed.get("chest-press")).resolves.toEqual({
      exerciseKey: "chest-press",
      weight: 45,
      updatedAt: 1,
    });
    const bodyweightRecord = await db.lastUsed.get("plank");
    expect(bodyweightRecord?.weight).toBeUndefined();
    expect("sets" in (bodyweightRecord as object)).toBe(false);
  });

  it("leaves the other tables untouched", async () => {
    await seedSchemaV1(
      [
        {
          exerciseKey: "belt-squat",
          sets: [{ reps: 4, weight: 20 }],
          updatedAt: 1,
        },
      ],
      [{ routineId: "fuerza-fase-1", currentDayIndex: 2 }],
    );

    await db.open();

    await expect(db.progress.get("fuerza-fase-1")).resolves.toEqual({
      routineId: "fuerza-fase-1",
      currentDayIndex: 2,
    });
  });
});
