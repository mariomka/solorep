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
import { SetScreen } from "@/components/set-screen";
import { db } from "@/lib/db";
import { parseRoutine, type Routine } from "@/lib/routine-schema";
import { workoutScreenWakeLock } from "@/lib/screen-wake-lock";
import { buildDayPlan, swapKey } from "@/lib/session-plan";
import {
  recordSetCompletion,
  recordSwap,
  setPostponedItems,
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
// Spied, not stubbed: the real screen still renders, and the reorder callbacks
// it receives can be invoked without the buttons that normally guard them.
vi.mock("@/components/set-screen", { spy: true });

const routine = parseRoutine(fullbody3d);

// Same routine with a one-second first plank set: the countdown test needs a
// short duration, and durations come from the plan, never from history.
const shortPlankRoutine: Routine = {
  ...routine,
  days: routine.days.map((day, dayIndex) => {
    const isFirstDay = dayIndex === 0;
    if (!isFirstDay) {
      return day;
    }
    return {
      ...day,
      exercises: day.exercises.map((item) => {
        const isPlank = "exercise" in item && item.exercise === "plank";
        if (!isPlank) {
          return item;
        }
        return {
          ...item,
          sets: item.sets.map((set, setIndex) =>
            setIndex === 0 ? { duration: 1 } : set,
          ),
        };
      }),
    };
  }),
};

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

// Four plain single-set items: every block is one step, so the walk after a
// reorder is fully observable step by step.
const fourItemRoutine = parseRoutine({
  id: "four-items",
  name: "Four items",
  exercises: {
    "item-a": { name: "Ejercicio A" },
    "item-b": { name: "Ejercicio B" },
    "item-c": { name: "Ejercicio C" },
    "item-d": { name: "Ejercicio D" },
  },
  days: [
    {
      id: "four-item-day",
      name: "Día de cuatro",
      exercises: ["item-a", "item-b", "item-c", "item-d"].map((exercise) => ({
        exercise,
        rest: 60,
        sets: [{ reps: 10 }],
      })),
    },
  ],
});

// A warm-up, three working exercises and a stretch, mirroring the real
// routines. The warm-up and the stretch are single-set items, which is exactly
// what the first-set guard alone cannot tell apart from a working exercise.
// Three work items matter: with only two, postponing one leaves it immediately
// next, and the queue line correctly de-duplicates against "Siguiente:".
// Natural plan steps: 0 warm-up, 1-2 belt squat, 3 chest press, 4 row,
// 5 stretch.
const phasedRoutine = parseRoutine({
  id: "phased",
  name: "Phased",
  exercises: {
    "jumping-jacks": { name: "Jumping Jacks" },
    "belt-squat": { name: "Belt Squat" },
    "chest-press": { name: "Press de pecho" },
    row: { name: "Remo" },
    "quad-stretch": { name: "Estiramiento de cuádriceps" },
  },
  days: [
    {
      id: "phased-day",
      name: "Día con fases",
      exercises: [
        {
          phase: "warmup",
          exercise: "jumping-jacks",
          rest: 0,
          sets: [{ reps: 30 }],
        },
        {
          exercise: "belt-squat",
          rest: 60,
          sets: [{ reps: 8 }, { reps: 8 }],
        },
        { exercise: "chest-press", rest: 60, sets: [{ reps: 10 }] },
        { exercise: "row", rest: 60, sets: [{ reps: 10 }] },
        {
          phase: "cooldown",
          exercise: "quad-stretch",
          rest: 0,
          sets: [{ duration: 30 }],
        },
      ],
    },
  ],
});

// Non-canonical phase order: a work item sits AFTER the cool-down, so the
// queue (which lands before it) can be reached by the pointer while scheduled
// work is still ahead -- the only shape where the queue holds the exercise on
// screen and the "Aplazados" line still has a reason to exist.
const trailingWorkRoutine = parseRoutine({
  id: "trailing-work",
  name: "Trailing work",
  exercises: {
    "item-a": { name: "Ejercicio A" },
    "item-b": { name: "Ejercicio B" },
    "quad-stretch": { name: "Estiramiento de cuádriceps" },
    "item-c": { name: "Ejercicio C" },
  },
  days: [
    {
      id: "trailing-work-day",
      name: "Día con trabajo final",
      exercises: [
        { exercise: "item-a", rest: 60, sets: [{ reps: 10 }] },
        { exercise: "item-b", rest: 60, sets: [{ reps: 10 }] },
        {
          phase: "cooldown",
          exercise: "quad-stretch",
          rest: 0,
          sets: [{ duration: 30 }],
        },
        { exercise: "item-c", rest: 60, sets: [{ reps: 10 }] },
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

/** Mounts the workout alone at a given step, replacing any previous render. */
async function renderWorkoutAtStep(
  dayIndex: number,
  stepIndex: number,
): Promise<void> {
  cleanup();
  await clearDatabase();
  await seedSession(dayIndex, stepIndex);
  renderWorkout(dayIndex);
  await screen.findByTestId("set-exercise-name");
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

async function seedShortPlankSession(currentStepIndex: number): Promise<void> {
  await db.routines.put({
    id: shortPlankRoutine.id,
    routine: shortPlankRoutine,
    importedAt: Date.now(),
  });
  await startSession(shortPlankRoutine.id, shortPlankRoutine.days[0].id, 0);
  await db.activeSession.update("current", { currentStepIndex });
}

function renderShortPlankWorkout() {
  render(
    <WorkoutScreen
      routine={shortPlankRoutine}
      dayIndex={0}
      onDayCompleted={vi.fn()}
      onExit={vi.fn()}
    />,
  );
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

async function renderPhasedWorkoutAtStep(stepIndex: number): Promise<void> {
  cleanup();
  await clearDatabase();
  await db.routines.put({
    id: phasedRoutine.id,
    routine: phasedRoutine,
    importedAt: Date.now(),
  });
  await startSession(phasedRoutine.id, "phased-day", 0);
  const shouldFastForward = stepIndex > 0;
  if (shouldFastForward) {
    await db.activeSession.update("current", { currentStepIndex: stepIndex });
  }
  render(
    <WorkoutScreen
      routine={phasedRoutine}
      dayIndex={0}
      onDayCompleted={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  await screen.findByTestId("set-exercise-name");
}

async function seedFourItemSession(): Promise<void> {
  await db.routines.put({
    id: fourItemRoutine.id,
    routine: fourItemRoutine,
    importedAt: Date.now(),
  });
  await startSession(fourItemRoutine.id, "four-item-day", 0);
}

function renderFourItemWorkout() {
  const onDayCompleted = vi.fn();
  render(
    <WorkoutScreen
      routine={fourItemRoutine}
      dayIndex={0}
      onDayCompleted={onDayCompleted}
      onExit={vi.fn()}
    />,
  );
  return { onDayCompleted };
}

async function renderTrailingWorkWorkout(): Promise<void> {
  await db.routines.put({
    id: trailingWorkRoutine.id,
    routine: trailingWorkRoutine,
    importedAt: Date.now(),
  });
  await startSession(trailingWorkRoutine.id, "trailing-work-day", 0);
  render(
    <WorkoutScreen
      routine={trailingWorkRoutine}
      dayIndex={0}
      onDayCompleted={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  await screen.findByTestId("set-exercise-name");
}

/** Completes the single set of the exercise currently on screen. */
async function completeSetOf(
  user: ReturnType<typeof userEvent.setup>,
  exerciseName: string,
): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
      exerciseName,
    );
  });
  await waitFor(() => {
    expect(screen.getByTestId("set-reps-input")).toHaveValue("10");
  });
  await user.click(screen.getByTestId("set-continue"));
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

  it("renders the first step with the last-used weight over the routine's, keeping its planned reps", async () => {
    await seedSession(0);
    await db.lastUsed.put({
      exerciseKey: "back-squat",
      weight: 55,
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
    await waitFor(() => expect(weightInput).toHaveValue("55"));
    // Planned 10 reps at 50 kg: the weight is history, the reps are the plan.
    expect(repsInput).toHaveValue("10");
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

  it("persists the rest deadline on completion and clears it when the rest ends", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const repsInput = await screen.findByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    const completedAt = Date.now();
    await user.click(screen.getByTestId("set-continue"));

    await screen.findByTestId("rest-screen");
    const resting = await db.activeSession.get("current");
    // Back-squat rest is 120 s.
    expect(resting?.restEndsAt).toBeGreaterThan(completedAt);
    expect(resting?.restEndsAt).toBeLessThanOrEqual(Date.now() + 120_000);

    await user.click(screen.getByTestId("rest-skip"));
    await screen.findByTestId("set-progress");
    await waitFor(async () => {
      const rested = await db.activeSession.get("current");
      expect(rested?.restEndsAt).toBeUndefined();
    });
  });

  it("resumes into the remaining rest when a persisted deadline is still running", async () => {
    await seedSession(0, 1);
    await db.activeSession.update("current", {
      restEndsAt: Date.now() + 65_000,
    });
    renderWorkout();

    await screen.findByTestId("rest-screen");
    expect(screen.getByTestId("rest-timer")).toHaveTextContent(/01:0[0-5]/);
  });

  it("resumes straight into the set when the persisted rest already elapsed", async () => {
    await seedSession(0, 1);
    await db.activeSession.update("current", {
      restEndsAt: Date.now() - 1_000,
    });
    renderWorkout();

    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 4",
    );
    expect(screen.queryByTestId("rest-screen")).not.toBeInTheDocument();
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

    await waitFor(() =>
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Curl de bíceps con mancuernas",
      ),
    );
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 3",
    );
  });

  it("carries a changed weight over to the remaining sets of the exercise", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const weightInput = await screen.findByTestId("set-weight-input");
    await waitFor(() => expect(weightInput).toHaveValue("50"));
    await user.clear(weightInput);
    await user.type(weightInput, "55");
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));

    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 4",
    );
    // Planned set 2 is 60 kg; the 55 kg deviation from set 1 wins.
    await waitFor(() =>
      expect(screen.getByTestId("set-weight-input")).toHaveValue("55"),
    );
  });

  it("keeps the planned pyramid when the prefilled weight is confirmed", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    const weightInput = await screen.findByTestId("set-weight-input");
    await waitFor(() => expect(weightInput).toHaveValue("50"));
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));

    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 4",
    );
    await waitFor(() =>
      expect(screen.getByTestId("set-weight-input")).toHaveValue("60"),
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

    await waitFor(() =>
      expect(screen.getByTestId("set-progress")).toHaveTextContent(
        "Serie 1 de 4",
      ),
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

    await waitFor(() =>
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Prensa de piernas",
      ),
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

    await waitFor(() =>
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Prensa de piernas",
      ),
    );
    await user.click(screen.getByTestId("set-exercise-select"));
    await user.click(
      await screen.findByTestId("set-exercise-option-back-squat"),
    );

    await waitFor(() =>
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Sentadilla con barra",
      ),
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

    await waitFor(() =>
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Prensa de piernas",
      ),
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
    // starts the plank. Its first set is shortened in the routine itself:
    // durations come from the plan, so history cannot speed the test up.
    await seedShortPlankSession(11);
    renderShortPlankWorkout();

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

  it("postpones the current exercise moving its block, not the pointer", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    await screen.findByTestId("set-exercise-name");
    await user.click(screen.getByTestId("set-postpone"));

    // Day 1 order becomes bench-press, barbell-row, plank, back-squat.
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Press banca",
      );
    });
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 4",
    );
    expect(screen.getByTestId("set-postponed-items")).toHaveTextContent(
      "Sentadilla con barra",
    );

    const session = await db.activeSession.get("current");
    expect(session?.postponed).toEqual([0]);
    expect(session?.currentStepIndex).toBe(0);
  });

  it("hides Aplazar in the middle of an exercise", async () => {
    await seedSession(0, 1);
    renderWorkout();

    await screen.findByTestId("set-exercise-name");
    expect(screen.queryByTestId("set-postpone")).not.toBeInTheDocument();
  });

  it("shows Aplazar only on the first member of a superset's first round", async () => {
    // Day 2: deadlift (4) + overhead-press (3) + lat-pulldown (3) = step 10
    // starts the biceps/triceps superset, which also ends the day -- so this
    // asserts the visibility gate, not that the button can act.
    await renderWorkoutAtStep(1, 10);
    expect(screen.getByTestId("set-postpone")).toBeInTheDocument();

    // Step 11 is member 1 of the same round.
    await renderWorkoutAtStep(1, 11);
    expect(screen.queryByTestId("set-postpone")).not.toBeInTheDocument();

    // Step 12 is member 0 again, but of the second round.
    await renderWorkoutAtStep(1, 12);
    expect(screen.queryByTestId("set-postpone")).not.toBeInTheDocument();
  });

  it("hides Aplazar below the frontier", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    await screen.findByTestId("set-postpone");
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 4",
    );

    await user.click(screen.getByTestId("set-previous"));

    await waitFor(() =>
      expect(screen.getByTestId("set-progress")).toHaveTextContent(
        "Serie 1 de 4",
      ),
    );
    expect(screen.queryByTestId("set-postpone")).not.toBeInTheDocument();
  });

  it("refuses to reorder the plan when the position cannot reorder it", async () => {
    // The row is queued, so the jump path has a target to be refused too.
    await seedSession(0);
    await db.activeSession.update("current", { postponed: [2] });
    const user = userEvent.setup();
    renderWorkout();

    const repsInput = await screen.findByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 4",
    );
    expect(screen.queryByTestId("set-postpone")).not.toBeInTheDocument();
    expect(screen.getByTestId("set-postponed-item-2")).toBeDisabled();

    // The chrome is not the guard: called straight from here, mid-exercise, a
    // reorder would move the squat's block away from the set already logged
    // under step 0 and hand that entry to another exercise.
    const [setScreenProps] = vi.mocked(SetScreen).mock.lastCall ?? [];
    if (setScreenProps === undefined) {
      throw new Error("SetScreen was never rendered.");
    }
    await act(async () => {
      await setScreenProps.onPostpone();
      await setScreenProps.onPostponedItemSelected(2);
    });

    expect(setPostponedItems).not.toHaveBeenCalled();
    const session = await db.activeSession.get("current");
    expect(session?.postponed).toEqual([2]);
    expect(session?.completed.map((entry) => entry.stepIndex)).toEqual([0]);
    expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 4",
    );
  });

  it("disables Aplazar on the last remaining block", async () => {
    // Step 11 starts the plank, the day's last item.
    await seedSession(0, 11);
    renderWorkout();

    expect(await screen.findByTestId("set-postpone")).toBeDisabled();
  });

  it("keeps completed steps in place and reorders the progress groups", async () => {
    // Squat (2 sets) done; the pointer starts the superset.
    await seedGroupedProgressSession(2, [0, 1]);
    const user = userEvent.setup();
    renderGroupedProgressWorkout();

    await screen.findByTestId("set-postpone");
    await user.click(screen.getByTestId("set-postpone"));

    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Plank",
      );
    });
    expect(screen.getByTestId("workout-progress-step-0")).toHaveAttribute(
      "data-state",
      "completed",
    );
    expect(screen.getByTestId("workout-progress-step-0")).toHaveAttribute(
      "data-group",
      "0:0",
    );
    expect(screen.getByTestId("workout-progress-step-1")).toHaveAttribute(
      "data-state",
      "completed",
    );
    expect(screen.getByTestId("workout-progress-step-1")).toHaveAttribute(
      "data-group",
      "0:0",
    );
    // The plank moved up into the postponed superset's place.
    expect(screen.getByTestId("workout-progress-step-2")).toHaveAttribute(
      "data-group",
      "2:0",
    );

    const session = await db.activeSession.get("current");
    expect(session?.postponed).toEqual([1]);
    expect(session?.currentStepIndex).toBe(2);
    expect(session?.completed.map((entry) => entry.stepIndex)).toEqual([0, 1]);
  });

  it("pulls a postponed exercise back by postponing everything in front of it", async () => {
    await seedGroupedProgressSession(0, []);
    const user = userEvent.setup();
    renderGroupedProgressWorkout();

    await screen.findByTestId("set-postpone");
    await user.click(screen.getByTestId("set-postpone"));

    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent("Curl");
    });

    await user.click(screen.getByTestId("set-postponed-item-0"));

    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Squat",
      );
    });
    expect(screen.getByTestId("set-postponed-eyebrow")).toBeInTheDocument();
    // Every remaining block is postponed now, so the queue line retires.
    expect(screen.queryByTestId("set-postponed-items")).not.toBeInTheDocument();

    const session = await db.activeSession.get("current");
    expect(session?.postponed).toEqual([0, 1, 2]);
    expect(session?.currentStepIndex).toBe(0);

    // Nothing was skipped: the superset still follows the squat's two sets.
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 2",
    );
    await user.click(screen.getByTestId("set-continue"));

    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent("Curl");
    });
  });

  it("walks every block exactly once after a jump and completes the day on the last one", async () => {
    await seedFourItemSession();
    const user = userEvent.setup();
    const { onDayCompleted } = renderFourItemWorkout();

    await screen.findByTestId("set-postpone");
    await user.click(screen.getByTestId("set-postpone"));

    // Order is now B, C, D, A with the pointer still at step 0.
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Ejercicio B",
      );
    });

    await user.click(screen.getByTestId("set-postponed-item-0"));

    // Pulling A forward pushed B, C and D behind it: natural order again.
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Ejercicio A",
      );
    });
    const jumped = await db.activeSession.get("current");
    expect(jumped?.postponed).toEqual([0, 1, 2, 3]);
    expect(jumped?.currentStepIndex).toBe(0);

    await completeSetOf(user, "Ejercicio A");
    await completeSetOf(user, "Ejercicio B");
    await completeSetOf(user, "Ejercicio C");
    // Three of four blocks done: the day is not over yet.
    expect(onDayCompleted).not.toHaveBeenCalled();

    await completeSetOf(user, "Ejercicio D");

    await waitFor(() => expect(onDayCompleted).toHaveBeenCalledTimes(1));
    const session = await db.activeSession.get("current");
    expect(
      session?.completed.map(({ stepIndex, slotKey }) => ({
        stepIndex,
        slotKey,
      })),
    ).toEqual([
      { stepIndex: 0, slotKey: "0:0" },
      { stepIndex: 1, slotKey: "1:0" },
      { stepIndex: 2, slotKey: "2:0" },
      { stepIndex: 3, slotKey: "3:0" },
    ]);
  });

  it("leaves the exercise Siguiente already names out of the postponed line", async () => {
    await seedFourItemSession();
    const user = userEvent.setup();
    renderFourItemWorkout();

    await screen.findByTestId("set-postpone");
    await user.click(screen.getByTestId("set-postpone"));
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Ejercicio B",
      );
    });
    await user.click(screen.getByTestId("set-postpone"));

    // Order is C, D, A, B: both queued blocks sit further away than the next
    // one, so the queue lists both.
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Ejercicio C",
      );
    });
    expect(screen.getByTestId("set-next-exercise")).toHaveTextContent(
      "Ejercicio D",
    );
    expect(screen.getByTestId("set-postponed-items")).toHaveTextContent(
      "Aplazados · Ejercicio A, Ejercicio B",
    );

    await completeSetOf(user, "Ejercicio C");

    // D is the last scheduled block, so "Siguiente:" already names A: printing
    // it again on the next line would read like two different exercises.
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Ejercicio D",
      );
    });
    expect(screen.getByTestId("set-next-exercise")).toHaveTextContent(
      "Ejercicio A",
    );
    expect(screen.getByTestId("set-postponed-items")).toHaveTextContent(
      "Aplazados · Ejercicio B",
    );
    expect(
      screen.queryByTestId("set-postponed-item-0"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("set-postponed-item-1")).toBeInTheDocument();
  });

  it("marks only a postponed exercise with the Aplazado eyebrow", async () => {
    await seedSession(0);
    // With item 0 postponed the order is bench-press, barbell-row, plank,
    // back-squat: step 10 starts the postponed squat.
    await db.activeSession.update("current", {
      postponed: [0],
      currentStepIndex: 10,
    });
    renderWorkout();

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );
    expect(screen.getByTestId("set-postponed-eyebrow")).toBeInTheDocument();

    cleanup();

    await db.activeSession.update("current", { currentStepIndex: 0 });
    renderWorkout();

    await waitFor(() =>
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Press banca",
      ),
    );
    expect(
      screen.queryByTestId("set-postponed-eyebrow"),
    ).not.toBeInTheDocument();
  });

  it("rebuilds the postponed order from the persisted queue after a restart", async () => {
    await seedSession(0);
    const user = userEvent.setup();
    renderWorkout();

    await screen.findByTestId("set-exercise-name");
    await user.click(screen.getByTestId("set-postpone"));
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Press banca",
      );
    });

    // Simulate the app being killed and reopened: same database, fresh mount.
    cleanup();
    renderWorkout();

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Press banca",
    );
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 4",
    );
    expect(screen.getByTestId("set-postponed-items")).toHaveTextContent(
      "Sentadilla con barra",
    );
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

