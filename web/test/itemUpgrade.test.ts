import { describe, expect, it } from "vitest";
import { RunEconomy } from "../src/game/anteEconomy.ts";
import { ITEM_RARITY, itemUpgradeCost } from "../src/game/items.ts";

// Платный тир предмета (LG3-хвост, b1.46.0): только standard → refined, дорожает с каждой
// купленной за забег ступенью; exotic/arcana — только дроп. Ось та же, что у дропа: cardRarity.
function economyWith(cards: string[], gold: number, cardRarity: Record<string, "unique" | "mythic" | "immortal"> = {}): RunEconomy {
  const base = new RunEconomy("item-upgrade-seed");
  const state = { ...base.snapshot, gold, equippedTactics: cards, ownedCards: cards, cardRarity };
  return new RunEconomy("item-upgrade-seed", state);
}

describe("itemUpgradeCost", () => {
  it("платно только standard → refined", () => {
    expect(itemUpgradeCost("common")).toBe(ITEM_RARITY.refinedCost);
    expect(itemUpgradeCost("unique")).toBeNull();
    expect(itemUpgradeCost("mythic")).toBeNull();
    expect(itemUpgradeCost("immortal")).toBeNull();
  });
});

describe("RunEconomy.upgradeItemTier", () => {
  it("поднимает standard-предмет до refined за золото; дальше — только дроп", () => {
    const economy = economyWith(["blackKingBar"], 30);
    expect(economy.itemUpgradeCost("blackKingBar")).toBe(4);
    expect(economy.upgradeItemTier("blackKingBar")).toBe(true);
    expect(economy.cardRarity.blackKingBar).toBe("unique");
    expect(economy.gold).toBe(26);
    expect(economy.itemUpgradeCost("blackKingBar")).toBeNull();
    expect(economy.upgradeItemTier("blackKingBar")).toBe(false);
  });
  it("эскалация: каждая купленная ступень за забег дороже (4 → 7 → 10)", () => {
    const economy = economyWith(["blackKingBar", "bottle", "dagon"], 40);
    expect(economy.upgradeItemTier("blackKingBar")).toBe(true);
    expect(economy.itemUpgradeCost("bottle")).toBe(7);
    expect(economy.upgradeItemTier("bottle")).toBe(true);
    expect(economy.itemUpgradeCost("dagon")).toBe(10);
    expect(economy.gold).toBe(40 - 4 - 7);
  });
  it("не улучшает тактику, чужую карту, уже refined и не уходит в минус", () => {
    const economy = economyWith(["widePool", "bottle", "dagon"], 3, { dagon: "unique" });
    expect(economy.itemUpgradeCost("widePool")).toBeNull();
    expect(economy.itemUpgradeCost("radiance")).toBeNull();
    expect(economy.itemUpgradeCost("dagon")).toBeNull();
    expect(economy.upgradeItemTier("bottle")).toBe(false);
    expect(economy.gold).toBe(3);
    expect(economy.cardRarity.bottle).toBeUndefined();
  });
});
