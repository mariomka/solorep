import { useLiveQuery } from "dexie-react-hooks";
import { ChartLine } from "lucide-react";
import { useEffect, useState } from "react";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { DayOverview } from "@/components/day-overview";
import { DaySelection } from "@/components/day-selection";
import { ExerciseStatsDetail } from "@/components/exercise-stats-detail";
import { ResumeSessionPrompt } from "@/components/resume-session-prompt";
import { RoutineList } from "@/components/routine-list";
import { SessionStatsDetail } from "@/components/session-stats-detail";
import { SessionSummary } from "@/components/session-summary";
import { StatsScreen } from "@/components/stats-screen";
import { Button } from "@/components/ui/button";
import { WorkoutScreen } from "@/components/workout-screen";
import { db, type RoutineRecord } from "@/lib/db";
import { findAutoResumableSession } from "@/lib/resume-session";

function parseNumericParam(raw: string): number | undefined {
  const isNumeric = /^\d+$/.test(raw);
  if (!isNumeric) {
    return undefined;
  }
  return Number.parseInt(raw, 10);
}

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
  const isRecordLoaded = liveRecord !== undefined && liveRecord !== null;
  // The day check only guards entry (a stale deep link): once the snapshot
  // exists, a re-import that shrinks the days must not eject the workout.
  const isDayMissing =
    snapshotRecord === undefined &&
    isRecordLoaded &&
    liveRecord.routine.days[dayIndex] === undefined;
  const shouldSnapshot =
    snapshotRecord === undefined && isRecordLoaded && !isDayMissing;
  useEffect(() => {
    if (shouldSnapshot) {
      setSnapshotRecord(liveRecord);
    }
  }, [shouldSnapshot, liveRecord]);

  const isMissing = liveRecord === null;
  useEffect(() => {
    // The routine vanished mid-workout (deleted in another tab) or the day
    // index points past the plan on entry (stale deep link): bail out.
    if (isMissing || isDayMissing) {
      onExit();
    }
  }, [isMissing, isDayMissing, onExit]);

  const isLoading = snapshotRecord === undefined;
  if (isLoading || isMissing || isDayMissing) {
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

function AppShell() {
  const [, navigate] = useLocation();

  // A session with recent activity re-enters the workout directly on launch
  // (a backgrounded PWA gets killed mid-rest; reopening must not lose the
  // countdown behind a prompt). Runs once on mount regardless of the load
  // route, so Salir still lands on the list with the regular resume prompt.
  const [isAutoResumePending, setIsAutoResumePending] = useState(true);
  useEffect(() => {
    let isActive = true;
    findAutoResumableSession()
      .then((target) => {
        if (isActive && target !== undefined) {
          navigate(`/workout/${target.routineId}/${target.dayIndex}`, {
            replace: true,
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
  }, [navigate]);

  if (isAutoResumePending) {
    return null;
  }

  return (
    <main
      data-test="app-shell"
      className="mx-auto flex min-h-svh w-full max-w-md flex-col pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-6 pl-[max(1.25rem,env(safe-area-inset-left))]"
    >
      <Switch>
        <Route path="/">
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
                navigate("/stats/exercises");
              }}
            >
              <ChartLine />
            </Button>
          </header>
          <div className="flex flex-col gap-8">
            <ResumeSessionPrompt
              onResume={({ routineId, dayIndex }) => {
                navigate(`/workout/${routineId}/${dayIndex}`);
              }}
            />
            <RoutineList
              onSelectRoutine={(routineId) => {
                navigate(`/routine/${routineId}`);
              }}
            />
          </div>
        </Route>
        <Route path="/routine/:id">
          {(params) => (
            <DaySelection
              routineId={params.id}
              onSelectDay={(dayIndex) => {
                navigate(`/routine/${params.id}/day/${dayIndex}`);
              }}
              onBack={() => {
                navigate("/");
              }}
              onMissing={() => {
                navigate("/", { replace: true });
              }}
            />
          )}
        </Route>
        <Route path="/routine/:id/day/:n">
          {(params) => {
            const dayIndex = parseNumericParam(params.n);
            if (dayIndex === undefined) {
              return <Redirect to="/" replace />;
            }
            return (
              <DayOverview
                routineId={params.id}
                dayIndex={dayIndex}
                onStart={() => {
                  navigate(`/workout/${params.id}/${dayIndex}`);
                }}
                onBack={() => {
                  navigate(`/routine/${params.id}`);
                }}
                onUnavailable={() => {
                  navigate("/", { replace: true });
                }}
              />
            );
          }}
        </Route>
        <Route path="/workout/:id/:n">
          {(params) => {
            const dayIndex = parseNumericParam(params.n);
            if (dayIndex === undefined) {
              return <Redirect to="/" replace />;
            }
            return (
              <WorkoutRoute
                routineId={params.id}
                dayIndex={dayIndex}
                onDayCompleted={() => {
                  navigate("/summary", { replace: true });
                }}
                onExit={() => {
                  navigate("/", { replace: true });
                }}
              />
            );
          }}
        </Route>
        <Route path="/summary">
          <SessionSummary
            onFinished={() => {
              navigate("/", { replace: true });
            }}
          />
        </Route>
        <Route path="/stats/exercise/:key">
          {(params) => (
            <ExerciseStatsDetail
              // Keyed by exercise so the range state resets per exercise.
              key={params.key}
              exerciseKey={params.key}
              onBack={() => {
                navigate("/stats/exercises");
              }}
            />
          )}
        </Route>
        <Route path="/stats/session/:id">
          {(params) => {
            const sessionId = parseNumericParam(params.id);
            if (sessionId === undefined) {
              return <Redirect to="/" replace />;
            }
            return (
              <SessionStatsDetail
                sessionId={sessionId}
                onBack={() => {
                  navigate("/stats/sessions");
                }}
                onMissing={() => {
                  navigate("/stats/sessions", { replace: true });
                }}
              />
            );
          }}
        </Route>
        <Route path="/stats/:tab">
          {(params) => {
            const tab = params.tab;
            // An inline check instead of a named boolean: TypeScript only
            // narrows the tab union through the direct comparison.
            if (tab !== "exercises" && tab !== "sessions") {
              return <Redirect to="/" replace />;
            }
            return (
              <StatsScreen
                tab={tab}
                onTabChange={(nextTab) => {
                  navigate(`/stats/${nextTab}`, { replace: true });
                }}
                onSelectExercise={(exerciseKey) => {
                  navigate(
                    `/stats/exercise/${encodeURIComponent(exerciseKey)}`,
                  );
                }}
                onSelectSession={(sessionId) => {
                  navigate(`/stats/session/${sessionId}`);
                }}
                onBack={() => {
                  navigate("/");
                }}
              />
            );
          }}
        </Route>
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
    </main>
  );
}

function App() {
  // The Router stays here so App.test.tsx exercises the real routing.
  return (
    <Router hook={useHashLocation}>
      <AppShell />
    </Router>
  );
}

export default App;
