import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Routine } from "@/lib/routine-schema";
import type { WorkoutStep } from "@/lib/session-plan";
import { clearDatabase } from "@/test/helpers";
import { SetScreen } from "./set-screen";

const exerciseCatalog: Routine["exercises"] = {
  "bench-press": { name: "Press banca", datasetId: "0025" },
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

function renderSetScreen(onComplete: (values: unknown) => Promise<void>) {
  render(
    <SetScreen
      step={step}
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

  it("hides the exercise GIF when it fails to load", async () => {
    renderSetScreen(vi.fn(async () => {}));

    const gif = await screen.findByTestId("set-exercise-gif");

    fireEvent.error(gif);

    expect(screen.queryByTestId("set-exercise-gif")).not.toBeInTheDocument();
  });
});
