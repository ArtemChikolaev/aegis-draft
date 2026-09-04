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
});
