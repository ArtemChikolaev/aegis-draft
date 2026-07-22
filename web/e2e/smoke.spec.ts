import { expect, test } from "@playwright/test";
import {
  completeDraft,
  gotoFreshApp,
  simulateTournamentToEnd,
  startClassicRun,
} from "./helpers.ts";

test.describe("smoke: classic run", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("start → draft → seamless run view (field + one CTA)", async ({ page }) => {
    await startClassicRun(page);
    await completeDraft(page);
    // Бесшовно: сразу непрерывный run-вид, без отдельного экрана-итога.
    await expect(page.getByTestId("run-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tournament-stage-field")).toBeVisible();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
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

test.describe("navigation integrity", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("Settings сохраняет каждый шаг выбора и конфиг Roguelite", async ({ page }) => {
    // Корень → Settings → тот же корень.
    await page.getByTestId("open-settings").click();
    await page.getByRole("button", { name: /Back to game/ }).click();
    await expect(page.getByTestId("mode-classic")).toBeVisible();

    // Выбор Quick/Roguelite → Settings → тот же выбор.
    await page.getByTestId("mode-classic").click();
    await page.getByTestId("open-settings").click();
    await page.getByRole("button", { name: /Back to game/ }).click();
    await expect(page.getByTestId("variant-run")).toBeVisible();

    // Roguelite config → вложенный раздел Settings → назад по иерархии без потери опций.
    await page.getByTestId("variant-run").click();
    const mixed = page.getByRole("group", { name: "Draft style" }).getByRole("button", { name: /Mixed draft/ });
    await mixed.click();
    await expect(mixed).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-career").click();
    await page.getByRole("button", { name: /Back to settings/ }).click();
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await page.getByRole("button", { name: /Back to game/ }).click();

    await expect(page.getByTestId("start-run")).toBeVisible();
    await expect(page.getByText("One draft. A chain of stages.", { exact: true })).toBeVisible();
    await expect(mixed).toHaveAttribute("aria-pressed", "true");
  });

  test("Browser Back идёт heroes → settings → исходный game-view", async ({ page }) => {
    await page.getByTestId("mode-classic").click();
    await page.getByTestId("variant-run").click();
    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-heroes").click();

    await page.goBack();
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("start-run")).toBeVisible();
    await expect(page.getByText("One draft. A chain of stages.", { exact: true })).toBeVisible();
  });
});

test.describe("smoke: tournament", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("draft → simulate → groups → (auto) playoffs → complete", async ({ page }) => {
    await startClassicRun(page);
    await completeDraft(page);
    await expect(page.getByTestId("run-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tournament-stage-field")).toBeVisible();

    await simulateTournamentToEnd(page);
  });
});
