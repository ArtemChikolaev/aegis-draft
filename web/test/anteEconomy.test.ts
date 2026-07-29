import { describe, expect, it } from "vitest";
import { runModifiers, runModifierTotal } from "../src/game/runStrength.ts";
import { rarityModifiers } from "../src/game/heroRarity.ts";
import {
  ECONOMY,
  RunEconomy,
  formUpgradeCost,
  interestFor,
  playerCost,
  rerollCostFor,
  marketOffers,
  playerOfferAffordable,
  prizeBreakdown,
  prizeForStage,
  rewardOffers,
} from "../src/game/anteEconomy.ts";

describe("prizeForStage", () => {
  it("база растёт по этапам, первое место даёт одинаковый performance-cap", () => {
    expect(prizeForStage("7-8", 8, 1)).toBe(ECONOMY.prizeBase);
    expect(prizeForStage("3", 3, 4))
      .toBe(ECONOMY.prizeBase + 3 * ECONOMY.prizeStageStep);
    expect(prizeForStage("1", 10, 1))
      .toBe(ECONOMY.prizeBase + ECONOMY.prizePerformanceMax);
    expect(prizeForStage("1", 3, 4))
      .toBe(ECONOMY.prizeBase + 3 * ECONOMY.prizeStageStep + ECONOMY.prizePerformanceMax);
    expect(prizeForStage(null, 8, 2))
      .toBe(ECONOMY.prizeBase + ECONOMY.prizeStageStep);
  });

  it("место хуже порога не даёт отрицательного бонуса", () => {
    expect(prizeForStage("9-12", 8, 1)).toBe(ECONOMY.prizeBase);
  });

  it("overperformance учитывает относительный отрыв от порога, а не ширину раннего stage", () => {
    expect(prizeForStage("2", 6, 2)).toBe(6);
    expect(prizeForStage("2", 3, 4)).toBe(8);
  });
});

describe("детерминизм офферов", () => {
  it("тот же seed+campId → те же reward-офферы", () => {
    expect(rewardOffers("s", 1)).toEqual(rewardOffers("s", 1));
    expect(rewardOffers("s", 1)).not.toEqual(rewardOffers("s", 2));
  });

  it("золотая reward-карта растёт вместе со stage и она одна", () => {
    // R4.3: пара «мало/много золота» была доминируемым выбором и убрана — золотая карта одна,
    // а конкурируют с ней содержательно другие награды.
    const stage1 = rewardOffers("s", 1).filter((offer) => offer.kind === "gold");
    const stage4 = rewardOffers("s", 4).filter((offer) => offer.kind === "gold");
    expect(stage1).toHaveLength(1);
    expect(stage1[0].goldGain).toBe(ECONOMY.rewardGold.base);
    expect(stage4[0].goldGain).toBe(ECONOMY.rewardGold.base + 3 * ECONOMY.rewardGold.stageStep);
  });

  it("R4.3: три награды — разные виды пользы, без доминируемых пар", () => {
    for (let camp = 1; camp <= 6; camp += 1) {
      const kinds = rewardOffers("variety", camp).map((offer) => offer.kind);
      expect(kinds).toHaveLength(3);
      // Деньги / билд / утилита — ни один вид не повторяется, поэтому «строго лучше» невозможно.
      expect(new Set(kinds).size).toBe(3);
      expect(kinds[0]).toBe("gold");
      // Предметы (R8.3) — тот же класс пассивной карточки, что тактики: делят слоты и пул.
      expect(["tactic", "item", "action", "stat"]).toContain(kinds[1]);
      expect(["reroll", "quality"]).toContain(kinds[2]);
    }
  });

  it("R4.3: без мета-гейта улучшений утилита всегда «поиск», а не «качество»", () => {
    for (let camp = 1; camp <= 6; camp += 1) {
      expect(rewardOffers("gate", camp, [], undefined, false)[2].kind).toBe("reroll");
    }
  });

  it("тот же seed+campId+rerollN → те же market-офферы; reroll меняет набор", () => {
    expect(marketOffers("s", 1, 0)).toEqual(marketOffers("s", 1, 0));
    // разный rerollN → другие id и (как правило) другое качество
    const a = marketOffers("s", 1, 0);
    const b = marketOffers("s", 1, 1);
    expect(a.map((o) => o.id)).not.toEqual(b.map((o) => o.id));
  });

  it("market покрывает все три слагаемых", () => {
    const summands = marketOffers("s", 0, 0).map((o) => o.effect?.summand).sort();
    expect(summands).toEqual(["base", "chemistry", "heroSynergy"]);
  });
});

