import type { ExerciseSet, RoutineDay } from "./routine-schema";

/**
 * Structural shape of a logged/last-used set. Mirrors the sets stored in the
 * data layer, but kept local so the engine stays decoupled from Dexie.
 */
export type LoggedSetValues = {
  reps?: number;
  duration?: number;
  weight?: number;
};

export interface WorkoutStep {
  itemIndex: number;
  memberIndex: number;
  primaryExerciseKey: string;
  alternatives: string[];
  setIndex: number;
  plannedSet: ExerciseSet;
  restAfterSeconds: number | null;
}

/**
 * Flattens a routine day into the ordered list of steps a session walks
 * through. Plain exercises emit one step per set with rest between sets;
 * supersets alternate members within a round with rest only after each full
 * round. The last set of every item gets `null` rest (moving stations is a
 * manual advance).
 */
export function buildDayPlan(day: RoutineDay): WorkoutStep[] {
  const steps: WorkoutStep[] = [];

  day.exercises.forEach((item, itemIndex) => {
    const isSuperset = "superset" in item;

    if (isSuperset) {
      const members = item.superset;
      const rounds = members[0].sets.length;

      for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
        members.forEach((member, memberIndex) => {
          const isLastMemberOfRound = memberIndex === members.length - 1;
          const isFinalRound = roundIndex === rounds - 1;
          const restAfterSeconds =
            isLastMemberOfRound && !isFinalRound ? item.rest : null;

          steps.push({
            itemIndex,
            memberIndex,
            primaryExerciseKey: member.exercise,
            alternatives: member.alternatives ?? [],
            setIndex: roundIndex,
            plannedSet: member.sets[roundIndex],
            restAfterSeconds,
          });
        });
      }
      return;
    }

    item.sets.forEach((plannedSet, setIndex) => {
      const isLastSet = setIndex === item.sets.length - 1;

      steps.push({
        itemIndex,
        memberIndex: 0,
        primaryExerciseKey: item.exercise,
        alternatives: item.alternatives ?? [],
        setIndex,
        plannedSet,
        restAfterSeconds: isLastSet ? null : item.rest,
      });
    });
  });

  return steps;
}

/** Identity of a swappable slot within a day: `${itemIndex}:${memberIndex}`. */
export function swapKey(itemIndex: number, memberIndex: number): string {
  return `${itemIndex}:${memberIndex}`;
}

/**
 * Effective exercise key of the next slot the session will reach after the
 * current step: the first later step belonging to a different slot, with the
 * session's swaps applied. `undefined` on the last slot of the day.
 */
export function resolveNextSlotExerciseKey(
  plan: WorkoutStep[],
  currentStepIndex: number,
  swaps: Record<string, string>,
): string | undefined {
  const currentStep = plan[currentStepIndex];
  if (currentStep === undefined) {
    return undefined;
  }

  const currentSlotKey = swapKey(
    currentStep.itemIndex,
    currentStep.memberIndex,
  );
  for (
    let stepIndex = currentStepIndex + 1;
    stepIndex < plan.length;
    stepIndex++
  ) {
    const step = plan[stepIndex];
    const stepSlotKey = swapKey(step.itemIndex, step.memberIndex);
    const isDifferentSlot = stepSlotKey !== currentSlotKey;
    if (isDifferentSlot) {
      return swaps[stepSlotKey] ?? step.primaryExerciseKey;
    }
  }
  return undefined;
}

/**
 * Weight context from the latest set already completed this session for the
 * same exercise: the earlier step's planned set and set index (to rebuild the
 * weight it was prefilled with) plus the weight actually logged.
 */
export interface SessionWeightPrecedent {
  plannedSet: ExerciseSet;
  setIndex: number;
  weight?: number;
}

function resolveBaselineWeight(
  plannedSet: ExerciseSet,
  lastUsedSets: LoggedSetValues[] | undefined,
  setIndex: number,
): number | undefined {
  const hasHistory = lastUsedSets !== undefined && lastUsedSets.length > 0;
  const candidate = hasHistory
    ? (lastUsedSets[setIndex] ?? lastUsedSets[lastUsedSets.length - 1])
    : undefined;
  return candidate?.weight ?? plannedSet.weight;
}

/**
 * Resolves the values to prefill for a set: last-used values for the same set
 * index win; extra sets fall back to the last known value; the routine's
 * planned set is the base. Field-wise, a reps-based plan never takes reps from
 * a duration-only history entry (and vice versa); weight overlays
 * independently.
 *
 * When a session precedent is given and its logged weight deviates from the
 * weight that set was prefilled with, the deviation carries over to this set.
 * Confirming the prefilled weight is not a deviation, so planned per-set
 * progressions (pyramids, stored lastUsed ramps) stay intact.
 */
export function resolvePrefill(
  plannedSet: ExerciseSet,
  lastUsedSets: LoggedSetValues[] | undefined,
  setIndex: number,
  sessionPrecedent?: SessionWeightPrecedent,
): LoggedSetValues {
  const hasHistory = lastUsedSets !== undefined && lastUsedSets.length > 0;
  const candidate = hasHistory
    ? (lastUsedSets[setIndex] ?? lastUsedSets[lastUsedSets.length - 1])
    : undefined;

  let weight = candidate?.weight ?? plannedSet.weight;
  if (sessionPrecedent !== undefined) {
    const precedentBaselineWeight = resolveBaselineWeight(
      sessionPrecedent.plannedSet,
      lastUsedSets,
      sessionPrecedent.setIndex,
    );
    const didDeviateFromBaseline =
      sessionPrecedent.weight !== precedentBaselineWeight;
    if (didDeviateFromBaseline) {
      weight = sessionPrecedent.weight;
    }
  }

  const isRepsBased = "reps" in plannedSet;
  if (isRepsBased) {
    const reps = candidate?.reps ?? plannedSet.reps;
    return weight === undefined ? { reps } : { reps, weight };
  }

  const duration = candidate?.duration ?? plannedSet.duration;
  return weight === undefined ? { duration } : { duration, weight };
}

/**
 * Session summary: total sets and volume (reps × weight). Sets missing reps
 * or weight (duration sets, bodyweight sets) contribute zero volume.
 */
export function computeSummary(completed: LoggedSetValues[]): {
  setsCompleted: number;
  totalVolume: number;
} {
  const setsCompleted = completed.length;
  const totalVolume = completed.reduce((volume, set) => {
    const { reps, weight } = set;
    const isMissingVolumeData = reps === undefined || weight === undefined;
    if (isMissingVolumeData) {
      return volume;
    }
    return volume + reps * weight;
  }, 0);

  return { setsCompleted, totalVolume };
}
