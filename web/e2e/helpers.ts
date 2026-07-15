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

export async function startClassicRun(page: Page) {
  await page.getByTestId("mode-classic").click();
  await expect(page.getByTestId("start-run")).toBeVisible();
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("draft-screen")).toBeVisible();
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