describe("RunEconomy — покупки и модификаторы", () => {
  it("призовые идемпотентны на camp", () => {
    const eco = new RunEconomy("s");
    eco.awardStageClear(1, "3-4", 8);
    const afterFirst = eco.gold;
    eco.awardStageClear(1, "3-4", 8); // повтор того же camp — no-op
    expect(eco.gold).toBe(afterFirst);
    eco.awardStageClear(2, "7-8", 4); // другой camp — начисляет
    expect(eco.gold).toBeGreaterThan(afterFirst);
  });

  it("покупка market применяет дельту слагаемого и списывает золото", () => {
    const eco = new RunEconomy("s");
    eco.awardStageClear(1, "1", 8); // набрать золота
    eco.openCamp(1);
    const before = eco.gold;
    const offer = eco.campView().marketOffers[0];
    expect(eco.buyMarket(offer.id)).toBe(true);
    expect(eco.gold).toBe(before - offer.cost);
    const mod = eco.modifiers();
    expect(mod[offer.effect!.summand]).toBeGreaterThan(0);
    // totalModifier учитывает и trade-off
    const expectedTotal = offer.effect!.delta + (offer.effect!.tradeoffDelta ?? 0);
    expect(eco.totalModifier()).toBeCloseTo(expectedTotal);
  });

  it("нельзя купить в минус", () => {
    const eco = new RunEconomy("s"); // 0 золота
    eco.openCamp(1);
    const offer = eco.campView().marketOffers.find((o) => o.cost > 0)!;
    expect(eco.buyMarket(offer.id)).toBe(false);
    expect(eco.gold).toBe(0);
    expect(eco.totalModifier()).toBe(0);
  });

  it("купленный оффер исчезает из рынка", () => {
    const eco = new RunEconomy("s");
    eco.awardStageClear(1, "1", 8);
    eco.openCamp(1);
    const offer = eco.campView().marketOffers[0];
    eco.buyMarket(offer.id);
    expect(eco.campView().marketOffers.find((o) => o.id === offer.id)).toBeUndefined();
  });

  it("reward выбирается один раз за Буткемп", () => {
    const eco = new RunEconomy("s");
    eco.openCamp(1);
    const [first, second] = eco.campView().rewardOffers;
    expect(eco.chooseReward(first.id)).toBe(true);
    expect(eco.chooseReward(second.id)).toBe(false); // уже выбрано
    expect(eco.campView().rewardChosen).toBe(true);
  });

  it("reroll списывает цену и не уходит в минус", () => {
    const eco = new RunEconomy("s"); // 0 золота
    eco.openCamp(1);
    expect(eco.rerollMarket()).toBe(false); // не хватает
    eco.awardStageClear(1, "1", 8);
    expect(eco.rerollMarket()).toBe(true);
    expect(eco.gold).toBeGreaterThanOrEqual(0);
  });
});

