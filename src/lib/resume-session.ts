import { type ActiveSessionRecord, db, type RoutineRecord } from "@/lib/db";
import type { RoutineDay } from "@/lib/routine-schema";
import {
  buildDayPlan,
  isPostponedOrderValid,
  swapKey,
} from "@/lib/session-plan";
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
 * A postponement queue that no longer addresses the day's items rejects the
 * session too, since its walk order can no longer be rebuilt.
 *
 * The day id alone is not enough once the queue is in play: an edited day keeps
 * its id, and a re-import that only adds a `phase` moves where the queue lands,
 * so the very same `stepIndex` would resolve to a different exercise. The
 * session's own plan is therefore rebuilt and every completed set must still
 * land on the slot and set index it was logged against -- otherwise the logged
 * sets would be silently reattributed and overwritten on the first correction.
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
  const hasValidPostponedOrder =
    isDayMatching && isPostponedOrderValid(day, session.postponed);
  if (!hasValidPostponedOrder) {
    return undefined;
  }

  const plan = buildDayPlan(day, session.postponed);
  // A session with nothing logged yet has no attribution to check, so the
  // pointer is still range-checked on its own.
  const isStepIndexInRange = session.currentStepIndex <= plan.length;
  const doCompletionsStillResolve = session.completed.every((entry) => {
    const step = plan[entry.stepIndex];
    return (
      step !== undefined &&
      swapKey(step.itemIndex, step.memberIndex) === entry.slotKey &&
      step.setIndex === entry.setIndex
    );
  });
  return isStepIndexInRange && doCompletionsStillResolve ? day : undefined;
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
