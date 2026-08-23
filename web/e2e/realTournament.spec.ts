import { expect, test } from "@playwright/test";
import { gotoFreshApp } from "./helpers.ts";

// Real Tournament (T5.6) играбелен только на датасете с полными полями (>=17 паков на событие).
// CI подменяет данные моком (7 команд) — там каталог пуст, и спека честно скипается, а не
// зеленеет на пустом списке (правило R15.8: сид/датасет-связанные проверки гоняются на своём).
async function catalogAvailable(page: import("@playwright/test").Page): Promise<boolean> {
  const manifest = await page.evaluate(async () => {
    const response = await fetch("data/manifest.json");
    return response.json() as Promise<{ ratingModelVersion?: string }>;
  });
  return !(manifest.ratingModelVersion ?? "").startsWith("mock");
}

test.describe("Real Tournament (T5.6, реальный датасет)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("событие → challenger-драфт → реальное поле без реролла → терминал с карьерой RT", async ({ page }) => {
    test.skip(!(await catalogAvailable(page)), "mock-датасет: полного поля нет");

    await page.getByTestId("mode-tournament").click();
    // Каталог событий с дефолтом; выбираем TI 2023 — узнаваемое реальное поле.
    const select = page.getByTestId("real-event-select");
    await expect(select).toBeVisible();
    await select.selectOption({ label: "The International 2023" });
    await page.getByTestId("start-run").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();

    // Challenger-драфт mixed-механикой до полного состава.
    for (let step = 0; step < 60; step += 1) {
      const candidate = page.locator('[data-testid^="candidate-"]:not([disabled])').first();
      if (await candidate.isVisible().catch(() => false)) { await candidate.click(); continue; }
      const hero = page.locator('[data-testid^="pack-hero-"]:not([disabled])').first();
      if (await hero.isVisible().catch(() => false)) { await hero.click(); continue; }
      break;
    }

    // Подготовка к событию (RT-E): между драфтом и посевом — фаза сборов с бюджетом недель.
    // Неделя сыгровки поднимает Team OVR; откат возвращает бюджет; закрытие ведёт к посеву.
    await expect(page.getByTestId("prep-screen")).toBeVisible();
    await expect(page.getByTestId("prep-budget")).toContainText(/5 of 5/);
    // SVG <text> — не HTMLElement: читаем textContent.
    const powerBefore = await page.getByTestId("pentagon-team-ovr").textContent();
    await page.getByTestId("prep-scrim").first().click();
    await expect(page.getByTestId("prep-budget")).toContainText(/4 of 5/);
    await page.getByTestId("prep-undo").click();
    await expect(page.getByTestId("prep-budget")).toContainText(/5 of 5/);
    await page.getByTestId("prep-scrim").first().click();
    await page.getByTestId("prep-scrim").first().click();
    await expect(page.getByTestId("prep-budget")).toContainText(/3 of 5/);
    // Сила выросла: сыгровка — те же виртуальные co-games, что видит боевой счёт.
    await expect(page.getByTestId("pentagon-team-ovr")).not.toHaveText(powerBefore);
    // Resume посреди сборов возвращает в ту же фазу с тем же бюджетом (план — в логе действий).
    await page.reload();
    await expect(page.getByTestId("resume-banner")).toBeVisible();
    await page.getByTestId("resume-continue").click();
    await expect(page.getByTestId("prep-screen")).toBeVisible();
    await expect(page.getByTestId("prep-budget")).toContainText(/3 of 5/);
    await page.getByTestId("prep-confirm").click();

    // Поле — реальные составы события: подпись симуляции есть, реролла поля нет.
    await expect(page.getByTestId("real-field-note")).toContainText("The International 2023");
    // Underdog-вызов (срез 2): прогноз подан как цель ещё до старта симуляции.
    await expect(page.getByTestId("real-challenge")).toBeVisible();
    await expect(page.getByTestId("tournament-field-reroll")).toHaveCount(0);
    await expect(page.getByTestId("tournament-stage-field")).toContainText("Team Spirit");

    // Терминал одним кликом (R1.1) + карьера в бакете RT.
    await page.getByTestId("tournament-show-result").click();
    await expect(page.getByTestId("tournament-complete")).toBeVisible({ timeout: 10_000 });
    // Вердикт прогноза на терминале: прогноз был вызовом — теперь он судится.
    await expect(page.getByTestId("real-underdog")).toHaveAttribute("data-verdict", /beat|met|missed/);
    await expect(page.locator(".career-panel")).toContainText(/Real Tournament/);
    await expect(page.locator(".career-run")).toHaveCount(1);
  });

  test("resume посреди RT-драфта восстанавливает забег с тем же полем", async ({ page }) => {
    test.skip(!(await catalogAvailable(page)), "mock-датасет: полного поля нет");

    await page.getByTestId("mode-tournament").click();
    await page.getByTestId("start-run").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();
    for (let i = 0; i < 3; i += 1) {
      await page.locator('[data-testid^="candidate-"]:not([disabled])').first().click();
    }
    await expect(page.locator(".draft__heading")).toContainText(/3 of 10/i);

    await page.reload();
    await expect(page.getByTestId("resume-banner")).toBeVisible();
    await page.getByTestId("resume-continue").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();
    await expect(page.locator(".draft__heading")).toContainText(/3 of 10/i);
  });
});
