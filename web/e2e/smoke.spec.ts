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

test.describe("responsive: no horizontal overflow", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  // Классический mobile/TMA-баг: страница уезжает вбок. Проверяем на старт-экране,
  // что документ не шире вьюпорта (запас 1px на субпиксельное округление).
  test("start screen fits the viewport width", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
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
