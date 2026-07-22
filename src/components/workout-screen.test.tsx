import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { workoutScreenWakeLock } from "@/lib/screen-wake-lock";
import { buildDayPlan, swapKey } from "@/lib/session-plan";
import {
  recordSetCompletion,
  recordSwap,
  startSession,
} from "@/lib/session-store";
import {
  playTimerFeedback,
  prepareTimerAudio,
  stopTimerFeedback,
} from "@/lib/timer-feedback";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { WorkoutScreen } from "./workout-screen";

vi.mock("@/lib/session-store", { spy: true });
vi.mock("@/lib/screen-wake-lock", { spy: true });
vi.mock("@/lib/timer-feedback", { spy: true });

const routine = parseRoutine(fullbody3d);
const groupedProgressRoutine = parseRoutine({
  id: "grouped-progress",
  name: "Grouped progress",
  exercises: {
    squat: { name: "Squat" },
    curl: { name: "Curl" },
    extension: { name: "Extension" },
    plank: { name: "Plank" },
  },
  days: [
    {
      id: "progress-day",
      name: "Progress day",
      exercises: [
        {
          exercise: "squat",
          rest: 60,
          sets: [{ reps: 10 }, { reps: 8 }],
        },
        {
          superset: [
            {
              exercise: "curl",
              sets: [{ reps: 12 }, { reps: 10 }],
            },
            {
              exercise: "extension",
              sets: [{ reps: 12 }, { reps: 10 }],
            },
          ],
          rest: 60,
        },
        {
          exercise: "plank",
          rest: 60,
          sets: [{ duration: 30 }],
        },
      ],
    },
  ],
});

// Radix Select relies on pointer-capture and scroll APIs jsdom lacks.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await clearDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedSession(
  dayIndex: number,
  currentStepIndex = 0,
): Promise<void> {
  await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });
  await startSession(routine.id, routine.days[dayIndex].id, dayIndex);
  const shouldFastForward = currentStepIndex > 0;
  if (shouldFastForward) {
    await db.activeSession.update("current", { currentStepIndex });
  }
}

function renderWorkout(dayIndex = 0) {
  const onDayCompleted = vi.fn();
  const onExit = vi.fn();
  const view = render(
    <WorkoutScreen
      routine={routine}
      dayIndex={dayIndex}
      onDayCompleted={onDayCompleted}
      onExit={onExit}
    />,
  );
  return { onDayCompleted, onExit, ...view };
}

async function seedGroupedProgressSession(
  currentStepIndex: number,
  completedStepIndexes: number[],
): Promise<void> {
  await db.routines.put({
    id: groupedProgressRoutine.id,
    routine: groupedProgressRoutine,
    importedAt: Date.now(),
  });
  await startSession(groupedProgressRoutine.id, "progress-day", 0);

  const day = groupedProgressRoutine.days[0];
  const plan = buildDayPlan(day);
  const completed = completedStepIndexes.map((stepIndex) => {
    const step = plan[stepIndex];
    if (step === undefined) {
      throw new Error(`Missing grouped progress step ${stepIndex}.`);
    }

    const slotKey = swapKey(step.itemIndex, step.memberIndex);
    return {
      stepIndex,
      slotKey,
      primaryExerciseKey: step.primaryExerciseKey,
      exerciseKey: step.primaryExerciseKey,
      setIndex: step.setIndex,
      reps: "reps" in step.plannedSet ? step.plannedSet.reps : undefined,
      duration:
        "duration" in step.plannedSet ? step.plannedSet.duration : undefined,
      completedAt: Date.now(),
    };
  });

  await db.activeSession.update("current", {
    currentStepIndex,
    completed,
  });
}

function renderGroupedProgressWorkout() {
  render(
    <WorkoutScreen
      routine={groupedProgressRoutine}
      dayIndex={0}
      onDayCompleted={vi.fn()}
      onExit={vi.fn()}
    />,
  );
}

