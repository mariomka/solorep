import { expect, test } from "@playwright/test";

const routineFile = "examples/fullbody-3d.json";
const routineName = "Full Body — 3 días";
const emptyStateText = "Importa una rutina para empezar.";

test("imports, persists, and deletes a routine", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(emptyStateText)).toBeVisible();

  const fileInput = page.getByLabel("Importar rutina JSON");
  await fileInput.setInputFiles(routineFile);

  await expect(page.getByText(routineName)).toBeVisible();
  await expect(page.getByText("3 días", { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByText(routineName)).toBeVisible();

  await page.getByRole("button", { name: `Eliminar ${routineName}` }).click();

  await expect(page.getByText(routineName)).not.toBeVisible();
  await expect(page.getByText(emptyStateText)).toBeVisible();

  await page.reload();

  await expect(page.getByText(routineName)).not.toBeVisible();
  await expect(page.getByText(emptyStateText)).toBeVisible();
});
