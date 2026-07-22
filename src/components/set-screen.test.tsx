import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Routine } from "@/lib/routine-schema";
import type { WorkoutStep } from "@/lib/session-plan";
import { clearDatabase } from "@/test/helpers";
import { SetScreen } from "./set-screen";

const exerciseCatalog: Routine["exercises"] = {
  "bench-press": {
    name: "Press banca",
    datasetId: "0025",
    note: "Mantén las escápulas retraídas durante toda la serie.",
  },
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

const durationStep: WorkoutStep = {
  ...step,
  plannedSet: { duration: 30 },
};

function renderSetScreen(
  onComplete: (values: unknown) => Promise<void>,
  workoutStep: WorkoutStep = step,
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
      onPrevious={vi.fn()}
      onExit={vi.fn()}
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

  it("starts a compact duration countdown automatically and toggles pause", async () => {
    const user = userEvent.setup();
    renderSetScreen(
      vi.fn(async () => {}),
      durationStep,
    );

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
