import { expect, test } from "@playwright/test";
import { gotoFreshApp } from "./helpers.ts";

/** Включить хардкор через окно правил: чекбокс → кнопка. */
function hardcoreOption(page: import("@playwright/test").Page, index: number) {
  // Доступное имя кнопки включает подсказку («On Player profiles are locked…»), поэтому
  // ищем не по имени, а внутри группы: fieldset+legend — это role=group с именем легенды.
  return page.getByRole("group", { name: "Hardcore" }).getByRole("button").nth(index);
}

async function enableHardcore(page: import("@playwright/test").Page) {
  await hardcoreOption(page, 1).click();
  const confirm = page.getByTestId("hard-gate-confirm");
  await expect(confirm).toBeDisabled();
  await page.getByTestId("hard-gate-ack").check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
}

test.describe("hardcore", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-classic").click();
  });

  test("окно правил: без чекбокса не включить, закрытие оставляет режим выключенным", async ({ page }) => {
    const on = hardcoreOption(page, 1);
    await on.click();

    // Кнопка заперта, пока не подтверждён чекбокс.
    await expect(page.getByTestId("hard-gate-confirm")).toBeDisabled();

    // Закрытие крестиком — режим НЕ включается.
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(on).toHaveAttribute("aria-pressed", "false");

    // Повторное открытие: чекбокс сброшен, подтверждение включает режим.
    await enableHardcore(page);
    await expect(on).toHaveAttribute("aria-pressed", "true");
  });

  test("во время хардкора справочник закрыт: поля недоступны, причина подписана", async ({ page }) => {
    await enableHardcore(page);
    await page.getByTestId("start-run").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();

    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-heroes").click();

    // Поле выбора игрока на месте, но недоступно; общий список героев продолжает работать.
    await expect(page.getByTestId("player-search")).toBeDisabled();
    await expect(page.getByRole("note")).toContainText("hardcore run is in progress");
    await expect(page.locator(".heroes__list li").first()).toBeVisible();

    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-teammates").click();
    await expect(page.getByTestId("player-search")).toBeDisabled();
    await expect(page.locator(".teammates__svg")).toHaveCount(0);
  });
});
