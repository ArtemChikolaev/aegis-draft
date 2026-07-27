import { expect, test } from "@playwright/test";
import { boostInCamp, completeDraft, gotoFreshApp, simulateAnteStageToOutcome, startClassicRun, startRogueliteRun, startRogueliteSeed } from "./helpers.ts";

// Seed, проходящий этап 1 жадным авто-драфтом (completeDraft) с большим запасом (место 1) —
// Буткемп достигается детерминированно. Подобран под текущие ante-константы (см. историю).
const CAMP_SEED = "camp-e2e-3";
// Cheat-забег, проходящий все пять этапов жадным драфтом + апгрейдами (подобран пробой; первый
// этап остаётся коин-флипом из-за схлопнутого поля — см. R7.1). Нужен, чтобы дойти до финала акта
// и проверить boss condition сквозным проходом.
const CHEAT_SEED = "cheat-e2e-3";

// Roguelite Run (T5.7 срез 1 + T5.2 срез 2): драфт → этап → Буткемп (reward/market) → следующий
// этап; растущий порог, промах = конец.
test("roguelite run: этапы через Буткемп и завершение забега", async ({ page }) => {
  // До 5 этапов × (reveal турнира + Буткемп) — на медленном CI-mobile не влезает в 30с.
  // Фикс-seed делает число этапов детерминированным, slow() утраивает бюджет.
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);

  let stagesPlayed = 0;
  for (let stage = 0; stage < 6; stage += 1) {
    await expect(page.getByTestId("ante-status")).toBeVisible();
    await simulateAnteStageToOutcome(page);
    await expect(page.getByTestId("ante-result")).toBeVisible();
    stagesPlayed += 1;

    if (await page.getByTestId("tournament-complete").isVisible().catch(() => false)) break;
    // Этап пройден → в Буткемп → следующий этап.
    await expect(page.getByTestId("ante-to-camp")).toBeVisible();
    await page.getByTestId("ante-to-camp").click();
    await expect(page.getByTestId("camp-screen")).toBeVisible();
    await page.getByTestId("camp-next-stage").click();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  }

  await expect(page.getByTestId("tournament-complete")).toBeVisible();
  expect(stagesPlayed).toBeGreaterThanOrEqual(1);
  expect(stagesPlayed).toBeLessThanOrEqual(5);
  await expect(page.locator(".career-run").first()).toContainText(`Stage ${stagesPlayed}/5`);
});

// Экономика Буткемпа: reward (выбор 1 из 3) и покупка на рынке двигают Team OVR, баланс не в минус.
test("roguelite run: Буткемп — reward и покупка меняют команду", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);

  // Фиксированный seed гарантирует проход этапа 1 → Буткемп.
  await expect(page.getByTestId("ante-to-camp")).toBeVisible();
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();

  // Reward: выбрать первую карту золота, баланс растёт.
  const goldBefore = Number(await page.getByTestId("camp-gold").innerText());
  await page.getByTestId("camp-reward").getByRole("button").first().click();
  await expect(page.getByTestId("camp-gold")).not.toHaveText(String(goldBefore));

  // Market: если есть доступная покупка — купить, золото списывается и не уходит в минус.
  const buyButtons = page.getByTestId("camp-market").getByRole("button", { name: /^(Buy|Купить)$/ });
  const count = await buyButtons.count();
  for (let i = 0; i < count; i += 1) {
    const btn = buyButtons.nth(i);
    if (!(await btn.isEnabled())) continue;
    const beforeBuy = Number(await page.getByTestId("camp-gold").innerText());
    await btn.click();
    const afterBuy = Number(await page.getByTestId("camp-gold").innerText());
    expect(afterBuy).toBeLessThan(beforeBuy);
    expect(afterBuy).toBeGreaterThanOrEqual(0);
    break;
  }

  // Следующий этап играется с усиленным полем.
  await page.getByTestId("camp-next-stage").click();
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
});

