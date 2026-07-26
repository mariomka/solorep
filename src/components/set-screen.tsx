import { ChevronDown } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { type ActiveSessionRecord, db } from "@/lib/db";
import { useExerciseInstructions } from "@/lib/exercise-instructions";
import { getExerciseGifUrl } from "@/lib/exercise-media";
import { formatCountdown } from "@/lib/format-countdown";
import type { Routine } from "@/lib/routine-schema";
import {
  type LoggedSetValues,
  resolvePrefill,
  type SessionWeightPrecedent,
  type WorkoutStep,
} from "@/lib/session-plan";
import { prepareTimerAudio } from "@/lib/timer-feedback";
import { useCountdown } from "@/lib/use-countdown";
import { useCountdownFeedback } from "@/lib/use-countdown-feedback";
import { cn } from "@/lib/utils";

export type CompletedSetEntry = ActiveSessionRecord["completed"][number];

export interface WorkoutProgressGroup {
  groupKey: string;
  stepIndexes: number[];
}

/**
 * A day item waiting behind the rest of the work -- right before the day's
 * first cool-down item, or at the end of the day when it has none -- with its
 * effective key.
 */
export interface PostponedItem {
  itemIndex: number;
  exerciseKey: string;
}

export interface SetScreenProps {
  step: WorkoutStep;
  exerciseCatalog: Routine["exercises"];
  effectiveExerciseKey: string;
  setNumber: number;
  totalSets: number;
  nextExerciseKey?: string;
  dayName?: string;
  currentStepIndex?: number;
  progressGroups?: WorkoutProgressGroup[];
  completedStepIndexes?: number[];
  completedEntry: CompletedSetEntry | undefined;
  sessionWeightPrecedent?: SessionWeightPrecedent;
  isFirstStep: boolean;
  canReorderPlan?: boolean;
  isReorderRedundant?: boolean;
  isCurrentItemPostponed?: boolean;
  postponedItems?: PostponedItem[];
  onComplete: (values: LoggedSetValues) => Promise<void>;
  onSwapChange: (alternativeKey: string | null) => Promise<void>;
  onPostpone: () => Promise<void>;
  onPostponedItemSelected: (itemIndex: number) => Promise<void>;
  onPrevious: () => void;
  onExit: () => void;
}

function getExerciseName(
  exerciseCatalog: Routine["exercises"],
  exerciseKey: string,
): string {
  const catalogEntry: { name: string } | undefined =
    exerciseCatalog[exerciseKey];
  return catalogEntry === undefined ? exerciseKey : catalogEntry.name;
}

function parsePositiveInteger(rawValue: string): number | undefined {
  const isIntegerFormat = /^\d+$/.test(rawValue.trim());
  if (!isIntegerFormat) {
    return undefined;
  }
  const value = Number(rawValue.trim());
  const isPositive = value > 0;
  return isPositive ? value : undefined;
}

function parseWeight(rawValue: string): { isValid: boolean; weight?: number } {
  const trimmed = rawValue.trim();
  const isEmpty = trimmed === "";
  if (isEmpty) {
    // Empty weight means bodyweight.
    return { isValid: true };
  }
  const value = Number(trimmed.replace(",", "."));
  const isPositiveNumber = Number.isFinite(value) && value > 0;
  return isPositiveNumber
    ? { isValid: true, weight: value }
    : { isValid: false };
}

interface DurationCountdownProps {
  seconds: number;
  isFirstStep: boolean;
  onFinished: () => void;
  onPrevious: () => void;
}

