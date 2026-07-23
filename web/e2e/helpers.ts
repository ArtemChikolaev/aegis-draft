import { expect, type Page } from "@playwright/test";

export async function clearPersist(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function gotoFreshApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("brand")).toBeVisible();
  await clearPersist(page);
  await page.reload();
  await expect(page.getByTestId("brand")).toBeVisible();
}

/** Пройти драфт: 5 игроков + 5 героев (первый доступный вариант на каждом шаге). */
export async function completeDraft(page: Page) {
  for (let step = 0; step < 12; step++) {
    const candidate = page.locator('[data-testid^="candidate-"]:not([disabled])').first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      continue;
    }
    const hero = page.locator('[data-testid^="pack-hero-"]:not([disabled])').first();
    if (await hero.isVisible().catch(() => false)) {
      await hero.click();
      continue;
    }
    break;
  }
}

// Classic-карточка ведёт в шаг выбора варианта: Quick Draft или Roguelite Run.
export async function startClassicRun(page: Page) {
  await page.getByTestId("mode-classic").click();
  await page.getByTestId("variant-quick").click();
  await expect(page.getByTestId("start-run")).toBeVisible();
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("draft-screen")).toBeVisible();
}

export async function startRogueliteRun(page: Page) {
  await page.getByTestId("mode-classic").click();
  await page.getByTestId("variant-run").click();
  await expect(page.getByTestId("start-run")).toBeVisible();
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("draft-screen")).toBeVisible();
}

/** Детерминированный roguelite-старт по фиксированному seed через run-link (формат — как кодек
 *  state/runLink.ts, версии берём из манифеста → устойчиво к обновлению датасета). Нужен, когда
 *  тесту важен исход этапа: `camp-e2e-22` проходит этап 1 жадным драфтом (см. подбор в истории). */
export async function startRogueliteSeed(page: Page, seed: string) {
  const encoded = await page.evaluate(async (seed) => {
    const m = await fetch("data/manifest.json").then((r) => r.json());
    const payload = { v: 1, s: m.schemaVersion, r: m.ratingModelVersion, m: "run", d: "team", f: "last_2y", n: 2, c: "event", a: "auto", seed };
    return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }, seed);
  await page.goto(`#/run=${encoded}`);
  await page.getByTestId("run-link-accept").click();
  await expect(page.getByTestId("draft-screen")).toBeVisible();
}

/** Симулировать текущий ante-этап до исхода: появляется либо «следующий этап»
 *  (порог пройден), либо терминальный итог забега (победа/смерть). */
export async function simulateAnteStageToOutcome(page: Page) {
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  await page.getByTestId("tournament-simulate").click();
  const next = page.getByTestId("ante-to-camp");
  const complete = page.getByTestId("tournament-complete");
  const skip = page.getByTestId("tournament-skip");
  for (
    let i = 0;
    i < 12 && !(await next.isVisible().catch(() => false)) && !(await complete.isVisible().catch(() => false));
    i += 1
  ) {
    await skip.click({ timeout: 1_500 }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Бесшовный запуск: одна CTA «Симулировать», дальше группы → (авто) плей-офф проигрываются
 *  сами. Reveal идёт двумя фазами; жмём Skip best-effort в цикле, пока не появится терминальный
 *  итог. Устойчиво к авто-переходу стадий и mobile-таймингам (кнопка Skip отсоединяется/появляется). */
export async function simulateTournamentToEnd(page: Page) {
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  await page.getByTestId("tournament-simulate").click();
  const complete = page.getByTestId("tournament-complete");
  const skip = page.getByTestId("tournament-skip");
  for (let i = 0; i < 10 && !(await complete.isVisible().catch(() => false)); i += 1) {
    await skip.click({ timeout: 1_500 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  await expect(complete).toBeVisible({ timeout: 15_000 });
}
