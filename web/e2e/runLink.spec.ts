import { expect, test, type Page } from "@playwright/test";
import { gotoFreshApp } from "./helpers.ts";

/** Собрать ссылку тем же форматом, что и кодек (state/runLink.ts). */
async function linkFor(page: Page, over: Record<string, unknown> = {}) {
  return page.evaluate(async (o) => {
    const m = await fetch("data/manifest.json").then((r) => r.json());
    const payload = {
      v: 1, s: m.schemaVersion, r: m.ratingModelVersion, m: "classic",
      d: "team", f: "last_2y", n: 1, c: "event", a: "auto", seed: "e2e-shared", ...o,
    };
    return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }, over);
}

const packSignature = (page: Page) =>
  page.locator('[data-testid^="candidate-"]').allInnerTexts();

test.describe("шеринг забега ссылкой", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("ссылка воспроизводит тот же пак у другого игрока", async ({ page }) => {
    const encoded = await linkFor(page);
    await page.goto(`#/run=${encoded}`);
    await page.getByTestId("run-link-accept").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();
    const first = await packSignature(page);
    expect(first.length).toBe(5);

    // Ссылку из адресной строки убрали — перезагрузка не переспрашивает.
    expect(new URL(page.url()).hash).toBe("");

    // Чистый профиль = «другой игрок»: тот же пак по той же ссылке.
    await gotoFreshApp(page);
    await page.goto(`#/run=${encoded}`);
    await page.getByTestId("run-link-accept").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();
    expect(await packSignature(page)).toEqual(first);
  });

  test("несовместимая версия объясняется и не запускается", async ({ page }) => {
    // ASCII: наивный btoa в хелпере не умеет не-Latin1 (продакшн-кодек умеет, см. unit-тест).
    await page.goto(`#/run=${await linkFor(page, { r: "v0.0.1-old" })}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Причина названа, а кнопки «играть» нет — забег на этих версиях не совпадёт.
    await expect(page.getByTestId("run-link-accept")).toHaveCount(0);
    await page.getByTestId("run-link-dismiss").click();
    await expect(dialog).toHaveCount(0);
    // Возвращаемся на выбор режима (start-run появляется только после выбора Classic).
    await expect(page.getByTestId("mode-classic")).toBeVisible();
  });

  test("идущий забег не затирается молча", async ({ page }) => {
    await page.getByTestId("mode-classic").click();
    await page.getByTestId("variant-quick").click();
    await page.getByTestId("start-run").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();
    await page.locator('[data-testid^="candidate-"]').first().click();

    await page.goto(`#/run=${await linkFor(page, { seed: "another" })}`);
    // Предупреждение о потере прогресса обязательно (CLAUDE.md: destructive → confirm).
    await expect(page.getByTestId("run-link-accept")).toBeVisible();
    await page.getByTestId("run-link-dismiss").click();
    // Отказ оставляет всё как было: свой забег на месте.
    await expect(page.getByTestId("draft-screen")).toBeVisible();
  });

  test("битая ссылка не ломает приложение", async ({ page }) => {
    await page.goto("#/run=%%%broken%%%");
    await expect(page.getByTestId("brand")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("mode-classic")).toBeVisible();
  });
});

test.describe("поле Seed на экране настроек", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
    await page.getByTestId("mode-classic").click();
    await page.getByTestId("variant-quick").click();
    await expect(page.getByTestId("seed-input")).toBeVisible();
  });

  test("короткий код и полная ссылка запускают один и тот же первый пак", async ({ page }) => {
    const encoded = await linkFor(page, { seed: "e2e-seed-field" });
    const seed = page.getByTestId("seed-input");
    await seed.fill(encoded);
    await expect(page.getByTestId("seed-status")).toContainText("Seed found");
    await expect(page.getByTestId("start-run")).toBeEnabled();
    await page.getByTestId("start-run").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();
    const first = await packSignature(page);

    await gotoFreshApp(page);
    await page.getByTestId("mode-classic").click();
    await page.getByTestId("variant-quick").click();
    const fullUrl = `${page.url().split("#")[0]}#/run=${encoded}`;
    await page.getByTestId("seed-input").fill(fullUrl);
    await expect(page.getByTestId("seed-status")).toContainText("Seed found");
    await page.getByTestId("start-run").click();
    await expect(page.getByTestId("draft-screen")).toBeVisible();
    expect(await packSignature(page)).toEqual(first);
  });

  test("неизвестный код показывает ошибку и блокирует запуск", async ({ page }) => {
    const seed = page.getByTestId("seed-input");
    await seed.fill("definitely-not-a-run-code");
    await expect(page.getByTestId("seed-input")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("seed-status")).toContainText("Seed not found");
    await expect(page.getByTestId("start-run")).toBeDisabled();

    // Очистка возвращает прежний golden path: никакой ошибки, обычный случайный запуск.
    await seed.fill("");
    await expect(page.getByTestId("seed-status")).toHaveCount(0);
    await expect(page.getByTestId("start-run")).toBeEnabled();
  });

  test("несовпадение настроек исправляется выбором настроек сида", async ({ page }) => {
    const easy = await linkFor(page, { n: -1, seed: "e2e-easy-seed" });
    await page.getByTestId("seed-input").fill(easy);
    await expect(page.getByTestId("seed-status")).toContainText("settings differ");
    await expect(page.getByTestId("seed-status")).toContainText("Easy");
    await expect(page.getByTestId("start-run")).toBeDisabled();

    await page.getByText("Easy", { exact: true }).click();
    await expect(page.getByTestId("seed-status")).toContainText("Seed found");
    await expect(page.getByTestId("start-run")).toBeEnabled();
  });
});
