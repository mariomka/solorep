import { expect, type Page, test } from "@playwright/test";

const routineFile = "examples/mini-session.json";
const routineId = "mini-session";
const routineName = "Mini sesión";
const dayAId = "day-a";
const dayBId = "day-b";

async function importRoutine(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("import-routine-input").setInputFiles(routineFile);
  const routineNameElement = page.getByTestId(`routine-name-${routineId}`);
  await expect(routineNameElement).toBeVisible();
  await expect(routineNameElement).toHaveText(routineName);
}

test("browser back exits the workout and the session stays resumable", async ({
  page,
}) => {
  await importRoutine(page);

  await page.getByTestId(`routine-card-${routineId}`).click();
  await page.getByTestId(`day-card-${dayAId}`).click();
  await page.getByTestId("day-overview-start").click();
  await expect(page.getByTestId("set-exercise-name")).toBeVisible();

  await page.goBack();

  // No confirmation dialog: back lands straight on the day overview.
  await expect(page.getByTestId("day-overview")).toBeVisible();
  await expect(page.getByTestId("set-exercise-name")).not.toBeVisible();

  // The session survived the exit: home still offers to resume it.
  await page.goBack();
  await page.goBack();
  const resumePrompt = page.getByTestId("resume-session-prompt");
  await expect(resumePrompt).toBeVisible();
  await expect(resumePrompt).toContainText("Tienes un entrenamiento en curso");
});

test("back from the summary never re-enters the finished workout", async ({
  page,
}) => {
  await importRoutine(page);

  await page.getByTestId(`routine-card-${routineId}`).click();
  // Day B is a single set: one completion finishes the day.
  await page.getByTestId(`day-card-${dayBId}`).click();
  await page.getByTestId("day-overview-start").click();

  await expect(page.getByTestId("set-progress")).toHaveText("Serie 1 de 1");
  await page.getByTestId("set-continue").click();
  await expect(page.getByTestId("session-summary")).toBeVisible();

  await page.goBack();

  // The workout entry was replaced by the summary: back skips it entirely.
  await expect(page.getByTestId("day-overview")).toBeVisible();
  await expect(page.getByTestId("set-exercise-name")).not.toBeVisible();
  await expect(page.getByTestId("session-summary")).not.toBeVisible();
});

test("deep links render stats and invalid routes land on the list", async ({
  page,
}) => {
  await page.goto("/#/stats/sessions");
  await expect(page.getByTestId("stats-sessions-empty")).toBeVisible();

  await page.goto("/#/stats/bogus");
  await expect(page.getByTestId("app-title")).toBeVisible();
  await expect(page.getByTestId("app-title")).toHaveText("Solorep");
});
