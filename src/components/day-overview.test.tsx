import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { prepareTimerAudio } from "@/lib/timer-feedback";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { DayOverview } from "./day-overview";

vi.mock("@/lib/timer-feedback", { spy: true });

const routine = parseRoutine(fullbody3d);

beforeEach(async () => {
  vi.clearAllMocks();
  await clearDatabase();
  await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });
});

describe("DayOverview", () => {
  it("shows every standalone and superset exercise with available media", async () => {
    render(
      <DayOverview
        routineId={routine.id}
        dayIndex={1}
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("day-overview-name")).toHaveTextContent(
      "Full Body B",
    );
    expect(
      screen.getAllByTestId(/^day-overview-exercise-\d+-\d+$/),
    ).toHaveLength(5);
    expect(
      screen.getByTestId("day-overview-exercise-name-3-0"),
    ).toHaveTextContent("Curl de bíceps con mancuernas");
    expect(
      screen.getByTestId("day-overview-exercise-name-3-1"),
    ).toHaveTextContent("Extensión de tríceps en polea");
    expect(screen.getByTestId("day-overview-exercise-3-0")).toHaveTextContent(
      "Superserie",
    );
    expect(screen.getAllByTestId(/^day-overview-exercise-image-/)).toHaveLength(
      5,
    );
  });

  it("hides a failed image without removing its exercise", async () => {
    render(
      <DayOverview
        routineId={routine.id}
        dayIndex={0}
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const image = await screen.findByTestId("day-overview-exercise-image-0-0");
    fireEvent.error(image);

    expect(
      screen.queryByTestId("day-overview-exercise-image-0-0"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("day-overview-exercise-name-0-0"),
    ).toHaveTextContent("Sentadilla con barra");
  });

  it("creates the active session only when starting the workout", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(
      <DayOverview
        routineId={routine.id}
        dayIndex={2}
        onStart={onStart}
        onBack={vi.fn()}
      />,
    );

    await screen.findByTestId("day-overview-start");
    await expect(db.activeSession.get("current")).resolves.toBeUndefined();

    await user.click(screen.getByTestId("day-overview-start"));

    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(prepareTimerAudio).toHaveBeenCalledTimes(1);
    await expect(db.activeSession.get("current")).resolves.toMatchObject({
      routineId: routine.id,
      dayId: "day-3",
      dayIndex: 2,
    });
  });

  it("returns to day selection without creating a session", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(
      <DayOverview
        routineId={routine.id}
        dayIndex={0}
        onStart={vi.fn()}
        onBack={onBack}
      />,
    );

    await user.click(await screen.findByTestId("day-overview-back"));

    expect(onBack).toHaveBeenCalledOnce();
    await expect(db.activeSession.get("current")).resolves.toBeUndefined();
  });
});
