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

/** Дождаться reveal-анимации и нажать Skip, если она идёт. */
export async function skipRevealIfPlaying(page: Page) {
  const skip = page.getByTestId("tournament-skip");
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(skip).toBeHidden({ timeout: 5_000 });
  }
}

/** field → groups → playoffs с пропуском live-reveal. */
export async function advanceTournamentToEnd(page: Page) {
  await expect(page.getByTestId("tournament-advance")).toBeVisible();
  await page.getByTestId("tournament-advance").click();

  await expect(page.getByTestId("tournament-stage-groups")).toBeVisible();
  await skipRevealIfPlaying(page);
  await page.getByTestId("tournament-advance").click();

  await expect(page.getByTestId("tournament-stage-playoffs")).toBeVisible();
  await skipRevealIfPlaying(page);
  await expect(page.getByTestId("tournament-complete")).toBeVisible({ timeout: 15_000 });
}
