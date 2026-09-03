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
export async function startRogueliteSeed(page: Page, seed: string, opts: { cheatMode?: boolean; playbook?: readonly string[] } = {}) {
  const encoded = await page.evaluate(async ({ seed, cheatMode, playbook }) => {
    const m = await fetch("data/manifest.json").then((r) => r.json());
    const payload = {
      v: 1, s: m.schemaVersion, r: m.ratingModelVersion, m: "run", d: "team", f: "last_2y",
      n: 2, c: "event", a: "auto", seed,
      // `x` = cheatMode в кодеке runLink (R2.1).
      ...(cheatMode ? { x: 1 } : {}),
      // `p` = Playbook (T6.4-2): карты через точку.
      ...(playbook ? { p: playbook.join(".") } : {}),
    };
    return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }, { seed, cheatMode: opts.cheatMode ?? false, playbook: opts.playbook ?? null });
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

/** Максимально усилиться в Буткемпе: забрать награду, купить все карты с положительной дельтой
 *  Team OVR и поднять качество героев. Нужен тестам, которым важно ДОЙТИ до позднего этапа
 *  (например до финала акта с боссом) — в паре с Cheat Mode это делает глубокий забег
 *  детерминированно достижимым, без охоты за «проходным» seed. */
export async function boostInCamp(page: Page) {
  await openCampSection(page, "reward");
  const reward = page.locator('[data-testid^="reward-rwd-"]').first();
  if (await reward.count()) await reward.click().catch(() => {});
  await openCampSection(page, "market");
  // Только апгрейды: в паках рынка есть честные ловушки, покупать их подряд бессмысленно.
  const upgrades = page.locator(
    '.camp-pack-card:has(.camp-offer__deltas > .camp-offer__delta--up:first-child) [data-testid^="market-mkt-"]',
  );
  for (let i = 0; i < 6; i += 1) {
    const button = upgrades.first();
    if (!(await button.count()) || !(await button.isEnabled().catch(() => false))) break;
    await button.click();
  }
  const rarity = page.locator('[data-testid^="rarity-upgrade-"]');
  for (let i = 0; i < 5; i += 1) {
    const button = rarity.first();
    if (!(await button.count()) || !(await button.isEnabled().catch(() => false))) break;
    await button.click();
  }
}

/** Перезагрузить страницу и продолжить сохранённый забег.
 *
 *  Resume — самая тяжёлая операция набора: детерминированный replay всего лога действий на свежем
 *  движке плюс пересборка рынка. Под пятью параллельными воркерами дефолтных 5с на первый экран
 *  иногда не хватает, и тест краснеет по таймингу, а не по существу. Ждём явно и в одном месте,
 *  чтобы это не расползалось по спекам разными числами. */
export async function reloadAndResume(page: Page) {
  await page.reload();
  const banner = page.getByTestId("resume-banner");
  await expect(banner).toBeVisible();
  // Клик сразу после reload иногда приходится на момент гидратации и теряется — баннер остаётся
  // висеть, и тест краснеет по тайммингу, а не по существу. Повторяем клик, пока баннер не уйдёт;
  // реальный отказ resume всё равно упадёт, просто позже.
  await expect(async () => {
    if (await banner.count()) await page.getByTestId("resume-continue").click({ timeout: 5_000 });
    await expect(banner).toHaveCount(0, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

/** Взять награду нужного ВИДА, а не по индексу слота: набор наград (R4.3) — три разных вида
 *  пользы, и их порядок/состав может меняться при калибровке. Индексы тестов ломались бы на
 *  каждой такой правке, вид — нет. */
export async function chooseReward(page: Page, kinds: readonly string[]) {
  await openCampSection(page, "reward");
  const selector = kinds.map((kind) => `[data-offer-kind="${kind}"]`).join(", ");
  const card = page.getByTestId("camp-reward").locator(selector).first();
  await expect(card).toBeVisible();
  await card.getByRole("button").click();
}

/** R13.4: Буткемп рендерит только один рабочий раздел. Тесты явно называют контекст действия,
 *  а не полагаются на прежнюю бесконечную ленту, где все карточки всегда были в DOM. */
export async function openCampSection(
  page: Page,
  section: "reward" | "market" | "build" | "preparation",
) {
  const tab = page.getByTestId(`camp-section-${section}`);
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}