describe("RunEconomy — сериализация", () => {
  it("snapshot восстанавливает состояние (детерминизм офферов по seed)", () => {
    const eco = new RunEconomy("s");
    eco.awardStageClear(1, "1", 8);
    eco.openCamp(1);
    const offer = eco.campView().marketOffers[0];
    eco.buyMarket(offer.id);
    const restored = new RunEconomy("s", eco.snapshot);
    expect(restored.gold).toBe(eco.gold);
    expect(restored.totalModifier()).toBe(eco.totalModifier());
    // офферы того же Буткемпа воспроизводятся, купленный по-прежнему скрыт
    expect(restored.campView().marketOffers.map((o) => o.id))
      .toEqual(eco.campView().marketOffers.map((o) => o.id));
  });
});

/** Найти Буткемп, где reward выдаёт карточку нужного класса (набор детерминирован по seed+camp).
 *  `passive` — тактика ИЛИ предмет: после R8.3 они делят слоты, и тестам важен именно класс. */
function campWithCard(eco: RunEconomy, kind: "passive" | "action"): string {
  const matches = (offerKind: string) => kind === "action"
    ? offerKind === "action"
    : offerKind === "tactic" || offerKind === "item";
  for (let camp = 1; camp <= 12; camp += 1) {
    eco.openCamp(camp);
    const card = eco.campView().rewardOffers.find((o) => matches(o.kind));
    if (card) return card.id;
  }
  throw new Error(`no ${kind} reward offer in first 12 camps`);
}

