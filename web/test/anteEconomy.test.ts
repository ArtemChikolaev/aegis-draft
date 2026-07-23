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
