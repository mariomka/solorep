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

    expect(await screen.findByText("Full Body — 3 días")).toBeInTheDocument();
    expect(await screen.findByText("3 días")).toBeInTheDocument();
  });

  it("renders the empty state when there are no routines", async () => {
    render(<RoutineList onSelectRoutine={vi.fn()} />);

    expect(
      await screen.findByText("Importa una rutina para empezar."),
    ).toBeInTheDocument();
  });

  it("orders routines by import time with the oldest first", async () => {
    const newerRoutine = { ...routine, id: "a-newer", name: "Rutina Nueva" };
    const olderRoutine = { ...routine, id: "z-older", name: "Rutina Vieja" };
    await db.routines.bulkPut([
      { id: newerRoutine.id, routine: newerRoutine, importedAt: 2000 },
      { id: olderRoutine.id, routine: olderRoutine, importedAt: 1000 },
    ]);

    render(<RoutineList onSelectRoutine={vi.fn()} />);

    const titles = await screen.findAllByText(/Rutina (Nueva|Vieja)/);
    const titleTexts = titles.map((title) => title.textContent);
    expect(titleTexts).toEqual(["Rutina Vieja", "Rutina Nueva"]);
  });

  it("calls onSelectRoutine with the routine id when tapping a card", async () => {
    await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });

    const onSelectRoutine = vi.fn();
    const user = userEvent.setup();
    render(<RoutineList onSelectRoutine={onSelectRoutine} />);

    const card = await screen.findByRole("button", {
      name: "Entrenar Full Body — 3 días",
    });
    await user.click(card);

    expect(onSelectRoutine).toHaveBeenCalledExactlyOnceWith(routine.id);
  });

  it("deletes a routine and its progress from the delete button", async () => {
    await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });
    await db.progress.put({ routineId: routine.id, currentDayIndex: 1 });

    const onSelectRoutine = vi.fn();
    const user = userEvent.setup();
    render(<RoutineList onSelectRoutine={onSelectRoutine} />);

    const deleteButton = await screen.findByRole("button", {
      name: "Eliminar Full Body — 3 días",
    });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText("Full Body — 3 días")).not.toBeInTheDocument();
    });
    await waitFor(async () => {
      await expect(db.progress.count()).resolves.toBe(0);
    });
    expect(onSelectRoutine).not.toHaveBeenCalled();
  });
});
