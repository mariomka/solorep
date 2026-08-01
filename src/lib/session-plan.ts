import type { ExerciseSet, RoutineDay } from "./routine-schema";
import { resolveItemPhase } from "./routine-schema";

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

/** Whether a day item exists and is part of the day's work phase. */
export function isWorkItem(day: RoutineDay, itemIndex: number): boolean {
  const item = day.exercises[itemIndex];
  return item !== undefined && resolveItemPhase(item) === "work";
}

/**
 * Natural index of the day's first cool-down item, `-1` when it has none. It
 * is where the postponement queue lands: a postponed exercise belongs after
 * the rest of the work, but still before the stretches.
 */
function findCooldownItemIndex(day: RoutineDay): number {
  return day.exercises.findIndex(
    (item) => resolveItemPhase(item) === "cooldown",
  );
}

/**
 * Whether a persisted postponement queue can still be applied to a day: every
 * entry must be a unique valid index of a `work` item. An absent queue is
 * valid (natural order); a garbage one is ignored rather than trusted, so a
 * stale re-import cannot corrupt the walk.
 *
 * Restricting the queue to work items is what keeps the landing rule coherent:
 * a queued warm-up or stretch would jump ahead of the cool-down, reordering
 * the stretches among themselves for no reason.
 */
export function isPostponedOrderValid(
  day: RoutineDay,
  postponed: number[] | undefined,
): boolean {
  if (postponed === undefined) {
    return true;
  }
  const seenItemIndexes = new Set<number>();
  return postponed.every((itemIndex) => {
    const isValidIndex =
      Number.isInteger(itemIndex) &&
      itemIndex >= 0 &&
      itemIndex < day.exercises.length &&
      isWorkItem(day, itemIndex);
    const isDuplicate = seenItemIndexes.has(itemIndex);
    seenItemIndexes.add(itemIndex);
    return isValidIndex && !isDuplicate;
  });
}

/**
 * Effective item order of a day: items that were not postponed in their
 * natural order, with the postponed ones spliced in right before the first
 * cool-down item (at the end of the day when there is none). Warming up again
 * or ending on a heavy lift after eight stretches is not a workout, so the
 * cool-down always stays last. An invalid queue falls back to the natural
 * order.
 */
export function resolveItemOrder(
  day: RoutineDay,
  postponed: number[] | undefined,
): number[] {
  const naturalItemIndexes = day.exercises.map((_item, itemIndex) => itemIndex);
  const isQueueUsable =
    postponed !== undefined &&
    postponed.length > 0 &&
    isPostponedOrderValid(day, postponed);
  if (!isQueueUsable) {
    return naturalItemIndexes;
  }

  const scheduledItemIndexes = naturalItemIndexes.filter(
    (itemIndex) => !postponed.includes(itemIndex),
  );
  // Cool-down items can never be queued, so the day's first one is always
  // still scheduled and its position in the scheduled list is the landing
  // point.
  const cooldownPosition = scheduledItemIndexes.indexOf(
    findCooldownItemIndex(day),
  );
  const hasCooldown = cooldownPosition !== -1;
  if (!hasCooldown) {
    return [...scheduledItemIndexes, ...postponed];
  }
  return [
    ...scheduledItemIndexes.slice(0, cooldownPosition),
    ...postponed,
    ...scheduledItemIndexes.slice(cooldownPosition),
  ];
}

/**
 * Flattens a routine day into the ordered list of steps a session walks
 * through. Plain exercises emit one step per set with rest between sets;
 * supersets alternate members within a round with rest only after each full
 * round. The last set of every item gets `null` rest (moving stations is a
 * manual advance).
 *
 * `postponed` reorders whole item blocks, landing them before the day's
 * cool-down; the emitted steps keep the item's natural `itemIndex`, which is
 * what keeps swaps and completed slot keys position-independent.
 */
