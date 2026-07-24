import { describe, expect, it } from "vitest";
import {
  ECONOMY,
  RunEconomy,
  marketOffers,
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

  it("золотые reward-карты растут вместе со stage", () => {
    const stage1 = rewardOffers("s", 1).filter((offer) => offer.kind === "gold");
    const stage4 = rewardOffers("s", 4).filter((offer) => offer.kind === "gold");
    expect(stage1.map((offer) => offer.goldGain)).toEqual([3, 6]);
    expect(stage4.map((offer) => offer.goldGain)).toEqual([6, 12]);
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

/** Найти Буткемп, где reward выдаёт карточку нужного типа (набор детерминирован по seed+camp). */
function campWithCard(eco: RunEconomy, kind: "tactic" | "action"): string {
  for (let camp = 1; camp <= 5; camp += 1) {
    eco.openCamp(camp);
    const card = eco.campView().rewardOffers.find((o) => o.kind === kind);
    if (card) return card.id;
  }
  throw new Error(`no ${kind} reward offer in first 5 camps`);
}

describe("RunEconomy — карточки билда (срез 4)", () => {
  it("reward третьей картой выдаёт Tactic или Camp Action", () => {
    const eco = new RunEconomy("s");
    eco.openCamp(1);
    const third = eco.campView().rewardOffers[2];
    expect(["tactic", "action", "stat"]).toContain(third.kind);
  });

  it("взятая тактика занимает слот и не считается модификатором экономики", () => {
    const eco = new RunEconomy("tac");
    const cardId = campWithCard(eco, "tactic");
    expect(eco.chooseReward(cardId)).toBe(true);
    expect(eco.campView().equippedTactics.length).toBe(1);
    // Условные тактики не входят в economy.modifiers — их вклад считает game/tactics.
    expect(eco.totalModifier()).toBe(0);
  });

  it("нельзя взять больше трёх тактик; сброс освобождает слот", () => {
    const eco = new RunEconomy("many");
    let taken = 0;
    for (let camp = 1; camp <= 20 && taken < 4; camp += 1) {
      eco.openCamp(camp);
      const card = eco.campView().rewardOffers.find((o) => o.kind === "tactic");
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

  it("snapshot восстанавливает экипировку и разыгранные действия", () => {
    const eco = new RunEconomy("persist");
    const cardId = campWithCard(eco, "tactic");
    eco.chooseReward(cardId);
    const restored = new RunEconomy("persist", eco.snapshot);
    expect(restored.campView().equippedTactics).toEqual(eco.campView().equippedTactics);
    expect(restored.snapshot.ownedCards).toEqual(eco.snapshot.ownedCards);
  });
});
