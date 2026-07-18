import { expect, test } from "@playwright/test";
import { gotoFreshApp } from "./helpers.ts";

test.describe("codex: teammate web", () => {
  test("settings → teammates → pick → re-center on a neighbour", async ({ page }) => {
    await gotoFreshApp(page);

    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-teammates").click();
    await expect(page.getByTestId("teammates-screen")).toBeVisible();

    // До выбора игрока паутины нет — только приглашение выбрать.
    await expect(page.locator(".teammates__svg")).toHaveCount(0);

    const search = page.getByTestId("player-search");
    await search.fill("nis");
    // Ищем опцию ВНУТРИ пикера: у нативного <select> периода свои <option> с той же ролью,
    // но они невидимы — глобальный getByRole("option") цеплял именно их и ждал вечно.
    const picker = page.locator(".teammates__picker");
    await picker.getByRole("option").first().click();

    const web = page.locator(".teammates__svg");
    await expect(web).toBeVisible();
    const center = page.locator(".teammates__center-name");
    const firstCenter = await center.textContent();
    expect(firstCenter?.length).toBeGreaterThan(0);

    // Клик по соседу перецентровывает паутину: центр меняется, бывший центр становится соседом.
    const neighbour = page.locator(".teammates__list li button").first();
    const neighbourName = await neighbour.locator("strong").textContent();
    await neighbour.click();
    await expect(center).toHaveText(neighbourName ?? "");
    await expect(page.locator(".teammates__name", { hasText: firstCenter ?? "" }).first()).toBeVisible();
  });
});
