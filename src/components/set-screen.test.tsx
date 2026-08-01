import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Routine } from "@/lib/routine-schema";
import type { WorkoutStep } from "@/lib/session-plan";
import { clearDatabase } from "@/test/helpers";
import { SetScreen, type SetScreenProps } from "./set-screen";

const exerciseCatalog: Routine["exercises"] = {
  "bench-press": {
    name: "Press banca",
    datasetId: "0025",
    note: "Mantén las escápulas retraídas durante toda la serie.",
  },
  "dumbbell-bench-press": { name: "Press banca con mancuernas" },
};

const step: WorkoutStep = {
  itemIndex: 0,
  memberIndex: 0,
  primaryExerciseKey: "bench-press",
  alternatives: [],
  setIndex: 0,
  plannedSet: { reps: 10, weight: 20 },
  restAfterSeconds: null,
};

const stepWithAlternatives: WorkoutStep = {
  ...step,
  alternatives: ["dumbbell-bench-press"],
};

const durationStep: WorkoutStep = {
  ...step,
  plannedSet: { duration: 30 },
};

const durationStepWithAlternatives: WorkoutStep = {
  ...durationStep,
  alternatives: ["dumbbell-bench-press"],
};

// Short enough to reach zero within a test, long enough to interact first.
const shortDurationStep: WorkoutStep = {
  ...step,
  plannedSet: { duration: 2 },
};

/** A write that never settles, so the pending guard stays closed. */
function neverResolvingPostpone() {
  return vi.fn<() => Promise<void>>(() => new Promise<void>(() => {}));
}

