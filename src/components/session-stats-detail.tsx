import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/format-duration";
import {
  buildExerciseNameMap,
  formatStatsDate,
  groupSessionEntries,
  resolveExerciseName,
  resolveSessionLabels,
} from "@/lib/stats";

interface SessionStatsDetailProps {
  sessionId: number;
  onBack: () => void;
}

function formatSetCount(setCount: number): string {
  const isSingular = setCount === 1;
  return isSingular ? "1 serie" : `${setCount} series`;
}

export function SessionStatsDetail({
  sessionId,
  onBack,
}: SessionStatsDetailProps) {
  const data = useLiveQuery(
    () =>
      Promise.all([db.sessions.get(sessionId), db.routines.toArray()] as const),
    [sessionId],
  );

  const session = data?.[0];
  const isMissing = data !== undefined && session === undefined;
  useEffect(() => {
    // The caller guarantees the session exists; bail out if it does not.
    if (isMissing) {
      onBack();
    }
  }, [isMissing, onBack]);

  const isLoading = data === undefined;
  if (isLoading || session === undefined) {
    return null;
  }

  const [, routines] = data;
  const { routineName, dayName } = resolveSessionLabels(session, routines);
  const nameMap = buildExerciseNameMap(routines);
  const groups = groupSessionEntries(session.entries);
  const durationSeconds = Math.floor(
    (session.finishedAt - session.startedAt) / 1000,
  );

  return (
    <div className="flex flex-col">
      <Button
        data-test="session-stats-back"
        variant="ghost"
        size="sm"
        className="-ml-4 mb-8 self-start"
        aria-label="Volver"
        onClick={onBack}
      >
        <ArrowLeft />
        Volver
      </Button>
      <span className="mb-3 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
        {routineName}
      </span>
      <h2
        data-test="session-stats-day-name"
        className="mb-2 font-heading text-3xl font-semibold leading-tight"
      >
        {dayName}
      </h2>
      <p
        data-test="session-stats-metadata"
        className="mb-8 text-sm text-muted-foreground tabular-nums"
      >
        {formatStatsDate(session.finishedAt)} ·{" "}
        {formatDuration(durationSeconds)} ·{" "}
        {formatSetCount(session.entries.length)}
      </p>
      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <div
            key={group.exerciseKey}
            data-test={`session-detail-group-${group.exerciseKey}`}
          >
            <h3 className="mb-1 font-heading text-lg font-semibold">
              {resolveExerciseName(group.exerciseKey, nameMap)}
            </h3>
            <dl className="border-t">
              {group.sets.map((set) => (
                <div
                  key={set.setIndex}
                  className="flex items-baseline justify-between gap-6 border-b py-3"
                >
                  <dt className="text-sm text-muted-foreground">
                    Serie {set.setIndex + 1}
                  </dt>
                  <dd className="font-mono text-sm font-medium tabular-nums">
                    {set.reps !== undefined
                      ? `${set.reps} reps`
                      : formatDuration(set.duration ?? 0)}
                    {set.weight !== undefined && ` · ${set.weight} kg`}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
