import { expect, test } from "@playwright/test";
import { gotoFreshApp } from "./helpers.ts";

/** Аркада (M13): вход в режим → забег тикает → карточка уровня выбирается → пауза → выход с confirm. */
test.describe("arcade", () => {
  test.setTimeout(120_000);
  test("забег стартует, уровень выбирается, пауза и выход работают", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    await expect(page.getByTestId("arcade-hero")).toBeVisible();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-1");
    await page.getByTestId("arcade-play").click();
    const clock = page.getByTestId("arcade-clock");
    await expect(clock).toBeVisible();
    // Держим движение, чтобы собирать опыт; первый уровень приходит в первую минуту.
    await page.keyboard.down("KeyD");
    await expect(clock).not.toHaveText("0:00", { timeout: 5000 });
    const levelUp = page.getByTestId("arcade-levelup");
    await expect(levelUp).toBeVisible({ timeout: 60_000 });
    await page.keyboard.up("KeyD");
    // Мир стоит, пока висит выбор: часы не идут.
    const frozen = await clock.textContent();
    await page.waitForTimeout(700);
    await expect(clock).toHaveText(frozen ?? "");
    await page.getByTestId("arcade-offer-0").click();
    await expect(levelUp).toHaveCount(0);
    await expect(clock).not.toHaveText(frozen ?? "", { timeout: 5000 });
    // Пауза по Escape и выход через подтверждение.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("arcade-paused")).toBeVisible();
    await page.getByRole("button", { name: /Leave run|Выйти из забега/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /Leave run|Выйти из забега/ }).click();
    await expect(page.getByTestId("arcade-hero")).toBeVisible();
  });

  test("фирменная пассивка героя видна в HUD", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    // У Juggernaut (герой по умолчанию) пассивка заведена отдельной способностью, поэтому берём того,
    // у кого она именно фирменная — Shadow Fiend с душами.
    await page.getByTestId("arcade-hero-shadow_fiend").click();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-sig");
    await page.getByTestId("arcade-play").click();
    await expect(page.getByTestId("arcade-clock")).toBeVisible();
    const chip = page.getByTestId("arcade-hud-signature");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("title", /Necromastery|Некромастерия/);
  });

  test("лавка: предмет раскрывается по тычку и показывает характеристики", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    await page.getByTestId("arcade-seed").fill("e2e-arcade-shop");
    await page.getByTestId("arcade-play").click();
    await expect(page.getByTestId("arcade-clock")).toBeVisible();
    // Лавка приходит по касанию торговца — в тесте открываем её напрямую через dev-хук.
    await page.evaluate("(() => { const s = window.__arcadeSim(); s.player.gold = 9999; s.openShop(); })()");
    const shop = page.getByTestId("arcade-shop");
    await expect(shop).toBeVisible();
    await page.getByTestId("arcade-shop-0").click();
    const item = page.getByTestId("arcade-shop-item-0");
    await expect(item).toBeVisible();
    // До тычка характеристик нет, после — есть, и продажа отдельной кнопкой.
    await expect(page.getByTestId("arcade-shop-details-0")).toHaveCount(0);
    await item.click();
    const details = page.getByTestId("arcade-shop-details-0");
    await expect(details).toBeVisible();
    await expect(details.locator("li").first()).toBeVisible();
    await expect(page.getByTestId("arcade-shop-sell-0")).toBeVisible();
  });

  test("гардероб: облик открывается по герою, покупка и надевание работают", async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-arcade").click();
    // Тычок по НЕ выбранному герою только выбирает его, по уже выбранному — открывает гардероб.
    // Какой герой выбран на старте, зависит от сохранённого выбора, поэтому тычем второй раз только
    // если окно ещё не открылось (иначе второй клик уходит в подложку модалки).
    await page.getByTestId("arcade-hero-juggernaut").click();
    if ((await page.getByTestId("arcade-wardrobe").count()) === 0) await page.getByTestId("arcade-hero-juggernaut").click();
    const wardrobe = page.getByTestId("arcade-wardrobe");
    await expect(wardrobe).toBeVisible();
    await expect(page.getByTestId("arcade-wardrobe-look-base")).toBeVisible();
    const arcana = page.getByTestId("arcade-wardrobe-look-skin_jugg_arcana");
    await expect(arcana).toBeVisible();
    await arcana.click();
    // В dev-сборке косметика бесплатна, поэтому кнопка покупки доступна сразу.
    const buy = page.getByTestId("arcade-wardrobe-buy");
    await expect(buy).toBeVisible();
    await buy.click();
    await expect(page.getByTestId("arcade-wardrobe-buy")).toHaveCount(0);
    // Самоцвет переключается и остаётся выбранным.
    const gem = page.getByTestId("arcade-wardrobe-style-gem4");
    await gem.click();
    await expect(gem).toHaveAttribute("data-active", "true");
  });
});
