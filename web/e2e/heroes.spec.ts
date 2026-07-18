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
    await expect(page.getByRole("listbox")).toBeVisible();
    await player.press("Enter");

    await expect(page.getByRole("heading", { name: "Mira" })).toBeVisible();
    await expect(page.getByRole("option", { name: "By players" })).toHaveCount(0);
    await page.getByTestId("player-clear").click();
    await expect(page.getByRole("heading", { name: "Pro scene heroes" })).toBeVisible();
    await expect(player).toBeFocused();
  });
});
