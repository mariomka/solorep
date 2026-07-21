import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import type { RoutineDay } from "@/lib/routine-schema";
import { buildDayPlan } from "@/lib/session-plan";
import { discardActiveSession, getActiveSession } from "@/lib/session-store";

export interface ResumeTarget {
  routineId: string;
  dayIndex: number;
}

export interface ResumeSessionPromptProps {
  onResume: (target: ResumeTarget) => void;
}

export function ResumeSessionPrompt({ onResume }: ResumeSessionPromptProps) {
  const data = useLiveQuery(async () => {
    const session = await getActiveSession();
    if (session === undefined) {
      return { session: undefined, record: undefined };
    }
    const record = await db.routines.get(session.routineId);
    return { session, record };
  });

  const session = data?.session;
  const record = data?.record;

  let validDay: RoutineDay | undefined;
  if (session !== undefined && record !== undefined) {
    // The day at the stored index must still be the stored day: this single
    // invariant covers both a deleted day and a reordered days array.
    const day: RoutineDay | undefined = record.routine.days[session.dayIndex];
    const isDayMatching = day !== undefined && day.id === session.dayId;
    const isStepIndexInRange =
      isDayMatching && session.currentStepIndex <= buildDayPlan(day).length;
    if (isStepIndexInRange) {
      validDay = day;
    }
  }

  // A session pointing at deleted or mismatched data cannot be resumed:
  // silently drop it instead of surfacing a broken prompt.
  const isOrphaned = session !== undefined && validDay === undefined;
  useEffect(() => {
    if (isOrphaned) {
      discardActiveSession().catch((error: unknown) => {
        console.error("Failed to discard the orphaned session", error);
      });
    }
  }, [isOrphaned]);

  if (session === undefined || record === undefined || validDay === undefined) {
    return null;
  }

  return (
    <Card data-test="resume-session-prompt" className="gap-0 py-0">
      <CardHeader className="border-b px-6 py-6">
        <Badge variant="status" className="mb-2">
          En curso
        </Badge>
        <CardTitle className="text-xl">
          Tienes un entrenamiento en curso
        </CardTitle>
        <CardDescription data-test="resume-session-details" className="mt-1">
          {record.routine.name} — {validDay.name}
        </CardDescription>
      </CardHeader>
      <CardFooter className="gap-2 px-6 py-5">
        <Button
          data-test="resume-session-resume"
          className="flex-1"
          onClick={() => {
            onResume({
              routineId: session.routineId,
              dayIndex: session.dayIndex,
            });
          }}
        >
          Reanudar
        </Button>
        <Button
          data-test="resume-session-discard"
          variant="outline"
          onClick={() => {
            discardActiveSession().catch((error: unknown) => {
              console.error("Failed to discard the session", error);
            });
          }}
        >
          Descartar
        </Button>
      </CardFooter>
    </Card>
  );
}