function renderSetScreen(
  onComplete: (values: unknown) => Promise<void>,
  workoutStep: WorkoutStep = step,
  overrides: Partial<SetScreenProps> = {},
) {
  render(
    <SetScreen
      step={workoutStep}
      exerciseCatalog={exerciseCatalog}
      effectiveExerciseKey="bench-press"
      setNumber={1}
      totalSets={2}
      completedEntry={undefined}
      isFirstStep={true}
      onComplete={onComplete}
      onSwapChange={vi.fn()}
      onPostpone={vi.fn()}
      onPostponedItemSelected={vi.fn()}
      onPrevious={vi.fn()}
      onExit={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(clearDatabase);

describe("SetScreen", () => {
  it("shows an inline alert and re-enables Continuar when saving fails, and retries on the next click", async () => {
    const onComplete = vi
      .fn<(values: unknown) => Promise<void>>()
      .mockRejectedValueOnce(new Error("persist failed"))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderSetScreen(onComplete);

    const repsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));

    await user.click(screen.getByTestId("set-continue"));

    expect(await screen.findByTestId("set-error")).toHaveTextContent(
      "No se pudo guardar la serie.",
    );
    const continueButton = screen.getByTestId("set-continue");
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);

    expect(onComplete).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.queryByTestId("set-error")).not.toBeInTheDocument();
    });
  });

  it("shows the postpone alert outside the dock so a duration step never hides it", async () => {
    const onPostpone = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("persist failed"));
    const user = userEvent.setup();
    renderSetScreen(
      vi.fn(async () => {}),
      durationStep,
      {
        canReorderPlan: true,
        onPostpone,
      },
    );

    // On a duration step the dock belongs to the countdown, so an alert inside
    // it would be unreachable.
    await user.click(await screen.findByTestId("duration-preparation-start"));
    const dock = await screen.findByTestId("duration-countdown-screen");

    await user.click(screen.getByTestId("set-postpone"));

    const alert = await screen.findByTestId("set-postpone-error");
    expect(alert).toHaveTextContent("No se pudo aplazar el ejercicio.");
    expect(dock).not.toContainElement(alert);
    expect(screen.queryByTestId("set-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("set-exercise-name")).toHaveTextContent(
      "Press banca",
    );
    // The pending guard released, so the exercise can be postponed again.
    expect(screen.getByTestId("set-postpone")).toBeEnabled();
  });

  it("replaces the postpone alert instead of stacking it when saving also fails", async () => {
    const onComplete = vi
      .fn<(values: unknown) => Promise<void>>()
      .mockRejectedValueOnce(new Error("persist failed"));
    const onPostpone = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("persist failed"));
    const user = userEvent.setup();
    renderSetScreen(onComplete, step, { canReorderPlan: true, onPostpone });

    await user.click(screen.getByTestId("set-postpone"));
    expect(await screen.findByTestId("set-postpone-error")).toBeInTheDocument();

    const repsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));
    await user.click(screen.getByTestId("set-continue"));

    // Doing the set here settles the failed postponement, so only the new
    // failure is left to read.
    expect(await screen.findByTestId("set-error")).toHaveTextContent(
      "No se pudo guardar la serie.",
    );
    expect(screen.queryByTestId("set-postpone-error")).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("blocks completing the set and changing the exercise while a postponement is pending", async () => {
    const onComplete = vi.fn<(values: unknown) => Promise<void>>();
    const user = userEvent.setup();
    renderSetScreen(onComplete, stepWithAlternatives, {
      canReorderPlan: true,
      onPostpone: neverResolvingPostpone(),
    });

    const repsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(repsInput).toHaveValue("10"));

    await user.click(screen.getByTestId("set-postpone"));

    const continueButton = screen.getByTestId("set-continue");
    expect(continueButton).toBeDisabled();

    await user.click(continueButton);

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId("set-previous")).toBeDisabled();
    expect(screen.getByTestId("set-exit")).toBeDisabled();
    expect(screen.getByTestId("set-postpone")).toBeDisabled();
    // Picking an alternative for an exercise about to leave the screen would
    // land the swap on the wrong slot.
    expect(screen.getByTestId("set-exercise-select")).toBeDisabled();
  });

  it("blocks the duration auto-completion while a postponement is pending", async () => {
    const onComplete = vi.fn<(values: unknown) => Promise<void>>();
    const user = userEvent.setup();
    renderSetScreen(onComplete, shortDurationStep, {
      canReorderPlan: true,
      onPostpone: neverResolvingPostpone(),
    });

    await user.click(await screen.findByTestId("duration-preparation-start"));
    await screen.findByTestId("duration-countdown-screen");
    await user.click(screen.getByTestId("set-postpone"));

    // The countdown reaches zero while the write is still in flight: its
    // one-shot completion is swallowed and the timer hands over to the dock.
    await waitFor(
      () => {
        expect(
          screen.queryByTestId("duration-countdown-screen"),
        ).not.toBeInTheDocument();
      },
      { timeout: 3_000 },
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps Aplazar enabled while a duration countdown runs", async () => {
    const user = userEvent.setup();
    renderSetScreen(
      vi.fn(async () => {}),
      durationStepWithAlternatives,
      { canReorderPlan: true },
    );

    await user.click(await screen.findByTestId("duration-preparation-start"));
    await screen.findByTestId("duration-countdown-screen");

    expect(screen.getByTestId("set-postpone")).toBeEnabled();
    // A disabled Alternativas proves the countdown is genuinely running: an
    // occupied station is exactly when a duration set must stay postponable.
    expect(screen.getByTestId("set-exercise-select")).toBeDisabled();
  });

  it("recovers a duration set stranded by a failed postponement with Reintentar", async () => {
    const onComplete = vi.fn<(values: unknown) => Promise<void>>();
    let rejectPostpone: (error: Error) => void = () => {};
    const onPostpone = vi.fn<() => Promise<void>>(
      () =>
        new Promise((_, reject) => {
          rejectPostpone = reject;
        }),
    );
    const user = userEvent.setup();
    renderSetScreen(onComplete, shortDurationStep, {
      canReorderPlan: true,
      onPostpone,
    });

    await user.click(await screen.findByTestId("duration-preparation-start"));
    await screen.findByTestId("duration-countdown-screen");
    await user.click(screen.getByTestId("set-postpone"));
    await waitFor(
      () => {
        expect(
          screen.queryByTestId("duration-countdown-screen"),
        ).not.toBeInTheDocument();
      },
      { timeout: 3_000 },
    );

    await act(async () => {
      rejectPostpone(new Error("persist failed"));
    });

    // Recoverable without skipping the set.
    await user.click(await screen.findByTestId("duration-retry"));

    // The retry re-arms the lead-in: the set was interrupted, so getting back
    // into position is part of doing it again.
    expect(
      await screen.findByTestId("duration-preparation-screen"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("set-postpone-error")).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows the exercise note and keeps it visible when the GIF fails", async () => {
    renderSetScreen(vi.fn(async () => {}));

    const gif = await screen.findByTestId("set-exercise-gif");
    expect(screen.getByTestId("set-exercise-note")).toHaveTextContent(
      "Mantén las escápulas retraídas durante toda la serie.",
    );

    fireEvent.error(gif);

    expect(screen.queryByTestId("set-exercise-gif")).not.toBeInTheDocument();
    expect(screen.getByTestId("set-exercise-note")).toBeInTheDocument();
  });

  it("holds a duration set behind a five-second lead-in before the countdown", async () => {
    renderSetScreen(
      vi.fn(async () => {}),
      durationStep,
    );

    expect(
      await screen.findByTestId("duration-preparation-screen"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("duration-preparation-timer")).toHaveTextContent(
      "5",
    );
    // The real countdown must not be running yet.
    expect(
      screen.queryByTestId("duration-countdown-screen"),
    ).not.toBeInTheDocument();
    // Getting into position needs the media, and going back must stay possible.
    expect(screen.getByTestId("set-exercise-gif")).toBeInTheDocument();
    expect(screen.getByTestId("set-previous")).toBeInTheDocument();

    expect(
      await screen.findByTestId(
        "duration-countdown-screen",
        {},
        { timeout: 6_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("duration-timer")).toHaveTextContent("00:30");
    expect(
      screen.queryByTestId("duration-preparation-screen"),
    ).not.toBeInTheDocument();
  }, 10_000);

  it("starts a compact duration countdown automatically and toggles pause", async () => {
    const user = userEvent.setup();
    renderSetScreen(
      vi.fn(async () => {}),
      durationStep,
    );

    // Cutting the lead-in short starts the set immediately.
    await user.click(await screen.findByTestId("duration-preparation-start"));

    expect(
      await screen.findByTestId("duration-countdown-screen"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("duration-timer")).toHaveTextContent("00:30");
    expect(screen.queryByTestId("set-duration-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("set-start")).not.toBeInTheDocument();
    // Media stays on screen while the countdown runs in the bottom dock.
    expect(screen.getByTestId("set-exercise-gif")).toBeInTheDocument();
    expect(screen.getByTestId("set-exercise-note")).toHaveTextContent(
      "Mantén las escápulas retraídas durante toda la serie.",
    );
    expect(screen.getByTestId("set-previous")).toBeInTheDocument();
    const pauseButton = screen.getByTestId("duration-pause");
    expect(pauseButton).toHaveTextContent("Pausar");
    await user.click(pauseButton);
    expect(pauseButton).toHaveTextContent("Reanudar");
    await user.click(pauseButton);
    expect(pauseButton).toHaveTextContent("Pausar");
    expect(screen.getByTestId("duration-skip")).toBeInTheDocument();
  });
});
