// Trade-in карт билда (LG1, R12.6): офферы, перенос тира −1, очистка Edition, реролл.
import { describe, expect, it } from "vitest";
import {
  ECONOMY,
  RunEconomy,
  rerollCostFor,
  tradeInRarity,
  tradeOffers,
  type RunEconomyState,
} from "../src/game/anteEconomy.ts";
import { isItemId, ITEM_IDS } from "../src/game/items.ts";
import { isTacticId } from "../src/game/tactics.ts";

function economyWith(mutate: (state: RunEconomyState) => void, seed = "trade-test"): RunEconomy {
  const base = new RunEconomy(seed);
  const state = base.snapshot;
  state.inCamp = true;
  state.campStageIndex = 3;
  state.gold = 20;
  mutate(state);
  return new RunEconomy(seed, state);
}

describe("tradeOffers", () => {
  it("детерминированы, не содержат взятого и меняются рероллом", () => {
    const a = tradeOffers("s", 3, [], 0);
    expect(a).toEqual(tradeOffers("s", 3, [], 0));
    expect(a).toHaveLength(ECONOMY.tradePackSize);
    const b = tradeOffers("s", 3, [], 1);
    expect(b).not.toEqual(a);
    const owned = a[0];
    expect(tradeOffers("s", 3, [owned], 0)).not.toContain(owned);
    for (const id of a) expect(isItemId(id) || isTacticId(id)).toBe(true);
  });
});

describe("tradeInRarity", () => {
  it("переносит тир на один вниз с полом common", () => {
    expect(tradeInRarity("immortal")).toBe("mythic");
    expect(tradeInRarity("unique")).toBe("common");
    expect(tradeInRarity("common")).toBe("common");
  });
});

describe("RunEconomy.tradeCard", () => {
  const outId = ITEM_IDS[0];

  it("меняет карту слота, переносит тир −1 и списывает золото", () => {
    const economy = economyWith((state) => {
      state.equippedTactics = [outId];
      state.ownedCards = [outId];
      state.cardRarity = { [outId]: "mythic" };
    });
    const incoming = economy.currentTradeOffers()[0];
    expect(economy.tradeCard(outId, incoming)).toBe(true);
    expect(economy.equippedTactics).toEqual([incoming]);
    expect(economy.gold).toBe(20 - ECONOMY.tradeInCost);
    expect(economy.snapshot.ownedCards).toContain(incoming);
    expect(economy.snapshot.ownedCards).toContain(outId);
    expect(economy.cardRarity[outId]).toBeUndefined();
    if (isItemId(incoming)) expect(economy.cardRarity[incoming]).toBe("unique");
    else expect(economy.cardRarity[incoming]).toBeUndefined();
  });

  it("Edition и заряды уходящей сгорают, тактика отдаёт common", () => {
    const economy = economyWith((state) => {
      state.equippedTactics = ["noSuperstars"];
      state.ownedCards = ["noSuperstars"];
      state.cardEditions = { noSuperstars: "charged" };
      state.cardCharges = { noSuperstars: 3 };
    });
    const incoming = economy.currentTradeOffers()[0];
    expect(economy.tradeCard("noSuperstars", incoming)).toBe(true);
    expect(economy.cardEditions.noSuperstars).toBeUndefined();
    expect(economy.cardCharges.noSuperstars).toBeUndefined();
    // Тактика тира не имеет ⇒ входящая карта common (записи нет).
    expect(economy.cardRarity[incoming]).toBeUndefined();
  });

  it("отказывает: карта не в слоте, оффер чужой, нет золота", () => {
    const economy = economyWith((state) => {
      state.equippedTactics = [outId];
      state.ownedCards = [outId];
    });
    const incoming = economy.currentTradeOffers()[0];
    expect(economy.tradeCard("noSuperstars", incoming)).toBe(false);
    expect(economy.tradeCard(outId, "definitely-not-an-offer")).toBe(false);
    const broke = economyWith((state) => {
      state.equippedTactics = [outId];
      state.ownedCards = [outId];
      state.gold = ECONOMY.tradeInCost - 1;
    });
    expect(broke.tradeCard(outId, broke.currentTradeOffers()[0])).toBe(false);
  });

  it("rerollTrade дорожает и меняет тройку", () => {
    const economy = economyWith((state) => {
      state.gold = 50;
    });
    const before = economy.currentTradeOffers();
    expect(economy.campView().tradeRerollCost).toBe(rerollCostFor(0));
    expect(economy.rerollTrade()).toBe(true);
    expect(economy.currentTradeOffers()).not.toEqual(before);
    expect(economy.campView().tradeRerollCost).toBe(rerollCostFor(1));
    expect(economy.gold).toBe(50 - rerollCostFor(0));
  });
});
