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

    const repsInput = screen.getByLabelText("Repeticiones");
    await waitFor(() => expect(repsInput).toHaveValue("10"));

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar la serie.",
    );
    const continueButton = screen.getByRole("button", { name: "Continuar" });
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);

    expect(onComplete).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("hides the exercise GIF when it fails to load", async () => {
    renderSetScreen(vi.fn(async () => {}));

    const gif = await screen.findByAltText("Demostración de Press banca");

    fireEvent.error(gif);

    expect(
      screen.queryByAltText("Demostración de Press banca"),
    ).not.toBeInTheDocument();
  });
});