export function buildDayPlan(
  day: RoutineDay,
  postponed?: number[],
): WorkoutStep[] {
  const steps: WorkoutStep[] = [];

  resolveItemOrder(day, postponed).forEach((itemIndex) => {
    const item = day.exercises[itemIndex];
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

/**
 * Adds items to the tail of the postponement queue. Items already queued move
 * to the end, so re-postponing an already postponed item pushes it back behind
 * the others instead of duplicating it.
 */
export function appendPostponedItems(
  postponed: number[],
  itemIndexes: number[],
): number[] {
  return [
    ...postponed.filter((itemIndex) => !itemIndexes.includes(itemIndex)),
    ...itemIndexes,
  ];
}

/** Step index where an item's block starts in the plan, `-1` when absent. */
export function findItemStartIndex(
  plan: WorkoutStep[],
  itemIndex: number,
): number {
  return plan.findIndex((step) => step.itemIndex === itemIndex);
}

/**
 * Work item indexes whose blocks sit between `fromStepIndex` and the target
 * item's block, in plan order and excluding the target. Postponing exactly
 * these pulls the target to `fromStepIndex` without moving the pointer.
 *
 * Only work items are collected: pushing a warm-up or a stretch into the queue
 * would make the whole queue invalid (and so ignored), silently dropping every
 * postponement made so far.
 */
export function resolveItemIndexesBefore(
  day: RoutineDay,
  plan: WorkoutStep[],
  fromStepIndex: number,
  targetItemIndex: number,
): number[] {
  const itemIndexesBefore: number[] = [];
  for (let stepIndex = fromStepIndex; stepIndex < plan.length; stepIndex++) {
    const { itemIndex } = plan[stepIndex];
    const isTarget = itemIndex === targetItemIndex;
    if (isTarget) {
      break;
    }
    const isCollectable =
      isWorkItem(day, itemIndex) && !itemIndexesBefore.includes(itemIndex);
    if (isCollectable) {
      itemIndexesBefore.push(itemIndex);
    }
  }
  return itemIndexesBefore;
}

export interface PostponeAvailability {
  canReorderPlan: boolean; // pointer at the frontier, on a work item's first step
  isReorderRedundant: boolean; // postponing would rebuild the very same order
}

export interface PostponeAvailabilityInput {
  day: RoutineDay;
  postponed: number[];
  plan: WorkoutStep[];
  stepIndex: number;
  frontier: number;
}

/**
 * Whether the plan can be reordered from the current position:
 * `canPostpone === canReorderPlan && !isReorderRedundant`.
 *
 * Reordering is legal only when `canReorderPlan`, because only then is nothing
 * at or above the pointer completed (completions always sit below the
 * frontier), so moving blocks from the pointer onwards cannot remap any
 * `completed` entry's `stepIndex`.
 */
export function resolvePostponeAvailability({
  day,
  postponed,
  plan,
  stepIndex,
  frontier,
}: PostponeAvailabilityInput): PostponeAvailability {
  const step = plan[stepIndex];
  if (step === undefined) {
    return { canReorderPlan: false, isReorderRedundant: false };
  }

  const isAtFrontier = stepIndex === frontier;
  const isItemFirstStep = step.setIndex === 0 && step.memberIndex === 0;
  const isWorkPhaseItem = isWorkItem(day, step.itemIndex);
  const cooldownItemIndex = findCooldownItemIndex(day);
  // The queue lands right before the day's first cool-down item, so a work
  // item listed after one would move backwards -- below the pointer, where the
  // completed entries live. Days that end on their cool-down never hit this.
  const isBeforeCooldown =
    cooldownItemIndex === -1 || step.itemIndex < cooldownItemIndex;

  // Postponing the last work item of a day lands the queue exactly where that
  // item already sits, so comparing the prospective order to the current one
  // is the general test for "this button has nowhere to move anything".
  const currentOrder = resolveItemOrder(day, postponed);
  const prospectiveOrder = resolveItemOrder(
    day,
    appendPostponedItems(postponed, [step.itemIndex]),
  );
  const isReorderRedundant = prospectiveOrder.every(
    (itemIndex, orderPosition) => itemIndex === currentOrder[orderPosition],
  );

  return {
    canReorderPlan:
      isAtFrontier && isItemFirstStep && isWorkPhaseItem && isBeforeCooldown,
    isReorderRedundant,
  };
}

/** Identity of a swappable slot within a day: `${itemIndex}:${memberIndex}`. */
export function swapKey(itemIndex: number, memberIndex: number): string {
  return `${itemIndex}:${memberIndex}`;
}

/**
 * Step index where the next slot the session will reach starts: the first later
 * step belonging to a different slot. `-1` on the last slot of the day.
 */
export function findNextSlotStepIndex(
  plan: WorkoutStep[],
  currentStepIndex: number,
): number {
  const currentStep = plan[currentStepIndex];
  if (currentStep === undefined) {
    return -1;
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
      return stepIndex;
    }
  }
  return -1;
}

/**
 * Effective exercise key of the next slot the session will reach after the
 * current step, with the session's swaps applied. `undefined` on the last slot
 * of the day.
 */
export function resolveNextSlotExerciseKey(
  plan: WorkoutStep[],
  currentStepIndex: number,
  swaps: Record<string, string>,
): string | undefined {
  const nextSlotStepIndex = findNextSlotStepIndex(plan, currentStepIndex);
  const isLastSlot = nextSlotStepIndex === -1;
  if (isLastSlot) {
    return undefined;
  }

  const nextStep = plan[nextSlotStepIndex];
  const nextSlotKey = swapKey(nextStep.itemIndex, nextStep.memberIndex);
  return swaps[nextSlotKey] ?? nextStep.primaryExerciseKey;
}

/**
 * Weight context from the latest set already completed this session for the
 * same exercise: the earlier step's planned set (to rebuild the weight it was
 * prefilled with) plus the weight actually logged.
 */
export interface SessionWeightPrecedent {
  plannedSet: ExerciseSet;
  weight?: number;
}

/**
 * Resolves the values to prefill for a set. The two fields answer different
 * questions, so they come from different places:
 *
 * - Reps and duration are the routine's PRESCRIPTION and always come from the
 *   plan. What you logged last time is a record of what happened (six reps on
 *   a bad day), not the target to retry; letting it win would also make a new
 *   phase's rep drop invisible, since re-importing preserves history.
 * - Weight is the exercise's STATE and comes from `lastUsedWeight`: one value
 *   per exercise, the last one logged, prefilling every set. The planned
 *   weight is just the starting point until the first set is logged.
 *
 * When a session precedent is given and its logged weight deviates from the
 * weight that set was prefilled with, the deviation carries over to this set.
 * Confirming the prefilled weight is not a deviation, so a planned ramp
 * survives its own session.
 */
export function resolvePrefill(
  plannedSet: ExerciseSet,
  lastUsedWeight: number | undefined,
  sessionPrecedent?: SessionWeightPrecedent,
): LoggedSetValues {
  let weight = lastUsedWeight ?? plannedSet.weight;
  if (sessionPrecedent !== undefined) {
    const precedentBaselineWeight =
      lastUsedWeight ?? sessionPrecedent.plannedSet.weight;
    const didDeviateFromBaseline =
      sessionPrecedent.weight !== precedentBaselineWeight;
    if (didDeviateFromBaseline) {
      weight = sessionPrecedent.weight;
    }
  }

  const isRepsBased = "reps" in plannedSet;
  if (isRepsBased) {
    const { reps } = plannedSet;
    return weight === undefined ? { reps } : { reps, weight };
  }

  const { duration } = plannedSet;
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
