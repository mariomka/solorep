import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { finishSession } from "@/lib/session-store";
import { clearDatabase } from "@/test/helpers";
import { SessionSummary } from "./session-summary";

vi.mock("@/lib/session-store", { spy: true });

const routine = parseRoutine({
  id: "two-day",
  name: "Dos Días",
  exercises: { "push-up": { name: "Flexiones" } },
  days: [
    {
      id: "day-1",
      name: "Día 1",
      exercises: [
        { exercise: "push-up", rest: 60, sets: [{ reps: 10 }, { reps: 8 }] },
      ],
    },
    {
      id: "day-2",
      name: "Día 2",
      exercises: [{ exercise: "push-up", rest: 60, sets: [{ reps: 10 }] }],
    },
  ],
});

interface SeedOptions {
  dayIndex: number;
  startedAt: number;
}

async function seedSession({
  dayIndex,
  startedAt,
}: SeedOptions): Promise<void> {
  await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });
  await db.activeSession.put({
    id: "current",
    routineId: routine.id,
    dayId: routine.days[dayIndex].id,
    dayIndex,
    startedAt,
    currentStepIndex: 2,
    swaps: {},
    completed: [
      {
        stepIndex: 0,
        slotKey: "0:0",
        primaryExerciseKey: "push-up",
        exerciseKey: "push-up",
        setIndex: 0,
        reps: 10,
        weight: 20,
        completedAt: startedAt + 60_000,
      },
      {
        stepIndex: 1,
        slotKey: "0:0",
        primaryExerciseKey: "push-up",
        exerciseKey: "push-up",
        setIndex: 1,
        reps: 8,
        weight: 20,
        completedAt: startedAt + 120_000,
      },
    ],
    updatedAt: startedAt + 120_000,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clearDatabase();
});

describe("SessionSummary", () => {
  it("shows duration, completed sets, and total volume", async () => {
    await seedSession({ dayIndex: 0, startedAt: Date.now() - 125_400 });

    render(<SessionSummary onFinished={vi.fn()} />);

    expect(await screen.findByText("Resumen")).toBeInTheDocument();
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // 10×20 + 8×20
    expect(screen.getByText("360 kg")).toBeInTheDocument();
  });

  it("rounds the displayed volume to one decimal with fractional weights", async () => {
    const startedAt = Date.now() - 60_000;
    await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });
    await db.activeSession.put({
      id: "current",
      routineId: routine.id,
      dayId: routine.days[0].id,
      dayIndex: 0,
      startedAt,
      currentStepIndex: 2,
      swaps: {},
      // 1×20.1 + 1×0.2 = 20.299999999999997 in floating point.
      completed: [
        {
          stepIndex: 0,
          slotKey: "0:0",
          primaryExerciseKey: "push-up",
          exerciseKey: "push-up",
          setIndex: 0,
          reps: 1,
          weight: 20.1,
          completedAt: startedAt + 10_000,
        },
        {
          stepIndex: 1,
          slotKey: "0:0",
          primaryExerciseKey: "push-up",
          exerciseKey: "push-up",
          setIndex: 1,
          reps: 1,
          weight: 0.2,
          completedAt: startedAt + 20_000,
        },
      ],
      updatedAt: startedAt + 20_000,
    });

    render(<SessionSummary onFinished={vi.fn()} />);

    expect(await screen.findByText("20.3 kg")).toBeInTheDocument();
  });

  it("formats durations of an hour or more as h:mm:ss", async () => {
    await seedSession({ dayIndex: 0, startedAt: Date.now() - 3_725_400 });

    render(<SessionSummary onFinished={vi.fn()} />);

    expect(await screen.findByText("1:02:05")).toBeInTheDocument();
  });

  it("finishes the session on Terminar, wrapping progress to the first day", async () => {
    await seedSession({ dayIndex: 1, startedAt: Date.now() - 60_000 });

    const onFinished = vi.fn();
    const user = userEvent.setup();
    render(<SessionSummary onFinished={onFinished} />);

    await user.click(await screen.findByRole("button", { name: "Terminar" }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      routineId: routine.id,
      dayId: "day-2",
    });
    expect(sessions[0].entries).toHaveLength(2);
    expect(sessions[0].entries[0]).toMatchObject({
      exerciseKey: "push-up",
      setIndex: 0,
      reps: 10,
      weight: 20,
    });

    // Last day finished: progress wraps around to day 0.
    const progress = await db.progress.get(routine.id);
    expect(progress?.currentDayIndex).toBe(0);

    const activeSession = await db.activeSession.get("current");
    expect(activeSession).toBeUndefined();
  });

  it("advances progress to the next day when finishing an earlier day", async () => {
    await seedSession({ dayIndex: 0, startedAt: Date.now() - 60_000 });

    const onFinished = vi.fn();
    const user = userEvent.setup();
    render(<SessionSummary onFinished={onFinished} />);

    await user.click(await screen.findByRole("button", { name: "Terminar" }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    const progress = await db.progress.get(routine.id);
    expect(progress?.currentDayIndex).toBe(1);
  });

  it("prevents duplicate finishes while pending, then shows an alert and allows retry", async () => {
    await seedSession({ dayIndex: 0, startedAt: Date.now() - 60_000 });
    let rejectFinish: (error: Error) => void = () => {};
    vi.mocked(finishSession).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFinish = reject;
        }),
    );

    const onFinished = vi.fn();
    const user = userEvent.setup();
    render(<SessionSummary onFinished={onFinished} />);

    const finishButton = await screen.findByRole("button", {
      name: "Terminar",
    });
    await user.click(finishButton);
    expect(finishButton).toBeDisabled();
    await user.click(finishButton);
    expect(finishSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFinish(new Error("finish failed"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo terminar el entrenamiento. Inténtalo de nuevo.",
    );
    expect(finishButton).toBeEnabled();
    await user.click(finishButton);

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(finishSession).toHaveBeenCalledTimes(2);
    await expect(db.activeSession.count()).resolves.toBe(0);
  });

  it("preserves an unfinishable session until the user explicitly discards it", async () => {
    await seedSession({ dayIndex: 0, startedAt: Date.now() - 60_000 });
    await db.routines.put({
      id: routine.id,
      routine: { ...routine, days: [routine.days[1]] },
      importedAt: Date.now(),
    });

    const onFinished = vi.fn();
    const user = userEvent.setup();
    render(<SessionSummary onFinished={onFinished} />);

    await user.click(await screen.findByRole("button", { name: "Terminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo terminar el entrenamiento. Inténtalo de nuevo.",
    );
    await expect(db.activeSession.count()).resolves.toBe(1);
    await expect(db.sessions.count()).resolves.toBe(0);
    expect(onFinished).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    await expect(db.activeSession.count()).resolves.toBe(0);
  });

  it("renders nothing and calls onFinished when there is no active session", async () => {
    const onFinished = vi.fn();
    const { container } = render(<SessionSummary onFinished={onFinished} />);

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });
});
