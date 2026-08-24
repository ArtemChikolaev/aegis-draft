// Editions (R13.5): Charged — заряды за этапы с выполненным условием, +bonus к эффекту карты.
import { describe, expect, it } from "vitest";
import { chargeCapForRarity, chargeFactor, EDITION, MAX_CHARGE_CAP, temperedPenaltyFactor } from "../src/game/editions.ts";
import { evaluateItems, protectedBossPenalty } from "../src/game/items.ts";
import { evaluateItems } from "../src/game/items.ts";
import { evaluateTactics, TACTICS, type TacticContext, type TacticPlayer } from "../src/game/tactics.ts";
import { ECONOMY, RunEconomy, rewardOffers } from "../src/game/anteEconomy.ts";
import { ACT_LENGTH } from "../src/game/anteRun.ts";

describe("chargeFactor", () => {
  it("растёт на bonus за заряд и упирается в страховочный максимум", () => {
    expect(chargeFactor(0)).toBe(1);
    expect(chargeFactor(1)).toBeCloseTo(1 + EDITION.chargeBonus);
    expect(chargeFactor(MAX_CHARGE_CAP)).toBeCloseTo(1 + EDITION.chargeBonus * MAX_CHARGE_CAP);
    expect(chargeFactor(MAX_CHARGE_CAP + 5)).toBeCloseTo(chargeFactor(MAX_CHARGE_CAP));
    expect(chargeFactor(-2)).toBe(1);
  });
});

describe("chargeCapForRarity", () => {
  it("потолок предмета растёт с тиром, тактика — фикс", () => {
    expect(chargeCapForRarity("common")).toBe(2);
    expect(chargeCapForRarity("unique")).toBe(3);
    expect(chargeCapForRarity("mythic")).toBe(4);
    expect(chargeCapForRarity("immortal")).toBe(5);
    expect(chargeCapForRarity(null)).toBe(EDITION.chargeCaps.tactic);
    expect(MAX_CHARGE_CAP).toBe(5);
  });
});

describe("заряды в evaluateItems", () => {
  // divineRapier: безусловный xMultFlat с drawback-ценой — детерминированный образец.
  const ctx = { activeHeroes: [] as number[], cardRarity: {}, cardCharges: {} };

  it("усиливает бонусную часть X Mult, а не весь множитель; drawback не растёт", () => {
    const plain = evaluateItems(["divineRapier"], ctx);
    const charged = evaluateItems(["divineRapier"], { ...ctx, cardCharges: { divineRapier: 2 } });
    const bonus = plain.xMults[0] - 1;
    expect(charged.xMults[0]).toBeCloseTo(1 + bonus * chargeFactor(2));
    expect(charged.goldPerCamp).toBe(plain.goldPerCamp);
  });

  it("нулевые заряды не меняют оценку", () => {
    const plain = evaluateItems(["divineRapier"], ctx);
    const zero = evaluateItems(["divineRapier"], { ...ctx, cardCharges: { divineRapier: 0 } });
    expect(zero).toEqual(plain);
  });
});

describe("заряды в evaluateTactics", () => {
  function player(over: Partial<TacticPlayer> & { accountId: number }): TacticPlayer {
    return { ovr: 80, eventYear: 2020, assignedHeroGames: 0, ...over };
  }
  function baseContext(): TacticContext {
    const players = [1, 2, 3, 4, 5].map((accountId) => player({ accountId }));
    const pairs = players.flatMap((a, i) =>
      players.slice(i + 1).map((b) => ({ a: a.accountId, b: b.accountId, games: 0 })));
    return { players, pairs, stagesCleared: 0 };
  }

  it("масштабирует вклад заряженной тактики и не трогает остальные", () => {
    const ctx = baseContext(); // все 80 OVR < starOvr → noSuperstars выполняется (summand chemistry)
    const plain = evaluateTactics(["noSuperstars"], ctx);
    const charged = evaluateTactics(["noSuperstars"], ctx, { noSuperstars: 3 });
    expect(plain.modifiers.chemistry).toBeCloseTo(TACTICS.noSuperstars.bonus);
    expect(charged.modifiers.chemistry).toBeCloseTo(TACTICS.noSuperstars.bonus * chargeFactor(3));
  });
});

