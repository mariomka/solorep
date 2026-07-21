import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ActiveSessionRecord, db } from "@/lib/db";
import { useExerciseInstructions } from "@/lib/exercise-instructions";
import { getExerciseGifUrl } from "@/lib/exercise-media";
import type { Routine } from "@/lib/routine-schema";
import {
  type LoggedSetValues,
  resolvePrefill,
  type WorkoutStep,
} from "@/lib/session-plan";
import { useCountdown } from "@/lib/use-countdown";

export type CompletedSetEntry = ActiveSessionRecord["completed"][number];

export interface SetScreenProps {
  step: WorkoutStep;
  exerciseCatalog: Routine["exercises"];
  effectiveExerciseKey: string;
  setNumber: number;
  totalSets: number;
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

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <p
        data-test="duration-timer"
        role="timer"
        aria-live="polite"
        className="font-heading text-8xl font-bold tabular-nums"
      >
        {remainingSeconds}
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
  const selectableExerciseKeys = [
    step.primaryExerciseKey,
    ...step.alternatives,
  ];
  const isGifVisible = gifUrl !== undefined && gifUrl !== hiddenGifUrl;
  const hasInstructions = instructions !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2
          data-test="set-exercise-name"
          className="font-heading text-2xl font-semibold"
        >
          {exerciseName}
        </h2>
        <p data-test="set-progress" className="text-muted-foreground">
          Serie {setNumber} de {totalSets}
        </p>
      </header>

      {hasAlternatives && (
        <Select
          value={effectiveExerciseKey}
          onValueChange={handleExerciseChange}
          disabled={isExerciseChangeDisabled}
        >
          <SelectTrigger
            data-test="set-exercise-select"
            className="w-full"
            aria-label="Cambiar ejercicio"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectableExerciseKeys.map((exerciseKey) => (
              <SelectItem
                key={exerciseKey}
                data-test={`set-exercise-option-${exerciseKey}`}
                value={exerciseKey}
              >
                {getExerciseName(exerciseCatalog, exerciseKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isGifVisible && (
        <img
          data-test="set-exercise-gif"
          src={gifUrl}
          alt={`Demostración de ${exerciseName}`}
          className="w-full rounded-xl bg-muted"
          onError={() => setHiddenGifUrl(gifUrl)}
        />
      )}

      {hasInstructions && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {instructions.map((instruction, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static ordered list, steps can repeat
            <li key={index}>{instruction}</li>
          ))}
        </ul>
      )}

      {isRepsSet ? (
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label
              htmlFor="set-weight"
              className="text-sm text-muted-foreground"
            >
              Peso (kg)
            </label>
            <Input
              data-test="set-weight-input"
              id="set-weight"
              inputMode="decimal"
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="set-reps" className="text-sm text-muted-foreground">
              Repeticiones
            </label>
            <Input
              data-test="set-reps-input"
              id="set-reps"
              inputMode="numeric"
              value={repsInput}
              onChange={(event) => setRepsInput(event.target.value)}
            />
          </div>
        </div>
      ) : isCountdownRunning && parsedDuration !== undefined ? (
        <DurationCountdown
          seconds={parsedDuration}
          onFinished={handleDurationFinished}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="set-duration"
            className="text-sm text-muted-foreground"
          >
            Duración (segundos)
          </label>
          <Input
            data-test="set-duration-input"
            id="set-duration"
            inputMode="numeric"
            value={durationInput}
            onChange={(event) => setDurationInput(event.target.value)}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
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
        <Button
          data-test="set-exit"
          variant="ghost"
          onClick={onExit}
          disabled={isSwapPending}
        >
          Salir
        </Button>
      </div>
    </div>
  );
}
