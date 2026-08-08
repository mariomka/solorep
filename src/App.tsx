import { useLiveQuery } from "dexie-react-hooks";
import { ChartLine } from "lucide-react";
import { useEffect, useState } from "react";
import { DayOverview } from "@/components/day-overview";
import { DaySelection } from "@/components/day-selection";
import { ExerciseStatsDetail } from "@/components/exercise-stats-detail";
import { ResumeSessionPrompt } from "@/components/resume-session-prompt";
import { RoutineList } from "@/components/routine-list";
import { SessionStatsDetail } from "@/components/session-stats-detail";
import { SessionSummary } from "@/components/session-summary";
import { StatsScreen, type StatsTab } from "@/components/stats-screen";
import { Button } from "@/components/ui/button";
import { WorkoutScreen } from "@/components/workout-screen";
import { db, type RoutineRecord } from "@/lib/db";
import { findAutoResumableSession } from "@/lib/resume-session";

type Screen =
  | { name: "list" }
  | { name: "day-selection"; routineId: string }
  | { name: "day-overview"; routineId: string; dayIndex: number }
  | { name: "workout"; routineId: string; dayIndex: number }
  | { name: "summary" }
  | { name: "stats"; tab: StatsTab }
  | { name: "stats-exercise"; exerciseKey: string }
  | { name: "stats-session"; sessionId: number };

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
  // A session with recent activity re-enters the workout directly on launch
  // (a backgrounded PWA gets killed mid-rest; reopening must not lose the
  // countdown behind a prompt). Runs once on mount, so Salir still lands on
  // the list with the regular resume prompt.
  const [isAutoResumePending, setIsAutoResumePending] = useState(true);
  useEffect(() => {
    let isActive = true;
    findAutoResumableSession()
      .then((target) => {
        if (isActive && target !== undefined) {
          setScreen({
            name: "workout",
            routineId: target.routineId,
            dayIndex: target.dayIndex,
          });
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to check for an auto-resumable session", error);
      })
      .finally(() => {
        if (isActive) {
          setIsAutoResumePending(false);
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  if (isAutoResumePending) {
    return null;
  }

  return (
    <main
      data-test="app-shell"
      className="mx-auto flex min-h-svh w-full max-w-md flex-col pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-6 pl-[max(1.25rem,env(safe-area-inset-left))]"
    >
      {screen.name === "list" && (
        <>
          <header className="mb-10 flex items-center justify-between border-b pb-5">
            <h1
              data-test="app-title"
              className="font-heading text-4xl font-black tracking-[-1px] uppercase"
            >
              Solorep
            </h1>
            <Button
              data-test="stats-entry"
              variant="ghost"
              size="icon"
              aria-label="Estadísticas"
              onClick={() => {
                setScreen({ name: "stats", tab: "exercises" });
              }}
            >
              <ChartLine />
            </Button>
          </header>
          <div className="flex flex-col gap-8">
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
          </div>
        </>
      )}
      {screen.name === "day-selection" && (
        <DaySelection
          routineId={screen.routineId}
          onSelectDay={(dayIndex) => {
            setScreen({
              name: "day-overview",
              routineId: screen.routineId,
              dayIndex,
            });
          }}
          onBack={() => {
            setScreen({ name: "list" });
          }}
        />
      )}
      {screen.name === "day-overview" && (
        <DayOverview
          routineId={screen.routineId}
          dayIndex={screen.dayIndex}
          onStart={() => {
            setScreen({
              name: "workout",
              routineId: screen.routineId,
              dayIndex: screen.dayIndex,
            });
          }}
          onBack={() => {
            setScreen({
              name: "day-selection",
              routineId: screen.routineId,
            });
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
      {screen.name === "stats" && (
        <StatsScreen
          tab={screen.tab}
          onTabChange={(tab) => {
            setScreen({ name: "stats", tab });
          }}
          onSelectExercise={(exerciseKey) => {
            setScreen({ name: "stats-exercise", exerciseKey });
          }}
          onSelectSession={(sessionId) => {
            setScreen({ name: "stats-session", sessionId });
          }}
          onBack={() => {
            setScreen({ name: "list" });
          }}
        />
      )}
      {screen.name === "stats-exercise" && (
        <ExerciseStatsDetail
          key={screen.exerciseKey}
          exerciseKey={screen.exerciseKey}
          onBack={() => {
            setScreen({ name: "stats", tab: "exercises" });
          }}
        />
      )}
      {screen.name === "stats-session" && (
        <SessionStatsDetail
          sessionId={screen.sessionId}
          onBack={() => {
            setScreen({ name: "stats", tab: "sessions" });
          }}
        />
      )}
    </main>
  );
}

export default App;