describe("RunEconomy — карточки билда (срез 4)", () => {
  it("reward второй картой выдаёт пассивную карточку или Camp Action", () => {
    const eco = new RunEconomy("s");
    eco.openCamp(1);
    const build = eco.campView().rewardOffers[1];
    expect(["tactic", "item", "action", "stat"]).toContain(build.kind);
  });

  it("взятая тактика занимает слот и не считается модификатором экономики", () => {
    const eco = new RunEconomy("tac");
    const cardId = campWithCard(eco, "passive");
    expect(eco.chooseReward(cardId)).toBe(true);
    expect(eco.campView().equippedTactics.length).toBe(1);
    // Условные тактики не входят в economy.modifiers — их вклад считает game/tactics.
    expect(eco.totalModifier()).toBe(0);
  });

  it("нельзя взять больше трёх пассивных карточек; сброс освобождает слот", () => {
    const eco = new RunEconomy("many");
    let taken = 0;
    for (let camp = 1; camp <= 40 && taken < 4; camp += 1) {
      eco.openCamp(camp);
      const card = eco.campView().rewardOffers.find((o) => o.kind === "tactic" || o.kind === "item");
      if (card && eco.chooseReward(card.id)) taken += 1;
    }
    expect(eco.campView().equippedTactics.length).toBe(3);
    const first = eco.campView().equippedTactics[0];
    expect(eco.discardTactic(first)).toBe(true);
    expect(eco.campView().equippedTactics.length).toBe(2);
  });

  it("одна и та же карта не выпадает дважды (ownedCards)", () => {
    const eco = new RunEconomy("dup");
    const seen = new Set<string>();
    for (let camp = 1; camp <= 10; camp += 1) {
      eco.openCamp(camp);
      const card = eco.campView().rewardOffers.find((o) => o.kind === "tactic" || o.kind === "action");
      if (card?.cardId && eco.chooseReward(card.id)) {
        expect(seen.has(card.cardId)).toBe(false);
        seen.add(card.cardId);
      }
    }
  });

  it("Camp Action разыгрывается на один этап и сгорает на следующем Буткемпе", () => {
    const eco = new RunEconomy("act");
    const cardId = campWithCard(eco, "action");
    const campStage = eco.snapshot.campStageIndex;
    eco.chooseReward(cardId);
    const actionId = eco.campView().heldActions[0];
    expect(eco.playCampAction(actionId)).toBe(true);
    // Статовые действия дают временный эффект; утилитарные — разведку/бесплатную замену.
    const view = eco.campView();
    const hasEffect = view.temporary.length > 0;
    const hasUtility = view.scouted || view.freePlayerSwaps > 0;
    expect(hasEffect || hasUtility).toBe(true);
    // Следующий Буткемп чистит временные эффекты.
    eco.openCamp(campStage + 1);
    expect(eco.campView().temporary).toEqual([]);
  });

  it("карточный reward не меняет личность после того, как его взяли", () => {
    // Регресс: cardOffer фильтровал ownedCards, поэтому после взятия карта под тем же id
    // «переезжала» на другую (взяли Old Teammates — показывалось Fresh Project с ✓).
    const eco = new RunEconomy("stable");
    let cardCamp = 0;
    for (let camp = 1; camp <= 5; camp += 1) {
      eco.openCamp(camp);
      if (eco.campView().rewardOffers[2].kind !== "gold") { cardCamp = camp; break; }
    }
    expect(cardCamp).toBeGreaterThan(0);
    const before = eco.campView().rewardOffers[2];
    expect(eco.chooseReward(before.id)).toBe(true);
    const after = eco.campView().rewardOffers[2];
    expect(after.id).toBe(before.id);
    expect(after.kind).toBe(before.kind);
    expect(after.cardId).toBe(before.cardId);
  });

  it("stand-in делает дорогую замену игрока доступной и бесплатной (регресс live-бага)", () => {
    // UI не давал купить игрока за 7 при 6 золота, хотя был бесплатный свап от Stand-in.
    expect(playerOfferAffordable(7, 6, 1)).toBe(true);  // бесплатный свап игнорирует цену
    expect(playerOfferAffordable(7, 6, 0)).toBe(false); // без свапа — по золоту
    expect(playerOfferAffordable(5, 6, 0)).toBe(true);
  });

  it("редкость героев (срез 3b): дропы, ролл, улучшение, персист", () => {
    const eco = new RunEconomy("rar");
    eco.openCamp(3);
    // Первый забег: случайных повышенных качеств нет...
    expect(eco.rarityDropsEnabled).toBe(false);
    expect(eco.rollHeroRarity(14, 3)).toBe("common");
    // ...но ручное улучшение доступно сразу (R3.1: раньше один флаг глушил и его — баг PF-8).
    expect(eco.rarityUpgradesEnabled).toBe(true);
    expect(eco.rarityUpgradeCost(14)).not.toBeNull();

    eco.setRarityFlags({ drops: true, upgrades: true });
    eco.awardStageClear(3, "1", 4); // немного золота
    eco.awardStageClear(4, "1", 3);
    // Ролл детерминирован и записывается в карту (не-common).
    const rolled = eco.rollHeroRarity(14, 5);
    expect(rolled).toBe(eco.rarityOf(14));
    // Улучшение поднимает тир текущего героя и списывает золото.
    const heroId = 99;
    const before = eco.rarityOf(heroId); // common
    const cost = eco.rarityUpgradeCost(heroId)!;
    const goldBefore = eco.gold;
    expect(eco.upgradeHeroRarity(heroId)).toBe(true);
    expect(eco.rarityOf(heroId)).not.toBe(before);
    expect(eco.gold).toBe(goldBefore - cost);
    // Персист восстанавливает карту и обе оси гейта.
    const restored = new RunEconomy("rar", eco.snapshot);
    expect(restored.rarityDropsEnabled).toBe(true);
    expect(restored.rarityUpgradesEnabled).toBe(true);
    expect(restored.heroRarity).toEqual(eco.heroRarity);
  });

  // R11.2: тир карточки-предмета. Гейт тот же, что у дропов героя; тир едет на оффере и
  // фиксируется при взятии — второй ролл был бы вторым источником правды.
  it("качество предметов: гейт, тир на оффере, персист", () => {
    const first = new RunEconomy("card-rarity-first");
    first.openCamp(6);
    for (const offer of first.campView().rewardOffers) {
      if (offer.kind === "item") expect(offer.cardRarity).toBeUndefined();
    }

    // Дропы открыты: ищем Буткемп, где билд-карта — предмет, и берём её.
    const eco = new RunEconomy("card-rarity");
    eco.setRarityFlags({ drops: true, upgrades: true });
    let taken: { id: string; rarity: string } | null = null;
    for (let camp = 1; camp <= 40 && !taken; camp += 1) {
      eco.openCamp(camp);
      const offer = eco.campView().rewardOffers.find((o) => o.kind === "item");
      if (!offer?.cardId || !offer.cardRarity || offer.cardRarity === "common") continue;
      expect(eco.chooseReward(offer.id)).toBe(true);
      taken = { id: offer.cardId, rarity: offer.cardRarity };
    }
    expect(taken).not.toBeNull();
    expect(eco.cardRarity[taken!.id]).toBe(taken!.rarity);
    // Персист восстанавливает карту тиров как есть.
    expect(new RunEconomy("card-rarity", eco.snapshot).cardRarity).toEqual(eco.cardRarity);
  });

  it("R3.1: первый забег качает героя руками, но не получает случайных дропов", () => {
    const eco = new RunEconomy("first-run");
    eco.setRarityFlags({ drops: false, upgrades: true });
    eco.openCamp(1);
    eco.awardStageClear(1, "1", 8);
    eco.awardStageClear(2, "1", 6);
    // Любой ролл рынка остаётся common, каким бы поздним ни был этап.
    for (const stage of [1, 5, 9]) expect(eco.rollHeroRarity(42, stage)).toBe("common");
    // Но common можно поднять до unique за золото, и это переживает resume.
    expect(eco.upgradeHeroRarity(42)).toBe(true);
    expect(eco.rarityOf(42)).toBe("unique");
    const view = eco.campView();
    expect(view.rarityUpgradesEnabled).toBe(true);
    expect(view.rarityDropsEnabled).toBe(false);
    expect(new RunEconomy("first-run", eco.snapshot).rarityOf(42)).toBe("unique");
  });

  it("R3.1: legacy-сейв с одним rarityEnabled поднимается в обе оси", () => {
    // Настоящий legacy-сейв новых полей НЕ содержит вовсе — только один rarityEnabled.
    const legacy = (enabled: boolean) => {
      const state = { ...new RunEconomy("legacy").snapshot, rarityEnabled: enabled };
      delete (state as Partial<typeof state>).rarityDropsEnabled;
      delete (state as Partial<typeof state>).rarityUpgradesEnabled;
      return state as never;
    };
    const legacyOn = legacy(true);
    const on = new RunEconomy("legacy", legacyOn);
    expect(on.rarityDropsEnabled).toBe(true);
    expect(on.rarityUpgradesEnabled).toBe(true);

    // Забег, начатый ДО фикса как «первый» (всё выключено), не должен менять правила на середине.
    const legacyOff = legacy(false);
    const off = new RunEconomy("legacy", legacyOff);
    expect(off.rarityDropsEnabled).toBe(false);
    expect(off.rarityUpgradesEnabled).toBe(false);
  });

  it("R2.2: Cheat Mode обходит ТОЛЬКО золото — токены, слоты и валидация как обычно", () => {
    const eco = new RunEconomy("cheat");
    eco.setUnlimitedGold(true);
    eco.openCamp(2);
    expect(eco.gold).toBe(0); // призовые ещё не начислены

    // Покупка/реролл/улучшение проходят при нулевом балансе и его не двигают.
    expect(eco.rerollMarket()).toBe(true);
    expect(eco.upgradeHeroRarity(7)).toBe(true);
    expect(eco.rarityOf(7)).toBe("unique");
    expect(eco.gold).toBe(0);
    expect(eco.campView().canReroll).toBe(true);
    expect(eco.campView().unlimitedGold).toBe(true);

    // Валидация payload не отключается: несуществующий оффер по-прежнему не покупается.
    expect(eco.purchaseMarket("mkt-нет-такого")).toBeNull();
    // Слоты карточек тоже не расширяются — Cheat Mode даёт золото, а не место в билде.
    const slots = eco.campView().tacticSlots;
    for (let i = 0; i < slots; i += 1) expect(eco.canTakeCard("tactic")).toBe(true);
    eco.chooseReward(campWithCard(eco, "passive"));
    expect(eco.campView().equippedTactics).toHaveLength(1);

    // Persist/resume сохраняет режим.
    expect(new RunEconomy("cheat", eco.snapshot).unlimitedGold).toBe(true);
    // Обычный забег ведёт себя как раньше.
    const normal = new RunEconomy("normal");
    normal.openCamp(2);
    expect(normal.rerollMarket()).toBe(false); // нет золота
  });

  it("R2.2: playerOfferAffordable в Cheat Mode не блокирует дорогую карту", () => {
    expect(playerOfferAffordable(99, 0, 0, true)).toBe(true);
    expect(playerOfferAffordable(99, 0, 0, false)).toBe(false);
    expect(playerOfferAffordable(99, 0, 0)).toBe(false); // дефолт — обычный забег
  });

  it("snapshot восстанавливает экипировку и разыгранные действия", () => {
    const eco = new RunEconomy("persist");
    const cardId = campWithCard(eco, "passive");
    eco.chooseReward(cardId);
    const restored = new RunEconomy("persist", eco.snapshot);
    expect(restored.campView().equippedTactics).toEqual(eco.campView().equippedTactics);
    expect(restored.snapshot.ownedCards).toEqual(eco.snapshot.ownedCards);
  });
});

