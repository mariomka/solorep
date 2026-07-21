import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { buildDayPlan } from "@/lib/session-plan";
import { startSession } from "@/lib/session-store";
import { clearDatabase } from "@/test/helpers";
import fullbody3d from "../../examples/fullbody-3d.json";
import { ResumeSessionPrompt } from "./resume-session-prompt";

const routine = parseRoutine(fullbody3d);

async function seedValidSession(dayIndex = 1): Promise<void> {
  await db.routines.put({ id: routine.id, routine, importedAt: Date.now() });
  await startSession(routine.id, routine.days[dayIndex].id, dayIndex);
}

beforeEach(clearDatabase);

describe("ResumeSessionPrompt", () => {
  it("shows the prompt with the routine and day names for a valid session", async () => {
    await seedValidSession();

    render(<ResumeSessionPrompt onResume={vi.fn()} />);

    expect(
      await screen.findByText("Tienes un entrenamiento en curso"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Full Body — 3 días — Full Body B"),
    ).toBeInTheDocument();
  });

  it("calls onResume with the stored routineId and dayIndex", async () => {
    await seedValidSession(2);

    const onResume = vi.fn();
    const user = userEvent.setup();
    render(<ResumeSessionPrompt onResume={onResume} />);

    await user.click(await screen.findByRole("button", { name: "Reanudar" }));

    expect(onResume).toHaveBeenCalledExactlyOnceWith({
      routineId: routine.id,
      dayIndex: 2,
    });
  });

  it("discards the session and hides the prompt on Descartar", async () => {
    await seedValidSession();

    const user = userEvent.setup();
    render(<ResumeSessionPrompt onResume={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Descartar" }));

    await waitFor(() => {
      expect(
        screen.queryByText("Tienes un entrenamiento en curso"),
      ).not.toBeInTheDocument();
    });
    const session = await db.activeSession.get("current");
    expect(session).toBeUndefined();
  });

  it("self-cleans an orphaned session whose routine was deleted", async () => {
    await startSession("ghost-routine", "day-1", 0);

    render(<ResumeSessionPrompt onResume={vi.fn()} />);

    await waitFor(async () => {
      const session = await db.activeSession.get("current");
      expect(session).toBeUndefined();
    });
    expect(
      screen.queryByText("Tienes un entrenamiento en curso"),
    ).not.toBeInTheDocument();
  });

  it("self-cleans a session whose day moved to a different index after a re-import", async () => {
    const reorderableData = {
      id: "reorderable",
      name: "Reordenable",
      exercises: { "push-up": { name: "Flexiones" } },
      days: [
        {
          id: "day-1",
          name: "Día 1",
          exercises: [{ exercise: "push-up", rest: 5, sets: [{ reps: 10 }] }],
        },
        {
          id: "day-2",
          name: "Día 2",
          exercises: [{ exercise: "push-up", rest: 5, sets: [{ reps: 10 }] }],
        },
      ],
    };
    const original = parseRoutine(reorderableData);
    await db.routines.put({
      id: original.id,
      routine: original,
      importedAt: Date.now(),
    });
    await startSession(original.id, "day-2", 1);

    // Re-import with the days reordered: day-2 now lives at index 0, so the
    // stored dayIndex no longer points at the stored dayId.
    const reordered = parseRoutine({
      ...reorderableData,
      days: [reorderableData.days[1], reorderableData.days[0]],
    });
    await db.routines.put({
      id: reordered.id,
      routine: reordered,
      importedAt: Date.now(),
    });

    render(<ResumeSessionPrompt onResume={vi.fn()} />);

    await waitFor(async () => {
      const session = await db.activeSession.get("current");
      expect(session).toBeUndefined();
    });
    expect(
      screen.queryByText("Tienes un entrenamiento en curso"),
    ).not.toBeInTheDocument();
  });

  it("self-cleans a session whose step index is beyond the day plan", async () => {
    await seedValidSession(0);
    const planLength = buildDayPlan(routine.days[0]).length;
    await db.activeSession.update("current", {
      currentStepIndex: planLength + 1,
    });

    render(<ResumeSessionPrompt onResume={vi.fn()} />);

    await waitFor(async () => {
      const session = await db.activeSession.get("current");
      expect(session).toBeUndefined();
    });
    expect(
      screen.queryByText("Tienes un entrenamiento en curso"),
    ).not.toBeInTheDocument();
  });
});
