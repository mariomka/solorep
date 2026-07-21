import { expect, test } from "@playwright/test";

const routineFile = "examples/fullbody-3d.json";
const routineId = "fullbody-3d";
const routineName = "Full Body — 3 días";
const emptyStateText = "Importa una rutina para empezar.";

test("imports, persists, and deletes a routine", async ({ page }) => {
  await page.goto("/");

  const emptyStateMessage = page.getByTestId("routine-list-empty-message");
  await expect(emptyStateMessage).toBeVisible();
  await expect(emptyStateMessage).toHaveText(emptyStateText);

  const fileInput = page.getByTestId("import-routine-input");
  await fileInput.setInputFiles(routineFile);

  const routineNameElement = page.getByTestId(`routine-name-${routineId}`);
  const routineDayCount = page.getByTestId(`routine-day-count-${routineId}`);
  await expect(routineNameElement).toBeVisible();
  await expect(routineNameElement).toHaveText(routineName);
  await expect(routineDayCount).toBeVisible();
  await expect(routineDayCount).toHaveText("3 días");

  await page.reload();

  await expect(routineNameElement).toBeVisible();
  await expect(routineNameElement).toHaveText(routineName);

  await page.getByTestId("routines-menu-trigger").click();
  await expect(page.getByTestId("import-routine-menu-item")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId(`routine-menu-${routineId}`).click();
  await page.getByTestId(`delete-routine-${routineId}`).click();

  await expect(routineNameElement).not.toBeVisible();
  await expect(emptyStateMessage).toBeVisible();
  await expect(emptyStateMessage).toHaveText(emptyStateText);

  await page.reload();

  await expect(routineNameElement).not.toBeVisible();
  await expect(emptyStateMessage).toBeVisible();
  await expect(emptyStateMessage).toHaveText(emptyStateText);
});
