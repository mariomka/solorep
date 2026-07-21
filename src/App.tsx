import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { DaySelection } from "@/components/day-selection";
import { ImportRoutineButton } from "@/components/import-routine-button";
import { ResumeSessionPrompt } from "@/components/resume-session-prompt";
import { RoutineList } from "@/components/routine-list";
import { SessionSummary } from "@/components/session-summary";
import { WorkoutScreen } from "@/components/workout-screen";
import { db, type RoutineRecord } from "@/lib/db";

type Screen =
  | { name: "list" }
  | { name: "day-selection"; routineId: string }
  | { name: "workout"; routineId: string; dayIndex: number }
  | { name: "summary" };

interface WorkoutRouteProps {
  routineId: string;
  dayIndex: number;
  onDayCompleted: () => void;
  onExit: () => void;
}

function WorkoutRoute({
  routineId,
  dayIndex,
  onDayCompleted,
  onExit,
}: WorkoutRouteProps) {
  const liveRecord = useLiveQuery(
    async () => (await db.routines.get(routineId)) ?? null,
    [routineId],
  );

  // The workout runs against a snapshot of the routine taken once on entry:
  // a re-import mid-workout must not mutate the plan under the reducer. The
  // live query stays only to bail out when the routine row disappears.
  const [snapshotRecord, setSnapshotRecord] = useState<
    RoutineRecord | undefined
  >(undefined);
  const shouldSnapshot =
    snapshotRecord === undefined &&
    liveRecord !== undefined &&
    liveRecord !== null;
  useEffect(() => {
    if (shouldSnapshot) {
      setSnapshotRecord(liveRecord);
    }
  }, [shouldSnapshot, liveRecord]);

  const isMissing = liveRecord === null;
  useEffect(() => {
    // The routine vanished mid-workout (deleted in another tab): bail out.
    if (isMissing) {
      onExit();
    }
  }, [isMissing, onExit]);

  const isLoading = snapshotRecord === undefined;
  if (isLoading || isMissing) {
    return null;
  }

  return (
    <WorkoutScreen
      routine={snapshotRecord.routine}
      dayIndex={dayIndex}
      onDayCompleted={onDayCompleted}
      onExit={onExit}
    />
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>({ name: "list" });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 p-4">
      {screen.name === "list" && (
        <>
          <h1 className="font-heading text-4xl font-black tracking-[-1px] uppercase">
            Solorep
          </h1>
          <ResumeSessionPrompt
            onResume={({ routineId, dayIndex }) => {
              setScreen({ name: "workout", routineId, dayIndex });
            }}
          />
          <RoutineList
            onSelectRoutine={(routineId) => {
              setScreen({ name: "day-selection", routineId });
            }}
          />
          <ImportRoutineButton />
        </>
      )}
      {screen.name === "day-selection" && (
        <DaySelection
          routineId={screen.routineId}
          onStartDay={(dayIndex) => {
            setScreen({
              name: "workout",
              routineId: screen.routineId,
              dayIndex,
            });
          }}
          onBack={() => {
            setScreen({ name: "list" });
          }}
        />
      )}
      {screen.name === "workout" && (
        <WorkoutRoute
          routineId={screen.routineId}
          dayIndex={screen.dayIndex}
          onDayCompleted={() => {
            setScreen({ name: "summary" });
          }}
          onExit={() => {
            setScreen({ name: "list" });
          }}
        />
      )}
      {screen.name === "summary" && (
        <SessionSummary
          onFinished={() => {
            setScreen({ name: "list" });
          }}
        />
      )}
    </main>
  );
}

export default App;
