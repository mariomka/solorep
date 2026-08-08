import { db, type SessionRecord } from "@/lib/db";
import type { RoutineDay } from "@/lib/routine-schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const SET_SPACING_MS = 90_000;

/**
 * Dev-only: replaces the `sessions` table with fake archived sessions
 * generated from the first imported routine, spread over the past `weeks`
 * weeks. Weights (and reps/duration for unweighted work) ramp up across
 * sessions so the stats charts show a real progression.
 */
export async function seedSessions(weeks = 8): Promise<number> {
  const routines = await db.routines.orderBy("importedAt").toArray();
  const routineRecord = routines[0];
  if (!routineRecord) {
    throw new Error("Import a routine before seeding sessions");
  }
  const { routine } = routineRecord;

  const sessionCount = weeks * routine.days.length;
  const intervalMs = (weeks * 7 * DAY_MS) / sessionCount;
  const occurrences = new Map<string, number>();
  const records: SessionRecord[] = [];

  for (let index = 0; index < sessionCount; index++) {
    const day = routine.days[index % routine.days.length];
    const startedAt = Date.now() - (sessionCount - index) * intervalMs;
    const entries = buildEntries(day, startedAt, occurrences);
    const lastEntry = entries[entries.length - 1];
    records.push({
      routineId: routineRecord.id,
      dayId: day.id,
      startedAt,
      finishedAt: (lastEntry?.completedAt ?? startedAt) + 60_000,
      entries,
    });
  }

  await db.transaction("rw", db.sessions, async () => {
    await db.sessions.clear();
    await db.sessions.bulkAdd(records);
  });
  return records.length;
}

function buildEntries(
  day: RoutineDay,
  startedAt: number,
  occurrences: Map<string, number>,
): SessionRecord["entries"] {
  // Snapshot each exercise's past-session count once per session, so every
  // set of the session ramps from the same baseline.
  const sessionOccurrences = new Map<string, number>();
  const occurrenceOf = (exerciseKey: string): number => {
    const snapshot = sessionOccurrences.get(exerciseKey);
    if (snapshot !== undefined) {
      return snapshot;
    }
    const count = occurrences.get(exerciseKey) ?? 0;
    sessionOccurrences.set(exerciseKey, count);
    occurrences.set(exerciseKey, count + 1);
    return count;
  };

  const entries: SessionRecord["entries"] = [];
  let completedAt = startedAt;
  for (const item of day.exercises) {
    const members = "superset" in item ? item.superset : [item];
    const rounds = members[0].sets.length;
    for (let setIndex = 0; setIndex < rounds; setIndex++) {
      for (const member of members) {
        const set = member.sets[setIndex];
        if (!set) {
          continue;
        }
        const occurrence = occurrenceOf(member.exercise);
        completedAt += SET_SPACING_MS;
        entries.push({
          exerciseKey: member.exercise,
          setIndex,
          ...("reps" in set && {
            reps: set.reps + Math.floor(occurrence / 3),
          }),
          ...("duration" in set && {
            duration: set.duration + 5 * Math.floor(occurrence / 3),
          }),
          ...(set.weight !== undefined && {
            weight: set.weight + 2.5 * Math.floor(occurrence / 2),
          }),
          completedAt,
        });
      }
    }
  }
  return entries;
}

declare global {
  interface Window {
    seedSessions: (weeks?: number) => Promise<number>;
  }
}

window.seedSessions = seedSessions;