// R4.2: реролл дорожает внутри Буткемпа и сбрасывается в следующем (принцип магазина Balatro).
describe("Дорожающий реролл рынка", () => {
  it("цена растёт по счётчику и сбрасывается в новом Буткемпе", () => {
    expect([0, 1, 2, 3].map(rerollCostFor)).toEqual([2, 3, 4, 5]);

    const eco = new RunEconomy("reroll");
    eco.openCamp(1);
    eco.awardStageClear(1, "1", 8);
    const paid: number[] = [];
    let gold = eco.gold;
    while (eco.campView().canReroll && paid.length < 3) {
      const cost = eco.campView().rerollCost;
      expect(eco.rerollMarket()).toBe(true);
      expect(eco.gold).toBe(gold - cost);
      gold = eco.gold;
      paid.push(cost);
    }
    // Каждый следующий реролл в том же Буткемпе дороже предыдущего.
    expect(paid.length).toBeGreaterThan(1);
    for (let i = 1; i < paid.length; i += 1) expect(paid[i]).toBeGreaterThan(paid[i - 1]);

    // Следующий Буткемп — цена снова базовая.
    eco.openCamp(2);
    expect(eco.campView().rerollCost).toBe(rerollCostFor(0));
  });

  it("бесплатный реролл от разведки не двигает цену следующего", () => {
    const eco = new RunEconomy("reroll-free");
    eco.openCamp(1);
    const before = eco.campView().rerollCost;
    eco.setUnlimitedGold(true); // чтобы дойти до реролла без призовых
    expect(eco.rerollMarket()).toBe(true);
    expect(eco.campView().rerollCost).toBeGreaterThan(before);
  });
});

