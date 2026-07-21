import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { RoutineList } from "./routine-list";

const routine = parseRoutine(fullbody3d);

beforeEach(clearDatabase);

describe("RoutineList", () => {
  it("renders a card with the routine name and day count", async () => {
    await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });

    render(<RoutineList onSelectRoutine={vi.fn()} />);

    expect(
      await screen.findByTestId("routine-name-fullbody-3d"),
    ).toHaveTextContent("Full Body — 3 días");
    expect(
      await screen.findByTestId("routine-day-count-fullbody-3d"),
    ).toHaveTextContent("3 días");
  });

  it("renders the empty state when there are no routines", async () => {
    render(<RoutineList onSelectRoutine={vi.fn()} />);

    expect(await screen.findByTestId("routine-list-empty")).toHaveTextContent(
      "Importa una rutina para empezar.",
    );
  });

  it("orders routines by import time with the oldest first", async () => {
    const newerRoutine = { ...routine, id: "a-newer", name: "Rutina Nueva" };
    const olderRoutine = { ...routine, id: "z-older", name: "Rutina Vieja" };
    await db.routines.bulkPut([
      { id: newerRoutine.id, routine: newerRoutine, importedAt: 2000 },
      { id: olderRoutine.id, routine: olderRoutine, importedAt: 1000 },
    ]);

    render(<RoutineList onSelectRoutine={vi.fn()} />);

    expect(await screen.findByTestId("routine-list")).toHaveTextContent(
      /Rutina Vieja.*Rutina Nueva/,
    );
  });

  it("calls onSelectRoutine with the routine id when tapping a card", async () => {
    await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });

    const onSelectRoutine = vi.fn();
    const user = userEvent.setup();
    render(<RoutineList onSelectRoutine={onSelectRoutine} />);

    const card = await screen.findByTestId("routine-card-fullbody-3d");
    await user.click(card);

    expect(onSelectRoutine).toHaveBeenCalledExactlyOnceWith(routine.id);
  });

  it("opens the file chooser from the populated routines menu", async () => {
    await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });

    const user = userEvent.setup();
    render(<RoutineList onSelectRoutine={vi.fn()} />);

    const fileInput = await screen.findByTestId("import-routine-input");
    const clickFileInput = vi
      .spyOn(fileInput, "click")
      .mockImplementation(() => {});

    await user.click(screen.getByTestId("routines-menu-trigger"));
    await user.click(await screen.findByTestId("import-routine-menu-item"));

    expect(clickFileInput).toHaveBeenCalledOnce();
    expect(fileInput).toBeInTheDocument();
  });

  it("deletes a routine and its progress from the routine menu", async () => {
    await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });
    await db.progress.put({ routineId: routine.id, currentDayIndex: 1 });

    const onSelectRoutine = vi.fn();
    const user = userEvent.setup();
    render(<RoutineList onSelectRoutine={onSelectRoutine} />);

    await user.click(await screen.findByTestId("routine-menu-fullbody-3d"));
    await user.click(await screen.findByTestId("delete-routine-fullbody-3d"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("routine-card-fullbody-3d"),
      ).not.toBeInTheDocument();
    });
    await waitFor(async () => {
      await expect(db.progress.count()).resolves.toBe(0);
    });
    expect(onSelectRoutine).not.toHaveBeenCalled();
  });
});
