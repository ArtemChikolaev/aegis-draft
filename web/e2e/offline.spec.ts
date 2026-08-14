import { expect, test, type Page } from "@playwright/test";
import { completeDraft } from "./helpers.ts";

// Офлайн-регресс (T11.5, ADR 0003): то, ради чего затевалась веха M11 — игра открывается и
// играется без сети. Гоняется на ПРОД-сборке (проект `offline` в playwright.config): в dev
// service worker выключен намеренно, и здесь он бы просто не существовал.
//
// Спека держит три обещания сразу:
//   1. офлайн-запуск и полный забег (T11.1);
//   2. картинки берутся из своего зеркала, а не с чужого CDN (T11.2);
//   3. режим, которому нужна сеть, честно говорит об этом (T11.3), а панель настроек
//      показывает реальное состояние копии (T11.4).
//
// Тесты последовательны: каждый тратит секунды на сборку офлайн-пакета, а параллелить нечего.
test.describe.configure({ mode: "serial" });

/** Дождаться, пока офлайн-копия действительно собрана.
 *
 *  Сигнал берём тот же, что видит игрок, — состояние в настройках: это заодно проверяет панель
 *  (T11.4) и не заставляет тест знать внутренние имена кэшей.
 *
 *  ВАЖНО: `expect.poll`, а не `page.waitForFunction` с async-предикатом. Второй НЕ ждёт промис
 *  (объект Promise сам по себе truthy) и проходит мгновенно — на этом уже потерян час: проверка
 *  «дождись установки воркера» стреляла в середине install и падала только там, где установка
 *  медленная (прод, 280 файлов), оставаясь зелёной локально.
 */
async function waitForOfflineReady(page: Page): Promise<void> {
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings-screen")).toBeVisible();
  await expect
    .poll(async () => page.getByTestId("offline-state").getAttribute("data-state"), { timeout: 90_000 })
    .toBe("ready");
  await page.goBack();
  await expect(page.getByTestId("mode-classic")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("brand")).toBeVisible();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await waitForOfflineReady(page);
});

test("офлайн: перезагрузка без сети открывает игру и забег доходит до итога", async ({ page, context }) => {
  await context.setOffline(true);
  // Без service worker'а здесь всё и кончается: навигация упирается в ERR_INTERNET_DISCONNECTED.
  await page.reload();
  await expect(page.getByTestId("mode-classic")).toBeVisible();

  await page.getByTestId("mode-classic").click();
  await page.getByTestId("variant-quick").click();
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("draft-screen")).toBeVisible();

  // Картинки в офлайне обязаны быть из своего зеркала: CDN недоступен, и «битая картинка»
  // означала бы, что зеркало (T11.2) отвалилось.
  const images = await page.evaluate(() => [...document.images].map((img) => ({ src: img.src, ok: img.complete && img.naturalWidth > 0 })));
  expect(images.length).toBeGreaterThan(0);
  expect(images.filter((img) => !img.ok)).toEqual([]);
  expect(images.filter((img) => !img.src.includes("/art/"))).toEqual([]);

  await completeDraft(page);
  await page.getByTestId("tournament-simulate").click();
  await page.getByTestId("tournament-show-result").click();
  await expect(page.getByTestId("tournament-complete")).toBeVisible({ timeout: 60_000 });
});

test("офлайн: Arena показывает причину, а одиночные режимы не задеты", async ({ page, context }) => {
  await context.setOffline(true);
  await page.reload();

  // Причина видна ДО клика: карточка помечена, иначе игрок узнаёт о проблеме уже внутри режима.
  await expect(page.getByTestId("mode-arena")).toHaveAttribute("data-offline", "true");
  await expect(page.getByTestId("mode-classic")).not.toHaveAttribute("data-offline", "true");

  await page.getByTestId("mode-arena").click();
  await expect(page.getByTestId("mode-network")).toHaveAttribute("data-state", "offline");
  await expect(page.getByTestId("offline-retry")).toBeVisible();

  // Повтор при живом офлайне не «чинит» экран молча — вердикт остаётся честным.
  await page.getByTestId("offline-retry").click();
  await expect(page.getByTestId("mode-network")).toHaveAttribute("data-state", "offline");
});

test("настройки: панель офлайна знает версию копии и умеет её удалить", async ({ page }) => {
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("offline-state")).toHaveAttribute("data-state", "ready");
  // Версия копии — это тот самый dataHash, по которому сверяется сейв: без него панель была бы
  // просто лампочкой «всё хорошо».
  await expect(page.getByTestId("offline-facts")).toContainText(/[0-9a-f]{8}/);

  await page.getByTestId("offline-clear").click();
  await page.getByTestId("offline-clear-confirm").click();
  await expect(page.getByTestId("offline-state")).toHaveAttribute("data-state", "none");
  await expect(page.getByTestId("offline-clear")).toBeDisabled();

  // Копия собирается заново по кнопке — включая оболочку: install у уже установленного воркера
  // не повторяется, и без дозаливки офлайн остался бы сломанным до следующей версии (шишка T11.4).
  await page.getByTestId("offline-refresh").click();
  await expect
    .poll(async () => page.getByTestId("offline-state").getAttribute("data-state"), { timeout: 90_000 })
    .toBe("ready");
});
