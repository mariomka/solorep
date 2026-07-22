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

// Older than AUTO_RESUME_WINDOW_MS: the session shows the resume prompt
// instead of re-entering the workout on launch.
const staleUpdatedAt = () => Date.now() - 16 * 60 * 1000;

beforeEach(clearDatabase);

describe("App", () => {
  it("renders the app shell", async () => {
    render(<App />);

    expect(await screen.findByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByTestId("app-title")).toHaveTextContent("Solorep");
    expect(
      await screen.findByTestId("import-routine-trigger"),
    ).toHaveTextContent("Importar rutina");
    expect(await screen.findByTestId("routine-list-empty")).toHaveTextContent(
      "Importa una rutina para empezar.",
    );
  });

  it("imports a routine file and shows it in the list", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByTestId("import-routine-input");
    await user.upload(input, makeRoutineFile(fullbody3d));

    expect(
      await screen.findByTestId("routine-name-fullbody-3d"),
    ).toHaveTextContent("Full Body — 3 días");
    expect(
      await screen.findByTestId("routine-day-count-fullbody-3d"),
    ).toHaveTextContent("3 días");
  });

  it("navigates to day selection when tapping a routine card", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByTestId("import-routine-input");
    await user.upload(input, makeRoutineFile(fullbody3d));

    const routineCard = await screen.findByTestId("routine-card-fullbody-3d");
    await user.click(routineCard);

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

  it("reviews the selected day before starting the workout", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByTestId("import-routine-input");
    await user.upload(input, makeRoutineFile(fullbody3d));

    const routineCard = await screen.findByTestId("routine-card-fullbody-3d");
    await user.click(routineCard);

    const dayCard = await screen.findByTestId("day-card-day-1");
    await user.click(dayCard);

    expect(await screen.findByTestId("day-overview-name")).toHaveTextContent(
      "Full Body A",
    );
    await expect(db.activeSession.get("current")).resolves.toBeUndefined();

    await user.click(screen.getByTestId("day-overview-start"));

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Sentadilla con barra",
    );
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 4",
    );
  });

  it("runs a full day: workout, summary, finish, and advanced progress", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByTestId("import-routine-input");
    await user.upload(input, makeRoutineFile(miniRoutineData));

    await user.click(await screen.findByTestId("routine-card-mini"));
    await user.click(await screen.findByTestId("day-card-day-1"));
    await user.click(await screen.findByTestId("day-overview-start"));

    // Set 1 of 2.
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 2",
    );
    const firstRepsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(firstRepsInput).toHaveValue("10"));
    await user.click(screen.getByTestId("set-continue"));

    await user.click(await screen.findByTestId("rest-skip"));

    // Set 2 of 2: prefills the routine's planned 8 -- lastUsed only lands at
    // finishSession, so a first-ever session sees planned values throughout.
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 2",
    );
    const secondRepsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(secondRepsInput).toHaveValue("8"));
    await user.click(screen.getByTestId("set-continue"));

    // Summary screen.
    expect(await screen.findByTestId("session-summary")).toHaveTextContent(
      "Resumen",
    );
    expect(screen.getByTestId("summary-sets-completed")).toHaveTextContent("2");
    await user.click(screen.getByTestId("summary-finish"));

    // Back at the list, with progress advanced to day 2.
    expect(await screen.findByTestId("app-title")).toHaveTextContent("Solorep");
    expect(await screen.findByTestId("routine-name-mini")).toHaveTextContent(
      "Mini",
    );
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
    await db.activeSession.update("current", { updatedAt: staleUpdatedAt() });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTestId("resume-session-resume"));
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 1 de 2",
    );
    const firstRepsInput = screen.getByTestId("set-reps-input");
    await waitFor(() => expect(firstRepsInput).toHaveValue("10"));
    await user.click(screen.getByTestId("set-continue"));
    await user.click(await screen.findByTestId("rest-skip"));
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 2",
    );

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
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 2",
    );
    await user.click(screen.getByTestId("set-continue"));
    expect(await screen.findByTestId("session-summary")).toHaveTextContent(
      "Resumen",
    );
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
      updatedAt: staleUpdatedAt(),
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
      await screen.findByTestId("resume-session-prompt"),
    ).toHaveTextContent("Tienes un entrenamiento en curso");
    await user.click(screen.getByTestId("resume-session-resume"));

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Flexiones",
    );
    expect(await screen.findByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 2",
    );
  });

  it("auto-resumes a session with recent activity straight into the workout", async () => {
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

    render(<App />);

    expect(await screen.findByTestId("set-exercise-name")).toHaveTextContent(
      "Flexiones",
    );
    expect(screen.getByTestId("set-progress")).toHaveTextContent(
      "Serie 2 de 2",
    );
    expect(
      screen.queryByTestId("resume-session-prompt"),
    ).not.toBeInTheDocument();
  });

  it("auto-resumes into the remaining rest of a killed session", async () => {
    await db.routines.put({
      id: miniRoutine.id,
      routine: miniRoutine,
      importedAt: Date.now(),
    });
    await startSession(miniRoutine.id, "day-1", 0);
    await db.activeSession.update("current", {
      currentStepIndex: 1,
      restEndsAt: Date.now() + 65_000,
    });

    render(<App />);

    await screen.findByTestId("rest-screen");
    expect(screen.getByTestId("rest-timer")).toHaveTextContent(/01:0[0-5]/);
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
      updatedAt: staleUpdatedAt(),
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

    await user.click(await screen.findByTestId("resume-session-resume"));

    expect(await screen.findByTestId("session-summary")).toHaveTextContent(
      "Resumen",
    );
    expect(screen.queryByTestId("set-progress")).not.toBeInTheDocument();
  });
});