describe("RunEconomy: заряды и Edition", () => {
  it("accrueCharges: активная копит до потолка, сломанное условие сжигает", () => {
    const economy = new RunEconomy("edition-test");
    const state = economy.snapshot;
    state.equippedTactics = ["noSuperstars"];
    state.cardEditions = { noSuperstars: "charged" };
    const withCards = new RunEconomy("edition-test", state);
    const cap = EDITION.chargeCaps.tactic;
    for (let i = 0; i < cap + 2; i++) withCards.accrueCharges(new Set(["noSuperstars"]));
    expect(withCards.cardCharges.noSuperstars).toBe(cap);
    withCards.accrueCharges(new Set());
    expect(withCards.cardCharges.noSuperstars).toBe(0);
  });

  it("потолок предмета зависит от тира; апгрейд тира поднимает потолок, заряды живут", () => {
    const economy = new RunEconomy("edition-test");
    const state = economy.snapshot;
    state.equippedTactics = ["divineRapier"];
    state.cardEditions = { divineRapier: "charged" };
    const withItem = new RunEconomy("edition-test", state);
    // Без записи тира предмет — standard: потолок 2.
    for (let i = 0; i < 4; i++) withItem.accrueCharges(new Set(["divineRapier"]));
    expect(withItem.cardCharges.divineRapier).toBe(2);
    // Тир вырос до arcana (immortal) — та же карта продолжает копить до 5.
    const upgraded = withItem.snapshot;
    upgraded.cardRarity = { divineRapier: "immortal" };
    const arcana = new RunEconomy("edition-test", upgraded);
    for (let i = 0; i < 4; i++) arcana.accrueCharges(new Set(["divineRapier"]));
    expect(arcana.cardCharges.divineRapier).toBe(5);
  });

  it("обычная карта зарядов не копит", () => {
    const economy = new RunEconomy("edition-test");
    const state = economy.snapshot;
    state.equippedTactics = ["noSuperstars"];
    const withCards = new RunEconomy("edition-test", state);
    withCards.accrueCharges(new Set(["noSuperstars"]));
    expect(withCards.cardCharges.noSuperstars).toBeUndefined();
  });

  it("discard заряженной карты очищает Edition и заряды", () => {
    const economy = new RunEconomy("edition-test");
    const state = economy.snapshot;
    state.equippedTactics = ["noSuperstars"];
    state.cardEditions = { noSuperstars: "charged" };
    state.cardCharges = { noSuperstars: 2 };
    const withCards = new RunEconomy("edition-test", state);
    expect(withCards.discardTactic("noSuperstars")).toBe(true);
    expect(withCards.cardEditions.noSuperstars).toBeUndefined();
    expect(withCards.cardCharges.noSuperstars).toBeUndefined();
  });

  it("снапшот переживает roundtrip с Edition-полями (и без них — legacy)", () => {
    const economy = new RunEconomy("edition-test");
    const state = economy.snapshot;
    state.cardEditions = { hyperstone: "charged" };
    state.cardCharges = { hyperstone: 1 };
    const restored = new RunEconomy("edition-test", JSON.parse(JSON.stringify(state)));
    expect(restored.cardEditions.hyperstone).toBe("charged");
    expect(restored.cardCharges.hyperstone).toBe(1);
    // Legacy-сейв без полей — обычные карты, не падение.
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.cardEditions;
    delete legacy.cardCharges;
    const legacyEconomy = new RunEconomy("edition-test", legacy);
    expect(legacyEconomy.cardEditions).toEqual({});
    expect(legacyEconomy.cardCharges).toEqual({});
  });
});

