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

function formatDayCount(dayCount: number): string {
  const isSingular = dayCount === 1;
  return isSingular ? "1 día" : `${dayCount} días`;
}

export function RoutineList() {
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
      <p className="text-muted-foreground">Importa una rutina para empezar.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {routines.map((record) => (
        <Card key={record.id}>
          <CardHeader>
            <CardTitle>{record.routine.name}</CardTitle>
            <CardDescription>
              {formatDayCount(record.routine.days.length)}
            </CardDescription>
            <CardAction>
              <Button
                variant="destructive"
                size="icon-sm"
                aria-label={`Eliminar ${record.routine.name}`}
                onClick={() => {
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
