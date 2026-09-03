import { expect, test } from "@playwright/test";
import {
  completeDraft,
  gotoFreshApp,
  simulateTournamentToEnd,
  startClassicRun,
} from "./helpers.ts";

test.describe("smoke: classic run", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("start → draft → seamless run view (field + one CTA)", async ({ page }) => {
    await startClassicRun(page);
    await completeDraft(page);
    // Бесшовно: сразу непрерывный run-вид, без отдельного экрана-итога.
    await expect(page.getByTestId("run-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tournament-stage-field")).toBeVisible();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  });

  // R1.1: «Показать результат» — presentation shortcut, доступный и до старта симуляции.
  // Он не второй симулятор: движок считает исход в конструкторе, кнопка лишь доводит показ.
  test("Show result выдаёт итог турнира одним кликом и пишет карьеру один раз", async ({ page }) => {
    await startClassicRun(page);
    await completeDraft(page);
    await expect(page.getByTestId("tournament-show-result")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("tournament-show-result").click();

    // Сразу терминальный экран: итоговая таблица + пост-турнирные действия, без reveal.
    await expect(page.getByTestId("tournament-complete")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("tournament-skip")).toHaveCount(0);
    await expect(page.getByTestId("tournament-show-result")).toHaveCount(0);

    // Карьера получила ровно одну запись, и она переживает reload (сейв забега очищен).
    await expect(page.locator(".career-run")).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId("resume-banner")).toHaveCount(0);
  });
});

test.describe("data load failure (T7.3)", () => {
  // Упавшая загрузка данных — не вечная орбита: баннер с причиной + retry, который
  // после восстановления сети доводит до старт-экрана.
  test("ошибка загрузки показывает retry, retry доводит до старта", async ({ page }) => {
    await page.route("**/data/manifest.json", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByTestId("retry-load")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".loading__orb")).toHaveCount(0);

    await page.unroute("**/data/manifest.json");
    await page.getByTestId("retry-load").click();
    await expect(page.getByTestId("mode-classic")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("responsive: no horizontal overflow", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  // Классический mobile/TMA-баг: страница уезжает вбок. Проверяем на старт-экране,
  // что документ не шире вьюпорта (запас 1px на субпиксельное округление).
  test("start screen fits the viewport width", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("navigation integrity", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("Settings сохраняет каждый шаг выбора и конфиг Roguelite", async ({ page }) => {
    // Корень → Settings → тот же корень.
    await page.getByTestId("open-settings").click();
    await page.getByRole("button", { name: /Back to game/ }).click();
    await expect(page.getByTestId("mode-classic")).toBeVisible();

    // Выбор Quick/Roguelite → Settings → тот же выбор.
    await page.getByTestId("mode-classic").click();
    await page.getByTestId("open-settings").click();
    await page.getByRole("button", { name: /Back to game/ }).click();
    await expect(page.getByTestId("variant-run")).toBeVisible();

    // Roguelite config → вложенный раздел Settings → назад по иерархии без потери опций.
    await page.getByTestId("variant-run").click();
    const mixed = page.getByRole("group", { name: "Draft style" }).getByRole("button", { name: /Mixed draft/ });
    await mixed.click();
    await expect(mixed).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-career").click();
    await page.getByRole("button", { name: /Back to settings/ }).click();
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await page.getByRole("button", { name: /Back to game/ }).click();

    await expect(page.getByTestId("start-run")).toBeVisible();
    await expect(page.getByText("One draft. A chain of stages.", { exact: true })).toBeVisible();
    await expect(mixed).toHaveAttribute("aria-pressed", "true");
  });

  test("Штаб открывается из настроек и показывает весь каталог карт", async ({ page }) => {
    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-hq").click();
    await expect(page.getByTestId("hq-screen")).toBeVisible();
    // Каталог показан целиком даже без единого забега: скрывать определения незачем.
    await expect(page.locator(".hq-card")).toHaveCount(45);
    await expect(page.getByTestId("hq-collection-hint")).toContainText("0 of 45");
    await page.locator('.hq-card[data-card-id="widePool"]').click();
    await expect(page.getByRole("dialog")).toContainText("Wide Pool");
  });

  test("Browser Back идёт heroes → settings → исходный game-view", async ({ page }) => {
    await page.getByTestId("mode-classic").click();
    await page.getByTestId("variant-run").click();
    await page.getByTestId("open-settings").click();
    await page.getByTestId("open-heroes").click();

    await page.goBack();
    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("start-run")).toBeVisible();
    await expect(page.getByText("One draft. A chain of stages.", { exact: true })).toBeVisible();
  });
});

test.describe("smoke: tournament", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFreshApp(page);
  });

  test("draft → simulate → groups → (auto) playoffs → complete", async ({ page }) => {
    await startClassicRun(page);
    await completeDraft(page);
    await expect(page.getByTestId("run-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tournament-stage-field")).toBeVisible();

    await simulateTournamentToEnd(page);
  });
});
