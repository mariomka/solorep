import { expect, type Page, test } from "@playwright/test";

const routineFile = "examples/mini-session.json";
const routineId = "mini-session";
const routineName = "Mini sesión";
const resumePromptTitle = "Tienes un entrenamiento en curso";
const dayAId = "day-a";
const dayBId = "day-b";

async function importRoutine(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("import-routine-input").setInputFiles(routineFile);
  const routineNameElement = page.getByTestId(`routine-name-${routineId}`);
  await expect(routineNameElement).toBeVisible();
  await expect(routineNameElement).toHaveText(routineName);
}

test("completes a full session and advances the day pointer", async ({
  page,
}) => {
  await importRoutine(page);

  await page.getByTestId(`routine-card-${routineId}`).click();

  const dayACard = page.getByTestId(`day-card-${dayAId}`);
  const dayBCard = page.getByTestId(`day-card-${dayBId}`);
  await expect(dayACard).toBeVisible();
  await expect(dayBCard).toBeVisible();
  await expect(dayACard).toContainText("Día A");
  await expect(dayBCard).toContainText("Día B");
  await expect(dayACard).toContainText("Siguiente");
  await expect(dayBCard).not.toContainText("Siguiente");

  await dayACard.click();
  const dayOverview = page.getByTestId("day-overview");
  await expect(dayOverview).toBeVisible();
  await expect(dayOverview).toContainText("Press banca");
  await expect(dayOverview).toContainText("Curl de bíceps");
  await page.getByTestId("day-overview-start").click();

  // Bench press set 1 of 2, then a rest screen (skipped deterministically).
  const exerciseName = page.getByTestId("set-exercise-name");
  const setProgress = page.getByTestId("set-progress");
  const continueButton = page.getByTestId("set-continue");
  await expect(exerciseName).toBeVisible();
  await expect(exerciseName).toHaveText("Press banca");
  await expect(setProgress).toBeVisible();
  await expect(setProgress).toHaveText("Serie 1 de 2");
  await continueButton.click();

  const restScreen = page.getByTestId("rest-screen");
  await expect(restScreen).toBeVisible();
  await expect(restScreen).toContainText("Descanso");
  await page.getByTestId("rest-skip").click();

  // Bench press set 2: last set of the item, so no rest afterwards.
  await expect(setProgress).toBeVisible();
  await expect(setProgress).toHaveText("Serie 2 de 2");
  await continueButton.click();

  // Superset members run back-to-back within the round.
  await expect(exerciseName).toBeVisible();
  await expect(exerciseName).toHaveText("Curl de bíceps");
  await continueButton.click();

  await expect(exerciseName).toBeVisible();
  await expect(exerciseName).toHaveText("Extensión de tríceps");
  await continueButton.click();

  // Duration set: a silent five-second lead-in runs first, then the countdown
  // starts automatically in the fixed bottom dock while the note stays visible.
  await expect(exerciseName).toBeVisible();
  await expect(exerciseName).toHaveText("Plancha");
  // A tick may already have elapsed, so pin the range instead of the first
  // value: this stays a short single-digit lead-in, not the set's own timer.
  await expect(page.getByTestId("duration-preparation-timer")).toHaveText(
    /^[1-5]$/,
  );
  await page.getByTestId("duration-preparation-start").click();
  await expect(page.getByTestId("duration-countdown-screen")).toBeVisible();
  await expect(page.getByTestId("set-exercise-note")).toContainText(
    "Aprieta abdomen y glúteos",
  );
  const durationTimer = page.getByTestId("duration-timer");
  const pauseButton = page.getByTestId("duration-pause");
  await pauseButton.click();
  await expect(pauseButton).toHaveText("Reanudar");
  const pausedCountdownText = await durationTimer.textContent();
  if (pausedCountdownText === null) {
    throw new Error("Duration timer has no text while paused.");
  }
  await page.waitForTimeout(1_100);
  await expect(durationTimer).toHaveText(pausedCountdownText);
  await pauseButton.click();
  await expect(pauseButton).toHaveText("Pausar");
  await page.getByTestId("duration-skip").click();

  // Summary: 5 sets. lastUsed is only written at finishSession, so every
  // set prefills the routine's planned values in a first-ever session.
  // Volume = 10×20 + 8×22.5 + 12×10 + 12×20 = 740 kg — this pins the
  // planned-values-win-in-session behavior.
  const sessionSummary = page.getByTestId("session-summary");
  await expect(sessionSummary).toBeVisible();
  await expect(sessionSummary).toContainText("Series completadas");
  await expect(page.getByTestId("summary-sets-completed")).toHaveText("5");
  await expect(page.getByTestId("summary-total-volume")).toHaveText("740 kg");
  await page.getByTestId("summary-finish").click();

  // Wait for the list before reloading: racing the finishSession
  // transaction would reload mid-write.
  const routineCard = page.getByTestId(`routine-card-${routineId}`);
  await expect(routineCard).toBeVisible();
  await page.reload();

  // Re-entering after a reload shows the pointer moved to day B, proving
  // the progress write went through real IndexedDB.
  await routineCard.click();
  await expect(dayBCard).toContainText("Siguiente");
  await expect(dayACard).not.toContainText("Siguiente");
});

