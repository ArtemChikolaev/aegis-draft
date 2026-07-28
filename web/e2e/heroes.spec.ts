import { expect, test } from "@playwright/test";
import { gotoFreshApp } from "./helpers.ts";

test.describe("codex: heroes directory", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("settings → heroes → player career → all heroes", async ({ page }) => {
    await page.getByTestId("open-settings").click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // Регрессия: длинный предыдущий экран не должен протащить scrollY в справочник.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.getByTestId("open-heroes").dispatchEvent("click");
    await expect(page.getByTestId("heroes-screen")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    const player = page.getByTestId("player-search");
    await expect(player).toHaveAttribute("placeholder", "Find a pro player");
    await player.fill("mir");
    // Кликаем НУЖНУЮ опцию, а не жмём Enter по первой: «mir» матчит семерых, и четверо из них
    // (Miracle-, Mirele`, Mirage`雨, Mira) — префиксные, причём Miracle-/Mirage начинаются даже
    // на «Mira». Порядок между ними тест не контролирует, отсюда и был флейк «heading Mira not
    // found» под нагрузкой. Фильтруем по точному тексту ника в <strong>: имя опции целиком —
    // это ник + команда + account id, поэтому getByRole(name:"Mira", exact) не совпадёт никогда.
    const mira = page.getByRole("option").filter({ has: page.getByText("Mira", { exact: true }) });
    await expect(mira).toBeVisible();
    await mira.click();

    await expect(page.getByRole("heading", { name: "Mira" })).toBeVisible();
    await expect(page.getByRole("option", { name: "By players" })).toHaveCount(0);
    await page.getByTestId("player-clear").click();
    await expect(page.getByRole("heading", { name: "Pro scene heroes" })).toBeVisible();
    await expect(player).toBeFocused();
  });
});

// R11.7: теги видно — и по ним можно спросить «покажи всех illusion». Фильтр и клик по чипу
// делают одно и то же, поэтому проверяем оба входа.
test.describe("codex: фильтр по тегу", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-heroes").dispatchEvent("click");
    await expect(page.getByTestId("heroes-screen")).toBeVisible();
  });

  test("выбор тега сужает список, сброс возвращает всех", async ({ page }) => {
    const rows = page.locator(".heroes__list li");
    const total = await rows.count();
    expect(total).toBeGreaterThan(50);

    await page.getByTestId("heroes-tag-filter").selectOption("illusion");
    await expect.poll(() => rows.count()).toBeLessThan(total);
    // Каждая оставшаяся строка действительно несёт выбранный тег.
    const shown = await rows.count();
    expect(shown).toBeGreaterThan(0);
    for (let i = 0; i < shown; i += 1) {
      await expect(rows.nth(i).locator('[data-tag="illusion"]')).toHaveCount(1);
    }

    await page.getByTestId("heroes-tag-filter").selectOption("");
    await expect.poll(() => rows.count()).toBe(total);
  });

  test("клик по чипу — тот же фильтр", async ({ page }) => {
    const rows = page.locator(".heroes__list li");
    const total = await rows.count();
    // Берём тег с первой строки и жмём его: чип — самая естественная точка входа в фильтр.
    const chip = rows.first().locator("[data-tag]").last();
    const tag = await chip.getAttribute("data-tag");
    await chip.click();
    await expect(page.getByTestId("heroes-tag-filter")).toHaveValue(tag!);
    await expect.poll(() => rows.count()).toBeLessThanOrEqual(total);
    await expect(rows.first().locator(`[data-tag="${tag}"]`)).toHaveCount(1);
  });
});
