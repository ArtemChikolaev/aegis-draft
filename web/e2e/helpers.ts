import { expect, type Locator, type Page } from "@playwright/test";

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

/** Classic-карточка ведёт в шаг выбора варианта: Quick Draft или Roguelite Run. Только вход —
 *  экран конфигурации открыт, забег не стартует. */
export async function openClassicVariant(page: Page, variant: "quick" | "run") {
  await page.getByTestId("mode-classic").click();
  await page.getByTestId(`variant-${variant}`).click();
}

async function startClassicVariant(page: Page, variant: "quick" | "run") {
  await openClassicVariant(page, variant);
  await expect(page.getByTestId("start-run")).toBeVisible();
  await page.getByTestId("start-run").click();
  await expect(page.getByTestId("draft-screen")).toBeVisible();
}

export async function startClassicRun(page: Page) {
  await startClassicVariant(page, "quick");
}

export async function startRogueliteRun(page: Page) {
  await startClassicVariant(page, "run");
}

/** Payload run-link в коротких ключах кодека state/runLink.ts; v/s/r подставляет runLinkCode. */
type RunLinkPayload = Record<string, unknown> & { m: string; seed: string };

/** Код run-link в формате кодека state/runLink.ts — единственная копия формата в e2e.
 *  Сам кодек сюда не импортируется: его граф (playbook → items → heroTags.v1.json) содержит
 *  JSON-импорт без атрибута type, и Node-загрузчик Playwright падает на нём ещё до тестов.
 *  Версии датасета берутся из манифеста страницы — устойчиво к обновлению данных; `r` в payload
 *  перекрывает версию модели (заведомо несовместимая ссылка). */
export async function runLinkCode(page: Page, payload: RunLinkPayload) {
  const manifest = await page.evaluate(() =>
    fetch("data/manifest.json").then((response) => response.json() as Promise<{ schemaVersion: number; ratingModelVersion: string }>),
  );
  const full = { v: 1, s: manifest.schemaVersion, r: manifest.ratingModelVersion, ...payload };
  // base64url без паддинга поверх UTF-8 — как toBase64Url кодека, не-Latin1 тоже кодируется.
  return Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
}

/** Детерминированный roguelite-старт по фиксированному seed через run-link. Нужен, когда
 *  тесту важен исход этапа: `camp-e2e-22` проходит этап 1 жадным драфтом (см. подбор в истории). */
export async function startRogueliteSeed(page: Page, seed: string, opts: { cheatMode?: boolean; playbook?: readonly string[] } = {}) {
  const encoded = await runLinkCode(page, {
    m: "run", d: "team", f: "last_2y", n: 2, c: "event", a: "auto", seed,
    // `x` = cheatMode в кодеке runLink (R2.1).
    ...(opts.cheatMode ? { x: 1 } : {}),
    // `p` = Playbook (T6.4-2): карты через точку.
    ...(opts.playbook ? { p: opts.playbook.join(".") } : {}),
  });
  await page.goto(`#/run=${encoded}`);
  await page.getByTestId("run-link-accept").click();
  await expect(page.getByTestId("draft-screen")).toBeVisible();
}

/** Жать Skip, пока не появится `target`. Reveal идёт фазами, и кнопка Skip между ними
 *  отсоединяется и появляется снова (авто-переход стадий, mobile-тайминги), поэтому клик —
 *  best-effort, а ожидание — повторяемая проверка с общим потолком вместо пауз в цикле. */
async function skipRevealUntil(page: Page, target: Locator) {
  const skip = page.getByTestId("tournament-skip");
  await expect(async () => {
    if (!(await target.isVisible().catch(() => false))) await skip.click({ timeout: 1_500 }).catch(() => {});
    await expect(target).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 30_000 });
}

/** Симулировать текущий ante-этап до исхода: появляется либо «следующий этап»
 *  (порог пройден), либо терминальный итог забега (победа/смерть). */
export async function simulateAnteStageToOutcome(page: Page) {
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  await page.getByTestId("tournament-simulate").click();
  await skipRevealUntil(page, page.getByTestId("ante-to-camp").or(page.getByTestId("tournament-complete")).first());
}

/** Бесшовный запуск: одна CTA «Симулировать», дальше группы → (авто) плей-офф проигрываются
 *  сами; ждём терминальный итог. */
export async function simulateTournamentToEnd(page: Page) {
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  await page.getByTestId("tournament-simulate").click();
  await skipRevealUntil(page, page.getByTestId("tournament-complete"));
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

/** Текст внутри `root` с контрастом ниже WCAG AA (4.5:1, крупный — 3:1) против фактического фона:
 *  полупрозрачные фоны предков смешиваются до первого непрозрачного. Неактивное (disabled, opacity),
 *  градиентный текст (`-webkit-text-fill-color: transparent`) и текст поверх картинки или градиента фона
 *  (цвет под ним не вычислить) пропускаются; `checked` — сколько узлов проверено, чтобы пустой список не
 *  прошёл молча (панель ещё не отрисована, всё пропущено). */
export async function lowContrastText(root: Locator): Promise<{ checked: number; low: string[] }> {
  return root.evaluate((el) => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const parse = (s: string): Rgba | null => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const over = (top: Rgba, under: Rgba): Rgba => ({
      r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1,
    });
    const lum = (c: Rgba) => {
      const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
    };
    const backdrop = (node: Element): Rgba | null => {
      const layers: Rgba[] = [];
      for (let e: Element | null = node; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const c = parse(cs.backgroundColor);
        // Картинка или градиент без непрозрачного цвета под ними (арт карточек режимов) — фон не вычислить; свечение поверх
        // сплошного цвета (панель модалки) меряем по цвету.
        if (cs.backgroundImage !== "none" && !(c && c.a >= 1)) return null;
        if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      return layers.reduceRight<Rgba>((under, top) => over(top, under), { r: 0, g: 0, b: 0, a: 1 });
    };
    const low: string[] = [];
    let checked = 0;
    for (const node of el.querySelectorAll("*")) {
      const text = [...node.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent?.trim()).join(" ").trim();
      if (!text || node.getClientRects().length === 0) continue;
      const cs = getComputedStyle(node);
      if (cs.visibility === "hidden" || cs.getPropertyValue("-webkit-text-fill-color") === "rgba(0, 0, 0, 0)") continue;
      let inactive = false;
      for (let e: Element | null = node; e && e !== el.parentElement; e = e.parentElement) {
        if ((e as HTMLButtonElement).disabled || Number(getComputedStyle(e).opacity) < 0.9) inactive = true;
      }
      const fg = parse(cs.color);
      if (inactive || !fg) continue;
      const bg = backdrop(node);
      if (!bg) continue;
      const l1 = lum(over(fg, bg)), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      checked++;
      if (ratio < (large ? 3 : 4.5)) low.push(`${text.slice(0, 40)} — ${ratio.toFixed(2)}:1 (${cs.color} на rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)}))`);
    }
    return { checked, low };
  });
}
