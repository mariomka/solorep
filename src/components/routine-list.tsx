import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { deleteRoutine } from "@/lib/routine-store";

interface RoutineListProps {
  onSelectRoutine: (routineId: string) => void;
}

function formatDayCount(dayCount: number): string {
  const isSingular = dayCount === 1;
  return isSingular ? "1 día" : `${dayCount} días`;
}

export function RoutineList({ onSelectRoutine }: RoutineListProps) {
  const routines = useLiveQuery(() =>
    db.routines.orderBy("importedAt").toArray(),
  );

  const isLoading = routines === undefined;
  if (isLoading) {
    return null;
  }

  const isEmpty = routines.length === 0;
  if (isEmpty) {
    return (
      <p data-test="routine-list-empty" className="text-muted-foreground">
        Importa una rutina para empezar.
      </p>
    );
  }

  return (
    <div data-test="routine-list" className="flex flex-col gap-3">
      {routines.map((record) => (
        <Card
          key={record.id}
          data-test={`routine-card-${record.id}`}
          role="button"
          tabIndex={0}
          aria-label={`Entrenar ${record.routine.name}`}
          className="cursor-pointer transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            onSelectRoutine(record.id);
          }}
          onKeyDown={(event) => {
            const isActivationKey = event.key === "Enter" || event.key === " ";
            const isCardItself = event.target === event.currentTarget;
            if (isActivationKey && isCardItself) {
              event.preventDefault();
              onSelectRoutine(record.id);
            }
          }}
        >
          <CardHeader>
            <CardTitle data-test={`routine-name-${record.id}`}>
              {record.routine.name}
            </CardTitle>
            <CardDescription data-test={`routine-day-count-${record.id}`}>
              {formatDayCount(record.routine.days.length)}
            </CardDescription>
            <CardAction>
              <Button
                data-test={`routine-delete-${record.id}`}
                variant="destructive"
                size="icon-sm"
                aria-label={`Eliminar ${record.routine.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteRoutine(record.id).catch((error: unknown) => {
                    console.error("Failed to delete routine", error);
                  });
                }}
              >
                <Trash2 />
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
