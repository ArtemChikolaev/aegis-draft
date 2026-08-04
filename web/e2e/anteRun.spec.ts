import { expect, test } from "@playwright/test";
import { boostInCamp, chooseReward, completeDraft, gotoFreshApp, openCampSection, reloadAndResume, simulateAnteStageToOutcome, startClassicRun, startRogueliteRun, startRogueliteSeed } from "./helpers.ts";
// Длина сезона и шаблон акта берутся из самой модели: тест не должен знать «25» отдельно от игры.
import { SEASON } from "../src/game/anteRun.ts";

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
  // Сезон — 25 этапов (R6.1), но ростер тут статичный (в Буткемпе ничего не покупаем), поэтому
  // забег гибнет в первом-втором акте. Бюджет цикла — с запасом к этому, а не к длине сезона:
  // прогонять 25 турниров в браузере ради проверки петли незачем.
  for (let stage = 0; stage < 12; stage += 1) {
    await expect(page.getByTestId("ante-status")).toBeVisible();
    await expect(page.getByTestId("ante-act-stage")).toContainText(`Stage ${(stage % SEASON.actLength) + 1}`);
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
  expect(stagesPlayed).toBeLessThan(SEASON.stages.length);
  await expect(page.locator(".career-run").first())
    .toContainText(`Stage ${stagesPlayed}/${SEASON.stages.length}`);
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

  // R13.4: вместо общей ленты виден один раздел; выбор награды ведёт к следующему решению.
  await expect(page.getByTestId("camp-section-nav").getByRole("tab")).toHaveCount(4);
  await expect(page.getByTestId("camp-market")).toHaveCount(0);

  // Reward: выбрать первую карту золота, баланс растёт.
  const goldBefore = Number(await page.getByTestId("camp-gold").innerText());
  await page.getByTestId("camp-reward").getByRole("button").first().click();
  await expect(page.getByTestId("camp-gold")).not.toHaveText(String(goldBefore));
  await expect(page.getByTestId("camp-section-market")).toHaveAttribute("aria-selected", "true");

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

// Срез 4 + R8.3: пассивные карточки (тактики И предметы делят слоты) + Camp Actions. Конкретные
// id не фиксируем — пул карточек общий и растёт; тесту важен класс карты и занятый слот.
test("roguelite run: пассивные карточки занимают слоты и входят в силу этапа", async ({ page }) => {
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await openCampSection(page, "build");

  // Билд-панель всегда на экране; тактические слоты пусты в начале забега.
  const tactics = page.getByTestId("camp-tactics");
  await expect(tactics).toBeVisible();
  await expect(tactics.locator(".camp__slot-count")).toHaveText("0/5");
  await expect(tactics.locator(".camp-slot--empty")).toHaveCount(5);

  // Взять пассивную карточку из reward → занят один слот, карточка появилась с описанием.
  // Конкретный id не фиксируем: пул общий для тактик и предметов (R8.3), и он растёт.
  await chooseReward(page, ["item", "tactic"]);
  await openCampSection(page, "build");
  await expect(tactics.locator(".camp__slot-count")).toHaveText("1/5");
  await expect(tactics.locator("[data-card-id]").first()).toBeVisible();
  await expect(tactics.locator("[data-card-id]").first().locator(".camp-slot__desc").first()).toBeVisible();

  // Тактика — условный модификатор Chemistry: он входит в тот же teamOvr, что уйдёт в поле.
  await page.getByTestId("camp-next-stage").click();
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  const strength = await page.getByTestId("tournament-user-strength").innerText();
  await expect(page.getByTestId("pentagon-team-ovr")).toHaveText(strength);

  // Этап 2 → Буткемп: берём вторую пассивную карточку, слот заполняется дальше.
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  // Любая пассивная награда заранее сообщает, какой слот займёт. После выбора R13.4 сворачивает
  // карточку в итоговую строку, поэтому проверяем этот affordance до действия, а не после него.
  await openCampSection(page, "reward");
  const passive = page.getByTestId("camp-reward").locator('[data-offer-kind="item"], [data-offer-kind="tactic"]').first();
  await expect(passive.locator(".camp-card-tag")).toBeVisible();
  await chooseReward(page, ["item", "tactic"]);
  await openCampSection(page, "build");
  await expect(tactics.locator(".camp__slot-count")).toHaveText("2/5");
  await expect(tactics.locator("[data-card-id]")).toHaveCount(2);

  // Этап 3 → Буткемп: третья карточка больше не замораживает билд — после расширения остаются
  // ещё два свободных слота. Полный потолок и отказ карточкам №6 сторожит unit-тест canTakeCard:
  // он не зависит от того, переживёт ли конкретный e2e-seed ещё три турнира.
  await page.getByTestId("camp-next-stage").click();
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await chooseReward(page, ["item", "tactic"]);
  await openCampSection(page, "build");
  await expect(tactics.locator(".camp__slot-count")).toHaveText("3/5");
});

// Регресс live-бага: Stand-in (бесплатный свап игрока) должен делать покупку игрока доступной,
// даже если цена выше золота. Seed подобран оффлайн под расширенный пул карточек (R8.3):
// camp-e2e-30 проходит этап 1 и выдаёт Stand-in карточной наградой первого Буткемпа.
test("roguelite run: stand-in делает замену игрока бесплатной", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteSeed(page, "camp-e2e-30");
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await openCampSection(page, "preparation");

  // Взять Stand-in и разыграть — слот действий занимается и освобождается, появляется свободный свап.
  const actions = page.getByTestId("camp-actions-panel");
  await expect(actions.locator(".camp__slot-count")).toHaveText("0/2");
  await chooseReward(page, ["action"]);
  await openCampSection(page, "preparation");
  await expect(actions.locator(".camp__slot-count")).toHaveText("1/2");
  await expect(page.getByTestId("action-play-standIn")).toBeVisible();
  await page.getByTestId("action-play-standIn").click();
  await expect(actions.locator(".camp__slot-count")).toHaveText("0/2");

  // Все карты игроков теперь бесплатны и покупаемы, независимо от цены/золота.
  await openCampSection(page, "market");
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
  await openCampSection(page, "market");

  // Дропы выключены: ни одна карта рынка героев не предлагает качество выше common.
  const heroCards = page.getByTestId("camp-hero-pack").locator("[data-incoming-rarity]");
  await expect(heroCards.first()).toBeVisible();
  for (const card of await heroCards.all()) {
    await expect(card).toHaveAttribute("data-incoming-rarity", "common");
  }

  // Блок улучшения виден и работает: common → unique за золото.
  const rarity = page.getByTestId("camp-rarity");
  await expect(rarity).toBeVisible();
  await chooseReward(page, ["gold"]);
  const upgrade = page.locator('[data-testid^="rarity-upgrade-"]').first();
  await expect(upgrade).toBeEnabled();
  const card = rarity.locator(".camp-rarity-card").first();
  // Целевая редкость — деталь разбора: компактная карточка показывает только итоговую силу,
  // а полный current → next живёт в связанном оверлее.
  await expect(card.locator(".camp-offer__deltas")).not.toContainText("→");
  await card.click();
  await expect(page.getByRole("dialog")).toContainText(
    /(?:Common|Обычный)\s*→\s*(?:Unique|Уникальный)/,
  );
  await page.getByRole("button", { name: /Close|Закрыть/i }).click();
  await expect(page.getByTestId("offer-overlay")).toHaveCount(0);
  await upgrade.click();
  await expect(card).toHaveAttribute("data-rarity", "unique");

  // Resume первого забега сохраняет вручную поднятое качество.
  await reloadAndResume(page);
  await expect(page.getByTestId("camp-screen")).toBeVisible({ timeout: 20_000 });
  await openCampSection(page, "market");
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
  await openCampSection(page, "market");

  const rarity = page.getByTestId("camp-rarity");
  await expect(rarity).toBeVisible();

  // Добираем золото, улучшаем первого героя common→unique — появляется бейдж редкости.
  await chooseReward(page, ["gold"]);
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
  await expect(page.getByTestId("ante-status")).toContainText("Act 1 · Stage 1");
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();

  await reloadAndResume(page);
  await expect(page.getByTestId("ante-status")).toContainText("Act 1 · Stage 1", { timeout: 20_000 });
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
  // Размер пака — балансовая константа (`MARKET_PACK.size`, R14.7), а не свойство экрана, и
  // тянуть её сюда импортом нельзя: игровой модуль тащит JSON-цепочку, которую загрузчик
  // Playwright не ест. Инвариант, который тесту действительно важен: обе рулетки одного размера и
  // не пусты — конкретное число живёт в юнит-тестах рынка.
  await expect(heroCards).toHaveCount(await packCards.count());
  expect(await heroCards.count()).toBeGreaterThan(0);
  await expect(heroCards.first().locator(".camp-hero-compare")).toBeVisible();
  await expect(heroCards.first().locator(".camp-offer__delta").first()).toContainText(/RUN POWER|СИЛА ЗАБЕГА/i);
  // Карточка несёт одну итоговую дельту реальной силы забега — уже после условий Tactics/Items.
  // Частные Base/Hero Synergy живут только в связанном
  // инспекторе — иначе карточки снова превращаются в таблицу слагаемых (playtest 2026-08-02).
  await expect(page.getByTestId("camp-hero-pack").getByText(/HERO SYNERGY|СИНЕРГИЯ ГЕРОЕВ/i))
    .toHaveCount(0);
  await expect(page.getByTestId("camp-rarity").getByText(/HERO SYNERGY|СИНЕРГИЯ ГЕРОЕВ/i))
    .toHaveCount(0);
  // R13.3: точка входа — сама карточка, а не чип с цифрой. Сетка остаётся на месте под overlay.
  const heroGridLayout = () => page.getByTestId("camp-hero-pack").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height };
  });
  const heroGridBox = await heroGridLayout();
  const heroOverlayTrigger = heroCards.first().locator(".camp-card-inspect-trigger");
  await heroCards.first().click();
  await expect(page.getByTestId("offer-overlay")).toBeVisible();
  await expect(page.getByTestId("offer-overlay-action")).toHaveText(/Buy|Купить/i);
  const offerOverlayBox = await page.getByRole("dialog").boundingBox();
  expect(offerOverlayBox).not.toBeNull();
  expect(offerOverlayBox!.width).toBeLessThanOrEqual(500);
  expect(await heroGridLayout()).toEqual(heroGridBox);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("offer-overlay")).toHaveCount(0);
  await expect(heroOverlayTrigger).toBeFocused();

  // Закрытие мышью тоже возвращает фокус (a11y), но не оставляет на карточке ложное selected-
  // свечение. Keyboard-close выше сохраняет видимый focus-ring — различаем модальность, а не
  // выкидываем возврат фокуса целиком.
  const pointerOverlayTrigger = heroCards.nth(1).locator(".camp-card-inspect-trigger");
  await heroCards.nth(1).click();
  await expect(page.getByTestId("offer-overlay")).toBeVisible();
  await page.getByRole("button", { name: /Close|Закрыть/i }).click();
  await expect(page.getByTestId("offer-overlay")).toHaveCount(0);
  await expect(pointerOverlayTrigger).toBeFocused();
  await expect(pointerOverlayTrigger).toHaveAttribute("data-modal-focus-restored", "pointer");
  await expect(pointerOverlayTrigger).toHaveCSS("outline-style", "none");

  await page.locator('[data-testid^="rarity-details-"]').first().click();
  await expect(page.getByTestId("offer-overlay")).toContainText(/HERO SYNERGY|СИНЕРГИЯ ГЕРОЕВ/i);
  await expect(page.getByTestId("offer-overlay")).toContainText(/RUN POWER|СИЛА ЗАБЕГА/i);
  await expect(page.getByTestId("offer-overlay")).toContainText(/→/);
  await page.getByRole("button", { name: /Close|Закрыть/i }).click();
  await expect(page.getByTestId("offer-overlay")).toHaveCount(0);
  // Берём карту с ДРУГОЙ личностью: после R5.2 рынок умеет и Form Upgrade (тот же accountId в
  // лучшей форме), а этот тест про перестановку людей между составом и скамейкой. Апгрейд формы
  // покрыт юнитами `engine.test.ts` — там же, где живёт правило «личность ≠ форма».
  const activeAccountIds = await page.getByTestId("camp-team-radar")
    .locator(".pentagon-node")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-account-id")));
  const packN = await packCards.count();
  let bought = false;
  for (let i = 0; i < packN; i += 1) {
    const card = packCards.nth(i);
    const incoming = await card.locator(".camp-player-card").getAttribute("data-account-id");
    if (incoming && activeAccountIds.includes(incoming)) continue;
    const buy = card.getByRole("button", { name: /^(Buy|Купить)$/ });
    if (!(await buy.isEnabled())) continue;
    await buy.click();
    // Buy остаётся самостоятельным контролом поверх whole-card trigger и не открывает overlay.
    await expect(page.getByTestId("offer-overlay")).toHaveCount(0);
    bought = true;
    break;
  }
  expect(bought).toBe(true);
  await openCampSection(page, "build");
  await expect(page.getByTestId("camp-reserve")).toBeVisible();
  const reserveGrid = page.getByTestId("camp-reserve").locator(".camp__reserve-grid");
  expect(await reserveGrid.evaluate((node) => getComputedStyle(node).overflowY)).toBe("auto");
  expect(parseFloat(await reserveGrid.evaluate((node) => getComputedStyle(node).maxHeight))).toBeGreaterThan(0);

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
  await reloadAndResume(page);
  await expect(page.getByTestId("camp-screen")).toBeVisible({ timeout: 20_000 });
  await openCampSection(page, "build");
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
test("cheat mode: ∞ золото, маркировка, boss на финале акта", async ({ page }) => {
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CHEAT_SEED, { cheatMode: true });
  await completeDraft(page);

  // Маркировка видна с первого этапа.
  await expect(page.getByTestId("cheat-badge").first()).toBeVisible();

  let sawBossPreview = false;
  let sawBossOnStage = false;
  // Первый акт целиком: этого достаточно для обеих половин правила о боссах. Терминальный исход
  // сюда больше не входит — в 25-этапном сезоне (R6.1) прокачанный cheat-забег на пятом этапе
  // ещё жив, и «вне статистики» проверяется отдельным коротким тестом ниже.
  for (let stage = 0; stage < SEASON.actLength; stage += 1) {
    await simulateAnteStageToOutcome(page);
    if (!(await page.getByTestId("ante-to-camp").isVisible().catch(() => false))) break;
    await page.getByTestId("ante-to-camp").click();
    await expect(page.getByTestId("camp-screen")).toBeVisible();

    // Золото показано как ∞ и покупки его не тратят.
    await expect(page.getByTestId("camp-gold")).toHaveText("∞");
    await boostInCamp(page);
    await expect(page.getByTestId("camp-gold")).toHaveText("∞");

    // Босс — только на финале акта (5-й этап), и в Буткемпе он виден заранее.
    await openCampSection(page, "preparation");
    const bossPreview = await page.getByTestId("camp-boss").count();
    expect(bossPreview > 0).toBe(stage === SEASON.actLength - 2);
    if (bossPreview) sawBossPreview = true;

    await page.getByTestId("camp-next-stage").click();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
    if (stage === SEASON.actLength - 2) {
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
});

// R2.3: cheat-забег помечен и не двигает агрегаты. Ростер намеренно НЕ усиливаем — статичный
// состав гибнет в первых актах, и терминальный исход достигается быстро (∞ золото на смертность
// само по себе не влияет: тратить его тут не на что, если ничего не покупать).
test("cheat mode: забег вне статистики", async ({ page }) => {
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CHEAT_SEED, { cheatMode: true });
  await completeDraft(page);

  for (let stage = 0; stage < 12; stage += 1) {
    await simulateAnteStageToOutcome(page);
    if (await page.getByTestId("tournament-complete").isVisible().catch(() => false)) break;
    await page.getByTestId("ante-to-camp").click();
    await expect(page.getByTestId("camp-screen")).toBeVisible();
    await page.getByTestId("camp-next-stage").click();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  }

  await expect(page.getByTestId("tournament-complete")).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("aegis:career:v1"));
  expect(stored).toContain('"cheatMode":true');
  // Счётчик «Забеги» остаётся нулевым: cheat-запись есть в истории, но не в агрегатах.
  await expect(page.locator(".career-panel").getByText(/^Runs$/).locator("..")).toContainText("0");
});