describe("day item phases", () => {
  it("never offers Aplazar on a warm-up or a stretch", async () => {
    await renderPhasedWorkoutAtStep(0);
    expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
      "Jumping Jacks",
    );
    expect(screen.queryByTestId("set-postpone")).not.toBeInTheDocument();

    await renderPhasedWorkoutAtStep(5);
    expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
      "Estiramiento de cuádriceps",
    );
    expect(screen.queryByTestId("set-postpone")).not.toBeInTheDocument();
  });

  it("offers Aplazar on a working exercise and disables it on the last one", async () => {
    await renderPhasedWorkoutAtStep(1);
    expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
      "Belt Squat",
    );
    expect(screen.getByTestId("set-postpone")).toBeEnabled();

    // The row is the last work item: the queue lands exactly where it already
    // sits, so the button has nothing to move.
    await renderPhasedWorkoutAtStep(4);
    expect(screen.getByTestId("set-exercise-name")).toHaveTextContent("Remo");
    expect(screen.getByTestId("set-postpone")).toBeDisabled();
  });

  it("lands a postponed exercise before the stretch, not at the end of the day", async () => {
    const user = userEvent.setup();
    await renderPhasedWorkoutAtStep(1);

    await user.click(screen.getByTestId("set-postpone"));

    // The next work item takes its place, and the queue is listed as pending.
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Press de pecho",
      );
    });
    expect(screen.getByTestId("set-postponed-items")).toHaveTextContent(
      "Belt Squat",
    );

    const session = await db.activeSession.get("current");
    expect(session?.postponed).toEqual([1]);
    expect(session?.currentStepIndex).toBe(1);

    // Belt Squat comes back after the other work but before the stretch.
    const plan = buildDayPlan(phasedRoutine.days[0], session?.postponed);
    expect(plan.map((step) => step.itemIndex)).toEqual([0, 2, 3, 1, 1, 4]);
  });

  it("stops listing a postponed exercise once it is the one on screen", async () => {
    const user = userEvent.setup();
    await renderPhasedWorkoutAtStep(1);
    await user.click(screen.getByTestId("set-postpone"));
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Press de pecho",
      );
    });

    // Walk the remaining work: the queue becomes the current exercise, so the
    // line has nothing left to announce and the eyebrow takes over.
    await completeSetOf(user, "Press de pecho");
    await completeSetOf(user, "Remo");

    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Belt Squat",
      );
    });
    expect(screen.queryByTestId("set-postponed-items")).not.toBeInTheDocument();
    expect(screen.getByTestId("set-postponed-eyebrow")).toBeInTheDocument();
  });

  it("stops listing a postponed exercise on screen while work still waits behind the stretch", async () => {
    const user = userEvent.setup();
    await renderTrailingWorkWorkout();

    // Order becomes B, A, stretch, C: the queue lands before the stretch, so
    // the work item after it keeps scheduled work ahead of the whole queue.
    await user.click(screen.getByTestId("set-postpone"));
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Ejercicio B",
      );
    });

    // One step later the pointer is on the queued block itself, with C still
    // scheduled ahead: listing A under "Aplazados" would announce the exercise
    // being executed.
    await completeSetOf(user, "Ejercicio B");
    await waitFor(() => {
      expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
        "Ejercicio A",
      );
    });
    expect(screen.getByTestId("set-postponed-eyebrow")).toBeInTheDocument();
    expect(screen.queryByTestId("set-postponed-items")).not.toBeInTheDocument();
  });
});

