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
  SetScreen,
  type WorkoutProgressGroup,
} from "@/components/set-screen";
import type { ActiveSessionRecord } from "@/lib/db";
import type { Routine } from "@/lib/routine-schema";
import {
  buildDayPlan,
  type LoggedSetValues,
  swapKey,
  type WorkoutStep,
} from "@/lib/session-plan";
import {
  getActiveSession,
  recordSetCompletion,
  recordSwap,
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
  | { type: "swapChanged"; slotKey: string; alternativeKey: string | null };

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
  }
}

function initWorkoutState(session: ActiveSessionRecord): WorkoutState {
  const completed: Record<number, CompletedSetEntry> = {};
  for (const entry of session.completed) {
    completed[entry.stepIndex] = entry;
  }

  return {
    stepIndex: session.currentStepIndex,
    phase: "set",
    restSeconds: 0,
    frontier: session.currentStepIndex,
    swaps: session.swaps,
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
  const plan = useMemo(() => buildDayPlan(day), [day]);
  const [state, dispatch] = useReducer(
    workoutReducer,
    initialSession,
    initWorkoutState,
  );

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

  const progressGroups = useMemo(() => {
    const stepIndexesBySlot = new Map<string, number[]>();

    plan.forEach((planStep, planStepIndex) => {
      const planSlotKey = swapKey(planStep.itemIndex, planStep.memberIndex);
      const existingStepIndexes = stepIndexesBySlot.get(planSlotKey) ?? [];
      existingStepIndexes.push(planStepIndex);
      stepIndexesBySlot.set(planSlotKey, existingStepIndexes);
    });

    return Array.from(
      stepIndexesBySlot,
      ([slotKey, stepIndexes]): WorkoutProgressGroup => ({
        slotKey,
        stepIndexes,
      }),
    );
  }, [plan]);

  const completedStepIndexes = Object.values(state.completed).map(
    (entry) => entry.stepIndex,
  );

  if (step === undefined) {
    return null;
  }

  const slotKey = swapKey(step.itemIndex, step.memberIndex);
  const effectiveExerciseKey = state.swaps[slotKey] ?? step.primaryExerciseKey;

  const handleSetCompleted = async (values: LoggedSetValues) => {
    const completedStepIndex = state.stepIndex;
    await recordSetCompletion({
      stepIndex: completedStepIndex,
      slotKey,
      primaryExerciseKey: step.primaryExerciseKey,
      exerciseKey: effectiveExerciseKey,
      setIndex: step.setIndex,
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

  const isResting = state.phase === "rest";
  if (isResting) {
    return (
      <RestScreen
        seconds={state.restSeconds}
        onFinished={() => dispatch({ type: "restFinished" })}
        onExit={onExit}
      />
    );
  }

  return (
    <SetScreen
      key={state.stepIndex}
      step={step}
      exerciseCatalog={routine.exercises}
      effectiveExerciseKey={effectiveExerciseKey}
      setNumber={step.setIndex + 1}
      totalSets={totalSets}
      dayName={day.name}
      currentStepIndex={state.stepIndex}
      progressGroups={progressGroups}
      completedStepIndexes={completedStepIndexes}
      completedEntry={state.completed[state.stepIndex]}
      isFirstStep={state.stepIndex === 0}
      onComplete={handleSetCompleted}
      onSwapChange={handleSwapChange}
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
