import {
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { RestScreen } from "@/components/rest-screen";
import {
  type CompletedSetEntry,
  type PostponedItem,
  SetScreen,
  type WorkoutProgressGroup,
} from "@/components/set-screen";
import type { ActiveSessionRecord } from "@/lib/db";
import type { DayItemPhase, Routine, RoutineDay } from "@/lib/routine-schema";
import { resolveItemPhase } from "@/lib/routine-schema";
import { workoutScreenWakeLock } from "@/lib/screen-wake-lock";
import {
  appendPostponedItems,
  buildDayPlan,
  findItemStartIndex,
  findNextSlotStepIndex,
  isPostponedOrderValid,
  isWorkItem,
  type LoggedSetValues,
  resolveItemIndexesBefore,
  resolveNextSlotExerciseKey,
  resolvePostponeAvailability,
  type SessionWeightPrecedent,
  swapKey,
  type WorkoutStep,
} from "@/lib/session-plan";
import {
  clearRest,
  getActiveSession,
  recordSetCompletion,
  recordSwap,
  setPostponedItems,
} from "@/lib/session-store";

export interface WorkoutScreenProps {
  routine: Routine;
  dayIndex: number;
  onDayCompleted: () => void; // fired right after the final step's recordSetCompletion resolves
  onExit: () => void; // "Salir" -- session row stays for resume
}

interface WorkoutState {
  stepIndex: number;
  phase: "set" | "rest";
  restSeconds: number;
  // Next step the session has never reached; completions below it are
  // corrections and never replay rest.
  frontier: number;
  swaps: Record<string, string>;
  // Item indexes moved behind the rest of the work, in postponement order:
  // they land right before the day's first cool-down item, or at the end of
  // the day when it has none.
  postponed: number[];
  completed: Record<number, CompletedSetEntry>;
}

type WorkoutAction =
  | {
      type: "stepCompleted";
      entry: CompletedSetEntry;
      restAfterSeconds: number | null;
    }
  | { type: "restFinished" }
  | { type: "previousStepRequested" }
  | { type: "swapChanged"; slotKey: string; alternativeKey: string | null }
  | { type: "itemsPostponed"; postponed: number[] };

function workoutReducer(
  state: WorkoutState,
  action: WorkoutAction,
): WorkoutState {
  switch (action.type) {
    case "stepCompleted": {
      const { entry, restAfterSeconds } = action;
      const completed = { ...state.completed, [entry.stepIndex]: entry };
      const isCorrection = entry.stepIndex < state.frontier;
      const frontier = Math.max(state.frontier, entry.stepIndex + 1);
      const nextStepIndex = entry.stepIndex + 1;
      const shouldRest =
        !isCorrection && restAfterSeconds !== null && restAfterSeconds > 0;
      if (shouldRest) {
        return {
          ...state,
          completed,
          frontier,
          stepIndex: nextStepIndex,
          phase: "rest",
          restSeconds: restAfterSeconds,
        };
      }
      return {
        ...state,
        completed,
        frontier,
        stepIndex: nextStepIndex,
        phase: "set",
      };
    }
    case "restFinished":
      return { ...state, phase: "set" };
    case "previousStepRequested":
      return {
        ...state,
        stepIndex: Math.max(0, state.stepIndex - 1),
        phase: "set",
      };
    case "swapChanged": {
      const { slotKey, alternativeKey } = action;
      const swaps = { ...state.swaps };
      const shouldClearSwap = alternativeKey === null;
      if (shouldClearSwap) {
        delete swaps[slotKey];
      } else {
        swaps[slotKey] = alternativeKey;
      }
      return { ...state, swaps };
    }
    case "itemsPostponed":
      // Only the derived item order changes: the pointer, the frontier, and
      // the completed entries stay put, so a postponement can never look like
      // a correction.
      return { ...state, postponed: action.postponed };
  }
}

interface WorkoutStateInit {
  session: ActiveSessionRecord;
  day: RoutineDay;
}

function initWorkoutState({ session, day }: WorkoutStateInit): WorkoutState {
  const completed: Record<number, CompletedSetEntry> = {};
  for (const entry of session.completed) {
    completed[entry.stepIndex] = entry;
  }

  // A persisted rest deadline survives a PWA kill/reload: resume into the
  // remaining rest, or straight into the set when it already elapsed.
  const restRemainingMilliseconds =
    session.restEndsAt === undefined ? 0 : session.restEndsAt - Date.now();
  const isRestPending = restRemainingMilliseconds > 0;

  return {
    stepIndex: session.currentStepIndex,
    phase: isRestPending ? "rest" : "set",
    restSeconds: isRestPending
      ? Math.ceil(restRemainingMilliseconds / 1000)
      : 0,
    frontier: session.currentStepIndex,
    swaps: session.swaps,
    // A queue the plan would ignore is dropped here too, otherwise later
    // postponements would append to a queue that never applies.
    postponed: isPostponedOrderValid(day, session.postponed)
      ? (session.postponed ?? [])
      : [],
    completed,
  };
}

interface WorkoutSessionViewProps extends WorkoutScreenProps {
  initialSession: ActiveSessionRecord;
}

function WorkoutSessionView({
  routine,
  dayIndex,
  initialSession,
  onDayCompleted,
  onExit,
}: WorkoutSessionViewProps) {
  const day = routine.days[dayIndex];
  const [state, dispatch] = useReducer(
    workoutReducer,
    { session: initialSession, day },
    initWorkoutState,
  );
  const plan = useMemo(
    () => buildDayPlan(day, state.postponed),
    [day, state.postponed],
  );

  useEffect(() => {
    workoutScreenWakeLock.acquire().catch((error: unknown) => {
      console.error("Failed to acquire the workout screen wake lock", error);
    });
    return () => {
      workoutScreenWakeLock.release().catch((error: unknown) => {
        console.error("Failed to release the workout screen wake lock", error);
      });
    };
  }, []);

  const step: WorkoutStep | undefined = plan[state.stepIndex];
  const isSessionComplete = initialSession.currentStepIndex === plan.length;
  useEffect(() => {
    if (isSessionComplete) {
      onDayCompleted();
    }
  }, [isSessionComplete, onDayCompleted]);

  // Belt-and-braces: the routine is snapshotted for the workout, but if the
  // pointer ever lands beyond the plan (e.g. a stale session), exit instead
  // of crashing.
  const isStepMissing = step === undefined && !isSessionComplete;
  useEffect(() => {
    if (isStepMissing) {
      onExit();
    }
  }, [isStepMissing, onExit]);

  const totalSets = useMemo(() => {
    if (step === undefined) {
      return 0;
    }
    return plan.filter(
      (planStep) =>
        planStep.itemIndex === step.itemIndex &&
        planStep.memberIndex === step.memberIndex,
    ).length;
  }, [plan, step]);

  // Work keeps one group per slot, so a set still reads as a position inside
  // its exercise. Warm-ups and stretches collapse per contiguous run instead:
  // a dozen single-set items would otherwise shatter the bar into slivers that
  // say nothing. Grouping work by slot rather than by run is deliberate --
  // a superset's members alternate (A1 B1 A2 B2), so its steps are not
  // contiguous and a run would split one exercise into several groups.
  const progressGroups = useMemo(() => {
    const stepIndexesByGroup = new Map<string, number[]>();
    let previousPhase: DayItemPhase | undefined;
    let currentRunKey = "";
    let runCount = 0;

    plan.forEach((planStep, planStepIndex) => {
      const phase = resolveItemPhase(day.exercises[planStep.itemIndex]);
      const isWorkStep = isWorkItem(day, planStep.itemIndex);

      let groupKey: string;
      if (isWorkStep) {
        groupKey = swapKey(planStep.itemIndex, planStep.memberIndex);
      } else {
        const continuesRun = previousPhase === phase;
        if (!continuesRun) {
          runCount += 1;
          currentRunKey = `${phase}:${runCount}`;
        }
        groupKey = currentRunKey;
      }
      previousPhase = phase;

      const existingStepIndexes = stepIndexesByGroup.get(groupKey) ?? [];
      existingStepIndexes.push(planStepIndex);
      stepIndexesByGroup.set(groupKey, existingStepIndexes);
    });

    return Array.from(
      stepIndexesByGroup,
      ([groupKey, stepIndexes]): WorkoutProgressGroup => ({
        groupKey,
        stepIndexes,
      }),
    );
  }, [day, plan]);

  const completedStepIndexes = Object.values(state.completed).map(
    (entry) => entry.stepIndex,
  );

  // Latest set already logged this session for the exercise on screen; its
  // weight carries over to upcoming sets when it deviated from the prefill.
  const sessionWeightPrecedent = useMemo<
    SessionWeightPrecedent | undefined
  >(() => {
    const currentStep = plan[state.stepIndex];
    if (currentStep === undefined) {
      return undefined;
    }
    const currentSlotKey = swapKey(
      currentStep.itemIndex,
      currentStep.memberIndex,
    );
    const currentExerciseKey =
      state.swaps[currentSlotKey] ?? currentStep.primaryExerciseKey;

    const precedingEntries = Object.values(state.completed).filter(
      (entry) =>
        entry.exerciseKey === currentExerciseKey &&
        entry.stepIndex < state.stepIndex,
    );
    const hasPrecedingEntries = precedingEntries.length > 0;
    if (!hasPrecedingEntries) {
      return undefined;
    }

    const latestEntry = precedingEntries.reduce((latest, entry) =>
      entry.stepIndex > latest.stepIndex ? entry : latest,
    );
    const latestEntryStep = plan[latestEntry.stepIndex];
    if (latestEntryStep === undefined) {
      return undefined;
    }
    return {
      plannedSet: latestEntryStep.plannedSet,
      setIndex: latestEntry.setIndex,
      weight: latestEntry.weight,
    };
  }, [plan, state.stepIndex, state.swaps, state.completed]);

  const { canReorderPlan, isReorderRedundant } = useMemo(
    () =>
      resolvePostponeAvailability({
        day,
        postponed: state.postponed,
        plan,
        stepIndex: state.stepIndex,
        frontier: state.frontier,
      }),
    [day, state.postponed, plan, state.stepIndex, state.frontier],
  );

  // The queue is only worth listing while scheduled WORK still sits ahead of
  // it. The cool-down always does, so "any scheduled block ahead" would keep
  // the line alive forever; once the queue is the tail of the work, it stops
  // adding information and the "Aplazado" eyebrow carries the context instead.
  // A postponed superset is represented by its first member only -- accepted
  // simplification.
  const postponedItems = useMemo<PostponedItem[]>(() => {
    const hasPendingScheduledWork = plan
      .slice(state.stepIndex)
      .some((pendingStep) => {
        const isPostponed = state.postponed.includes(pendingStep.itemIndex);
        const isWork = isWorkItem(day, pendingStep.itemIndex);
        return !isPostponed && isWork;
      });
    if (!hasPendingScheduledWork) {
      return [];
    }
    // On the last scheduled block the first queued block is what "Siguiente:"
    // already names, so it is left out instead of printing the same exercise on
    // two adjacent lines.
    const nextSlotStepIndex = findNextSlotStepIndex(plan, state.stepIndex);
    return state.postponed.flatMap((itemIndex) => {
      const blockStartIndex = findItemStartIndex(plan, itemIndex);
      // The queue lands before the cool-down rather than at the plan's tail, so
      // the pointer can already sit on or past a queued block while scheduled
      // work remains ahead. Listing the exercise being executed would be a lie.
      const isBlockReached = blockStartIndex <= state.stepIndex;
      const isNamedAsNext = blockStartIndex === nextSlotStepIndex;
      if (isBlockReached || isNamedAsNext) {
        return [];
      }
      const blockStep = plan[blockStartIndex];
      const blockSlotKey = swapKey(blockStep.itemIndex, blockStep.memberIndex);
      return [
        {
          itemIndex,
          exerciseKey:
            state.swaps[blockSlotKey] ?? blockStep.primaryExerciseKey,
        },
      ];
    });
  }, [day, plan, state.postponed, state.stepIndex, state.swaps]);

  if (step === undefined) {
    return null;
  }

  const slotKey = swapKey(step.itemIndex, step.memberIndex);
  const effectiveExerciseKey = state.swaps[slotKey] ?? step.primaryExerciseKey;
  const nextExerciseKey = resolveNextSlotExerciseKey(
    plan,
    state.stepIndex,
    state.swaps,
  );

  const isCurrentItemPostponed = state.postponed.includes(step.itemIndex);

  const handleSetCompleted = async (values: LoggedSetValues) => {
    const completedStepIndex = state.stepIndex;
    // Mirrors the reducer's rest decision so the persisted deadline matches
    // the rest screen the user is about to see.
    const restAfterSeconds = step.restAfterSeconds;
    const isCorrection = completedStepIndex < state.frontier;
    const startsRest =
      !isCorrection && restAfterSeconds !== null && restAfterSeconds > 0;
    const restEndsAt = startsRest
      ? Date.now() + restAfterSeconds * 1000
      : undefined;
    await recordSetCompletion({
      stepIndex: completedStepIndex,
      slotKey,
      primaryExerciseKey: step.primaryExerciseKey,
      exerciseKey: effectiveExerciseKey,
      setIndex: step.setIndex,
      restEndsAt,
      ...values,
    });

    const isLastStep = completedStepIndex === plan.length - 1;
    if (isLastStep) {
      onDayCompleted();
      return;
    }

    dispatch({
      type: "stepCompleted",
      entry: {
        stepIndex: completedStepIndex,
        slotKey,
        primaryExerciseKey: step.primaryExerciseKey,
        exerciseKey: effectiveExerciseKey,
        setIndex: step.setIndex,
        ...values,
        completedAt: Date.now(),
      },
      restAfterSeconds: step.restAfterSeconds,
    });
  };

  const handleSwapChange = async (alternativeKey: string | null) => {
    await recordSwap(step.itemIndex, step.memberIndex, alternativeKey);
    dispatch({ type: "swapChanged", slotKey, alternativeKey });
  };

  /**
   * Reorders the day's blocks and persists the resulting queue whole, so the
   * record can never drift from the queue the plan is derived from.
   *
   * Gated on `canReorderPlan` because the reorder is only safe when nothing at
   * or above the pointer is completed -- which holds exactly at the frontier on
   * an item's first step. Reordering anywhere else reattributes the completed
   * entries (keyed by step index) to whichever exercise lands on those steps.
   */
  const postponeAndPersist = async (itemIndexes: number[]) => {
    if (!canReorderPlan) {
      return;
    }
    const postponed = appendPostponedItems(state.postponed, itemIndexes);
    await setPostponedItems(postponed);
    dispatch({ type: "itemsPostponed", postponed });
  };

  const handlePostpone = async () => {
    await postponeAndPersist([step.itemIndex]);
  };

  // Pulling a postponed item forward postpones everything scheduled in front
  // of it instead of un-postponing it: the pointer never moves, so no
  // completed entry is ever remapped.
  const handlePostponedItemSelected = async (itemIndex: number) => {
    const itemIndexesToPush = resolveItemIndexesBefore(
      day,
      plan,
      state.stepIndex,
      itemIndex,
    );
    const isAlreadyCurrent = itemIndexesToPush.length === 0;
    if (isAlreadyCurrent) {
      return;
    }
    await postponeAndPersist(itemIndexesToPush);
  };

  const handleRestFinished = () => {
    dispatch({ type: "restFinished" });
    clearRest().catch((error: unknown) => {
      console.error("Failed to clear the persisted rest deadline", error);
    });
  };

  const isResting = state.phase === "rest";
  if (isResting) {
    return (
      <RestScreen seconds={state.restSeconds} onFinished={handleRestFinished} />
    );
  }

  return (
    <SetScreen
      // The item at a given step index changes on a reorder, so the slot key
      // is part of the identity: a postponement remounts, a swap does not.
      key={`${state.stepIndex}-${slotKey}`}
      step={step}
      exerciseCatalog={routine.exercises}
      effectiveExerciseKey={effectiveExerciseKey}
      setNumber={step.setIndex + 1}
      totalSets={totalSets}
      nextExerciseKey={nextExerciseKey}
      dayName={day.name}
      currentStepIndex={state.stepIndex}
      progressGroups={progressGroups}
      completedStepIndexes={completedStepIndexes}
      completedEntry={state.completed[state.stepIndex]}
      sessionWeightPrecedent={sessionWeightPrecedent}
      isFirstStep={state.stepIndex === 0}
      canReorderPlan={canReorderPlan}
      isReorderRedundant={isReorderRedundant}
      isCurrentItemPostponed={isCurrentItemPostponed}
      postponedItems={postponedItems}
      onComplete={handleSetCompleted}
      onSwapChange={handleSwapChange}
      onPostpone={handlePostpone}
      onPostponedItemSelected={handlePostponedItemSelected}
      onPrevious={() => dispatch({ type: "previousStepRequested" })}
      onExit={onExit}
    />
  );
}

export function WorkoutScreen({
  routine,
  dayIndex,
  onDayCompleted,
  onExit,
}: WorkoutScreenProps): ReactNode {
  const [initialSession, setInitialSession] = useState<
    ActiveSessionRecord | null | undefined
  >(undefined);

  useEffect(() => {
    let isActive = true;
    getActiveSession()
      .then((session) => {
        if (isActive) {
          setInitialSession(session ?? null);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load the active session", error);
        if (isActive) {
          setInitialSession(null);
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  const isSessionMissing = initialSession === null;
  useEffect(() => {
    // The caller guarantees an active session exists; bail out if it does not.
    if (isSessionMissing) {
      onExit();
    }
  }, [isSessionMissing, onExit]);

  const isLoading = initialSession === undefined;
  if (isLoading || isSessionMissing) {
    return null;
  }

  return (
    <WorkoutSessionView
      routine={routine}
      dayIndex={dayIndex}
      initialSession={initialSession}
      onDayCompleted={onDayCompleted}
      onExit={onExit}
    />
  );
}
