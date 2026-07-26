import { type ActiveSessionRecord, db } from "@/lib/db";

const ACTIVE_SESSION_ID = "current";

interface SetValues {
  reps?: number;
  duration?: number;
  weight?: number;
}

export interface SetCompletionInput extends SetValues {
  stepIndex: number;
  slotKey: string;
  primaryExerciseKey: string;
  exerciseKey: string;
  setIndex: number;
  // Epoch ms deadline of the rest that follows this completion; omitted when
  // no rest follows (correction, last set of an item).
  restEndsAt?: number;
}

function extractSetValues(source: SetValues): SetValues {
  const setValues: SetValues = {};
  if (source.reps !== undefined) {
    setValues.reps = source.reps;
  }
  if (source.duration !== undefined) {
    setValues.duration = source.duration;
  }
  if (source.weight !== undefined) {
    setValues.weight = source.weight;
  }
  return setValues;
}

/**
 * Returns a copy of `sets` with `setValues` written at `setIndex`. Gaps below
 * `setIndex` are padded with the last known value, or the new values when the
 * record had none.
 */
function applySetToLastUsed(
  sets: SetValues[],
  setIndex: number,
  setValues: SetValues,
): SetValues[] {
  const nextSets = [...sets];
  const hasKnownValues = nextSets.length > 0;
  const paddingValue = hasKnownValues
    ? nextSets[nextSets.length - 1]
    : setValues;
  while (nextSets.length < setIndex) {
    nextSets.push({ ...paddingValue });
  }
  nextSets[setIndex] = setValues;
  return nextSets;
}

export async function startSession(
  routineId: string,
  dayId: string,
  dayIndex: number,
): Promise<void> {
  const now = Date.now();
  await db.activeSession.put({
    id: ACTIVE_SESSION_ID,
    routineId,
    dayId,
    dayIndex,
    startedAt: now,
    currentStepIndex: 0,
    swaps: {},
    postponed: [],
    completed: [],
    updatedAt: now,
  });
}

export async function recordSetCompletion(
  input: SetCompletionInput,
): Promise<void> {
  await db.transaction("rw", db.activeSession, async () => {
    const session = await db.activeSession.get(ACTIVE_SESSION_ID);
    if (session === undefined) {
      throw new Error("No active session to record a set completion for.");
    }

    const now = Date.now();
    const setValues = extractSetValues(input);

    const entry = {
      stepIndex: input.stepIndex,
      slotKey: input.slotKey,
      primaryExerciseKey: input.primaryExerciseKey,
      exerciseKey: input.exerciseKey,
      setIndex: input.setIndex,
      ...setValues,
      completedAt: now,
    };

    const completed = [...session.completed];
    const existingEntryIndex = completed.findIndex(
      (item) => item.stepIndex === input.stepIndex,
    );
    const hasExistingEntry = existingEntryIndex !== -1;
    if (hasExistingEntry) {
      completed[existingEntryIndex] = entry;
    } else {
      completed.push(entry);
    }

    // A completion either starts a new rest or invalidates the previous one,
    // so the stale deadline never survives the write.
    const { restEndsAt: _staleRestEndsAt, ...sessionWithoutRest } = session;
    const nextSession: ActiveSessionRecord = {
      ...sessionWithoutRest,
      completed,
      currentStepIndex: Math.max(session.currentStepIndex, input.stepIndex + 1),
      updatedAt: now,
    };
    const startsRest = input.restEndsAt !== undefined;
    if (startsRest) {
      nextSession.restEndsAt = input.restEndsAt;
    }
    await db.activeSession.put(nextSession);
  });
}

export async function clearRest(): Promise<void> {
  await db.transaction("rw", db.activeSession, async () => {
    const session = await db.activeSession.get(ACTIVE_SESSION_ID);
    if (session === undefined) {
      return;
    }
    const hasPersistedRest = session.restEndsAt !== undefined;
    if (!hasPersistedRest) {
      return;
    }

    const { restEndsAt: _restEndsAt, ...sessionWithoutRest } = session;
    await db.activeSession.put({
      ...sessionWithoutRest,
      updatedAt: Date.now(),
    });
  });
}