// Срез 4: Tactics + Camp Actions. CAMP_SEED детерминированно выдаёт тактику (oldTeammates)
// третьей reward-картой на этапе 1 и действие (heroPractice) на этапе 2.
test("roguelite run: экипировка тактики и розыгрыш действия", async ({ page }) => {
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();

  // Билд-панель всегда на экране; тактические слоты пусты в начале забега.
  const tactics = page.getByTestId("camp-tactics");
  await expect(tactics).toBeVisible();
  await expect(tactics.locator(".camp__slot-count")).toHaveText("0/3");
  await expect(tactics.locator(".camp-slot--empty")).toHaveCount(3);

  // Взять тактику из reward → занят один слот, карточка появилась с описанием.
  await page.getByTestId("reward-rwd-1-2").click();
  await expect(tactics.locator(".camp__slot-count")).toHaveText("1/3");
  await expect(tactics.locator('[data-card-id="oldTeammates"]')).toBeVisible();

  // Тактика — условный модификатор Chemistry: он входит в тот же teamOvr, что уйдёт в поле.
  await page.getByTestId("camp-next-stage").click();
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  const strength = await page.getByTestId("tournament-user-strength").innerText();
  await expect(page.getByTestId("pentagon-team-ovr")).toHaveText(strength);

  // Этап 2 → Буткемп с Camp Action в reward.
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  const actions = page.getByTestId("camp-actions-panel");
  await expect(actions.locator(".camp__slot-count")).toHaveText("0/2");
  await page.getByTestId("reward-rwd-2-2").click();
  await expect(actions.locator(".camp__slot-count")).toHaveText("1/2");

  // Разыграть действие → слот освобождается (одноразовое), тактика первого этапа осталась.
  await page.getByTestId("action-play-heroPractice").click();
  await expect(actions.locator(".camp__slot-count")).toHaveText("0/2");
  await expect(page.getByTestId("camp-tactics").locator('[data-card-id="oldTeammates"]')).toBeVisible();
});

// Регресс live-бага: Stand-in (бесплатный свап игрока) должен делать покупку игрока доступной,
// даже если цена выше золота. camp-e2e-23 выдаёт Stand-in третьей reward-картой на этапе 1.
test("roguelite run: stand-in делает замену игрока бесплатной", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteSeed(page, "camp-e2e-229");
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();

  // Взять Stand-in и разыграть — появляется бесплатный свап игрока.
  await page.getByTestId("reward-rwd-1-2").click();
  await expect(page.getByTestId("action-play-standIn")).toBeVisible();
  await page.getByTestId("action-play-standIn").click();

  // Все карты игроков теперь бесплатны и покупаемы, независимо от цены/золота.
  const playerCards = page.getByTestId("camp-pack").locator('[data-offer-kind="player"]');
  await expect(playerCards.first()).toBeVisible();
  const freeCosts = playerCards.locator(".camp-offer__cost--free");
  await expect(freeCosts.first()).toBeVisible();
  const firstBuy = playerCards.first().getByRole("button", { name: /^(Buy|Купить)$/ });
  await expect(firstBuy).toBeEnabled();

  // Покупка не тратит золото (свап бесплатный).
  const goldBefore = Number(await page.getByTestId("camp-gold").innerText());
  await firstBuy.click();
  await expect(page.getByTestId("camp-gold")).toHaveText(String(goldBefore));
});

// Срез 3b + R3.1/R3.2: в первом-ever забеге закрыты только СЛУЧАЙНЫЕ повышенные качества.
// Ручное улучшение доступно сразу — раньше один флаг rarityEnabled глушил и его (баг PF-8).
test("roguelite run: первый забег — дропы common, но улучшать можно руками", async ({ page }) => {
  await gotoFreshApp(page); // пустая карьера → дропы закрыты
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();

  // Дропы выключены: ни одна карта рынка героев не предлагает качество выше common.
  const heroCards = page.getByTestId("camp-hero-pack").locator("[data-incoming-rarity]");
  await expect(heroCards.first()).toBeVisible();
  for (const card of await heroCards.all()) {
    await expect(card).toHaveAttribute("data-incoming-rarity", "common");
  }

  // Блок улучшения виден и работает: common → unique за золото.
  const rarity = page.getByTestId("camp-rarity");
  await expect(rarity).toBeVisible();
  await page.getByTestId("reward-rwd-1-1").click();
  const upgrade = page.locator('[data-testid^="rarity-upgrade-"]').first();
  await expect(upgrade).toBeEnabled();
  const card = rarity.locator(".camp-rarity-card").first();
  await upgrade.click();
  await expect(card).toHaveAttribute("data-rarity", "unique");

  // Resume первого забега сохраняет вручную поднятое качество.
  await page.reload();
  await expect(page.getByTestId("resume-banner")).toBeVisible();
  await page.getByTestId("resume-continue").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await expect(page.getByTestId("camp-rarity").locator(".camp-rarity-card").first())
    .toHaveAttribute("data-rarity", "unique");
});

// Со второго забега (в careerStore есть завершённый roguelite-забег) редкость активна.
test("roguelite run: со второго забега открываются случайные повышенные качества", async ({ page }) => {
  // addInitScript переживает clearPersist+reload внутри gotoFreshApp (пере-применяется до скриптов).
  await page.addInitScript(() => {
    localStorage.setItem("aegis:career:v1", JSON.stringify({ v: 1, entries: [{ configLabel: { mode: "run" } }] }));
  });
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();

  const rarity = page.getByTestId("camp-rarity");
  await expect(rarity).toBeVisible();

  // Добираем золото, улучшаем первого героя common→unique — появляется бейдж редкости.
  await page.getByTestId("reward-rwd-1-1").click();
  const upgrade = page.locator('[data-testid^="rarity-upgrade-"]').first();
  await expect(upgrade).toBeEnabled();
  await upgrade.click();
  await expect(rarity.locator(".rarity-badge").first()).toBeVisible();
});

