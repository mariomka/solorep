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
        onUnavailable={vi.fn()}
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
        onUnavailable={vi.fn()}
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
        onUnavailable={vi.fn()}
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
        onUnavailable={vi.fn()}
      />,
    );

    await user.click(await screen.findByTestId("day-overview-back"));

    expect(onBack).toHaveBeenCalledOnce();
    await expect(db.activeSession.get("current")).resolves.toBeUndefined();
  });

  it("calls onUnavailable when the routine does not exist", async () => {
    const onUnavailable = vi.fn();
    render(
      <DayOverview
        routineId="unknown-routine"
        dayIndex={0}
        onStart={vi.fn()}
        onBack={vi.fn()}
        onUnavailable={onUnavailable}
      />,
    );

    await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });

  it("calls onUnavailable when the day index is out of range", async () => {
    const onUnavailable = vi.fn();
    render(
      <DayOverview
        routineId={routine.id}
        dayIndex={99}
        onStart={vi.fn()}
        onBack={vi.fn()}
        onUnavailable={onUnavailable}
      />,
    );

    await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });
});

describe("DayOverview phase sections", () => {
  const phasedRoutine = parseRoutine({
    id: "phased-overview",
    name: "Phased overview",
    exercises: {
      "jumping-jacks": { name: "Jumping Jacks" },
      "cat-cow": { name: "Gato-Vaca" },
      "belt-squat": { name: "Belt Squat", datasetId: "0025" },
      "chest-press": { name: "Press de pecho", datasetId: "0026" },
      "quad-stretch": { name: "Estiramiento de cuádriceps" },
      "lat-stretch": { name: "Estiramiento de dorsal" },
    },
    days: [
      {
        id: "phased-overview-day",
        name: "Día con fases",
        exercises: [
          {
            phase: "warmup",
            exercise: "jumping-jacks",
            rest: 0,
            sets: [{ reps: 30 }],
          },
          {
            phase: "warmup",
            exercise: "cat-cow",
            rest: 0,
            sets: [{ reps: 10 }],
          },
          {
            exercise: "belt-squat",
            rest: 120,
            sets: [{ reps: 8 }, { reps: 8 }],
          },
          { exercise: "chest-press", rest: 90, sets: [{ reps: 10 }] },
          {
            phase: "cooldown",
            exercise: "quad-stretch",
            rest: 0,
            sets: [{ duration: 30 }],
          },
          {
            phase: "cooldown",
            exercise: "lat-stretch",
            rest: 0,
            sets: [{ duration: 30 }],
          },
        ],
      },
    ],
  });

  async function renderPhasedOverview() {
    await db.routines.put({
      id: phasedRoutine.id,
      routine: phasedRoutine,
      importedAt: Date.now(),
    });
    render(
      <DayOverview
        routineId={phasedRoutine.id}
        dayIndex={0}
        onStart={vi.fn()}
        onBack={vi.fn()}
        onUnavailable={vi.fn()}
      />,
    );
    await screen.findByTestId("day-overview-name");
  }

  it("groups the day into labelled phase sections with their counts", async () => {
    await renderPhasedOverview();

    expect(
      screen.getByTestId("day-overview-section-label-warmup"),
    ).toHaveTextContent("Calentamiento · 2");
    expect(
      screen.getByTestId("day-overview-section-label-work"),
    ).toHaveTextContent("Principal · 2");
    expect(
      screen.getByTestId("day-overview-section-label-cooldown"),
    ).toHaveTextContent("Estiramientos · 2");
  });

  it("renders warm-ups and stretches without media and keeps it on the work rows", async () => {
    await renderPhasedOverview();

    // Only the two work exercises carry a thumbnail, though every catalog
    // entry could have had one.
    expect(screen.getAllByTestId(/^day-overview-exercise-image-/)).toHaveLength(
      2,
    );
    expect(
      screen.queryByTestId("day-overview-exercise-image-0-0"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("day-overview-exercise-image-2-0"),
    ).toBeInTheDocument();

    // A single-set compact row drops the "1 serie ·" prefix.
    expect(screen.getByTestId("day-overview-exercise-0-0")).toHaveTextContent(
      "Jumping Jacks30 rep.",
    );
    expect(screen.getByTestId("day-overview-exercise-4-0")).toHaveTextContent(
      "Estiramiento de cuádriceps30 s",
    );
  });

  it("numbers the work section from one, ignoring the warm-up above it", async () => {
    await renderPhasedOverview();

    expect(screen.getByTestId("day-overview-exercise-2-0")).toHaveTextContent(
      "01 / Ejercicio",
    );
    expect(screen.getByTestId("day-overview-exercise-3-0")).toHaveTextContent(
      "02 / Ejercicio",
    );
  });

  it("leaves a day without phases as one unlabelled list", async () => {
    render(
      <DayOverview
        routineId={routine.id}
        dayIndex={1}
        onStart={vi.fn()}
        onBack={vi.fn()}
        onUnavailable={vi.fn()}
      />,
    );
    await screen.findByTestId("day-overview-name");

    expect(
      screen.queryByTestId("day-overview-section-label-work"),
    ).not.toBeInTheDocument();
    // Every row keeps its full treatment, media included.
    expect(screen.getAllByTestId(/^day-overview-exercise-image-/)).toHaveLength(
      5,
    );
  });
});
