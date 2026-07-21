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
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

interface DaySelectionProps {
  routineId: string;
  onSelectDay: (dayIndex: number) => void;
  onBack: () => void;
}

function formatExerciseCount(exerciseCount: number): string {
  const isSingular = exerciseCount === 1;
  return isSingular ? "1 ejercicio" : `${exerciseCount} ejercicios`;
}

export function DaySelection({
  routineId,
  onSelectDay,
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
    <div className="flex flex-col">
      <Button
        data-test="day-selection-back"
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
        Seleccionar día
      </Badge>
      <h2
        data-test="day-selection-routine-name"
        className="mb-8 font-heading text-3xl font-semibold leading-tight"
      >
        {record.routine.name}
      </h2>
      <div className="border-t">
        {record.routine.days.map((day, dayIndex) => {
          const isNextDay = dayIndex === nextDayIndex;
          return (
            <button
              key={day.id}
              data-test={`day-card-${day.id}`}
              type="button"
              className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelectDay(dayIndex)}
            >
              <Card
                className={cn(
                  "cursor-pointer border-x-0 border-t-0 py-0 transition-colors hover:bg-accent",
                  isNextDay && "border-l-2 border-l-primary bg-accent/40",
                )}
              >
                <CardHeader className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-5">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                        Día {String(dayIndex + 1).padStart(2, "0")}
                      </span>
                      {isNextDay && (
                        <Badge
                          data-test={`day-next-badge-${day.id}`}
                          variant="status"
                        >
                          Siguiente
                        </Badge>
                      )}
                    </div>
                    <CardTitle data-test={`day-name-${day.id}`}>
                      {day.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {formatExerciseCount(day.exercises.length)}
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
    </div>
  );
}