test("postpones an exercise and keeps the order after a reload", async ({
  page,
}) => {
  await importRoutine(page);

  await page.getByTestId(`routine-card-${routineId}`).click();
  await page.getByTestId(`day-card-${dayAId}`).click();
  await page.getByTestId("day-overview-start").click();

  const exerciseName = page.getByTestId("set-exercise-name");
  const postponedItems = page.getByTestId("set-postponed-items");
  await expect(exerciseName).toBeVisible();
  await expect(exerciseName).toHaveText("Press banca");

  await page.getByTestId("set-postpone").click();

  // The bench press block moved to the end of the day: the superset is next.
  await expect(exerciseName).toHaveText("Curl de bíceps");
  await expect(postponedItems).toContainText("Press banca");

  // setPostponedItems bumped updatedAt, so the reload auto-resumes the workout.
  await page.reload();

  // The order is rebuilt from the persisted queue through real IndexedDB.
  await expect(exerciseName).toBeVisible();
  await expect(exerciseName).toHaveText("Curl de bíceps");
  await expect(postponedItems).toContainText("Press banca");
});

test("auto-resumes a fresh session after a reload and discards it from the list", async ({
  page,
}) => {
  await importRoutine(page);

  await page.getByTestId(`routine-card-${routineId}`).click();
  await page.getByTestId(`day-card-${dayAId}`).click();
  await page.getByTestId("day-overview-start").click();

  // Complete only the first set; the rest screen appearing guarantees the
  // completion was persisted before the reload.
  const setProgress = page.getByTestId("set-progress");
  await expect(setProgress).toBeVisible();
  await expect(setProgress).toHaveText("Serie 1 de 2");
  await page.getByTestId("set-continue").click();
  const restScreen = page.getByTestId("rest-screen");
  await expect(restScreen).toBeVisible();
  await expect(restScreen).toContainText("Descanso");

  await page.reload();

  // A session with recent activity skips the resume prompt: the reload lands
  // back in the workout on the next uncompleted step (the 3 s persisted rest
  // may still run first; the assertions retry through it).
  const exerciseName = page.getByTestId("set-exercise-name");
  await expect(exerciseName).toBeVisible();
  await expect(exerciseName).toHaveText("Press banca");
  await expect(setProgress).toBeVisible();
  await expect(setProgress).toHaveText("Serie 2 de 2");

  // Salir returns to the list, where the prompt still offers the session.
  await page.getByTestId("set-exit").click();

  const resumePrompt = page.getByTestId("resume-session-prompt");
  await expect(resumePrompt).toBeVisible();
  await expect(resumePrompt).toContainText(resumePromptTitle);
  await page.getByTestId("resume-session-discard").click();

  await expect(resumePrompt).not.toBeVisible();
});
