import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { DaySelection } from "./day-selection";

const routine = parseRoutine(fullbody3d);

async function seedRoutine(): Promise<void> {
  await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });
}

beforeEach(clearDatabase);

describe("DaySelection", () => {
  it("renders the routine name and every day", async () => {
    await seedRoutine();

    render(
      <DaySelection
        routineId={routine.id}
        onStartDay={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText("Full Body — 3 días")).toBeInTheDocument();
    expect(await screen.findByText("Full Body A")).toBeInTheDocument();
    expect(await screen.findByText("Full Body B")).toBeInTheDocument();
    expect(await screen.findByText("Full Body C")).toBeInTheDocument();
  });

  it("shows the Siguiente badge only on the day from the progress row", async () => {
    await seedRoutine();
    await db.progress.put({ routineId: routine.id, currentDayIndex: 1 });

    render(
      <DaySelection
        routineId={routine.id}
        onStartDay={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const badges = await screen.findAllByText("Siguiente");
    expect(badges).toHaveLength(1);

    const dayTwoCard = await screen.findByRole("button", {
      name: /Full Body B/,
    });
    expect(within(dayTwoCard).getByText("Siguiente")).toBeInTheDocument();
  });

  it("defaults the Siguiente badge to the first day without a progress row", async () => {
    await seedRoutine();

    render(
      <DaySelection
        routineId={routine.id}
        onStartDay={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const dayOneCard = await screen.findByRole("button", {
      name: /Full Body A/,
    });
    expect(within(dayOneCard).getByText("Siguiente")).toBeInTheDocument();
  });

  it("starts a session and calls onStartDay when tapping a day", async () => {
    await seedRoutine();

    const onStartDay = vi.fn();
    const user = userEvent.setup();
    render(
      <DaySelection
        routineId={routine.id}
        onStartDay={onStartDay}
        onBack={vi.fn()}
      />,
    );

    const dayThreeCard = await screen.findByRole("button", {
      name: /Full Body C/,
    });
    await user.click(dayThreeCard);

    await waitFor(() => {
      expect(onStartDay).toHaveBeenCalledExactlyOnceWith(2);
    });
    const session = await db.activeSession.get("current");
    expect(session).toMatchObject({
      routineId: routine.id,
      dayId: "day-3",
      dayIndex: 2,
    });
  });

  it("calls onBack when tapping the back button", async () => {
    await seedRoutine();

    const onBack = vi.fn();
    const user = userEvent.setup();
    render(
      <DaySelection
        routineId={routine.id}
        onStartDay={vi.fn()}
        onBack={onBack}
      />,
    );

    const backButton = await screen.findByRole("button", { name: "Volver" });
    await user.click(backButton);

    expect(onBack).toHaveBeenCalledOnce();
  });
});
