import { expect, test } from "@playwright/test";
import {
  advanceTournamentToEnd,
  completeDraft,
  gotoFreshApp,
  startClassicRun,
} from "./helpers.ts";

test.describe("smoke: classic run", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("start → draft → result", async ({ page }) => {
    await startClassicRun(page);
    await completeDraft(page);
    await expect(page.getByTestId("result-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("start-tournament")).toBeVisible();
  });
});

test.describe("smoke: tournament", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("result → tournament field → groups → playoffs complete", async ({ page }) => {
    await startClassicRun(page);
    await completeDraft(page);
    await expect(page.getByTestId("result-screen")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("start-tournament").click();
    await expect(page.getByTestId("tournament-screen")).toBeVisible();
    await expect(page.getByTestId("tournament-stage-field")).toBeVisible();

    await advanceTournamentToEnd(page);
  });
});
