import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "@/test/helpers";
import { db } from "./db";
import {
  AUTO_RESUME_WINDOW_MS,
  findAutoResumableSession,
} from "./resume-session";
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
