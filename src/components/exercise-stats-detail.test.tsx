import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ExerciseStatsDetail } from "@/components/exercise-stats-detail";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { clearDatabase } from "@/test/helpers";

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
): Promise<void> {
  await db.sessions.add({
    routineId: "mini",
    dayId: "day-1",
    startedAt: 1_000_000,
    finishedAt: 1_300_000,
    entries: entries.map((entry, setIndex) => ({
      ...entry,
      setIndex,
      completedAt: 1_100_000 + setIndex,
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
});