// R5.3: за человека уже заплачено — апгрейд его формы идёт по trade-in.
describe("Цена апгрейда формы", () => {
  it("дешевле покупки того же игрока со стороны, но не бесплатна", () => {
    const incoming = 88;
    const current = 80;
    const full = playerCost(incoming);
    const upgrade = formUpgradeCost(incoming, current);
    expect(upgrade).toBeLessThan(full);
    expect(upgrade).toBeGreaterThanOrEqual(ECONOMY.formUpgradeMinCost);
  });

  it("сайдгрейд и даунгрейд не становятся бесплатными", () => {
    expect(formUpgradeCost(80, 80)).toBeGreaterThanOrEqual(ECONOMY.formUpgradeMinCost);
    expect(formUpgradeCost(70, 92)).toBeGreaterThanOrEqual(ECONOMY.formUpgradeMinCost);
  });

  it("чем сильнее входящая форма, тем дороже апгрейд", () => {
    expect(formUpgradeCost(92, 80)).toBeGreaterThan(formUpgradeCost(84, 80));
  });
});

// R4.3: проценты за накопление и награды-токены.
describe("Проценты за накопление", () => {
  it("растут по удержанному золоту и упираются в cap", () => {
    expect(interestFor(0)).toBe(0);
    expect(interestFor(ECONOMY.interestPerGold - 1)).toBe(0);
    expect(interestFor(ECONOMY.interestPerGold)).toBe(1);
    expect(interestFor(ECONOMY.interestPerGold * 2)).toBe(2);
    expect(interestFor(ECONOMY.interestPerGold * 99)).toBe(ECONOMY.interestCap);
  });

  it("начисляются вместе с призовыми и показываются раздельно", () => {
    const eco = new RunEconomy("interest");
    // Первый Буткемп: копить было нечего — только призовые.
    eco.awardStageClear(1, "1", 8);
    // Премия за место — своя строка выплаты (R6.4): чемпионство на этапе с порогом топ-8 платит
    // сверх базы, и игрок должен видеть, за что именно ему заплатили.
    expect(eco.snapshot.lastPayout).toEqual({
      prize: prizeBreakdown("1", 8, 1).base,
      performance: prizeBreakdown("1", 8, 1).performance,
      interest: 0,
    });
    expect(eco.snapshot.lastPayout!.prize + eco.snapshot.lastPayout!.performance)
      .toBe(prizeForStage("1", 8, 1));

    // Второй: на руках уже есть баланс → сверху проценты с него.
    const held = eco.gold;
    eco.awardStageClear(2, "1", 6);
    const payout = eco.snapshot.lastPayout!;
    expect(payout.interest).toBe(interestFor(held));
    expect(eco.gold).toBe(held + payout.prize + payout.performance + payout.interest);
  });

  it("накопить приносит проценты, спустить всё в ноль — нет", () => {
    const saver = new RunEconomy("saver");
    const spender = new RunEconomy("saver");
    for (const eco of [saver, spender]) eco.awardStageClear(1, "1", 8);
    expect(saver.gold).toBeGreaterThanOrEqual(ECONOMY.interestPerGold);

    // «Транжира» сжигает баланс реролами до нуля, «копящий» держит его.
    spender.openCamp(1);
    while (spender.campView().canReroll) spender.rerollMarket();
    expect(spender.gold).toBeLessThan(ECONOMY.interestPerGold);

    for (const eco of [saver, spender]) eco.awardStageClear(2, "1", 6);
    expect(saver.snapshot.lastPayout!.interest)
      .toBeGreaterThan(spender.snapshot.lastPayout!.interest);
  });

  it("в Cheat Mode проценты не начисляются", () => {
    const eco = new RunEconomy("cheat-interest");
    eco.setUnlimitedGold(true);
    eco.awardStageClear(1, "1", 8);
    eco.awardStageClear(2, "1", 6);
    expect(eco.snapshot.lastPayout!.interest).toBe(0);
  });
});

