import { type ActiveSessionRecord, db, type RoutineRecord } from "@/lib/db";
import type { RoutineDay } from "@/lib/routine-schema";
import { buildDayPlan } from "@/lib/session-plan";
import { getActiveSession } from "@/lib/session-store";

/**
 * Sessions with activity within this window re-enter the workout on app
 * launch without going through the resume prompt: a PWA killed mid-workout
 * (typically during a rest) reopens straight into the session.
 */
export const AUTO_RESUME_WINDOW_MS = 15 * 60 * 1000;

/**
 * The session's stored day, when it can still be resumed against the current
 * routine record. The day at the stored index must still be the stored day:
 * this single invariant covers both a deleted day and a reordered days array.
 */
export function resolveResumableDay(
  session: ActiveSessionRecord,
  record: RoutineRecord | undefined,
): RoutineDay | undefined {
  if (record === undefined) {
    return undefined;
  }
  const day: RoutineDay | undefined = record.routine.days[session.dayIndex];
  const isDayMatching = day !== undefined && day.id === session.dayId;
  const isStepIndexInRange =
    isDayMatching && session.currentStepIndex <= buildDayPlan(day).length;
  return isStepIndexInRange ? day : undefined;
}

export interface AutoResumeTarget {
  routineId: string;
  dayIndex: number;
}

/**
 * The active session to re-enter directly on app launch, or `undefined` when
 * there is none, it is stale (no activity within the auto-resume window), or
 * it no longer matches its routine.
 */
export async function findAutoResumableSession(): Promise<
  AutoResumeTarget | undefined
> {
  const session = await getActiveSession();
  if (session === undefined) {
    return undefined;
  }

  const isRecent = Date.now() - session.updatedAt <= AUTO_RESUME_WINDOW_MS;
  if (!isRecent) {
    return undefined;
  }

  const record = await db.routines.get(session.routineId);
  const resumableDay = resolveResumableDay(session, record);
  if (resumableDay === undefined) {
    return undefined;
  }

  return { routineId: session.routineId, dayIndex: session.dayIndex };
}