describe("Tempered (LG4): защита от штрафа босса", () => {
  it("temperedPenaltyFactor: множитель за каждую активную карту, 1 при нуле", () => {
    expect(temperedPenaltyFactor(0)).toBe(1);
    expect(temperedPenaltyFactor(1)).toBeCloseTo(EDITION.tempered.penaltyFactor);
    expect(temperedPenaltyFactor(2)).toBeCloseTo(EDITION.tempered.penaltyFactor ** 2);
    expect(temperedPenaltyFactor(-3)).toBe(1);
  });

  it("protectedBossPenalty применяет Tempered вместе с предметной защитой", () => {
    const noItems = evaluateItems([], { activeHeroes: [], cardRarity: {}, cardCharges: {} });
    expect(protectedBossPenalty(6, noItems, 0)).toBe(6);
    expect(protectedBossPenalty(6, noItems, 1)).toBeCloseTo(6 * EDITION.tempered.penaltyFactor);
    expect(protectedBossPenalty(-2, noItems, 1)).toBe(0); // отрицательный штраф клампится до нуля
  });

  it("дроп Tempered: подпоток не сдвигает charged-исходы и реально встречается", () => {
    const dropStage = ACT_LENGTH * (EDITION.minAct - 1);
    let charged = 0;
    let tempered = 0;
    for (let stage = dropStage; stage < dropStage + 60; stage += 1) {
      const card = rewardOffers("edition-seed", stage, []).find((o) => o.cardId != null);
      if (card?.cardEdition === "charged") charged += 1;
      if (card?.cardEdition === "tempered") tempered += 1;
    }
    // Charged на том же сиде выпадает по-прежнему (его поток не тронут), Tempered — появился.
    expect(charged).toBeGreaterThan(0);
    expect(tempered).toBeGreaterThan(0);
  });

  it("accrueCharges игнорирует Tempered: защитная ось зарядов не копит", () => {
    const economy = new RunEconomy("tempered-test");
    const state = economy.snapshot;
    state.equippedTactics = ["noSuperstars"];
    state.cardEditions = { noSuperstars: "tempered" };
    const withCard = new RunEconomy("tempered-test", state);
    withCard.accrueCharges(new Set(["noSuperstars"]));
    expect(withCard.cardCharges.noSuperstars).toBeUndefined();
  });

  it("chooseReward фиксирует Tempered из оффера", () => {
    const dropStage = ACT_LENGTH * (EDITION.minAct - 1);
    for (let stage = dropStage; stage < dropStage + 80; stage += 1) {
      const offers = rewardOffers("edition-seed", stage, []);
      const card = offers.find((o) => o.cardEdition === "tempered");
      if (!card || (card.kind !== "tactic" && card.kind !== "item")) continue;
      const economy = new RunEconomy("edition-seed");
      const state = economy.snapshot;
      state.campStageIndex = stage;
      state.inCamp = true;
      const inCamp = new RunEconomy("edition-seed", state);
      expect(inCamp.chooseReward(card.id)).toBe(true);
      expect(inCamp.cardEditions[card.cardId!]).toBe("tempered");
      return;
    }
    throw new Error("не нашлось Tempered-награды в диапазоне — ослаблен дроп?");
  });
});

