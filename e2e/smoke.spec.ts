import { expect, test } from "@playwright/test";

test("app shell loads", async ({ page }) => {
  await page.goto("/");

  const appTitle = page.getByTestId("app-title");
  await expect(appTitle).toBeVisible();
  await expect(appTitle).toHaveText("Solorep");
});
