import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  type WorkoutStep,
} from "@/lib/session-plan";
import { useCountdown } from "@/lib/use-countdown";
import { cn } from "@/lib/utils";

export type CompletedSetEntry = ActiveSessionRecord["completed"][number];

export interface WorkoutProgressGroup {
  slotKey: string;
  stepIndexes: number[];
}

export interface SetScreenProps {
  step: WorkoutStep;
  exerciseCatalog: Routine["exercises"];
  effectiveExerciseKey: string;
  setNumber: number;
  totalSets: number;
  dayName?: string;
  currentStepIndex?: number;
  progressGroups?: WorkoutProgressGroup[];
  completedStepIndexes?: number[];
  completedEntry: CompletedSetEntry | undefined;
  isFirstStep: boolean;
  onComplete: (values: LoggedSetValues) => Promise<void>;
  onSwapChange: (alternativeKey: string | null) => Promise<void>;
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
  onFinished: () => void;
}

function DurationCountdown({ seconds, onFinished }: DurationCountdownProps) {
  const remainingSeconds = useCountdown(seconds, onFinished);
  const countdownText = formatCountdown(remainingSeconds);

  return (
    <div className="flex flex-col items-center border-y py-8">
      <p className="mb-4 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
        Temporizador
      </p>
      <p
        data-test="duration-timer"
        role="timer"
        aria-live="polite"
        className="font-mono text-8xl font-medium tracking-tighter text-primary tabular-nums"
      >
        {countdownText}
      </p>
      <p className="mt-1 mb-6 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
        Min : Seg
      </p>
      <Button data-test="duration-skip" variant="outline" onClick={onFinished}>
        Saltar
      </Button>
    </div>
  );
}

export function SetScreen({
  step,
  exerciseCatalog,
  effectiveExerciseKey,
  setNumber,
  totalSets,
  dayName,
  currentStepIndex,
  progressGroups = [],
  completedStepIndexes = [],
  completedEntry,
  isFirstStep,
  onComplete,
  onSwapChange,
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
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );
  const hasSubmittedRef = useRef(false);

  const isRepsSet = "reps" in step.plannedSet;
  const exerciseName = getExerciseName(exerciseCatalog, effectiveExerciseKey);
  const catalogEntry: { datasetId?: string } | undefined =
    exerciseCatalog[effectiveExerciseKey];
  const datasetId = catalogEntry?.datasetId;
  const gifUrl =
    datasetId === undefined ? undefined : getExerciseGifUrl(datasetId);
  const instructions = useExerciseInstructions(datasetId);

  useEffect(() => {
    setIsCountdownRunning(false);

    const matchesPlannedOccurrence =
      completedEntry !== undefined &&
      completedEntry.primaryExerciseKey === step.primaryExerciseKey;
    if (matchesPlannedOccurrence) {
      setRepsInput(completedEntry.reps?.toString() ?? "");
      setDurationInput(completedEntry.duration?.toString() ?? "");
      setWeightInput(completedEntry.weight?.toString() ?? "");
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
        );
        setRepsInput(prefill.reps?.toString() ?? "");
        setDurationInput(prefill.duration?.toString() ?? "");
        setWeightInput(prefill.weight?.toString() ?? "");
      })
      .catch((error: unknown) => {
        console.error("Failed to load last used values", error);
      });

    return () => {
      isActive = false;
    };
  }, [step, effectiveExerciseKey, completedEntry]);

  const parsedReps = parsePositiveInteger(repsInput);
  const parsedDuration = parsePositiveInteger(durationInput);
  const weightParse = parseWeight(weightInput);

  const canContinue =
    parsedReps !== undefined && weightParse.isValid && !isSwapPending;
  const canStartCountdown = parsedDuration !== undefined && !isSwapPending;

  const submitCompletion = (values: LoggedSetValues) => {
    // Guards against double submission (double tap, or the countdown firing
    // in the same tick as a manual skip).
    if (hasSubmittedRef.current || isSwapPending) {
      return;
    }
    hasSubmittedRef.current = true;
    setErrorMessage(undefined);
    onComplete(values).catch((error: unknown) => {
      console.error("Failed to record the set completion", error);
      // Re-arm the submit guard so the user can retry.
      hasSubmittedRef.current = false;
      setIsCountdownRunning(false);
      setErrorMessage("No se pudo guardar la serie.");
    });
  };

  const handleContinue = () => {
    if (parsedReps === undefined || !weightParse.isValid) {
      return;
    }
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
    submitCompletion({ duration: parsedDuration });
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

  const hasAlternatives = step.alternatives.length > 0;
  const isExerciseChangeDisabled = isSwapPending || isCountdownRunning;
  const allExerciseKeys = [step.primaryExerciseKey, ...step.alternatives];
  const availableExerciseKeys = allExerciseKeys.filter(
    (exerciseKey) => exerciseKey !== effectiveExerciseKey,
  );
  const isGifVisible = gifUrl !== undefined && gifUrl !== hiddenGifUrl;
  const hasInstructions = instructions !== undefined;
  const hasExerciseActions = hasInstructions || hasAlternatives;
  const totalStepCount = progressGroups.reduce(
    (count, group) => count + group.stepIndexes.length,
    0,
  );
  const hasSessionProgress =
    currentStepIndex !== undefined && totalStepCount > 0;
  const completedStepIndexSet = new Set(completedStepIndexes);

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
            disabled={isSwapPending}
          >
            Salir
          </Button>
        </div>
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
                key={group.slotKey}
                data-test={`workout-progress-group-${group.slotKey}`}
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
                      data-group={group.slotKey}
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
      </header>

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
        </div>
      )}

      {isGifVisible && (
        <img
          data-test="set-exercise-gif"
          src={gifUrl}
          alt={`Demostración de ${exerciseName}`}
          className="w-full object-contain"
          onError={() => setHiddenGifUrl(gifUrl)}
        />
      )}

      {!isRepsSet && isCountdownRunning && parsedDuration !== undefined && (
        <DurationCountdown
          seconds={parsedDuration}
          onFinished={handleDurationFinished}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 supports-backdrop-filter:backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 pt-4 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]">
          {isRepsSet ? (
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
          ) : (
            !isCountdownRunning && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="set-duration"
                  className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase"
                >
                  Duración (segundos)
                </label>
                <Input
                  id="set-duration"
                  data-test="set-duration-input"
                  inputMode="numeric"
                  value={durationInput}
                  className="h-14 font-heading text-3xl font-semibold tabular-nums md:text-3xl"
                  onChange={(event) => setDurationInput(event.target.value)}
                />
              </div>
            )
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
              disabled={isFirstStep || isSwapPending}
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
              !isCountdownRunning && (
                <Button
                  data-test="set-start"
                  className="flex-1"
                  onClick={() => setIsCountdownRunning(true)}
                  disabled={!canStartCountdown}
                >
                  Empezar
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
