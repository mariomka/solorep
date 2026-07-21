import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseRoutine } from "@/lib/routine-schema";
import { startSession } from "@/lib/session-store";
import { clearDatabase, makeRoutineFile } from "@/test/helpers";
import fullbody3d from "../examples/fullbody-3d.json";
import App from "./App";

const miniRoutineData = {
  id: "mini",
  name: "Mini",
  exercises: { "push-up": { name: "Flexiones" } },
  days: [
    {
      id: "day-1",
      name: "Día 1",
      exercises: [
        { exercise: "push-up", rest: 5, sets: [{ reps: 10 }, { reps: 8 }] },
      ],
    },
    {
      id: "day-2",
      name: "Día 2",
      exercises: [{ exercise: "push-up", rest: 5, sets: [{ reps: 10 }] }],
    },
  ],
};
const miniRoutine = parseRoutine(miniRoutineData);

beforeEach(clearDatabase);

describe("App", () => {
  it("renders the app shell", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Solorep" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Importar rutina" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Importa una rutina para empezar."),
    ).toBeInTheDocument();
  });

  it("imports a routine file and shows it in the list", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("Importar rutina JSON");
    await user.upload(input, makeRoutineFile(fullbody3d));

    expect(await screen.findByText("Full Body — 3 días")).toBeInTheDocument();
    expect(await screen.findByText("3 días")).toBeInTheDocument();
  });

  it("navigates to day selection when tapping a routine card", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("Importar rutina JSON");
    await user.upload(input, makeRoutineFile(fullbody3d));

    const routineCard = await screen.findByRole("button", {
      name: "Entrenar Full Body — 3 días",
    });
    await user.click(routineCard);

    expect(await screen.findByText("Full Body A")).toBeInTheDocument();
    expect(await screen.findByText("Full Body B")).toBeInTheDocument();
    expect(await screen.findByText("Full Body C")).toBeInTheDocument();
  });

  it("navigates to the workout screen when tapping a day", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("Importar rutina JSON");
    await user.upload(input, makeRoutineFile(fullbody3d));

    const routineCard = await screen.findByRole("button", {
      name: "Entrenar Full Body — 3 días",
    });
    await user.click(routineCard);

    const dayCard = await screen.findByRole("button", {
      name: /Full Body A/,
    });
    await user.click(dayCard);

    expect(
      await screen.findByRole("heading", { name: "Sentadilla con barra" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Serie 1 de 4")).toBeInTheDocument();
  });

  it("runs a full day: workout, summary, finish, and advanced progress", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("Importar rutina JSON");
    await user.upload(input, makeRoutineFile(miniRoutineData));

    await user.click(
      await screen.findByRole("button", { name: "Entrenar Mini" }),
    );
    await user.click(await screen.findByRole("button", { name: /Día 1/ }));

    // Set 1 of 2.
    expect(await screen.findByText("Serie 1 de 2")).toBeInTheDocument();
    const firstRepsInput = screen.getByLabelText("Repeticiones");
    await waitFor(() => expect(firstRepsInput).toHaveValue("10"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await user.click(
      await screen.findByRole("button", { name: "Saltar descanso" }),
    );

    // Set 2 of 2: prefills the routine's planned 8 -- lastUsed only lands at
    // finishSession, so a first-ever session sees planned values throughout.
    expect(await screen.findByText("Serie 2 de 2")).toBeInTheDocument();
    const secondRepsInput = screen.getByLabelText("Repeticiones");
    await waitFor(() => expect(secondRepsInput).toHaveValue("8"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // Summary screen.
    expect(await screen.findByText("Resumen")).toBeInTheDocument();
    expect(screen.getByText("Series completadas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Terminar" }));

    // Back at the list, with progress advanced to day 2.
    expect(
      await screen.findByRole("heading", { name: "Solorep" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Mini")).toBeInTheDocument();
    const progress = await db.progress.get("mini");
    expect(progress?.currentDayIndex).toBe(1);
  });

  it("keeps the workout on its routine snapshot when a re-import shrinks the day mid-session", async () => {
    await db.routines.put({
      id: miniRoutine.id,
      routine: miniRoutine,
      importedAt: Date.now(),
    });
    await startSession(miniRoutine.id, "day-1", 0);

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Reanudar" }));
    expect(await screen.findByText("Serie 1 de 2")).toBeInTheDocument();
    const firstRepsInput = screen.getByLabelText("Repeticiones");
    await waitFor(() => expect(firstRepsInput).toHaveValue("10"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(
      await screen.findByRole("button", { name: "Saltar descanso" }),
    );
    expect(await screen.findByText("Serie 2 de 2")).toBeInTheDocument();

    // Re-import overwrites the routine with a day-1 shrunk to a single set.
    const shrunkRoutine = parseRoutine({
      ...miniRoutineData,
      days: [
        {
          id: "day-1",
          name: "Día 1",
          exercises: [{ exercise: "push-up", rest: 5, sets: [{ reps: 10 }] }],
        },
        miniRoutineData.days[1],
      ],
    });
    await db.routines.put({
      id: shrunkRoutine.id,
      routine: shrunkRoutine,
      importedAt: Date.now(),
    });

    // The workout keeps running against its snapshot: step 2 stays on screen
    // and completing it still reaches the summary.
    expect(await screen.findByText("Serie 2 de 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Resumen")).toBeInTheDocument();
  });

  it("resumes a mid-session workout from the list prompt at the right step", async () => {
    await db.routines.put({
      id: miniRoutine.id,
      routine: miniRoutine,
      importedAt: Date.now(),
    });
    await startSession(miniRoutine.id, "day-1", 0);
    await db.activeSession.update("current", {
      currentStepIndex: 1,
      completed: [
        {
          stepIndex: 0,
          slotKey: "0:0",
          primaryExerciseKey: "push-up",
          exerciseKey: "push-up",
          setIndex: 0,
          reps: 10,
          completedAt: Date.now(),
        },
      ],
    });

    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText("Tienes un entrenamiento en curso"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reanudar" }));

    expect(
      await screen.findByRole("heading", { name: "Flexiones" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Serie 2 de 2")).toBeInTheDocument();
  });

  it("resumes a completed active session directly at the summary", async () => {
    await db.routines.put({
      id: miniRoutine.id,
      routine: miniRoutine,
      importedAt: Date.now(),
    });
    await startSession(miniRoutine.id, "day-1", 0);
    const completedAt = Date.now();
    await db.activeSession.update("current", {
      currentStepIndex: 2,
      completed: [
        {
          stepIndex: 0,
          slotKey: "0:0",
          primaryExerciseKey: "push-up",
          exerciseKey: "push-up",
          setIndex: 0,
          reps: 10,
          completedAt,
        },
        {
          stepIndex: 1,
          slotKey: "0:0",
          primaryExerciseKey: "push-up",
          exerciseKey: "push-up",
          setIndex: 1,
          reps: 8,
          completedAt,
        },
      ],
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Reanudar" }));

    expect(await screen.findByText("Resumen")).toBeInTheDocument();
    expect(screen.queryByText("Serie 2 de 2")).not.toBeInTheDocument();
  });
});
