import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ExerciseStatsDetail } from "@/components/exercise-stats-detail";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { clearDatabase } from "@/test/helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_AT = Date.now() - 10 * DAY_MS;
const OLD_AT = Date.now() - 120 * DAY_MS;

const routine = parseRoutine({
  id: "mini",
  name: "Mini",
  exercises: {
    squat: { name: "Sentadilla" },
    "push-up": { name: "Flexiones" },
  },
  days: [
    {
      id: "day-1",
      name: "Día 1",
      exercises: [{ exercise: "squat", rest: 5, sets: [{ reps: 10 }] }],
    },
  ],
});

async function seedRoutine(): Promise<void> {
  await db.routines.put({ id: routine.id, routine, importedAt: 1000 });
}

async function seedSession(
  entries: Array<{
    exerciseKey: string;
    reps?: number;
    duration?: number;
    weight?: number;
  }>,
  finishedAt = 1_300_000,
): Promise<void> {
  await db.sessions.add({
    routineId: "mini",
    dayId: "day-1",
    startedAt: finishedAt - 300_000,
    finishedAt,
    entries: entries.map((entry, setIndex) => ({
      ...entry,
      setIndex,
      completedAt: finishedAt - 200_000 + setIndex,
    })),
  });
}

beforeEach(clearDatabase);

describe("ExerciseStatsDetail", () => {
  it("shows the resolved name, the weight metric label, and the chart", async () => {
    await seedRoutine();
    await seedSession([{ exerciseKey: "squat", reps: 8, weight: 60 }]);

    render(<ExerciseStatsDetail exerciseKey="squat" onBack={() => {}} />);

    expect(await screen.findByTestId("exercise-stats-name")).toHaveTextContent(
      "Sentadilla",
    );
    expect(screen.getByTestId("exercise-progression-metric")).toHaveTextContent(
      "Peso máximo (kg)",
    );
    expect(
      screen.getByTestId("exercise-progression-chart"),
    ).toBeInTheDocument();
  });

  it("falls back to the reps metric when no weight was ever logged", async () => {
    await seedRoutine();
    await seedSession([{ exerciseKey: "push-up", reps: 12 }]);

    render(<ExerciseStatsDetail exerciseKey="push-up" onBack={() => {}} />);

    expect(
      await screen.findByTestId("exercise-progression-metric"),
    ).toHaveTextContent("Repeticiones máximas");
    expect(
      screen.getByTestId("exercise-progression-chart"),
    ).toBeInTheDocument();
  });

  it("shows an empty message when the exercise has no data", async () => {
    await seedRoutine();

    render(<ExerciseStatsDetail exerciseKey="squat" onBack={() => {}} />);

    expect(
      await screen.findByTestId("exercise-progression-empty"),
    ).toHaveTextContent("No hay datos para este ejercicio.");
    expect(
      screen.queryByTestId("exercise-progression-chart"),
    ).not.toBeInTheDocument();
  });

  it("defaults to 3M when recent and old points exist", async () => {
    await seedRoutine();
    await seedSession([{ exerciseKey: "squat", weight: 50 }], OLD_AT);
    await seedSession([{ exerciseKey: "squat", weight: 60 }], RECENT_AT);

    render(<ExerciseStatsDetail exerciseKey="squat" onBack={() => {}} />);

    expect(await screen.findByTestId("chart-range-3m")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("chart-range-all")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("opens on Todo when all points are older than the 3m window", async () => {
    await seedRoutine();
    await seedSession([{ exerciseKey: "squat", weight: 50 }], OLD_AT);

    render(<ExerciseStatsDetail exerciseKey="squat" onBack={() => {}} />);

    expect(await screen.findByTestId("chart-range-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("chart-range-empty")).not.toBeInTheDocument();
  });

  it("switches the active range on click", async () => {
    await seedRoutine();
    await seedSession([{ exerciseKey: "squat", weight: 50 }], OLD_AT);
    await seedSession([{ exerciseKey: "squat", weight: 60 }], RECENT_AT);
    const user = userEvent.setup();

    render(<ExerciseStatsDetail exerciseKey="squat" onBack={() => {}} />);

    await user.click(await screen.findByTestId("chart-range-1y"));
    await waitFor(() =>
      expect(screen.getByTestId("chart-range-1y")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );

    await user.click(screen.getByTestId("chart-range-all"));
    await waitFor(() =>
      expect(screen.getByTestId("chart-range-all")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("shows the empty-period message when 3M is selected with only old points", async () => {
    await seedRoutine();
    await seedSession([{ exerciseKey: "squat", weight: 50 }], OLD_AT);
    const user = userEvent.setup();

    render(<ExerciseStatsDetail exerciseKey="squat" onBack={() => {}} />);

    await user.click(await screen.findByTestId("chart-range-3m"));

    expect(await screen.findByTestId("chart-range-empty")).toHaveTextContent(
      "No hay datos en este periodo.",
    );
    expect(screen.getByTestId("chart-range-3m")).toBeInTheDocument();
  });

  it("hides the selector when all points are within the 3m window", async () => {
    await seedRoutine();
    await seedSession([{ exerciseKey: "squat", weight: 60 }], RECENT_AT);

    render(<ExerciseStatsDetail exerciseKey="squat" onBack={() => {}} />);

    expect(
      await screen.findByTestId("exercise-progression-chart"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("chart-range-3m")).not.toBeInTheDocument();
  });
});
