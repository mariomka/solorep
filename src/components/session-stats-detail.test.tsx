import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStatsDetail } from "@/components/session-stats-detail";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { clearDatabase } from "@/test/helpers";

const routine = parseRoutine({
  id: "mini",
  name: "Mini",
  exercises: {
    squat: { name: "Sentadilla" },
    plank: { name: "Plancha" },
    "push-up": { name: "Flexiones" },
  },
  days: [
    {
      id: "day-1",
      name: "Día completo",
      exercises: [{ exercise: "squat", rest: 5, sets: [{ reps: 10 }] }],
    },
  ],
});

const SESSION_ID = 7;

async function seedSession(): Promise<void> {
  await db.routines.put({ id: routine.id, routine, importedAt: 1000 });
  await db.sessions.add({
    id: SESSION_ID,
    routineId: "mini",
    dayId: "day-1",
    startedAt: 1_000_000,
    finishedAt: 1_300_000,
    entries: [
      {
        exerciseKey: "squat",
        setIndex: 0,
        reps: 8,
        weight: 60,
        completedAt: 1_100_000,
      },
      {
        exerciseKey: "plank",
        setIndex: 0,
        duration: 45,
        completedAt: 1_150_000,
      },
      {
        exerciseKey: "push-up",
        setIndex: 0,
        reps: 12,
        completedAt: 1_200_000,
      },
    ],
  });
}

beforeEach(clearDatabase);

describe("SessionStatsDetail", () => {
  it("renders groups in entry order with reps, duration, and weight values", async () => {
    await seedSession();

    render(<SessionStatsDetail sessionId={SESSION_ID} onBack={() => {}} />);

    expect(
      await screen.findByTestId("session-stats-day-name"),
    ).toHaveTextContent("Día completo");
    expect(screen.getByTestId("session-stats-metadata")).toHaveTextContent(
      "5:00",
    );
    expect(screen.getByTestId("session-stats-metadata")).toHaveTextContent(
      "3 series",
    );

    const groups = screen.getAllByTestId(/^session-detail-group-/);
    expect(groups.map((group) => group.getAttribute("data-test"))).toEqual([
      "session-detail-group-squat",
      "session-detail-group-plank",
      "session-detail-group-push-up",
    ]);

    const squatGroup = screen.getByTestId("session-detail-group-squat");
    expect(squatGroup).toHaveTextContent("Sentadilla");
    expect(squatGroup).toHaveTextContent("Serie 1");
    expect(squatGroup).toHaveTextContent("8 reps · 60 kg");

    const plankGroup = screen.getByTestId("session-detail-group-plank");
    expect(plankGroup).toHaveTextContent("0:45");
    expect(plankGroup).not.toHaveTextContent("kg");

    const pushUpGroup = screen.getByTestId("session-detail-group-push-up");
    expect(pushUpGroup).toHaveTextContent("12 reps");
    expect(pushUpGroup).not.toHaveTextContent("kg");
  });

  it("calls onBack when the session does not exist", async () => {
    const onBack = vi.fn();

    render(<SessionStatsDetail sessionId={99} onBack={onBack} />);

    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });
});