describe("Награды-токены", () => {
  function rewardOfKind(eco: RunEconomy, kind: "reroll" | "quality"): string | null {
    for (let camp = 1; camp <= 12; camp += 1) {
      eco.openCamp(camp);
      const offer = eco.campView().rewardOffers.find((o) => o.kind === kind);
      if (offer) return offer.id;
    }
    return null;
  }

  it("«Скауты» дают бесплатные реролы и не тратят золото", () => {
    const eco = new RunEconomy("tokens-reroll");
    const id = rewardOfKind(eco, "reroll");
    expect(id).not.toBeNull();
    expect(eco.chooseReward(id!)).toBe(true);
    const view = eco.campView();
    expect(view.freeMarketRerolls).toBe(ECONOMY.rewardReroll.tokens);
    const goldBefore = eco.gold;
    expect(eco.rerollMarket()).toBe(true);
    expect(eco.gold).toBe(goldBefore); // реролл бесплатный
    expect(eco.campView().freeMarketRerolls).toBe(ECONOMY.rewardReroll.tokens - 1);
  });

  it("«Тренировочный блок» делает улучшение качества бесплатным ровно один раз", () => {
    const eco = new RunEconomy("tokens-quality");
    const id = rewardOfKind(eco, "quality");
    expect(id).not.toBeNull();
    expect(eco.chooseReward(id!)).toBe(true);
    expect(eco.campView().freeRarityUpgrades).toBe(ECONOMY.rewardQuality.tokens);

    // Золота нет, но токен есть → улучшение проходит и не уводит баланс в минус.
    expect(eco.gold).toBe(0);
    expect(eco.upgradeHeroRarity(11)).toBe(true);
    expect(eco.rarityOf(11)).toBe("unique");
    expect(eco.gold).toBe(0);
    expect(eco.campView().freeRarityUpgrades).toBe(0);
    // Второй раз без золота уже нельзя.
    expect(eco.upgradeHeroRarity(11)).toBe(false);
  });

  it("токены переживают resume", () => {
    const eco = new RunEconomy("tokens-persist");
    const id = rewardOfKind(eco, "quality") ?? rewardOfKind(eco, "reroll")!;
    eco.chooseReward(id);
    const restored = new RunEconomy("tokens-persist", eco.snapshot);
    expect(restored.campView().freeRarityUpgrades).toBe(eco.campView().freeRarityUpgrades);
    expect(restored.campView().freeMarketRerolls).toBe(eco.campView().freeMarketRerolls);
  });
});