describe("дроп Charged в карточной награде", () => {
  const dropStage = ACT_LENGTH * (EDITION.minAct - 1);

  it("до третьего акта Edition не выпадает", () => {
    for (let stage = 1; stage < dropStage; stage++) {
      for (const seed of ["s1", "s2", "s3"]) {
        const card = rewardOffers(seed, stage, []).find((o) => o.cardId != null);
        expect(card?.cardEdition).toBeUndefined();
      }
    }
  });

  it("с третьего акта дроп детерминирован и реально встречается", () => {
    let seen = 0;
    for (let stage = dropStage; stage < dropStage + 30; stage++) {
      const a = rewardOffers("edition-seed", stage, []);
      const b = rewardOffers("edition-seed", stage, []);
      expect(a).toEqual(b); // тот же seed+stage ⇒ тот же ролл
      if (a.find((o) => o.cardId != null)?.cardEdition === "charged") seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("оффер улучшения может зарядить взятую карту; arcana получает чистый edition-оффер", () => {
    // Инъекция через preparedRewardCard: ролл с нужным исходом искать не нужно — проверяем
    // ПРИМЕНЕНИЕ (валидация и запись), генерация покрыта тестом дропа и потоковой изоляцией.
    const makeEconomy = (rarity: "immortal" | "unique", edition?: "charged") => {
      const economy = new RunEconomy("edition-up");
      const state = economy.snapshot;
      state.inCamp = true;
      state.campStageIndex = dropStage;
      state.equippedTactics = ["divineRapier"];
      state.ownedCards = ["divineRapier"];
      state.cardRarity = { divineRapier: rarity };
      if (edition) state.cardEditions = { divineRapier: edition };
      state.preparedRewardCard = {
        id: `rwd-${dropStage}-1`, kind: "item", labelKey: "item.divineRapier", cost: 0,
        cardId: "divineRapier", cardRarity: rarity, cardUpgrade: true, cardEdition: "charged",
      };
      return new RunEconomy("edition-up", state);
    };
    // Arcana (immortal-тир): тир не растёт, но карта становится Charged.
    const arcana = makeEconomy("immortal");
    expect(arcana.chooseReward(`rwd-${dropStage}-1`)).toBe(true);
    expect(arcana.cardEditions.divineRapier).toBe("charged");
    expect(arcana.cardRarity.divineRapier).toBe("immortal");
    // Уже Charged: оффер без оси роста отклоняется.
    const already = makeEconomy("immortal", "charged");
    expect(already.chooseReward(`rwd-${dropStage}-1`)).toBe(false);
  });

  it("chooseReward фиксирует Edition из оффера, заряды стартуют с нуля", () => {
    // Ищем этап, где карточная награда пришла Charged и картой-тактикой/предметом.
    for (let stage = dropStage; stage < dropStage + 40; stage++) {
      const offers = rewardOffers("edition-seed", stage, []);
      const card = offers.find((o) => o.cardEdition === "charged");
      if (!card || (card.kind !== "tactic" && card.kind !== "item")) continue;
      const economy = new RunEconomy("edition-seed");
      const state = economy.snapshot;
      state.campStageIndex = stage;
      state.inCamp = true;
      const inCamp = new RunEconomy("edition-seed", state);
      expect(inCamp.chooseReward(card.id)).toBe(true);
      expect(inCamp.cardEditions[card.cardId!]).toBe("charged");
      expect(inCamp.cardCharges[card.cardId!]).toBeUndefined();
      return;
    }
    throw new Error("не нашлось Charged-награды в диапазоне — ослаблен дроп?");
  });
});

describe("RunEconomy: токены зачарования (LG6)", () => {
  it("титул платит токеном; enchant валидирует токен/экипировку/повтор; заряды стартуют с нуля", () => {
    const economy = new RunEconomy("enchant-test");
    const state = economy.snapshot;
    state.equippedTactics = ["noSuperstars", "divineRapier"];
    state.cardEditions = { divineRapier: "tempered" };
    const run = new RunEconomy("enchant-test", state);
    // Без токена зачаровать нельзя.
    expect(run.enchantCard("noSuperstars", "charged")).toBe(false);
    expect(run.awardDynastyTitle(30)).toBe(true);
    expect(run.editionTokens).toBe(ECONOMY.dynastyMilestone.editionTokens);
    // Идемпотентность титула: повторный лагерь токен не удваивает.
    expect(run.awardDynastyTitle(30)).toBe(false);
    expect(run.editionTokens).toBe(1);
    // Кандидаты — только экипированные без Edition.
    expect(run.enchantableCards()).toEqual(["noSuperstars"]);
    expect(run.enchantCard("divineRapier", "charged")).toBe(false); // уже Tempered
    expect(run.enchantCard("ghost-card", "charged")).toBe(false);   // не экипирована
    expect(run.enchantCard("noSuperstars", "charged")).toBe(true);
    expect(run.editionTokens).toBe(0);
    expect(run.cardEditions.noSuperstars).toBe("charged");
    expect(run.cardCharges.noSuperstars).toBe(0);
    // Токен потрачен — вторую карту зачаровать нечем.
    expect(run.enchantCard("noSuperstars", "tempered")).toBe(false);
    // Зачарованная Charged копит заряды как выпавшая.
    run.accrueCharges(new Set(["noSuperstars"]));
    expect(run.cardCharges.noSuperstars).toBe(1);
  });

  it("токены переживают persist round-trip; legacy-сейв без поля читается нулём", () => {
    const economy = new RunEconomy("enchant-persist");
    const base = economy.snapshot;
    base.equippedTactics = ["noSuperstars"];
    const run = new RunEconomy("enchant-persist", base);
    run.awardDynastyTitle(30);
    run.awardDynastyTitle(35);
    const restored = new RunEconomy("enchant-persist", run.snapshot);
    expect(restored.editionTokens).toBe(2);
    // Legacy: поле отсутствует в сейве.
    const legacy = { ...run.snapshot } as Record<string, unknown>;
    delete legacy.editionTokens;
    const fromLegacy = new RunEconomy("enchant-persist", legacy as never);
    expect(fromLegacy.editionTokens).toBe(0);
  });
});
