import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatsScreen, type StatsTab } from "@/components/stats-screen";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { clearDatabase } from "@/test/helpers";

const routine = parseRoutine({
  id: "mini",
  name: "Mini",
  exercises: {
    "push-up": { name: "Flexiones" },
    squat: { name: "Sentadilla" },
  },
  days: [
    {
      id: "day-1",
      name: "Día de empuje",
      exercises: [{ exercise: "push-up", rest: 5, sets: [{ reps: 10 }] }],
    },
  ],
});

async function seedRoutine(): Promise<void> {
  await db.routines.put({ id: routine.id, routine, importedAt: 1000 });
}

async function seedSessions(): Promise<{ oldId: number; newId: number }> {
  const oldId = 1;
  const newId = 2;
  await db.sessions.add({
    id: oldId,
    routineId: "mini",
    dayId: "day-1",
    startedAt: 1_000_000,
    finishedAt: 1_300_000,
    entries: [
      { exerciseKey: "push-up", setIndex: 0, reps: 10, completedAt: 1_100_000 },
      { exerciseKey: "squat", setIndex: 0, reps: 8, completedAt: 1_200_000 },
    ],
  });
  await db.sessions.add({
    id: newId,
    routineId: "deleted-routine",
    dayId: "leg-day",
    startedAt: 2_000_000,
    finishedAt: 2_600_000,
    entries: [
      {
        exerciseKey: "goblet-squat",
        setIndex: 0,
        reps: 12,
        weight: 16,
        completedAt: 2_100_000,
      },
    ],
  });
  return { oldId, newId };
}

interface RenderOptions {
  tab?: StatsTab;
  onSelectExercise?: (exerciseKey: string) => void;
  onSelectSession?: (sessionId: number) => void;
}

// The tab is controlled by the parent screen state, so tests drive it through
// a minimal stateful harness.
function StatsHarness({
  tab: initialTab = "exercises",
  onSelectExercise = () => {},
  onSelectSession = () => {},
}: RenderOptions) {
  const [tab, setTab] = useState<StatsTab>(initialTab);
  return (
    <StatsScreen
      tab={tab}
      onTabChange={setTab}
      onSelectExercise={onSelectExercise}
      onSelectSession={onSelectSession}
      onBack={() => {}}
    />
  );
}

function renderStats(options: RenderOptions = {}) {
  return render(<StatsHarness {...options} />);
}

beforeEach(clearDatabase);

describe("StatsScreen", () => {
  it("shows an empty message per tab when there are no sessions", async () => {
    renderStats();
    expect(
      await screen.findByTestId("stats-exercises-empty"),
    ).toHaveTextContent("Aún no has entrenado ningún ejercicio.");

    renderStats({ tab: "sessions" });
    expect(await screen.findByTestId("stats-sessions-empty")).toHaveTextContent(
      "Aún no hay sesiones registradas.",
    );
  });

  it("lists trained exercises by recency with catalog names and humanized fallbacks", async () => {
    await seedRoutine();
    await seedSessions();

    renderStats();

    const gobletRow = await screen.findByTestId("stats-exercise-goblet-squat");
    expect(gobletRow).toHaveTextContent("Goblet squat");
    expect(screen.getByTestId("stats-exercise-push-up")).toHaveTextContent(
      "Flexiones",
    );
    expect(screen.getByTestId("stats-exercise-squat")).toHaveTextContent(
      "Sentadilla",
    );

    const rows = screen.getAllByTestId(/^stats-exercise-/);
    expect(rows.map((row) => row.getAttribute("data-test"))).toEqual([
      "stats-exercise-goblet-squat",
      "stats-exercise-push-up",
      "stats-exercise-squat",
    ]);
  });

  it("lists sessions with routine, day, date, duration, and set count", async () => {
    await seedRoutine();
    const { oldId, newId } = await seedSessions();

    renderStats();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("stats-tab-sessions"));

    await waitFor(() => {
      expect(screen.getByTestId(`stats-session-${oldId}`)).toBeInTheDocument();
    });

    const knownRow = screen.getByTestId(`stats-session-${oldId}`);
    expect(knownRow).toHaveTextContent("Mini");
    expect(knownRow).toHaveTextContent("Día de empuje");
    expect(knownRow).toHaveTextContent("5:00");
    expect(knownRow).toHaveTextContent("2 series");

    const orphanRow = screen.getByTestId(`stats-session-${newId}`);
    expect(orphanRow).toHaveTextContent("Rutina eliminada");
    expect(orphanRow).toHaveTextContent("Leg day");
    expect(orphanRow).toHaveTextContent("10:00");
    expect(orphanRow).toHaveTextContent("1 serie");

    const rows = screen.getAllByTestId(/^stats-session-/);
    expect(rows.map((row) => row.getAttribute("data-test"))).toEqual([
      `stats-session-${newId}`,
      `stats-session-${oldId}`,
    ]);
  });

  it("fires onSelectExercise and onSelectSession with the row's key and id", async () => {
    await seedRoutine();
    const { newId } = await seedSessions();
    const onSelectExercise = vi.fn();
    const onSelectSession = vi.fn();

    renderStats({ onSelectExercise, onSelectSession });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("stats-exercise-push-up"));
    expect(onSelectExercise).toHaveBeenCalledWith("push-up");

    await user.click(screen.getByTestId("stats-tab-sessions"));
    await user.click(await screen.findByTestId(`stats-session-${newId}`));
    expect(onSelectSession).toHaveBeenCalledWith(newId);
  });
});
