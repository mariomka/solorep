import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db, type RoutineRecord, type SessionRecord } from "@/lib/db";
import { formatDuration } from "@/lib/format-duration";
import { formatSetCount } from "@/lib/format-set-count";
import {
  aggregateTrainedExercises,
  buildExerciseNameMap,
  formatStatsDate,
  resolveExerciseName,
  resolveSessionLabels,
} from "@/lib/stats";
import { cn } from "@/lib/utils";

export type StatsTab = "exercises" | "sessions";

interface StatsScreenProps {
  tab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  onSelectExercise: (exerciseKey: string) => void;
  onSelectSession: (sessionId: number) => void;
  onBack: () => void;
}

interface SessionRowsProps {
  sessions: SessionRecord[];
  routines: RoutineRecord[];
  onSelectSession: (sessionId: number) => void;
}

function SessionRows({
  sessions,
  routines,
  onSelectSession,
}: SessionRowsProps) {
  return (
    <div className="border-t">
      {sessions.map((session) => {
        const { routineName, dayName } = resolveSessionLabels(
          session,
          routines,
        );
        const durationSeconds = Math.floor(
          (session.finishedAt - session.startedAt) / 1000,
        );
        return (
          <button
            key={session.id}
            data-test={`stats-session-${session.id}`}
            type="button"
            className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              if (session.id !== undefined) {
                onSelectSession(session.id);
              }
            }}
          >
            <Card className="cursor-pointer border-x-0 border-t-0 py-0 transition-colors hover:bg-accent">
              <CardHeader className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-5">
                <div className="min-w-0">
                  <div className="mb-2 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                    {routineName}
                  </div>
                  <CardTitle>{dayName}</CardTitle>
                  <CardDescription className="mt-1 tabular-nums">
                    {formatStatsDate(session.finishedAt)} ·{" "}
                    {formatDuration(durationSeconds)} ·{" "}
                    {formatSetCount(session.entries.length)}
                  </CardDescription>
                </div>
                <div className="col-start-2 row-start-1 self-center">
                  <ArrowRight className="size-4 text-primary" />
                </div>
              </CardHeader>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

interface ExerciseRowsProps {
  sessions: SessionRecord[];
  routines: RoutineRecord[];
  onSelectExercise: (exerciseKey: string) => void;
}

function ExerciseRows({
  sessions,
  routines,
  onSelectExercise,
}: ExerciseRowsProps) {
  const trainedExercises = aggregateTrainedExercises(sessions);
  const nameMap = buildExerciseNameMap(routines);

  return (
    <div className="border-t">
      {trainedExercises.map((exercise) => (
        <button
          key={exercise.exerciseKey}
          data-test={`stats-exercise-${exercise.exerciseKey}`}
          type="button"
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onSelectExercise(exercise.exerciseKey)}
        >
          <Card className="cursor-pointer border-x-0 border-t-0 py-0 transition-colors hover:bg-accent">
            <CardHeader className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-5">
              <div className="min-w-0">
                <CardTitle>
                  {resolveExerciseName(exercise.exerciseKey, nameMap)}
                </CardTitle>
                <CardDescription className="mt-1 tabular-nums">
                  {formatStatsDate(exercise.lastTrainedAt)}
                </CardDescription>
              </div>
              <div className="col-start-2 row-start-1 self-center">
                <ArrowRight className="size-4 text-primary" />
              </div>
            </CardHeader>
          </Card>
        </button>
      ))}
    </div>
  );
}

export function StatsScreen({
  tab,
  onTabChange,
  onSelectExercise,
  onSelectSession,
  onBack,
}: StatsScreenProps) {
  const data = useLiveQuery(() =>
    Promise.all([
      db.sessions.orderBy("finishedAt").reverse().toArray(),
      db.routines.toArray(),
    ]),
  );

  const isLoading = data === undefined;
  if (isLoading) {
    return null;
  }

  const [sessions, routines] = data;
  const hasSessions = sessions.length > 0;
  const isExercisesTab = tab === "exercises";

  return (
    <div className="flex flex-col">
      <Button
        data-test="stats-back"
        variant="ghost"
        size="sm"
        className="-ml-4 mb-8 self-start"
        aria-label="Volver"
        onClick={onBack}
      >
        <ArrowLeft />
        Volver
      </Button>
      <Badge variant="secondary" className="mb-3">
        Historial
      </Badge>
      <h2 className="mb-8 font-heading text-3xl font-semibold leading-tight">
        Estadísticas
      </h2>
      <div className="mb-6 flex gap-6">
        <button
          data-test="stats-tab-exercises"
          type="button"
          className={cn(
            "border-b-2 pb-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            isExercisesTab
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground",
          )}
          onClick={() => onTabChange("exercises")}
        >
          Ejercicios
        </button>
        <button
          data-test="stats-tab-sessions"
          type="button"
          className={cn(
            "border-b-2 pb-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            isExercisesTab
              ? "border-transparent text-muted-foreground"
              : "border-primary text-primary",
          )}
          onClick={() => onTabChange("sessions")}
        >
          Sesiones
        </button>
      </div>
      {isExercisesTab &&
        (hasSessions ? (
          <ExerciseRows
            sessions={sessions}
            routines={routines}
            onSelectExercise={onSelectExercise}
          />
        ) : (
          <p
            data-test="stats-exercises-empty"
            className="text-sm text-muted-foreground"
          >
            Aún no has entrenado ningún ejercicio.
          </p>
        ))}
      {!isExercisesTab &&
        (hasSessions ? (
          <SessionRows
            sessions={sessions}
            routines={routines}
            onSelectSession={onSelectSession}
          />
        ) : (
          <p
            data-test="stats-sessions-empty"
            className="text-sm text-muted-foreground"
          >
            Aún no hay sesiones registradas.
          </p>
        ))}
    </div>
  );
}
