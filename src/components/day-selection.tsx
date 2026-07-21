import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { startSession } from "@/lib/session-store";

interface DaySelectionProps {
  routineId: string;
  onStartDay: (dayIndex: number) => void;
  onBack: () => void;
}

function formatExerciseCount(exerciseCount: number): string {
  const isSingular = exerciseCount === 1;
  return isSingular ? "1 ejercicio" : `${exerciseCount} ejercicios`;
}

export function DaySelection({
  routineId,
  onStartDay,
  onBack,
}: DaySelectionProps) {
  const data = useLiveQuery(async () => {
    const [record, progress] = await Promise.all([
      db.routines.get(routineId),
      db.progress.get(routineId),
    ]);
    return { record, progress };
  }, [routineId]);

  const isLoading = data === undefined;
  if (isLoading) {
    return null;
  }

  const record = data.record;
  const isMissing = record === undefined;
  if (isMissing) {
    return null;
  }

  const nextDayIndex = data.progress?.currentDayIndex ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="ghost"
        className="self-start"
        aria-label="Volver"
        onClick={onBack}
      >
        <ArrowLeft />
        Volver
      </Button>
      <h2 className="font-heading text-2xl font-bold">{record.routine.name}</h2>
      <div className="flex flex-col gap-3">
        {record.routine.days.map((day, dayIndex) => {
          const isNextDay = dayIndex === nextDayIndex;
          return (
            <button
              key={day.id}
              type="button"
              className="rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                startSession(routineId, day.id, dayIndex)
                  .then(() => {
                    onStartDay(dayIndex);
                  })
                  .catch((error: unknown) => {
                    console.error("Failed to start session", error);
                  });
              }}
            >
              <Card className="cursor-pointer transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle>{day.name}</CardTitle>
                  <CardDescription>
                    {formatExerciseCount(day.exercises.length)}
                  </CardDescription>
                  {isNextDay && (
                    <CardAction>
                      <Badge>Siguiente</Badge>
                    </CardAction>
                  )}
                </CardHeader>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