// Quick Draft (classic) НЕ показывает ante-статус и Буткемп — режим не затронут.
test("quick draft не показывает ante-статус", async ({ page }) => {
  await gotoFreshApp(page);
  await startClassicRun(page);
  await completeDraft(page);
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  await expect(page.getByTestId("ante-status")).toHaveCount(0);
});

// Resume восстанавливает ante-забег на том же этапе (сейв несёт mode + anteStageIndex).
test("roguelite run: resume восстанавливает ante-этап после перезагрузки", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteRun(page);
  await completeDraft(page);
  await expect(page.getByTestId("ante-status")).toContainText("Stage 1/5");
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("resume-banner")).toBeVisible();
  await page.getByTestId("resume-continue").click();

  await expect(page.getByTestId("ante-status")).toContainText("Stage 1/5");
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
});

// Resume восстанавливает Буткемп, structural swap и резерв при перезагрузке во время camp.
test("roguelite run: resume восстанавливает Буткемп после перезагрузки", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);

  await expect(page.getByTestId("ante-to-camp")).toBeVisible();
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();

  // Добираем золото reward-картой и покупаем игрока из пак-рулетки (карта — CampPlayerCard).
  await page.getByTestId("camp-reward").getByRole("button").first().click();
  const packCards = page.getByTestId("camp-pack").locator('[data-offer-kind="player"]');
  await expect(packCards.first()).toBeVisible();
  await expect(packCards.first().locator(".camp-player-card")).toBeVisible();
  const heroCards = page.getByTestId("camp-hero-pack").locator('[data-offer-kind="hero"]');
  await expect(heroCards).toHaveCount(5);
  await expect(heroCards.first().locator(".camp-hero-compare")).toBeVisible();
  await expect(heroCards.first().locator(".camp-offer__delta").first()).toContainText(/TEAM OVR/i);
  const packBuys = packCards.getByRole("button", { name: /^(Buy|Купить)$/ });
  const packN = await packBuys.count();
  let bought = false;
  for (let i = 0; i < packN; i += 1) {
    if (!(await packBuys.nth(i).isEnabled())) continue;
    await packBuys.nth(i).click();
    bought = true;
    break;
  }
  expect(bought).toBe(true);
  await expect(page.getByTestId("camp-reserve")).toBeVisible();

  // Бесплатно возвращаем запасного: accountId действительно переезжают между радаром и скамейкой.
  const reserveCard = page.getByTestId("camp-reserve-player");
  const reserveBefore = await reserveCard.getAttribute("data-account-id");
  const swapButton = page.locator('[data-testid^="camp-reserve-player-swap-"]').first();
  const swapTestId = await swapButton.getAttribute("data-testid");
  const slotIndex = Number(swapTestId?.split("-").at(-1));
  const activeBefore = await page.getByTestId("camp-team-radar")
    .locator(".pentagon-node")
    .nth(slotIndex)
    .getAttribute("data-account-id");
  expect(reserveBefore).toBeTruthy();
  expect(activeBefore).toBeTruthy();
  expect(activeBefore).not.toBe(reserveBefore);
  await swapButton.click();
  await expect(reserveCard).toHaveAttribute("data-account-id", activeBefore!);
  await expect(page.getByTestId("camp-team-radar").locator(`[data-account-id="${reserveBefore}"]`))
    .toBeVisible();

  const gold = await page.getByTestId("camp-gold").innerText();
  const reservePlayer = await page.getByTestId("camp-reserve-player-name").innerText();

  // Перезагрузка во время Буткемпа → та же перестановка, запас и валюта.
  await page.reload();
  await expect(page.getByTestId("resume-banner")).toBeVisible();
  await page.getByTestId("resume-continue").click();

  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await expect(page.getByTestId("camp-gold")).toHaveText(gold);
  await expect(page.getByTestId("camp-reserve-player-name")).toHaveText(reservePlayer);
  await expect(page.getByTestId("camp-team-radar").locator(`[data-account-id="${reserveBefore}"]`))
    .toBeVisible();

  // И следующий турнир получает именно активный состав после перестановки.
  await page.getByTestId("camp-next-stage").click();
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  await expect(page.locator(".result__radar").locator(`[data-account-id="${reserveBefore}"]`))
    .toBeVisible();
  // Экономические модификаторы входят и в силу симуляции, и в радар: два числа не расходятся.
  const simulatedStrength = await page.getByTestId("tournament-user-strength").innerText();
  await expect(page.getByTestId("pentagon-team-ovr")).toHaveText(simulatedStrength);
});

