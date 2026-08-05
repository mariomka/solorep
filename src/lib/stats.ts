import type { RoutineRecord, SessionRecord } from "@/lib/db";

export interface TrainedExercise {
  exerciseKey: string;
  lastTrainedAt: number;
}

/**
 * Dedupes entries across all sessions by exerciseKey; lastTrainedAt is the
 * finishedAt of the latest session containing the key. Sorted most recent
 * first.
 */
export function aggregateTrainedExercises(
  sessions: SessionRecord[],
): TrainedExercise[] {
  const lastTrainedByKey = new Map<string, number>();
  for (const session of sessions) {
    for (const entry of session.entries) {
      const previous = lastTrainedByKey.get(entry.exerciseKey) ?? 0;
      const isMoreRecent = session.finishedAt > previous;
      if (isMoreRecent) {
        lastTrainedByKey.set(entry.exerciseKey, session.finishedAt);
      }
    }
  }
  return [...lastTrainedByKey.entries()]
    .map(([exerciseKey, lastTrainedAt]) => ({ exerciseKey, lastTrainedAt }))
    .sort((a, b) => b.lastTrainedAt - a.lastTrainedAt);
}

export type ProgressionMetric = "weight" | "reps" | "duration";

export interface ProgressionPoint {
  finishedAt: number;
  value: number;
}

export interface ExerciseProgression {
  metric: ProgressionMetric;
  points: ProgressionPoint[];
}

/**
 * One point per session: the max of the chosen metric among the session's
 * entries for the key. The metric is picked once across ALL the exercise's
 * sessions -- weight if any entry ever logged weight, else reps, else
 * duration -- and sessions with no value for it are skipped, not zeroed.
 */
export function buildExerciseProgression(
  sessions: SessionRecord[],
  exerciseKey: string,
): ExerciseProgression {
  const entriesBySession = sessions
    .map((session) => ({
      finishedAt: session.finishedAt,
      entries: session.entries.filter(
        (entry) => entry.exerciseKey === exerciseKey,
      ),
    }))
    .filter((session) => session.entries.length > 0);

  const allEntries = entriesBySession.flatMap((session) => session.entries);
  const hasWeight = allEntries.some((entry) => entry.weight !== undefined);
  const hasReps = allEntries.some((entry) => entry.reps !== undefined);
  const metric: ProgressionMetric = hasWeight
    ? "weight"
    : hasReps
      ? "reps"
      : "duration";

  const points: ProgressionPoint[] = [];
  for (const session of entriesBySession) {
    const values = session.entries
      .map((entry) => entry[metric])
      .filter((value): value is number => value !== undefined);
    const hasValues = values.length > 0;
    if (hasValues) {
      points.push({
        finishedAt: session.finishedAt,
        value: Math.max(...values),
      });
    }
  }
  points.sort((a, b) => a.finishedAt - b.finishedAt);

  return { metric, points };
}

/** Maps exercise keys to catalog names; latest importedAt wins on collisions. */
export function buildExerciseNameMap(
  routines: RoutineRecord[],
): Map<string, string> {
  const sortedByImport = [...routines].sort(
    (a, b) => a.importedAt - b.importedAt,
  );
  const nameMap = new Map<string, string>();
  for (const record of sortedByImport) {
    for (const [key, entry] of Object.entries(record.routine.exercises)) {
      nameMap.set(key, entry.name);
    }
  }
  return nameMap;
}

function humanizeKey(key: string): string {
  const words = key.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Catalog name when known, else humanized kebab key: "bench-press" -> "Bench press". */
export function resolveExerciseName(
  exerciseKey: string,
  nameMap: Map<string, string>,
): string {
  return nameMap.get(exerciseKey) ?? humanizeKey(exerciseKey);
}

export interface SessionLabels {
  routineName: string;
  dayName: string;
}

/**
 * Routine and day names for an archived session; both survive routine
 * deletion via fallbacks.
 */
export function resolveSessionLabels(
  session: SessionRecord,
  routines: RoutineRecord[],
): SessionLabels {
  const record = routines.find((routine) => routine.id === session.routineId);
  const routineName = record?.routine.name ?? "Rutina eliminada";
  const dayName =
    record?.routine.days.find((day) => day.id === session.dayId)?.name ??
    humanizeKey(session.dayId);
  return { routineName, dayName };
}

export interface SessionExerciseGroup {
  exerciseKey: string;
  sets: SessionRecord["entries"];
}

/** Groups entries by exerciseKey; group order = first appearance in entries. */
export function groupSessionEntries(
  entries: SessionRecord["entries"],
): SessionExerciseGroup[] {
  const groups: SessionExerciseGroup[] = [];
  const groupByKey = new Map<string, SessionExerciseGroup>();
  for (const entry of entries) {
    let group = groupByKey.get(entry.exerciseKey);
    if (group === undefined) {
      group = { exerciseKey: entry.exerciseKey, sets: [] };
      groupByKey.set(entry.exerciseKey, group);
      groups.push(group);
    }
    group.sets.push(entry);
  }
  return groups;
}

const statsDateFormat = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "5 ago 2026" style. */
export function formatStatsDate(epochMs: number): string {
  return statsDateFormat.format(epochMs);
}
