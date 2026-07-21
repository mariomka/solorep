import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Ellipsis, Trash2 } from "lucide-react";
import { ImportRoutineButton } from "@/components/import-routine-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      <div data-test="routine-list-empty" className="flex flex-col gap-8">
        <section
          className="flex flex-col gap-4"
          aria-labelledby="routines-title"
        >
          <Badge id="routines-title" variant="secondary">
            Rutinas
          </Badge>
          <div className="flex flex-col items-center border-y px-6 py-9 text-center">
            <img
              src={`${import.meta.env.BASE_URL}apple-touch-icon.png`}
              alt=""
              className="mb-5 size-20 opacity-80 grayscale"
            />
            <p
              data-test="routine-list-empty-message"
              className="max-w-56 text-sm leading-relaxed text-muted-foreground"
            >
              Importa una rutina para empezar.
            </p>
          </div>
        </section>
        <ImportRoutineButton />
      </div>
    );
  }

  return (
    <div data-test="routine-list">
      <section className="flex flex-col gap-4" aria-labelledby="routines-title">
        <div className="grid grid-cols-[1fr_auto] items-center gap-y-2">
          <Badge id="routines-title" variant="secondary">
            Rutinas
          </Badge>
          <ImportRoutineButton mode="menu" />
        </div>
        <div className="border-t">
          {routines.map((record, routineIndex) => (
            <Card
              key={record.id}
              className="border-x-0 border-t-0 py-0 transition-colors hover:bg-accent"
            >
              <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] px-4 py-5">
                <button
                  type="button"
                  data-test={`routine-card-${record.id}`}
                  aria-label={`Entrenar ${record.routine.name}`}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => {
                    onSelectRoutine(record.id);
                  }}
                >
                  <div className="min-w-0">
                    <p className="mb-2 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                      Rutina {String(routineIndex + 1).padStart(2, "0")}
                    </p>
                    <CardTitle
                      data-test={`routine-name-${record.id}`}
                      className="truncate"
                    >
                      {record.routine.name}
                    </CardTitle>
                    <CardDescription
                      data-test={`routine-day-count-${record.id}`}
                      className="mt-1"
                    >
                      {formatDayCount(record.routine.days.length)}
                    </CardDescription>
                  </div>
                  <ArrowRight className="ml-4 size-4 text-primary" />
                </button>
                <div className="flex items-center self-center pl-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        data-test={`routine-menu-${record.id}`}
                        variant="ghost"
                        size="icon-lg"
                        className="text-muted-foreground hover:bg-transparent hover:text-foreground"
                        aria-label={`Opciones de ${record.routine.name}`}
                      >
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-auto">
                      <DropdownMenuItem
                        data-test={`delete-routine-${record.id}`}
                        onSelect={() => {
                          deleteRoutine(record.id).catch((error: unknown) => {
                            console.error("Failed to delete routine", error);
                          });
                        }}
                      >
                        <Trash2 />
                        Eliminar rutina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