// R9.4: разведка раскрывает то, чего в Буткемпе ещё НЕ видно, — правило следующего боссового
// турнира, до которого несколько этапов. Seed подобран оффлайн: `camp-e2e-150` выдаёт карточку
// Scouting наградой первого Буткемпа (пул карточек детерминирован по seed+campId).
test("roguelite run: разведка раскрывает будущего босса и знание не теряется", async ({ page }) => {
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, "camp-e2e-150");
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await openCampSection(page, "preparation");

  // До разведки будущий босс не показан: правило предстоящего этапа — единственное, что видно.
  await expect(page.getByTestId("camp-boss-scouted")).toHaveCount(0);

  await chooseReward(page, ["action"]);
  await openCampSection(page, "preparation");
  await page.getByTestId("action-play-scouting").click();
  const scouted = page.getByTestId("camp-boss-scouted");
  await expect(scouted).toBeVisible();
  await expect(scouted).toHaveAttribute("data-boss-id", /.+/);
  const revealed = await scouted.getAttribute("data-boss-id");

  // Знание держится до самого турнира: в следующем Буткемпе тот же босс, только ближе.
  await page.getByTestId("camp-next-stage").click();
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await openCampSection(page, "preparation");
  await expect(page.getByTestId("camp-boss-scouted")).toHaveAttribute("data-boss-id", revealed!);
});

