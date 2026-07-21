import { render, screen, waitFor } from "@testing-library/react";
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

    expect(
      await screen.findByTestId("day-selection-routine-name"),
    ).toHaveTextContent("Full Body — 3 días");
    expect(await screen.findByTestId("day-name-day-1")).toHaveTextContent(
      "Full Body A",
    );
    expect(await screen.findByTestId("day-name-day-2")).toHaveTextContent(
      "Full Body B",
    );
    expect(await screen.findByTestId("day-name-day-3")).toHaveTextContent(
      "Full Body C",
    );
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

    expect(await screen.findByTestId("day-next-badge-day-2")).toHaveTextContent(
      "Siguiente",
    );
    expect(
      screen.queryByTestId("day-next-badge-day-1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("day-next-badge-day-3"),
    ).not.toBeInTheDocument();
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

    expect(await screen.findByTestId("day-next-badge-day-1")).toHaveTextContent(
      "Siguiente",
    );
    expect(
      screen.queryByTestId("day-next-badge-day-2"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("day-next-badge-day-3"),
    ).not.toBeInTheDocument();
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

    const dayThreeCard = await screen.findByTestId("day-card-day-3");
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

    const backButton = await screen.findByTestId("day-selection-back");
    await user.click(backButton);

    expect(onBack).toHaveBeenCalledOnce();
  });
});