export async function recordSwap(
  itemIndex: number,
  memberIndex: number,
  alternativeKey: string | null,
): Promise<void> {
  await db.transaction("rw", db.activeSession, async () => {
    const session = await db.activeSession.get(ACTIVE_SESSION_ID);
    if (session === undefined) {
      throw new Error("No active session to record a swap for.");
    }

    const swapKey = `${itemIndex}:${memberIndex}`;
    const swaps = { ...session.swaps };
    const shouldClearSwap = alternativeKey === null;
    if (shouldClearSwap) {
      delete swaps[swapKey];
    } else {
      swaps[swapKey] = alternativeKey;
    }

    await db.activeSession.put({
      ...session,
      swaps,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Replaces the day's postponement queue with `postponed`: the items moved
 * behind the rest of the work, in postponement order, landing right before the
 * day's first cool-down item (at the end of the day when it has none). It
 * never appends -- the caller
 * owns the queue (it derives the plan from it) and passes it whole, which is
 * what keeps the record and the walk from diverging, and repairs a stale
 * persisted queue on the first write.
 *
 * Only the derived item order changes: the pointer, the completed entries, the
 * swaps, and a running rest are all left alone, which is what keeps the
 * completed entries' step indexes valid (the caller only reorders blocks at or
 * above the pointer).
 */
export async function setPostponedItems(postponed: number[]): Promise<void> {
  await db.transaction("rw", db.activeSession, async () => {
    const session = await db.activeSession.get(ACTIVE_SESSION_ID);
    if (session === undefined) {
      throw new Error("No active session to postpone items in.");
    }

    await db.activeSession.put({
      ...session,
      postponed,
      updatedAt: Date.now(),
    });
  });
}

export async function finishSession(): Promise<void> {
  await db.transaction(
    "rw",
    db.activeSession,
    db.routines,
    db.sessions,
    db.progress,
    db.lastUsed,
    async () => {
      const session = await db.activeSession.get(ACTIVE_SESSION_ID);
      if (session === undefined) {
        throw new Error("No active session to finish.");
      }

      const routineRecord = await db.routines.get(session.routineId);
      if (routineRecord === undefined) {
        throw new Error("Cannot finish a session whose routine is missing.");
      }
      const completedDayIndex = routineRecord.routine.days.findIndex(
        (day) => day.id === session.dayId,
      );
      const isCompletedDayMissing = completedDayIndex === -1;
      if (isCompletedDayMissing) {
        throw new Error(
          "Cannot finish a session whose completed day is missing from the routine.",
        );
      }

      const now = Date.now();
      const completedEntries = session.completed.map((entry) => ({
        ...entry,
        exerciseKey: session.swaps[entry.slotKey] ?? entry.primaryExerciseKey,
      }));

      await db.sessions.add({
        routineId: session.routineId,
        dayId: session.dayId,
        startedAt: session.startedAt,
        finishedAt: now,
        entries: completedEntries.map(
          ({
            stepIndex: _stepIndex,
            slotKey: _slotKey,
            primaryExerciseKey: _primaryExerciseKey,
            ...entry
          }) => entry,
        ),
      });

      const totalDays = routineRecord.routine.days.length;
      await db.progress.put({
        routineId: session.routineId,
        currentDayIndex: (completedDayIndex + 1) % totalDays,
      });

      // lastUsed is derived from the completed entries only at finish time:
      // discarded sessions leave no trace. Entries are keyed by the effective
      // (post-swap) exercise key. Collisions on the same key + setIndex (two
      // day items hitting the same exercise) resolve last-completed wins.
      const entriesByExerciseKey = new Map<
        string,
        ActiveSessionRecord["completed"]
      >();
      for (const entry of completedEntries) {
        const group = entriesByExerciseKey.get(entry.exerciseKey) ?? [];
        group.push(entry);
        entriesByExerciseKey.set(entry.exerciseKey, group);
      }

      for (const [exerciseKey, group] of entriesByExerciseKey) {
        // Ascending setIndex, then completedAt; the sort is stable, so ties
        // keep array order and the last-applied entry wins.
        const orderedEntries = [...group].sort(
          (a, b) => a.setIndex - b.setIndex || a.completedAt - b.completedAt,
        );
        const existingRecord = await db.lastUsed.get(exerciseKey);
        let sets = existingRecord === undefined ? [] : existingRecord.sets;
        for (const entry of orderedEntries) {
          sets = applySetToLastUsed(
            sets,
            entry.setIndex,
            extractSetValues(entry),
          );
        }
        await db.lastUsed.put({ exerciseKey, sets, updatedAt: now });
      }

      await db.activeSession.delete(ACTIVE_SESSION_ID);
    },
  );
}

export async function discardActiveSession(): Promise<void> {
  await db.activeSession.delete(ACTIVE_SESSION_ID);
}

export async function getActiveSession(): Promise<
  ActiveSessionRecord | undefined
> {
  return db.activeSession.get(ACTIVE_SESSION_ID);
}