// T5.9: поздние синки — то, во что превращается золото, когда рынок насыщен. Cheat Mode здесь не
// про читы, а про детерминизм: синки стоят десятки золота, и обычный первый Буткемп до них просто
// не дотягивает. Проверяем ровно то, что нельзя проверить юнитом, — что покупка доходит до экрана.
test("roguelite run: поздние синки — подготовка дорожает, правило этапа меняется", async ({ page }) => {
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CHEAT_SEED, { cheatMode: true });
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await openCampSection(page, "preparation");

  // Подготовка: цена растёт с каждой покупкой в этом же Буткемпе.
  const buyPrep = page.getByTestId("camp-prep-boost-buy");
  const firstPrice = await buyPrep.innerText();
  await buyPrep.click();
  await expect(page.getByTestId("camp-prep-boost-note")).toBeVisible();
  await expect(buyPrep).not.toHaveText(firstPrice);

  // Разведка за золото раскрывает будущего босса — то же знание, что даёт карточка Scouting.
  await expect(page.getByTestId("camp-boss-scouted")).toHaveCount(0);
  await page.getByTestId("camp-prep-scout-buy").click();
  await expect(page.getByTestId("camp-boss-scouted")).toBeVisible();
  // Раскрывать больше нечего — карточка покупки уходит с экрана.
  await expect(page.getByTestId("camp-prep-scout")).toHaveCount(0);

  // Смена правила: она есть только там, где правило есть, — на финале акта.
  await expect(page.getByTestId("camp-prep-boss")).toHaveCount(0);
  await boostInCamp(page);
  await openCampSection(page, "preparation");
  for (let stage = 1; stage < SEASON.actLength; stage += 1) {
    await page.getByTestId("camp-next-stage").click();
    await expect(page.getByTestId("tournament-simulate")).toBeVisible();
    await simulateAnteStageToOutcome(page);
    if (!(await page.getByTestId("ante-to-camp").isVisible().catch(() => false))) break;
    await page.getByTestId("ante-to-camp").click();
    await expect(page.getByTestId("camp-screen")).toBeVisible();
    // Забег обязан дожить до финала акта — иначе проверять смену правила не на чем.
    await boostInCamp(page);
    await openCampSection(page, "preparation");
    if (await page.getByTestId("camp-boss").count()) {
      const before = await page.getByTestId("camp-boss").getAttribute("data-boss-id");
      await page.getByTestId("camp-prep-boss-buy").click();
      // Заплатил — получил ДРУГОЕ правило, а не тот же бросок ещё раз.
      await expect(page.getByTestId("camp-boss")).not.toHaveAttribute("data-boss-id", before!);
      return;
    }
  }
  throw new Error("финал акта не достигнут: смену правила проверить не на чем");
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

// R4.3: награды — три РАЗНЫХ вида пользы, доминируемой пары «мало/много золота» больше нет.
test("roguelite run: награды разных видов, проценты и бесплатное улучшение", async ({ page }) => {
  test.slow();
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await openCampSection(page, "reward");

  // Ровно три награды, и ни один вид не повторяется — «строго лучше» невозможно.
  const cards = page.getByTestId("camp-reward").locator("[data-offer-kind]");
  await expect(cards).toHaveCount(3);
  const kinds = await cards.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-offer-kind")));
  expect(new Set(kinds).size).toBe(3);
  expect(kinds).toContain("gold");
  expect(kinds.some((k) => k === "reroll" || k === "quality")).toBe(true);

  // Автоматическая выплата разложена на призовые и проценты.
  await expect(page.getByTestId("camp-payout")).toBeVisible();

  const utility = kinds.find((k) => k === "reroll" || k === "quality")!;
  await chooseReward(page, [utility]);

  if (utility === "quality") {
    // Токен делает улучшение качества бесплатным — карточка так и подписана.
    const upgrade = page.locator('[data-testid^="rarity-upgrade-"]').first();
    await expect(upgrade).toBeEnabled();
    await expect(page.getByTestId("camp-rarity").locator(".camp-offer__cost--free").first()).toBeVisible();
    const goldBefore = await page.getByTestId("camp-gold").innerText();
    await upgrade.click();
    await expect(page.getByTestId("camp-gold")).toHaveText(goldBefore);
  } else {
    // Скауты дают бесплатные реролы: реролл не тратит золото.
    const goldBefore = await page.getByTestId("camp-gold").innerText();
    await page.getByTestId("camp-reroll").click();
    await expect(page.getByTestId("camp-gold")).toHaveText(goldBefore);
  }
});

// R8.3: предмет в пассивном слоте зажигает разложение силы забега. Seed подобран оффлайн так,
// чтобы карточная награда первого Буткемпа была предметом, чьё условие на текущем ростере
// выполняется (иначе панель законно не показывается — пустых слоёв она не рисует).
test("roguelite run: предмет в слоте показывает разложение силы", async ({ page }) => {
  await gotoFreshApp(page);
  await startRogueliteSeed(page, "camp-e2e-1");
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();
  await openCampSection(page, "build");

  // До взятия предмета слои пусты, поэтому панели нет — «+0 / ×1.00» рисовать нечего.
  await expect(page.getByTestId("camp-power")).toHaveCount(0);

  await chooseReward(page, ["item"]);
  await openCampSection(page, "build");
  const slot = page.getByTestId("camp-tactics").locator(".camp-slot--item").first();
  await expect(slot).toBeVisible();
  await expect(slot.locator(".camp-slot__desc").first()).not.toBeEmpty();

  // Разложение появилось и показывает итог, отличный от чистого Team OVR.
  const power = page.getByTestId("camp-power");
  await expect(power).toBeVisible();
  await expect(page.getByTestId("camp-power-total")).not.toBeEmpty();

  // Сила, с которой команда выходит на этап, совпадает с показанным итогом.
  await page.getByTestId("camp-next-stage").click();
  await expect(page.getByTestId("tournament-simulate")).toBeVisible();
  const strength = await page.getByTestId("tournament-user-strength").innerText();
  await expect(page.getByTestId("pentagon-team-ovr")).toHaveText(strength);
});

// R11.2: у карточки-предмета есть тир, и он масштабирует ЧИСЛА эффекта. Тест сторожит ровно тот
// дефект, на котором это ломается: описание карточки берёт тир, а разложение вклада — забывает,
// и слот показывает два разных числа для одного эффекта.
test("roguelite run: тир предмета в описании и во вкладе — одно число", async ({ page }) => {
  // Второй забег: случайные повышенные качества открыты (мета-гейт по careerStore).
  await page.addInitScript(() => {
    localStorage.setItem("aegis:career:v1", JSON.stringify({ v: 1, entries: [{ configLabel: { mode: "run" } }] }));
  });
  await gotoFreshApp(page);
  await startRogueliteSeed(page, CAMP_SEED);
  await completeDraft(page);
  await simulateAnteStageToOutcome(page);
  await page.getByTestId("ante-to-camp").click();
  await expect(page.getByTestId("camp-screen")).toBeVisible();

  await openCampSection(page, "reward");
  const rewardItem = page.getByTestId("camp-reward").locator('[data-offer-kind="item"]').first();
  const rewardTier = await rewardItem.getAttribute("data-card-tier");
  await chooseReward(page, ["item"]);
  await openCampSection(page, "build");
  const slot = page.getByTestId("camp-tactics").locator(".camp-slot--item").first();
  await expect(slot).toBeVisible();
  const rarity = await slot.getAttribute("data-card-rarity");
  // У предмета своя шкала имён (R11.5): механический тир `unique` показывается как `refined`.
  const tier = await slot.getAttribute("data-card-tier");
  test.skip(rarity === "common", "в этом Буткемпе выпал common — масштабировать нечего");

  // Тир виден игроку и в награде, и в слоте — один и тот же. Сверяем по классу-модификатору, а не
  // по тексту: бейдж рендерится через `text-transform`, и `innerText` («UNIQUE») не равен тексту
  // DOM («Unique»).
  await expect(slot.locator(`.rarity-badge--${tier}`)).toBeVisible();
  expect(rewardTier).toBe(tier);
  // Шкала предмета — НЕ шкала героя: имена тиров не должны совпадать.
  expect(tier).not.toBe(rarity);
  const firstNumber = (text: string) => text.match(/-?\d+(\.\d+)?/)?.[0];
  const desc = await slot.locator(".camp-slot__desc").first().innerText();
  const chip = await slot.locator(".camp-offer__delta").first().innerText();

  // Числа описания и вклада сходятся — но проверять это можно ТОЛЬКО когда условие карточки
  // сработало: у «+7.5% за героя с тегом» на ростере без таких героев вклад законно равен нулю.
  // На mock-датасете CI так и происходит, поэтому безусловное сравнение было бы ложным падением.
  // Сам класс ошибки «вклад посчитан без тира» ловится компилятором: `ItemContext.cardRarity`
  // обязателен, и забыть его в src нельзя.
  if (Number(firstNumber(chip) ?? 0) !== 0) {
    expect(firstNumber(chip)).toBe(firstNumber(desc));
  }
});
