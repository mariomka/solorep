import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getExerciseGifUrl } from "@/lib/exercise-media";
import type { ExerciseSet, Routine, RoutineDay } from "@/lib/routine-schema";
import { startSession } from "@/lib/session-store";
import { prepareTimerAudio } from "@/lib/timer-feedback";
import { cn } from "@/lib/utils";

interface DayOverviewProps {
  routineId: string;
  dayIndex: number;
  onStart: () => void;
  onBack: () => void;
}

interface DayOverviewEntry {
  itemIndex: number;
  memberIndex: number;
  exerciseKey: string;
  sets: ExerciseSet[];
  isSuperset: boolean;
}

type CatalogEntry = Routine["exercises"][string];

function buildDayOverviewEntries(day: RoutineDay): DayOverviewEntry[] {
  return day.exercises.flatMap((item, itemIndex) => {
    const isSuperset = "superset" in item;
    const members = isSuperset ? item.superset : [item];

    return members.map((member, memberIndex) => ({
      itemIndex,
      memberIndex,
      exerciseKey: member.exercise,
      sets: member.sets,
      isSuperset,
    }));
  });
}

function formatSeriesCount(seriesCount: number): string {
  const isSingular = seriesCount === 1;
  return isSingular ? "1 serie" : `${seriesCount} series`;
}

function formatSetPrescription(sets: ExerciseSet[]): string {
  const seriesText = formatSeriesCount(sets.length);
  const repetitions = sets.flatMap((set) => ("reps" in set ? [set.reps] : []));
  const hasOnlyRepetitions = repetitions.length === sets.length;
  if (hasOnlyRepetitions) {
    return `${seriesText} · ${repetitions.join(" / ")} rep.`;
  }

  const durations = sets.flatMap((set) =>
    "duration" in set ? [set.duration] : [],
  );
  const hasOnlyDurations = durations.length === sets.length;
  if (hasOnlyDurations) {
    return `${seriesText} · ${durations.join(" / ")} s`;
  }

  return seriesText;
}

interface ExerciseOverviewRowProps {
  entry: DayOverviewEntry;
  catalogEntry: CatalogEntry | undefined;
  position: number;
}

function ExerciseOverviewRow({
  entry,
  catalogEntry,
  position,
}: ExerciseOverviewRowProps) {
  const datasetId = catalogEntry?.datasetId;
  const gifUrl =
    datasetId === undefined ? undefined : getExerciseGifUrl(datasetId);
  const [failedGifUrl, setFailedGifUrl] = useState<string | undefined>(
    undefined,
  );

  const isGifVisible = gifUrl !== undefined && gifUrl !== failedGifUrl;
  const exerciseName = catalogEntry?.name ?? entry.exerciseKey;
  const exerciseNote = catalogEntry?.note;
  const entryKey = `${entry.itemIndex}-${entry.memberIndex}`;

  return (
    <article
      data-test={`day-overview-exercise-${entryKey}`}
      className={cn(
        "grid gap-4 border-b py-5",
        isGifVisible && "grid-cols-[minmax(0,1fr)_6rem]",
      )}
    >
      <div className="min-w-0 self-center">
        <p className="mb-2 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
          {String(position).padStart(2, "0")} /{" "}
          {entry.isSuperset ? "Superserie" : "Ejercicio"}
        </p>
        <h3
          data-test={`day-overview-exercise-name-${entryKey}`}
          className="font-heading text-lg font-semibold leading-tight"
        >
          {exerciseName}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatSetPrescription(entry.sets)}
        </p>
        {exerciseNote !== undefined && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {exerciseNote}
          </p>
        )}
      </div>
      {isGifVisible && (
        <img
          data-test={`day-overview-exercise-image-${entryKey}`}
          src={gifUrl}
          alt={`Demostración de ${exerciseName}`}
          loading="lazy"
          className="h-24 w-24 object-contain"
          onError={() => setFailedGifUrl(gifUrl)}
        />
      )}
    </article>
  );
}

export function DayOverview({
  routineId,
  dayIndex,
  onStart,
  onBack,
}: DayOverviewProps) {
  const record = useLiveQuery(
    async () => (await db.routines.get(routineId)) ?? null,
    [routineId],
  );
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  const day = record?.routine.days[dayIndex];
  const hasLoaded = record !== undefined;
  const isUnavailable = hasLoaded && (record === null || day === undefined);
  useEffect(() => {
    if (isUnavailable) {
      onBack();
    }
  }, [isUnavailable, onBack]);

  if (record === undefined || record === null || day === undefined) {
    return null;
  }

  const entries = buildDayOverviewEntries(day);
  const totalSeries = entries.reduce(
    (seriesCount, entry) => seriesCount + entry.sets.length,
    0,
  );
  const exerciseCountText =
    entries.length === 1 ? "1 ejercicio" : `${entries.length} ejercicios`;

  const handleStart = () => {
    setIsStarting(true);
    setErrorMessage(undefined);
    prepareTimerAudio().catch((error: unknown) => {
      console.error("Failed to prepare timer audio", error);
    });
    startSession(routineId, day.id, dayIndex)
      .then(onStart)
      .catch((error: unknown) => {
        console.error("Failed to start session", error);
        setIsStarting(false);
        setErrorMessage("No se pudo empezar el entrenamiento.");
      });
  };

  return (
    <div data-test="day-overview" className="flex flex-col pb-8">
      <Button
        data-test="day-overview-back"
        variant="ghost"
        size="sm"
        className="-ml-4 mb-8 self-start"
        onClick={onBack}
      >
        <ArrowLeft />
        Volver
      </Button>
      <Badge variant="secondary" className="mb-3 self-start">
        Resumen del día
      </Badge>
      <h2
        data-test="day-overview-name"
        className="font-heading text-3xl font-semibold leading-tight"
      >
        {day.name}
      </h2>
      <p className="mt-2 mb-8 text-sm text-muted-foreground">
        {record.routine.name} · {exerciseCountText} ·{" "}
        {formatSeriesCount(totalSeries)}
      </p>

      <div className="border-t">
        {entries.map((entry, entryIndex) => (
          <ExerciseOverviewRow
            key={`${entry.itemIndex}:${entry.memberIndex}`}
            entry={entry}
            catalogEntry={record.routine.exercises[entry.exerciseKey]}
            position={entryIndex + 1}
          />
        ))}
      </div>

      {errorMessage !== undefined && (
        <p
          data-test="day-overview-error"
          role="alert"
          className="mt-6 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      )}
      <Button
        data-test="day-overview-start"
        size="lg"
        className="mt-8 w-full"
        onClick={handleStart}
        disabled={isStarting}
      >
        Empezar entrenamiento
      </Button>
    </div>
  );
}
