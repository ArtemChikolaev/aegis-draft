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