describe("progress bar phase grouping", () => {
  // 2 warm-ups, a 2-set exercise, a 2x2 superset, 2 stretches: 11 steps.
  const phasedProgressRoutine = parseRoutine({
    id: "phased-progress",
    name: "Phased progress",
    exercises: {
      "jumping-jacks": { name: "Jumping Jacks" },
      "cat-cow": { name: "Gato-Vaca" },
      "belt-squat": { name: "Belt Squat" },
      curl: { name: "Curl" },
      extension: { name: "Extension" },
      "quad-stretch": { name: "Estiramiento de cuádriceps" },
      "lat-stretch": { name: "Estiramiento de dorsal" },
    },
    days: [
      {
        id: "phased-progress-day",
        name: "Día con fases",
        exercises: [
          {
            phase: "warmup",
            exercise: "jumping-jacks",
            rest: 0,
            sets: [{ reps: 30 }],
          },
          {
            phase: "warmup",
            exercise: "cat-cow",
            rest: 0,
            sets: [{ reps: 10 }],
          },
          {
            exercise: "belt-squat",
            rest: 60,
            sets: [{ reps: 8 }, { reps: 8 }],
          },
          {
            superset: [
              { exercise: "curl", sets: [{ reps: 12 }, { reps: 10 }] },
              { exercise: "extension", sets: [{ reps: 12 }, { reps: 10 }] },
            ],
            rest: 60,
          },
          {
            phase: "cooldown",
            exercise: "quad-stretch",
            rest: 0,
            sets: [{ duration: 30 }],
          },
          {
            phase: "cooldown",
            exercise: "lat-stretch",
            rest: 0,
            sets: [{ duration: 30 }],
          },
        ],
      },
    ],
  });

  async function renderPhasedProgress() {
    await db.routines.put({
      id: phasedProgressRoutine.id,
      routine: phasedProgressRoutine,
      importedAt: Date.now(),
    });
    await startSession(phasedProgressRoutine.id, "phased-progress-day", 0);
    render(
      <WorkoutScreen
        routine={phasedProgressRoutine}
        dayIndex={0}
        onDayCompleted={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    await screen.findByTestId("set-exercise-name");
  }

  /** Group key of each segment, keyed by the step it represents. */
  function groupKeyByStep(): Record<number, string> {
    const segments = screen.getAllByTestId(/^workout-progress-step-\d+$/);
    return Object.fromEntries(
      segments.map((segment) => {
        const testId = segment.getAttribute("data-test") ?? "";
        const stepIndex = Number(testId.replace("workout-progress-step-", ""));
        return [stepIndex, segment.getAttribute("data-group") ?? ""];
      }),
    );
  }

  it("collapses each warm-up and stretch run into a single group", async () => {
    await renderPhasedProgress();

    const groupKeys = groupKeyByStep();
    expect(Object.keys(groupKeys)).toHaveLength(10);
    // Both warm-up steps share one group, and so do both stretches.
    expect(groupKeys[0]).toBe(groupKeys[1]);
    expect(groupKeys[8]).toBe(groupKeys[9]);
    // Warm-up and cool-down are separate runs, never the same group.
    expect(groupKeys[0]).not.toBe(groupKeys[8]);
    // Neither collapses into a work slot.
    expect(groupKeys[0]).not.toBe(groupKeys[2]);
  });

  it("keeps one group per work slot, including each superset member", async () => {
    await renderPhasedProgress();

    const groupKeys = groupKeyByStep();
    // The plain exercise's two sets.
    expect(groupKeys[2]).toBe("2:0");
    expect(groupKeys[3]).toBe("2:0");
    // The superset alternates its members (A1 B1 A2 B2), so each slot's steps
    // are not contiguous and must still land in one group.
    expect(groupKeys[4]).toBe("3:0");
    expect(groupKeys[6]).toBe("3:0");
    expect(groupKeys[5]).toBe("3:1");
    expect(groupKeys[7]).toBe("3:1");
  });

  it("gives every work slot its own group instead of one run", async () => {
    await renderPhasedProgress();

    const groupKeys = groupKeyByStep();
    const workGroupKeys = [2, 3, 4, 5, 6, 7].map((step) => groupKeys[step]);
    expect(new Set(workGroupKeys).size).toBe(3);
  });

  it("separates a phase change with a wider gap than an exercise change", async () => {
    await renderPhasedProgress();

    const groups = screen.getAllByTestId(/^workout-progress-group-/);
    const separationByGroup = groups.map((group) => ({
      phase: group.getAttribute("data-phase"),
      // The extra margin adds to the gap every group already carries.
      hasPhaseGap: group.classList.contains("ml-2"),
    }));
    expect(separationByGroup).toEqual([
      { phase: "warmup", hasPhaseGap: false },
      { phase: "work", hasPhaseGap: true },
      { phase: "work", hasPhaseGap: false },
      { phase: "work", hasPhaseGap: false },
      { phase: "cooldown", hasPhaseGap: true },
    ]);
  });
});
