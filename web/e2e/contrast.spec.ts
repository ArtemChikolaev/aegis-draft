import { expect, test, type Page } from "@playwright/test";
import { completeDraft, gotoFreshApp, lowContrastText, startClassicRun } from "./helpers.ts";

// Контраст экранов в обеих темах (M26): замер всех экранов нашёл в светлой теме акцент #d97757 на ivory (2.7:1), шкалу OVR
// (2.6–2.9:1), белый на акценте (3.1:1) и цвета ролей и акцента на тёмных вставках (драфт, HUD Аркады — 2.1–3.7:1); тёмная
// тема была чистой. Токены светлой темы подняты до WCAG AA, тёмные вставки берут инвертный набор. Здесь — по экрану на
// каждый вид поверхности: ivory со вставками, тёмная панель пака, итог турнира со шкалой OVR, подготовка Аркады, настройки.

/** Конечные анимации и переходы (появление экрана, смена темы) — до конца: на середине прозрачность и цвета не итоговые. */
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
  .map((a) => a.finished.catch(() => undefined))));

async function expectReadable(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    await settle(page);
    const { checked, low } = await lowContrastText(page.locator("body"));
    expect(checked).toBeGreaterThan(10);
    expect(low, colorScheme).toEqual([]);
  }
}

test.describe("контраст экранов в обеих темах", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("старт и выбор варианта Classic", async ({ page }) => {
    await expectReadable(page);
    await page.getByTestId("mode-classic").click();
    await page.getByTestId("variant-quick").click();
    await expect(page.getByTestId("start-run")).toBeVisible();
    await expectReadable(page);
  });

  test("драфт: тёмная панель пака и радар", async ({ page }) => {
    await startClassicRun(page);
    await page.locator('[data-testid^="candidate-"]:not([disabled])').first().click();
    // Курсор остаётся над следующей карточкой — заодно проверяется залитое наведение с бейджем роли.
    await expectReadable(page);
  });

  test("итог турнира: шкала OVR на ivory", async ({ page }) => {
    await startClassicRun(page);
    await completeDraft(page);
    await page.getByTestId("tournament-show-result").click();
    await expect(page.getByTestId("tournament-complete")).toBeVisible({ timeout: 15_000 });
    await expectReadable(page);
  });

  test("подготовка Аркады и настройки", async ({ page }) => {
    await page.getByTestId("mode-arcade").click();
    await expect(page.getByTestId("arcade-hero")).toBeVisible();
    await expectReadable(page);
    await gotoFreshApp(page);
    await page.getByTestId("open-settings").click();
    await expect(page.getByTestId("open-heroes")).toBeVisible();
    await expectReadable(page);
  });
});