// R10: композиция силы забега — одна на игру и на балансовый симулятор. Копии этой суммы уже
// разъезжались (симулятор мерил билд без редкости и тактик, а по его числам калибровались
// коэффициенты), поэтому инвариант зафиксирован тестом.
describe("Композиция силы забега", () => {
  const zero = { base: 0, heroSynergy: 0, chemistry: 0 };

  it("складывает экономику, тактики и редкость активных героев", () => {
    const input = {
      economy: { base: 2, heroSynergy: 1, chemistry: 0.5 },
      tactics: { base: 1, heroSynergy: 0, chemistry: 2 },
      heroRarity: { "11": "immortal" as const, "22": "unique" as const },
      activeHeroes: [11, 22],
    };
    const mods = runModifiers(input);
    const rarity = rarityModifiers(input.heroRarity, input.activeHeroes);
    expect(mods.base).toBeCloseTo(3 + rarity.base, 6);
    expect(mods.heroSynergy).toBeCloseTo(1 + rarity.heroSynergy, 6);
    expect(mods.chemistry).toBeCloseTo(2.5, 6);
    expect(runModifierTotal(input)).toBeCloseTo(mods.base + mods.heroSynergy + mods.chemistry, 6);
  });

  it("учитывает редкость только АКТИВНЫХ героев", () => {
    const heroRarity = { "11": "immortal" as const };
    const active = runModifiers({ economy: zero, tactics: null, heroRarity, activeHeroes: [11] });
    const benched = runModifiers({ economy: zero, tactics: null, heroRarity, activeHeroes: [99] });
    expect(active.heroSynergy).toBeGreaterThan(0);
    expect(benched).toEqual(zero);
  });

  it("без тактик и редкости равна модификаторам экономики", () => {
    const economy = { base: 4, heroSynergy: -1, chemistry: 0 };
    expect(runModifiers({ economy, tactics: null, heroRarity: {}, activeHeroes: [1, 2] }))
      .toEqual(economy);
  });
});
