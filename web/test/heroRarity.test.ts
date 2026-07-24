import { describe, expect, it } from "vitest";
import {
  RARITIES,
  RARITY,
  nextRarity,
  rarityContribution,
  rarityModifiers,
  rarityRank,
  raritySwapDelta,
  rollRarity,
  upgradeCost,
  type Rarity,
} from "../src/game/heroRarity.ts";

describe("тиры редкости", () => {
  it("порядок и ранги", () => {
    expect(RARITIES).toEqual(["common", "unique", "mythic", "immortal"]);
    expect(rarityRank("common")).toBe(0);
    expect(rarityRank("immortal")).toBe(3);
  });

  it("nextRarity: шаг вверх, immortal — потолок", () => {
    expect(nextRarity("common")).toBe("unique");
    expect(nextRarity("mythic")).toBe("immortal");
    expect(nextRarity("immortal")).toBeNull();
  });

  it("upgradeCost: цена достижения тира, immortal без апгрейда", () => {
    expect(upgradeCost("common")).toBe(RARITY.upgradeCost.unique);
    expect(upgradeCost("mythic")).toBe(RARITY.upgradeCost.immortal);
    expect(upgradeCost("immortal")).toBeNull();
  });
});

describe("rollRarity — детерминизм и кривая по этапу", () => {
  it("тот же (seed, heroId, stage) ⇒ та же редкость", () => {
    expect(rollRarity("s", 14, 3)).toBe(rollRarity("s", 14, 3));
  });

  it("ранние этапы почти всё common, поздние дают редких заметно чаще", () => {
    const dist = (stage: number) => {
      const counts: Record<Rarity, number> = { common: 0, unique: 0, mythic: 0, immortal: 0 };
      for (let h = 0; h < 400; h++) counts[rollRarity("curve", h, stage)] += 1;
      return counts;
    };
    const early = dist(1);
    const late = dist(5);
    // На этапе 1 common доминирует; mythic/immortal почти нет.
    expect(early.common).toBeGreaterThan(early.unique + early.mythic + early.immortal);
    expect(early.immortal).toBeLessThan(20);
    // К этапу 5 доля редких (mythic+immortal) заметно выше, чем на этапе 1.
    expect(late.mythic + late.immortal).toBeGreaterThan(early.mythic + early.immortal);
  });
});

describe("rarityModifiers", () => {
  it("считает чистый вклад замены, а не бонус входящего героя", () => {
    expect(rarityContribution("immortal")).toEqual({
      heroSynergy: RARITY.heroSynergyBonus.immortal,
      base: RARITY.immortalBaseBonus,
    });
    expect(raritySwapDelta("immortal", "mythic")).toEqual({
      heroSynergy: RARITY.heroSynergyBonus.mythic - RARITY.heroSynergyBonus.immortal,
      base: -RARITY.immortalBaseBonus,
    });
    expect(raritySwapDelta("common", "immortal")).toEqual({
      heroSynergy: RARITY.heroSynergyBonus.immortal,
      base: RARITY.immortalBaseBonus,
    });
  });

  it("суммирует Hero Synergy по активным героям, immortal добавляет Base", () => {
    const map = { "1": "unique", "2": "mythic", "3": "immortal" } as Record<string, Rarity>;
    const mods = rarityModifiers(map, [1, 2, 3, 4, 5]); // 4,5 — common (нет в карте)
    expect(mods.heroSynergy).toBeCloseTo(
      RARITY.heroSynergyBonus.unique + RARITY.heroSynergyBonus.mythic + RARITY.heroSynergyBonus.immortal,
      5,
    );
    expect(mods.base).toBe(RARITY.immortalBaseBonus); // только immortal
    expect(mods.chemistry).toBe(0);
  });

  it("весь common ⇒ нулевой вклад", () => {
    expect(rarityModifiers({}, [1, 2, 3, 4, 5])).toEqual({ base: 0, heroSynergy: 0, chemistry: 0 });
  });
});