// R2 — Cheat Mode: правило конкретного забега.
//
// Здесь же живёт покрытие cadence боссов (R6.2): босс стоит только на финале акта, а дойти до
// него можно лишь глубоким забегом — Cheat Mode делает это детерминированно, без охоты за
// «проходным» seed. Тест проверяет ОБЕ половины правила: на этапах 1–4 боссов нет, на 5-м есть.
// Отдельного узкого теста «обычные этапы без босса» поэтому не держим.
test("cheat mode: ∞ золото, маркировка, boss на финале акта, забег вне статистики", async ({ page }) => {
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CHEAT_SEED, { cheatMode: true });
  await completeDraft(page);

  // Маркировка видна с первого этапа.
  await expect(page.getByTestId("cheat-badge").first()).toBeVisible();

  let sawBossPreview = false;
  let sawBossOnStage = false;
  for (let stage = 0; stage < 5; stage += 1) {
    await simulateAnteStageToOutcome(page);
    if (!(await page.getByTestId("ante-to-camp").isVisible().catch(() => false))) break;
    await page.getByTestId("ante-to-camp").click();
    await expect(page.getByTestId("camp-screen")).toBeVisible();

    // Золото показано как ∞ и покупки его не тратят.
    await expect(page.getByTestId("camp-gold")).toHaveText("∞");
    await boostInCamp(page);
    await expect(page.getByTestId("camp-gold")).toHaveText("∞");

    // Босс — только на финале акта (5-й этап), и в Буткемпе он виден заранее.
    const bossPreview = await page.getByTestId("camp-boss").count();
    expect(bossPreview > 0).toBe(stage === 3);
    if (bossPreview) sawBossPreview = true;

    await page.getByTestId("camp-next-stage").click();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
    if (stage === 3) {
      const anteBoss = page.getByTestId("ante-boss");
      await expect(anteBoss).toBeVisible();
      await expect(anteBoss).toHaveAttribute("data-boss-id", /.+/);
      sawBossOnStage = true;
      // Штраф босса входит в силу состава так же, как в таблицу поля: центр радара = сила в поле.
      const strength = await page.getByTestId("tournament-user-strength").innerText();
      await expect(page.getByTestId("pentagon-team-ovr")).toHaveText(strength);
    }
  }
  expect(sawBossPreview).toBe(true);
  expect(sawBossOnStage).toBe(true);

  // Забег дошёл до конца, запись сохранена с меткой — но в статистику не пошла.
  const stored = await page.evaluate(() => localStorage.getItem("aegis:career:v1"));
  expect(stored).toContain('"cheatMode":true');
  // Счётчик «Забеги» остаётся нулевым: cheat-запись есть в истории, но не в агрегатах.
  await expect(page.locator(".career-panel").getByText(/^Runs$/).locator("..")).toContainText("0");
});

// R2.1: Cheat Mode — правило конкретного забега, живёт на экране его конфигурации.
test("cheat mode: секция Special rules только в Roguelite, включение через подтверждение", async ({ page }) => {
  await gotoFreshApp(page);

  // Quick Draft — обычная конфигурация без особых правил.
  await page.getByTestId("mode-classic").click();
  await page.getByTestId("variant-quick").click();
  await expect(page.getByTestId("start-run")).toBeVisible();
  await expect(page.getByTestId("special-rules")).toHaveCount(0);

  // Roguelite Run — секция есть; по умолчанию Cheat Mode выключен.
  await gotoFreshApp(page);
  await page.getByTestId("mode-classic").click();
  await page.getByTestId("variant-run").click();
  const special = page.getByTestId("special-rules");
  await expect(special).toBeVisible();
  const on = special.getByRole("button", { name: /Unlimited gold/ });
  await expect(on).toHaveAttribute("aria-pressed", "false");

  // Включение не проходит молча: сперва модалка.
  await on.click();
  await expect(page.getByTestId("cheat-gate-confirm")).toBeVisible();
  await expect(on).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("cheat-gate-confirm").click();
  await expect(on).toHaveAttribute("aria-pressed", "true");

  // Хардкор и Cheat Mode взаимоисключающи: опция блокируется с понятной подсказкой.
  const hardOn = page.getByRole("group", { name: /Hardcore/i }).getByRole("button").last();
  await expect(hardOn).toBeDisabled();
  await expect(hardOn).toContainText(/Unavailable with Cheat Mode/i);

  // Выключение — сразу, без модалки, и хардкор снова доступен.
  await special.getByRole("button", { name: /Normal run economy/ }).click();
  await expect(page.getByTestId("cheat-gate-confirm")).toHaveCount(0);
  await expect(hardOn).toBeEnabled();
});
