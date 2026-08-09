// Editions (R13.5): Charged — заряды за этапы с выполненным условием, +bonus к эффекту карты.
import { describe, expect, it } from "vitest";
import { chargeFactor, EDITION } from "../src/game/editions.ts";
import { evaluateItems } from "../src/game/items.ts";
import { evaluateTactics, TACTICS, type TacticContext, type TacticPlayer } from "../src/game/tactics.ts";
import { RunEconomy, rewardOffers } from "../src/game/anteEconomy.ts";
import { ACT_LENGTH } from "../src/game/anteRun.ts";

describe("chargeFactor", () => {
  it("растёт на bonus за заряд и упирается в потолок", () => {
    expect(chargeFactor(0)).toBe(1);
    expect(chargeFactor(1)).toBeCloseTo(1 + EDITION.chargeBonus);
    expect(chargeFactor(EDITION.chargeCap)).toBeCloseTo(1 + EDITION.chargeBonus * EDITION.chargeCap);
    expect(chargeFactor(EDITION.chargeCap + 5)).toBeCloseTo(chargeFactor(EDITION.chargeCap));
    expect(chargeFactor(-2)).toBe(1);
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
    for (let i = 0; i < EDITION.chargeCap + 2; i++) withCards.accrueCharges(new Set(["noSuperstars"]));
    expect(withCards.cardCharges.noSuperstars).toBe(EDITION.chargeCap);
    withCards.accrueCharges(new Set());
    expect(withCards.cardCharges.noSuperstars).toBe(0);
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