describe("WorkoutScreen", () => {
  it("holds a screen wake lock only while the workout is mounted", async () => {
    await seedSession(0);
    const { unmount } = renderWorkout();

    await screen.findByTestId("set-exercise-name");
    expect(workoutScreenWakeLock.acquire).toHaveBeenCalledTimes(1);

    unmount();

    expect(workoutScreenWakeLock.release).toHaveBeenCalledTimes(1);
  });

  it("renders the first step with last-used values over routine values", async () => {
    await seedSession(0);
    await db.lastUsed.put({
      exerciseKey: "back-squat",
      sets: [{ reps: 12, weight: 55 }],
      updatedAt: Date.now(),
    });

    renderWorkout();

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 4",
    );

    const repsInput = screen.getByTestId("set-reps-input");
    const weightInput = screen.getByTestId("set-weight-input");
    await waitFor(() => expect(repsInput).toHaveValue("12"));
    expect(weightInput).toHaveValue("55");
  });

  it("groups standalone sets and interleaved superset members by exercise slot", async () => {
    await seedGroupedProgressSession(0, []);
    renderGroupedProgressWorkout();

    await screen.findByTestId("workout-progress-step-0");

    expect(screen.getAllByTestId(/^workout-progress-group-/)).toHaveLength(4);
    expect(screen.getByTestId("workout-progress-step-0")).toHaveAttribute(
      "data-group",
      "0:0",
    );
    expect(screen.getByTestId("workout-progress-step-1")).toHaveAttribute(
      "data-group",
      "0:0",
    );
    expect(screen.getByTestId("workout-progress-step-2")).toHaveAttribute(
      "data-group",
      "1:0",
    );
    expect(screen.getByTestId("workout-progress-step-4")).toHaveAttribute(
      "data-group",
      "1:0",
    );
    expect(screen.getByTestId("workout-progress-step-3")).toHaveAttribute(
      "data-group",
      "1:1",
    );
    expect(screen.getByTestId("workout-progress-step-5")).toHaveAttribute(
      "data-group",
      "1:1",
    );
    expect(screen.getByTestId("workout-progress-step-6")).toHaveAttribute(
      "data-group",
      "2:0",
    );
  });

  it("marks completed, current, and pending steps across back navigation", async () => {
    await seedGroupedProgressSession(3, [0, 1, 2]);
    const user = userEvent.setup();
    renderGroupedProgressWorkout();

    expect(
      await screen.findByTestId("workout-progress-step-0"),
    ).toHaveAttribute("data-state", "completed");
    expect(screen.getByTestId("workout-progress-step-1")).toHaveAttribute(
      "data-state",
      "completed",
    );
    expect(screen.getByTestId("workout-progress-step-2")).toHaveAttribute(
      "data-state",
      "completed",
    );
    expect(screen.getByTestId("workout-progress-step-3")).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(screen.getByTestId("workout-progress-step-4")).toHaveAttribute(
      "data-state",
      "pending",
    );
    expect(screen.getByTestId("workout-progress-step-5")).toHaveAttribute(
      "data-state",
      "pending",
    );
    expect(screen.getByTestId("workout-progress-step-6")).toHaveAttribute(
      "data-state",
      "pending",
    );

    await user.click(screen.getByTestId("set-previous"));

    await waitFor(() => {
      expect(screen.getByTestId("workout-progress-step-2")).toHaveAttribute(
        "data-state",
        "current",
      );
    });
    expect(screen.getByTestId("workout-progress-step-3")).toHaveAttribute(
      "data-state",
      "pending",
    );
  });

  it("shows the upcoming exercise name and hides it on the last slot", async () => {
    await seedSession(0);
    renderWorkout();

    // Back-squat sets are followed by bench-press.
    expect(await screen.findByTestId("set-next-exercise")).toHaveTextContent(
      "Press banca",
    );

    cleanup();

    // Step 11 is the plank, the day's last slot.
    await clearDatabase();
    await seedSession(0, 11);
    renderWorkout();

    await screen.findByTestId("set-exercise-name");
    expect(screen.queryByTestId("set-next-exercise")).not.toBeInTheDocument();
  });

  it("shows the swapped alternative as the upcoming exercise", async () => {
    // Step 3 is the last back-squat set; the next slot is bench-press.
    await seedSession(0, 3);
    await recordSwap(1, 0, "dumbbell-bench-press");
    renderWorkout();

    expect(await screen.findByTestId("set-next-exercise")).toHaveTextContent(
      "Press banca con mancuernas",
    );
  });

  it("continues into rest, records the completion, and skipping rest advances", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const repsInput = await screen.findByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByTestId("set-continue"));

    expect(prepareTimerAudio).toHaveBeenCalledTimes(1);

    expect(await screen.findByTestId("rest-screen")).toHaveTextContent(
      "Descanso",
    );
    expect(screen.getByTestId("rest-timer")).toHaveTextContent("02:00");

    const session = await db.activeSession.get("current");
    expect(session?.completed[0]).toMatchObject({
      stepIndex: 0,
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });

    await user.click(screen.getByTestId("rest-skip"));
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 4",
    );
  });

  it("alternates superset members without rest and rests after the round", async () => {
    // Day 2: deadlift (4) + overhead-press (3) + lat-pulldown (3) = step 10
    // starts the biceps/triceps superset.
    await seedSession(1, 10);
    const user = userEvent.setup();
    renderWorkout(1);

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Curl de bíceps con mancuernas",
    );
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 3",
    );
    const bicepsRepsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(bicepsRepsInput).toHaveValue("12"));
    await user.click(screen.getByTestId("set-continue"));

    // Member B follows directly, no rest screen in between.
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Extensión de tríceps en polea",
      );
    });
    expect(screen.queryByTestId("rest-screen")).not.toBeInTheDocument();
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 3",
    );
    const tricepsRepsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(tricepsRepsInput).toHaveValue("12"));
    await user.click(screen.getByTestId("set-continue"));

    // The round is over: now the superset rest applies.
    expect(await screen.findByTestId("rest-screen")).toHaveTextContent(
      "Descanso",
    );
    expect(screen.getByTestId("rest-timer")).toHaveTextContent("01:15");
    await user.click(screen.getByTestId("rest-skip"));

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Curl de bíceps con mancuernas",
    );
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 3",
    );
  });

  it("goes back with Anterior, prefills recorded values, and re-completing overwrites without rest", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const repsInput = await screen.findByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 4",
    );

    await user.click(screen.getByTestId("set-previous"));

    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 4",
    );
    const weightInput = screen.getByTestId("set-weight-input");
    await waitFor(() => expect(weightInput).toHaveValue("50"));
    expect(screen.getByTestId("set-reps-input")).toHaveValue("10");

    await user.clear(weightInput);
    await user.type(weightInput, "62.5");
    await user.click(screen.getByTestId("set-continue"));

    // A correction goes straight to the next set screen, no rest replay.
    await waitFor(() => {
      expect(screen.getByTestId("set-progress")).toHaveTextContent(
        "Serie 2 de 4",
      );
    });
    expect(screen.queryByTestId("rest-screen")).not.toBeInTheDocument();

    const session = await db.activeSession.get("current");
    expect(session?.completed).toHaveLength(1);
    expect(session?.completed[0]).toMatchObject({
      stepIndex: 0,
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 62.5,
    });
    expect(session?.currentStepIndex).toBe(1);
  });

  it("swaps to an alternative and records completion under the alternative key", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );

    await user.click(screen.getByTestId("set-exercise-select"));
    await user.click(
      await screen.findByTestId("set-exercise-option-leg-press"),
    );

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Prensa de piernas",
    );
    const repsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByTestId("set-continue"));

    await screen.findByTestId("rest-screen");

    const session = await db.activeSession.get("current");
    expect(session?.swaps).toEqual({ "0:0": "leg-press" });
    expect(session?.completed[0]).toMatchObject({
      stepIndex: 0,
      exerciseKey: "leg-press",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });

    // lastUsed is only derived at finishSession time, never mid-session.
    await expect(db.lastUsed.get("leg-press")).resolves.toBeUndefined();
  });

  it("offers the original exercise after a swap so the change can be reversed", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );
    await user.click(screen.getByTestId("set-exercise-select"));
    await user.click(
      await screen.findByTestId("set-exercise-option-leg-press"),
    );

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Prensa de piernas",
    );
    await user.click(screen.getByTestId("set-exercise-select"));
    await user.click(
      await screen.findByTestId("set-exercise-option-back-squat"),
    );

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );
    await expect(db.activeSession.get("current")).resolves.toMatchObject({
      swaps: {},
    });
  });

  it("opens exercise instructions in the technique sheet", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    await user.click(await screen.findByTestId("technique-trigger"));

    expect(await screen.findByTestId("technique-sheet")).toHaveTextContent(
      "Ejecución",
    );
  });

  it("keeps the persisted exercise active while a swap is pending, then retries after an error", async () => {
    await seedSession(0);
    let rejectSwap: (error: Error) => void = () => {};
    vi.mocked(recordSwap).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSwap = reject;
        }),
    );
    const user = userEvent.setup();
    renderWorkout();

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );
    await user.click(screen.getByTestId("set-exercise-select"));
    await user.click(
      await screen.findByTestId("set-exercise-option-leg-press"),
    );

    expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );
    expect(screen.getByTestId("set-continue")).toBeDisabled();
    await expect(db.activeSession.get("current")).resolves.toMatchObject({
      swaps: {},
      completed: [],
    });

    await act(async () => {
      rejectSwap(new Error("persist failed"));
    });

    expect(await screen.findByTestId("set-error")).toHaveTextContent(
      "No se pudo cambiar el ejercicio.",
    );
    expect(screen.getByTestId("set-continue")).toBeEnabled();

    await user.click(screen.getByTestId("set-exercise-select"));
    await user.click(
      await screen.findByTestId("set-exercise-option-leg-press"),
    );

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Prensa de piernas",
    );
    await expect(db.activeSession.get("current")).resolves.toMatchObject({
      swaps: { "0:0": "leg-press" },
      completed: [],
    });
    expect(recordSwap).toHaveBeenCalledTimes(2);

    await user.click(screen.getByTestId("set-continue"));
    await screen.findByTestId("rest-screen");
    const session = await db.activeSession.get("current");
    expect(session?.completed[0].exerciseKey).toBe("leg-press");
  });

  it("keeps an earlier set's values when the whole exercise is swapped", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const firstWeightInput = await screen.findByTestId("set-weight-input");
    await waitFor(() => expect(firstWeightInput).toHaveValue("50"));
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));

    await user.click(screen.getByTestId("set-exercise-select"));
    await user.click(
      await screen.findByTestId("set-exercise-option-leg-press"),
    );
    await user.click(screen.getByTestId("set-previous"));

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Prensa de piernas",
    );
    await waitFor(() =>
      expect(screen.getByTestId("set-weight-input")).toHaveValue("50"),
    );
    expect(screen.getByTestId("set-reps-input")).toHaveValue("10");
  });

  it("auto-completes a duration set when the countdown reaches zero", async () => {
    // Day 1: back-squat (4) + bench-press (4) + barbell-row (3) = step 11
    // starts the plank.
    await seedSession(0, 11);
    await db.lastUsed.put({
      exerciseKey: "plank",
      sets: [{ duration: 1 }],
      updatedAt: Date.now(),
    });
    renderWorkout();

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Plancha",
    );
    expect(await screen.findByTestId("duration-timer")).toHaveTextContent("1");
    expect(playTimerFeedback).toHaveBeenLastCalledWith("countdown", {
      soundEnabled: true,
      vibrationEnabled: true,
    });

    const restScreen = await screen.findByTestId(
      "rest-screen",
      {},
      { timeout: 2_000 },
    );

    expect(playTimerFeedback).toHaveBeenLastCalledWith("complete", {
      soundEnabled: true,
      vibrationEnabled: true,
    });
    expect(restScreen).toHaveTextContent("Descanso");
    const session = await db.activeSession.get("current");
    expect(session?.completed.at(-1)).toMatchObject({
      stepIndex: 11,
      exerciseKey: "plank",
      setIndex: 0,
      duration: 1,
    });
  });

  it("completes an automatically started duration set through Saltar", async () => {
    await seedSession(0, 11);
    const user = userEvent.setup();
    renderWorkout();

    await user.click(await screen.findByTestId("duration-skip"));

    expect(stopTimerFeedback).toHaveBeenCalled();
    expect(playTimerFeedback).not.toHaveBeenCalledWith(
      "complete",
      expect.anything(),
    );
    expect(await screen.findByTestId("rest-screen")).toHaveTextContent(
      "Descanso",
    );
    const session = await db.activeSession.get("current");
    expect(session?.completed.at(-1)).toMatchObject({
      stepIndex: 11,
      exerciseKey: "plank",
      setIndex: 0,
      duration: 45,
    });
  });

  it("fires onDayCompleted right after the final step completion is recorded", async () => {
    const miniRoutine = parseRoutine({
      id: "mini",
      name: "Mini",
      exercises: { "push-up": { name: "Flexiones" } },
      days: [
        {
          id: "day-1",
          name: "Día 1",
          exercises: [
            {
              exercise: "push-up",
              rest: 60,
              sets: [{ reps: 10 }, { reps: 8 }],
            },
          ],
        },
      ],
    });
    await db.routines.put({
      id: miniRoutine.id,
      routine: miniRoutine,
      importedAt: Date.now(),
    });
    await startSession(miniRoutine.id, "day-1", 0);

    const onDayCompleted = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkoutScreen
        routine={miniRoutine}
        dayIndex={0}
        onDayCompleted={onDayCompleted}
        onExit={vi.fn()}
      />,
    );

    const repsInput = await screen.findByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));

    // The second set prefills the routine's planned 8: lastUsed is only
    // written at finishSession, so it cannot overlay within the session.
    const secondRepsInput = await screen.findByTestId("set-reps-input");
    await waitFor(() => expect(secondRepsInput).toHaveValue("8"));
    expect(onDayCompleted).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("set-continue"));

    await waitFor(() => expect(onDayCompleted).toHaveBeenCalledTimes(1));

    // The session row stays: finishing is wired by the caller.
    const session = await db.activeSession.get("current");
    expect(session?.completed).toHaveLength(2);
    expect(session?.completed.at(-1)).toMatchObject({
      stepIndex: 1,
      exerciseKey: "push-up",
      setIndex: 1,
      reps: 8,
    });
  });

  it("shows an inline error and re-enables Continuar when persisting fails, and a retry succeeds", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const repsInput = await screen.findByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));

    vi.mocked(recordSetCompletion).mockRejectedValueOnce(
      new Error("persist failed"),
    );
    await user.click(screen.getByTestId("set-continue"));

    expect(await screen.findByTestId("set-error")).toHaveTextContent(
      "No se pudo guardar la serie.",
    );
    const continueButton = screen.getByTestId("set-continue");
    expect(continueButton).toBeEnabled();
    const session = await db.activeSession.get("current");
    expect(session?.completed).toHaveLength(0);

    // The retry goes through the real implementation and advances.
    await user.click(continueButton);

    expect(await screen.findByTestId("rest-screen")).toHaveTextContent(
      "Descanso",
    );
    const sessionAfterRetry = await db.activeSession.get("current");
    expect(sessionAfterRetry?.completed).toHaveLength(1);
  });
});
