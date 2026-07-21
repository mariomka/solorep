import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
import {
  recordSetCompletion,
  recordSwap,
  startSession,
} from "@/lib/session-store";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { WorkoutScreen } from "./workout-screen";

vi.mock("@/lib/session-store", { spy: true });

const routine = parseRoutine(fullbody3d);

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
  render(
    <WorkoutScreen
      routine={routine}
      dayIndex={dayIndex}
      onDayCompleted={onDayCompleted}
      onExit={onExit}
    />,
  );
  return { onDayCompleted, onExit };
}

describe("WorkoutScreen", () => {
  it("renders the first step with last-used values over routine values", async () => {
    await seedSession(0);
    await db.lastUsed.put({
      exerciseKey: "back-squat",
      sets: [{ reps: 12, weight: 55 }],
      updatedAt: Date.now(),
    });

    renderWorkout();

    expect(
      await screen.findByRole("heading", { name: "Sentadilla con barra" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Serie 1 de 4")).toBeInTheDocument();

    const repsInput = screen.getByLabelText("Repeticiones");
    const weightInput = screen.getByLabelText("Peso (kg)");
    await waitFor(() => expect(repsInput).toHaveValue("12"));
    expect(weightInput).toHaveValue("55");
  });

  it("continues into rest, records the completion, and skipping rest advances", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const repsInput = await screen.findByLabelText("Repeticiones");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Descanso")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("120");

    const session = await db.activeSession.get("current");
    expect(session?.completed[0]).toMatchObject({
      stepIndex: 0,
      exerciseKey: "back-squat",
      setIndex: 0,
      reps: 10,
      weight: 50,
    });

    await user.click(screen.getByRole("button", { name: "Saltar descanso" }));
    expect(await screen.findByText("Serie 2 de 4")).toBeInTheDocument();
  });

  it("alternates superset members without rest and rests after the round", async () => {
    // Day 2: deadlift (4) + overhead-press (3) + lat-pulldown (3) = step 10
    // starts the biceps/triceps superset.
    await seedSession(1, 10);
    const user = userEvent.setup();
    renderWorkout(1);

    expect(
      await screen.findByRole("heading", {
        name: "Curl de bíceps con mancuernas",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Serie 1 de 3")).toBeInTheDocument();
    const bicepsRepsInput = screen.getByLabelText("Repeticiones");
    await waitFor(() => expect(bicepsRepsInput).toHaveValue("12"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // Member B follows directly, no rest screen in between.
    expect(
      await screen.findByRole("heading", {
        name: "Extensión de tríceps en polea",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Descanso")).not.toBeInTheDocument();
    expect(screen.getByText("Serie 1 de 3")).toBeInTheDocument();
    const tricepsRepsInput = screen.getByLabelText("Repeticiones");
    await waitFor(() => expect(tricepsRepsInput).toHaveValue("12"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // The round is over: now the superset rest applies.
    expect(await screen.findByText("Descanso")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("75");
    await user.click(screen.getByRole("button", { name: "Saltar descanso" }));

    expect(
      await screen.findByRole("heading", {
        name: "Curl de bíceps con mancuernas",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Serie 2 de 3")).toBeInTheDocument();
  });

  it("goes back with Anterior, prefills recorded values, and re-completing overwrites without rest", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const repsInput = await screen.findByLabelText("Repeticiones");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(
      await screen.findByRole("button", { name: "Saltar descanso" }),
    );
    expect(await screen.findByText("Serie 2 de 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Anterior" }));

    expect(await screen.findByText("Serie 1 de 4")).toBeInTheDocument();
    const weightInput = screen.getByLabelText("Peso (kg)");
    await waitFor(() => expect(weightInput).toHaveValue("50"));
    expect(screen.getByLabelText("Repeticiones")).toHaveValue("10");

    await user.clear(weightInput);
    await user.type(weightInput, "62.5");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // A correction goes straight to the next set screen, no rest replay.
    expect(await screen.findByText("Serie 2 de 4")).toBeInTheDocument();
    expect(screen.queryByText("Descanso")).not.toBeInTheDocument();

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

    expect(
      await screen.findByRole("heading", { name: "Sentadilla con barra" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Prensa de piernas" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Prensa de piernas" }),
    ).toBeInTheDocument();
    const repsInput = screen.getByLabelText("Repeticiones");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByText("Descanso");

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

    await screen.findByRole("heading", { name: "Sentadilla con barra" });
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Prensa de piernas" }),
    );

    expect(
      screen.getByRole("heading", { name: "Sentadilla con barra" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await expect(db.activeSession.get("current")).resolves.toMatchObject({
      swaps: {},
      completed: [],
    });

    await act(async () => {
      rejectSwap(new Error("persist failed"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo cambiar el ejercicio.",
    );
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Prensa de piernas" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Prensa de piernas" }),
    ).toBeInTheDocument();
    await expect(db.activeSession.get("current")).resolves.toMatchObject({
      swaps: { "0:0": "leg-press" },
      completed: [],
    });
    expect(recordSwap).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Descanso");
    const session = await db.activeSession.get("current");
    expect(session?.completed[0].exerciseKey).toBe("leg-press");
  });

  it("keeps an earlier set's values when the whole exercise is swapped", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const firstWeightInput = await screen.findByLabelText("Peso (kg)");
    await waitFor(() => expect(firstWeightInput).toHaveValue("50"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(
      await screen.findByRole("button", { name: "Saltar descanso" }),
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Prensa de piernas" }),
    );
    await user.click(screen.getByRole("button", { name: "Anterior" }));

    expect(
      await screen.findByRole("heading", { name: "Prensa de piernas" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Peso (kg)")).toHaveValue("50"),
    );
    expect(screen.getByLabelText("Repeticiones")).toHaveValue("10");
  });

  it("auto-completes a duration set when the countdown reaches zero", async () => {
    // Day 1: back-squat (4) + bench-press (4) + barbell-row (3) = step 11
    // starts the plank.
    await seedSession(0, 11);
    renderWorkout();

    expect(
      await screen.findByRole("heading", { name: "Plancha" }),
    ).toBeInTheDocument();
    const durationInput = screen.getByLabelText("Duración (segundos)");
    await waitFor(() => expect(durationInput).toHaveValue("45"));

    // setImmediate stays real so fake-indexeddb keeps working under fake timers.
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    // fireEvent instead of userEvent: userEvent's internal waits hang under
    // vitest fake timers, and the countdown interval must be registered while
    // timers are faked for the advance below to reach it.
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));

    expect(screen.getByRole("timer")).toHaveTextContent("45");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(46_000);
    });
    vi.useRealTimers();

    expect(await screen.findByText("Descanso")).toBeInTheDocument();
    const session = await db.activeSession.get("current");
    expect(session?.completed.at(-1)).toMatchObject({
      stepIndex: 11,
      exerciseKey: "plank",
      setIndex: 0,
      duration: 45,
    });
  });

  it("completes a duration set through Saltar with the edited duration", async () => {
    await seedSession(0, 11);
    const user = userEvent.setup();
    renderWorkout();

    const durationInput = await screen.findByLabelText("Duración (segundos)");
    await waitFor(() => expect(durationInput).toHaveValue("45"));
    await user.clear(durationInput);
    await user.type(durationInput, "30");
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    await user.click(await screen.findByRole("button", { name: "Saltar" }));

    expect(await screen.findByText("Descanso")).toBeInTheDocument();
    const session = await db.activeSession.get("current");
    expect(session?.completed.at(-1)).toMatchObject({
      stepIndex: 11,
      exerciseKey: "plank",
      setIndex: 0,
      duration: 30,
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

    const repsInput = await screen.findByLabelText("Repeticiones");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(
      await screen.findByRole("button", { name: "Saltar descanso" }),
    );

    // The second set prefills the routine's planned 8: lastUsed is only
    // written at finishSession, so it cannot overlay within the session.
    const secondRepsInput = await screen.findByLabelText("Repeticiones");
    await waitFor(() => expect(secondRepsInput).toHaveValue("8"));
    expect(onDayCompleted).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Continuar" }));

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

    const repsInput = await screen.findByLabelText("Repeticiones");
    await waitFor(() => expect(repsInput).toHaveValue("10"));

    vi.mocked(recordSetCompletion).mockRejectedValueOnce(
      new Error("persist failed"),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar la serie.",
    );
    const continueButton = screen.getByRole("button", { name: "Continuar" });
    expect(continueButton).toBeEnabled();
    const session = await db.activeSession.get("current");
    expect(session?.completed).toHaveLength(0);

    // The retry goes through the real implementation and advances.
    await user.click(continueButton);

    expect(await screen.findByText("Descanso")).toBeInTheDocument();
    const sessionAfterRetry = await db.activeSession.get("current");
    expect(sessionAfterRetry?.completed).toHaveLength(1);
  });
});
