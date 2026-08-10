import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getExerciseGifUrl } from "@/lib/exercise-media";
import { formatSetCount } from "@/lib/format-set-count";
import type {
  DayItemPhase,
  ExerciseSet,
  Routine,
  RoutineDay,
} from "@/lib/routine-schema";
import { resolveItemPhase } from "@/lib/routine-schema";
import { getActiveSession, startSession } from "@/lib/session-store";
import { prepareTimerAudio } from "@/lib/timer-feedback";
import { cn } from "@/lib/utils";

interface DayOverviewProps {
  routineId: string;
  dayIndex: number;
  onStart: () => void;
  onBack: () => void;
  onUnavailable: () => void;
}

interface DayOverviewEntry {
  itemIndex: number;
  memberIndex: number;
  exerciseKey: string;
  sets: ExerciseSet[];
  isSuperset: boolean;
}

/** A contiguous run of items sharing a phase, in execution order. */
interface DayOverviewSection {
  phase: DayItemPhase;
  entries: DayOverviewEntry[];
}

type CatalogEntry = Routine["exercises"][string];

const SECTION_LABELS: Record<DayItemPhase, string> = {
  warmup: "Calentamiento",
  work: "Principal",
  cooldown: "Estiramientos",
};

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

/**
 * Groups the day into contiguous runs of the same phase. Runs rather than
 * phases: the overview promises execution order, so an unusual day that
 * interleaves phases gets more sections instead of a reordered list. A day
 * with a single run (every routine authored before phases existed) yields one
 * unlabelled section and renders exactly as it always did.
 */
function buildDayOverviewSections(day: RoutineDay): DayOverviewSection[] {
  const sections: DayOverviewSection[] = [];

  day.exercises.forEach((item, itemIndex) => {
    const phase = resolveItemPhase(item);
    const isSuperset = "superset" in item;
    const members = isSuperset ? item.superset : [item];
    const entries = members.map((member, memberIndex) => ({
      itemIndex,
      memberIndex,
      exerciseKey: member.exercise,
      sets: member.sets,
      isSuperset,
    }));

    const currentSection = sections[sections.length - 1];
    const continuesRun = currentSection?.phase === phase;
    if (continuesRun) {
      currentSection.entries.push(...entries);
      return;
    }
    sections.push({ phase, entries });
  });

  return sections;
}

function formatSetPrescription(sets: ExerciseSet[]): string {
  const seriesText = formatSetCount(sets.length);
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

/**
 * Prescription for a compact row. Single-set warm-ups and stretches are the
 * norm, and "1 serie ·" in front of every one of them is noise, so the series
 * count only appears once there is more than one.
 */
function formatCompactPrescription(sets: ExerciseSet[]): string {
  const isSingleSet = sets.length === 1;
  if (!isSingleSet) {
    return formatSetPrescription(sets);
  }

  const [set] = sets;
  return "reps" in set ? `${set.reps} rep.` : `${set.duration} s`;
}

interface CompactOverviewRowProps {
  entry: DayOverviewEntry;
  catalogEntry: CatalogEntry | undefined;
}

/**
 * Warm-ups and stretches: name and prescription on one line, no thumbnail and
 * no number. They are the bulk of the rows and the least of the session, and
 * their note still shows on the set screen when the exercise comes up.
 */
function CompactOverviewRow({ entry, catalogEntry }: CompactOverviewRowProps) {
  const exerciseName = catalogEntry?.name ?? entry.exerciseKey;
  const entryKey = `${entry.itemIndex}-${entry.memberIndex}`;

  return (
    <div
      data-test={`day-overview-exercise-${entryKey}`}
      className="flex items-baseline justify-between gap-4 border-b py-3"
    >
      <p
        data-test={`day-overview-exercise-name-${entryKey}`}
        className="min-w-0 truncate text-sm"
      >
        {exerciseName}
      </p>
      <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
        {formatCompactPrescription(entry.sets)}
      </p>
    </div>
  );
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
  onUnavailable,
}: DayOverviewProps) {
  const data = useLiveQuery(
    async () => ({
      record: (await db.routines.get(routineId)) ?? null,
      session: await getActiveSession(),
    }),
    [routineId],
  );
  const record = data?.record;
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  const day = record?.routine.days[dayIndex];
  const hasLoaded = record !== undefined;
  const isUnavailable = hasLoaded && (record === null || day === undefined);
  useEffect(() => {
    if (isUnavailable) {
      onUnavailable();
    }
  }, [isUnavailable, onUnavailable]);

  if (record === undefined || record === null || day === undefined) {
    return null;
  }

  // A session for this very day is resumed, never restarted, so the action
  // says what it does instead of promising a fresh start over logged sets.
  const session = data?.session;
  const isDayInProgress =
    session !== undefined &&
    session.routineId === routineId &&
    session.dayId === day.id &&
    session.dayIndex === dayIndex;

  const entries = buildDayOverviewEntries(day);
  const sections = buildDayOverviewSections(day);
  // A day with a single run has nothing to distinguish, so it stays the plain
  // unlabelled list it was before phases existed.
  const isSectioned = sections.length > 1;
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
        {formatSetCount(totalSeries)}
      </p>

      {sections.map((section) => {
        const isWorkSection = section.phase === "work";
        return (
          <section
            key={`${section.phase}-${section.entries[0].itemIndex}`}
            data-test={`day-overview-section-${section.phase}`}
            className="mb-8 last:mb-0"
          >
            {isSectioned && (
              <h3
                data-test={`day-overview-section-label-${section.phase}`}
                className="mb-3 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase"
              >
                {SECTION_LABELS[section.phase]} · {section.entries.length}
              </h3>
            )}
            <div className="border-t">
              {section.entries.map((entry, entryIndex) =>
                isWorkSection ? (
                  <ExerciseOverviewRow
                    key={`${entry.itemIndex}:${entry.memberIndex}`}
                    entry={entry}
                    catalogEntry={record.routine.exercises[entry.exerciseKey]}
                    position={entryIndex + 1}
                  />
                ) : (
                  <CompactOverviewRow
                    key={`${entry.itemIndex}:${entry.memberIndex}`}
                    entry={entry}
                    catalogEntry={record.routine.exercises[entry.exerciseKey]}
                  />
                ),
              )}
            </div>
          </section>
        );
      })}

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
        {isDayInProgress ? "Reanudar entrenamiento" : "Empezar entrenamiento"}
      </Button>
    </div>
  );
}
