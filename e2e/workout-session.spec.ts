import { expect, type Page, test } from "@playwright/test";

const routineFile = "examples/mini-session.json";
const routineName = "Mini sesión";
const resumePromptTitle = "Tienes un entrenamiento en curso";

async function importRoutine(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Importar rutina JSON").setInputFiles(routineFile);
  await expect(page.getByText(routineName)).toBeVisible();
}

test("completes a full session and advances the day pointer", async ({
  page,
}) => {
  await importRoutine(page);

  await page.getByRole("button", { name: `Entrenar ${routineName}` }).click();

  const dayACard = page.getByRole("button", { name: /Día A/ });
  const dayBCard = page.getByRole("button", { name: /Día B/ });
  await expect(dayACard).toBeVisible();
  await expect(dayBCard).toBeVisible();
  await expect(dayACard).toContainText("Siguiente");
  await expect(dayBCard).not.toContainText("Siguiente");

  await dayACard.click();

  // Bench press set 1 of 2, then a rest screen (skipped deterministically).
  await expect(
    page.getByRole("heading", { name: "Press banca" }),
  ).toBeVisible();
  await expect(page.getByText("Serie 1 de 2")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("Descanso", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Saltar descanso" }).click();

  // Bench press set 2: last set of the item, so no rest afterwards.
  await expect(page.getByText("Serie 2 de 2")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Superset members run back-to-back within the round.
  await expect(
    page.getByRole("heading", { name: "Curl de bíceps" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(
    page.getByRole("heading", { name: "Extensión de tríceps" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Duration set: start the countdown, then skip it.
  await expect(page.getByRole("heading", { name: "Plancha" })).toBeVisible();
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.getByRole("button", { name: "Saltar", exact: true }).click();

  // Summary: 5 sets. lastUsed is only written at finishSession, so every
  // set prefills the routine's planned values in a first-ever session.
  // Volume = 10×20 + 8×22.5 + 12×10 + 12×20 = 740 kg — this pins the
  // planned-values-win-in-session behavior.
  await expect(page.getByText("Series completadas")).toBeVisible();
  await expect(page.getByText("5", { exact: true })).toBeVisible();
  await expect(page.getByText("740 kg")).toBeVisible();
  await page.getByRole("button", { name: "Terminar" }).click();

  // Wait for the list before reloading: racing the finishSession
  // transaction would reload mid-write.
  await expect(
    page.getByRole("button", { name: `Entrenar ${routineName}` }),
  ).toBeVisible();
  await page.reload();

  // Re-entering after a reload shows the pointer moved to day B, proving
  // the progress write went through real IndexedDB.
  await page.getByRole("button", { name: `Entrenar ${routineName}` }).click();
  await expect(dayBCard).toContainText("Siguiente");
  await expect(dayACard).not.toContainText("Siguiente");
});

test("resumes an in-progress session after a reload and discards it", async ({
  page,
}) => {
  await importRoutine(page);

  await page.getByRole("button", { name: `Entrenar ${routineName}` }).click();
  await page.getByRole("button", { name: /Día A/ }).click();

  // Complete only the first set; the rest screen appearing guarantees the
  // completion was persisted before the reload.
  await expect(page.getByText("Serie 1 de 2")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Descanso", { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByText(resumePromptTitle)).toBeVisible();
  await page.getByRole("button", { name: "Reanudar" }).click();

  // Resumes on the next uncompleted step.
  await expect(
    page.getByRole("heading", { name: "Press banca" }),
  ).toBeVisible();
  await expect(page.getByText("Serie 2 de 2")).toBeVisible();

  await page.getByRole("button", { name: "Salir" }).click();

  await expect(page.getByText(resumePromptTitle)).toBeVisible();
  await page.getByRole("button", { name: "Descartar" }).click();

  await expect(page.getByText(resumePromptTitle)).not.toBeVisible();
});