function DurationCountdown({
  seconds,
  isFirstStep,
  onFinished,
  onPrevious,
}: DurationCountdownProps) {
  const [isPaused, setIsPaused] = useState(false);
  const { notifySecond, notifyComplete, cancel } = useCountdownFeedback();
  const handleTimerFinished = () => {
    notifyComplete();
    onFinished();
  };
  const remainingSeconds = useCountdown(seconds, handleTimerFinished, isPaused);
  useEffect(() => {
    notifySecond(remainingSeconds);
  }, [notifySecond, remainingSeconds]);

  const isFinalCountdown = remainingSeconds >= 1 && remainingSeconds <= 5;
  const countdownText = isFinalCountdown
    ? String(remainingSeconds)
    : formatCountdown(remainingSeconds);

  const handleSkip = () => {
    cancel();
    onFinished();
  };

  const handlePauseToggle = () => {
    const isResuming = isPaused;
    if (isResuming) {
      prepareTimerAudio().catch((error: unknown) => {
        console.error("Failed to prepare timer audio", error);
      });
    } else {
      cancel();
    }
    setIsPaused(!isPaused);
  };

  return (
    <div
      data-test="duration-countdown-screen"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 supports-backdrop-filter:backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 pt-4 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]">
        <div className="flex items-start justify-between gap-4">
          <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            Temporizador
          </span>
          <p
            data-test="duration-timer"
            role="timer"
            aria-live="polite"
            className={cn(
              "font-mono text-4xl font-medium leading-none tracking-tight text-primary tabular-nums",
              isFinalCountdown && "font-heading text-5xl font-black",
            )}
          >
            {countdownText}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            data-test="set-previous"
            variant="outline"
            onClick={onPrevious}
            disabled={isFirstStep}
          >
            Anterior
          </Button>
          <Button
            data-test="duration-pause"
            className="flex-1"
            onClick={handlePauseToggle}
          >
            {isPaused ? "Reanudar" : "Pausar"}
          </Button>
          <Button
            data-test="duration-skip"
            variant="outline"
            onClick={handleSkip}
          >
            Saltar
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SetScreen({
  step,
  exerciseCatalog,
  effectiveExerciseKey,
  setNumber,
  totalSets,
  nextExerciseKey,
  dayName,
  currentStepIndex,
  progressGroups = [],
  completedStepIndexes = [],
  completedEntry,
  sessionWeightPrecedent,
  isFirstStep,
  canReorderPlan = false,
  isReorderRedundant = false,
  isCurrentItemPostponed = false,
  postponedItems = [],
  onComplete,
  onSwapChange,
  onPostpone,
  onPostponedItemSelected,
  onPrevious,
  onExit,
}: SetScreenProps) {
  const [weightInput, setWeightInput] = useState("");
  const [repsInput, setRepsInput] = useState("");
  const [durationInput, setDurationInput] = useState("");
  const [isCountdownRunning, setIsCountdownRunning] = useState(false);
  const [hiddenGifUrl, setHiddenGifUrl] = useState<string | undefined>(
    undefined,
  );
  const [isSwapPending, setIsSwapPending] = useState(false);
  const [isPostponePending, setIsPostponePending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const [postponeErrorMessage, setPostponeErrorMessage] = useState<
    string | undefined
  >(undefined);
  const hasSubmittedRef = useRef(false);

  const isRepsSet = "reps" in step.plannedSet;
  const exerciseName = getExerciseName(exerciseCatalog, effectiveExerciseKey);
  const nextExerciseName =
    nextExerciseKey === undefined
      ? undefined
      : getExerciseName(exerciseCatalog, nextExerciseKey);
  const catalogEntry: { datasetId?: string; note?: string } | undefined =
    exerciseCatalog[effectiveExerciseKey];
  const datasetId = catalogEntry?.datasetId;
  const exerciseNote = catalogEntry?.note;
  const gifUrl =
    datasetId === undefined ? undefined : getExerciseGifUrl(datasetId);
  const instructions = useExerciseInstructions(datasetId);

  useEffect(() => {
    setIsCountdownRunning(false);
    const shouldStartDurationCountdown = "duration" in step.plannedSet;

    const matchesPlannedOccurrence =
      completedEntry !== undefined &&
      completedEntry.primaryExerciseKey === step.primaryExerciseKey;
    if (matchesPlannedOccurrence) {
      setRepsInput(completedEntry.reps?.toString() ?? "");
      setDurationInput(completedEntry.duration?.toString() ?? "");
      setWeightInput(completedEntry.weight?.toString() ?? "");
      setIsCountdownRunning(shouldStartDurationCountdown);
      return;
    }

    let isActive = true;
    db.lastUsed
      .get(effectiveExerciseKey)
      .then((lastUsedRecord) => {
        if (!isActive) {
          return;
        }
        const prefill = resolvePrefill(
          step.plannedSet,
          lastUsedRecord?.sets,
          step.setIndex,
          sessionWeightPrecedent,
        );
        setRepsInput(prefill.reps?.toString() ?? "");
        setDurationInput(prefill.duration?.toString() ?? "");
        setWeightInput(prefill.weight?.toString() ?? "");
        setIsCountdownRunning(shouldStartDurationCountdown);
      })
      .catch((error: unknown) => {
        console.error("Failed to load last used values", error);
      });

    return () => {
      isActive = false;
    };
  }, [step, effectiveExerciseKey, completedEntry, sessionWeightPrecedent]);

  const parsedReps = parsePositiveInteger(repsInput);
  const parsedDuration = parsePositiveInteger(durationInput);
  const weightParse = parseWeight(weightInput);

  const canContinue =
    parsedReps !== undefined &&
    weightParse.isValid &&
    !isSwapPending &&
    !isPostponePending;

  /** Returns whether the completion was actually submitted. */
  const submitCompletion = (values: LoggedSetValues): boolean => {
    // Guards against double submission (double tap, or the countdown firing
    // in the same tick as a manual skip) and against completing the step for
    // an item a pending reorder is about to move.
    if (hasSubmittedRef.current || isSwapPending || isPostponePending) {
      return false;
    }
    hasSubmittedRef.current = true;
    setErrorMessage(undefined);
    // The set is being done here, so a failed postponement is no longer
    // actionable: leaving its alert up would stack two alerts on a retry.
    setPostponeErrorMessage(undefined);
    onComplete(values).catch((error: unknown) => {
      console.error("Failed to record the set completion", error);
      // Re-arm the submit guard so the user can retry.
      hasSubmittedRef.current = false;
      setIsCountdownRunning(false);
      setErrorMessage("No se pudo guardar la serie.");
    });
    return true;
  };

  const handleContinue = () => {
    if (parsedReps === undefined || !weightParse.isValid) {
      return;
    }
    prepareTimerAudio().catch((error: unknown) => {
      console.error("Failed to prepare timer audio", error);
    });
    const values: LoggedSetValues =
      weightParse.weight === undefined
        ? { reps: parsedReps }
        : { reps: parsedReps, weight: weightParse.weight };
    submitCompletion(values);
  };

  const handleDurationFinished = () => {
    if (parsedDuration === undefined) {
      return;
    }
    const didSubmit = submitCompletion({ duration: parsedDuration });
    // The countdown fires its completion exactly once, so a pending reorder
    // swallowing it would strand the timer at 00:00. Stopping it hands the set
    // over to the retry dock, which stays reachable without skipping.
    if (!didSubmit) {
      setIsCountdownRunning(false);
    }
  };

  const handleRetryCountdown = () => {
    prepareTimerAudio().catch((error: unknown) => {
      console.error("Failed to prepare timer audio", error);
    });
    // Restarting the timer settles the failed postponement: the set is being
    // done here, so its alert is no longer actionable.
    setPostponeErrorMessage(undefined);
    setIsCountdownRunning(true);
  };

  const handleExerciseChange = (selectedKey: string) => {
    const isPrimary = selectedKey === step.primaryExerciseKey;
    setIsSwapPending(true);
    setErrorMessage(undefined);
    onSwapChange(isPrimary ? null : selectedKey)
      .then(() => {
        setIsSwapPending(false);
      })
      .catch((error: unknown) => {
        console.error("Failed to record the exercise swap", error);
        setIsSwapPending(false);
        setErrorMessage("No se pudo cambiar el ejercicio.");
      });
  };

  const runPostponeOperation = (operation: () => Promise<void>) => {
    const isBusy =
      hasSubmittedRef.current || isSwapPending || isPostponePending;
    if (isBusy) {
      return;
    }
    setIsPostponePending(true);
    setPostponeErrorMessage(undefined);
    operation()
      .then(() => {
        setIsPostponePending(false);
      })
      .catch((error: unknown) => {
        console.error("Failed to reorder the workout plan", error);
        setIsPostponePending(false);
        setPostponeErrorMessage("No se pudo aplazar el ejercicio.");
      });
  };

  const handlePostpone = () => {
    runPostponeOperation(onPostpone);
  };

  const handlePostponedItemSelected = (itemIndex: number) => {
    runPostponeOperation(() => onPostponedItemSelected(itemIndex));
  };

  const hasAlternatives = step.alternatives.length > 0;
  const isExerciseChangeDisabled =
    isSwapPending || isPostponePending || isCountdownRunning;
  // Duration sets auto-start their countdown, so a running countdown must not
  // block a postponement: an occupied station is exactly this case.
  const isPostponeDisabled =
    isReorderRedundant || isPostponePending || isSwapPending;
  // The queue stays readable off a block boundary, but a reorder is only legal
  // at one, so pulling an item forward is not always available.
  const isPostponedItemDisabled =
    !canReorderPlan || isPostponePending || isSwapPending;
  const allExerciseKeys = [step.primaryExerciseKey, ...step.alternatives];
  const availableExerciseKeys = allExerciseKeys.filter(
    (exerciseKey) => exerciseKey !== effectiveExerciseKey,
  );
  const isGifVisible = gifUrl !== undefined && gifUrl !== hiddenGifUrl;
  const hasInstructions = instructions !== undefined;
  const hasExerciseActions =
    hasInstructions || hasAlternatives || canReorderPlan;
  const hasPostponeError = postponeErrorMessage !== undefined;
  const hasPostponedItems = postponedItems.length > 0;
  const totalStepCount = progressGroups.reduce(
    (count, group) => count + group.stepIndexes.length,
    0,
  );
  const hasSessionProgress =
    currentStepIndex !== undefined && totalStepCount > 0;
  const completedStepIndexSet = new Set(completedStepIndexes);
  const isDurationCountdownVisible =
    !isRepsSet && isCountdownRunning && parsedDuration !== undefined;
  const hasStoppedDurationSet = errorMessage !== undefined || hasPostponeError;
  const isDurationRetryVisible =
    !isRepsSet &&
    !isCountdownRunning &&
    parsedDuration !== undefined &&
    hasStoppedDurationSet;

  return (
    <div className="flex flex-col gap-7 pb-72">
      <header className="border-b pb-5">
        <div className="mb-4 flex items-center justify-between gap-4 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
          <span>{dayName ?? "Entrenamiento"}</span>
          <Button
            data-test="set-exit"
            variant="ghost"
            size="xs"
            className="-mr-3"
            onClick={onExit}
            disabled={isSwapPending || isPostponePending}
          >
            Salir
          </Button>
        </div>
        {isCurrentItemPostponed && (
          <p
            data-test="set-postponed-eyebrow"
            className="mb-1 text-[0.625rem] font-semibold tracking-widest text-primary uppercase"
          >
            Aplazado
          </p>
        )}
        <h2
          data-test="set-exercise-name"
          className="font-heading text-3xl font-semibold leading-tight"
        >
          {exerciseName}
        </h2>
        <div className="mt-2 flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <p data-test="set-progress">
            Serie {setNumber} de {totalSets}
          </p>
          {hasSessionProgress && (
            <p className="font-mono text-xs tabular-nums">
              {String(currentStepIndex + 1).padStart(2, "0")} /{" "}
              {String(totalStepCount).padStart(2, "0")}
            </p>
          )}
        </div>
        {hasSessionProgress && (
          <div className="mt-5 flex gap-1" aria-hidden="true">
            {progressGroups.map((group) => (
              <div
                key={group.groupKey}
                data-test={`workout-progress-group-${group.groupKey}`}
                className="flex min-w-0 basis-0 gap-px"
                style={{ flexGrow: group.stepIndexes.length }}
              >
                {group.stepIndexes.map((progressStepIndex) => {
                  const isCompleted =
                    completedStepIndexSet.has(progressStepIndex);
                  const isCurrent = progressStepIndex === currentStepIndex;
                  const progressState = isCurrent
                    ? "current"
                    : isCompleted
                      ? "completed"
                      : "pending";
                  const isFilled = progressState !== "pending";

                  return (
                    <span
                      key={progressStepIndex}
                      data-test={`workout-progress-step-${progressStepIndex}`}
                      data-group={group.groupKey}
                      data-state={progressState}
                      className={cn(
                        "h-1 flex-1",
                        isFilled ? "bg-primary" : "bg-border",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {(nextExerciseName !== undefined || hasPostponedItems) && (
          <div className="mt-4 flex flex-col gap-1">
            {nextExerciseName !== undefined && (
              <p
                data-test="set-next-exercise"
                className="truncate text-sm text-muted-foreground"
              >
                Siguiente: {nextExerciseName}
              </p>
            )}
            {hasPostponedItems && (
              <p
                data-test="set-postponed-items"
                className="text-sm text-muted-foreground"
              >
                Aplazados ·{" "}
                {postponedItems.map((postponedItem, index) => (
                  <Fragment key={postponedItem.itemIndex}>
                    {index > 0 && ", "}
                    <button
                      type="button"
                      data-test={`set-postponed-item-${postponedItem.itemIndex}`}
                      className="underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:no-underline disabled:opacity-60"
                      disabled={isPostponedItemDisabled}
                      onClick={() =>
                        handlePostponedItemSelected(postponedItem.itemIndex)
                      }
                    >
                      {getExerciseName(
                        exerciseCatalog,
                        postponedItem.exerciseKey,
                      )}
                    </button>
                  </Fragment>
                ))}
              </p>
            )}
          </div>
        )}
      </header>

      {(hasExerciseActions || hasPostponeError) && (
        <div className="flex flex-col gap-2">
          {hasExerciseActions && (
            <div className="flex items-center gap-2">
              {hasInstructions && (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      data-test="technique-trigger"
                      variant="outline"
                      size="sm"
                    >
                      Ver técnica
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    data-test="technique-sheet"
                    side="bottom"
                    className="max-h-[85svh] overflow-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                  >
                    <SheetHeader
                      data-test="technique-sheet-header"
                      className="shrink-0 border-b p-5 pr-16"
                    >
                      <p className="text-[0.625rem] font-semibold tracking-widest text-primary uppercase">
                        Ejecución
                      </p>
                      <SheetTitle className="text-2xl tracking-normal normal-case">
                        {exerciseName}
                      </SheetTitle>
                      <SheetDescription className="sr-only">
                        Instrucciones de ejecución de {exerciseName}
                      </SheetDescription>
                    </SheetHeader>
                    <ol
                      data-test="technique-sheet-instructions"
                      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 text-sm leading-relaxed"
                    >
                      {instructions.map((instruction, index) => (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: static ordered list, steps can repeat
                          key={index}
                          className="flex items-baseline border-b py-4"
                        >
                          <span className="w-8 shrink-0 font-mono text-xs text-primary tabular-nums">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 text-muted-foreground">
                            {instruction}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </SheetContent>
                </Sheet>
              )}
              {hasAlternatives && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      data-test="set-exercise-select"
                      variant="outline"
                      size="sm"
                      disabled={isExerciseChangeDisabled}
                    >
                      Alternativas
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-auto">
                    {availableExerciseKeys.map((exerciseKey) => (
                      <DropdownMenuItem
                        key={exerciseKey}
                        data-test={`set-exercise-option-${exerciseKey}`}
                        onSelect={() => handleExerciseChange(exerciseKey)}
                      >
                        {getExerciseName(exerciseCatalog, exerciseKey)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {canReorderPlan && (
                <Button
                  data-test="set-postpone"
                  variant="outline"
                  size="sm"
                  onClick={handlePostpone}
                  disabled={isPostponeDisabled}
                >
                  Aplazar
                </Button>
              )}
            </div>
          )}
          {hasPostponeError && (
            <p
              data-test="set-postpone-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {postponeErrorMessage}
            </p>
          )}
        </div>
      )}

      {(isGifVisible || exerciseNote !== undefined) && (
        <div className="flex flex-col">
          {isGifVisible && (
            <img
              data-test="set-exercise-gif"
              src={gifUrl}
              alt={`Demostración de ${exerciseName}`}
              className="w-full object-contain"
              onError={() => setHiddenGifUrl(gifUrl)}
            />
          )}
          {exerciseNote !== undefined && (
            <p
              data-test="set-exercise-note"
              className={cn(
                "text-sm leading-relaxed text-muted-foreground",
                isGifVisible && "mt-3",
              )}
            >
              {exerciseNote}
            </p>
          )}
        </div>
      )}

      {isDurationCountdownVisible && (
        <DurationCountdown
          seconds={parsedDuration}
          isFirstStep={isFirstStep}
          onFinished={handleDurationFinished}
          onPrevious={onPrevious}
        />
      )}

      {!isDurationCountdownVisible && (isRepsSet || isDurationRetryVisible) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 supports-backdrop-filter:backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 pt-4 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]">
            {isRepsSet && (
              <div className="flex gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    htmlFor="set-weight"
                    className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase"
                  >
                    Peso (kg)
                  </label>
                  <Input
                    id="set-weight"
                    data-test="set-weight-input"
                    inputMode="decimal"
                    value={weightInput}
                    className="h-14 font-heading text-3xl font-semibold tabular-nums md:text-3xl"
                    onChange={(event) => setWeightInput(event.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    htmlFor="set-reps"
                    className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase"
                  >
                    Repeticiones
                  </label>
                  <Input
                    id="set-reps"
                    data-test="set-reps-input"
                    inputMode="numeric"
                    value={repsInput}
                    className="h-14 font-heading text-3xl font-semibold tabular-nums md:text-3xl"
                    onChange={(event) => setRepsInput(event.target.value)}
                  />
                </div>
              </div>
            )}
            {errorMessage !== undefined && (
              <p
                data-test="set-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errorMessage}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                data-test="set-previous"
                variant="outline"
                onClick={onPrevious}
                disabled={isFirstStep || isSwapPending || isPostponePending}
              >
                Anterior
              </Button>
              {isRepsSet ? (
                <Button
                  data-test="set-continue"
                  className="flex-1"
                  onClick={handleContinue}
                  disabled={!canContinue}
                >
                  Continuar
                </Button>
              ) : (
                isDurationRetryVisible && (
                  <Button
                    data-test="duration-retry"
                    className="flex-1"
                    onClick={handleRetryCountdown}
                  >
                    Reintentar
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
