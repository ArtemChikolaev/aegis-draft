import { describe, expect, it } from "vitest";
import {
  RARITY,
  heroPrice,
  rarityContribution,
  rarityModifiers,
  rarityOvrContribution,
  raritySwapDelta,
  rollHeroRarity,
  upgradeCost,
} from "../src/game/heroRarity.ts";
import { RARITIES, type Rarity } from "../src/game/rarity.ts";

// R4.1: цена входящего героя определяется КАЧЕСТВОМ и не зависит от номера этапа.
describe("цена героя по качеству", () => {
  it("монотонна по тиру", () => {
    expect(RARITIES.map(heroPrice)).toEqual([4, 6, 10, 20]);
    for (let i = 1; i < RARITIES.length; i += 1) {
      expect(heroPrice(RARITIES[i])).toBeGreaterThan(heroPrice(RARITIES[i - 1]));
    }
  });

  // R11.3: старый инвариант приравнивал оба пути по золоту и тем самым считал смену героя
  // бесплатной. Она не бесплатна — re-pick пересобирает matching и теряет career-связку.
  it("инвариант: купить готовый тир ДЕШЕВЛЕ, чем вырастить его из common", () => {
    let ladder = heroPrice("common");
    for (const rarity of RARITIES.slice(1) as Exclude<Rarity, "common">[]) {
      ladder += RARITY.upgradeCost[rarity];
      expect(heroPrice(rarity)).toBeLessThan(ladder);
    }
  });

  it("цена улучшения за единицу силы растёт с тиром", () => {
    // Раньше самый сильный шаг (до immortal) был самым дешёвым за очко — он доминировал всё.
    const gain = (to: Exclude<Rarity, "common">) =>
      rarityOvrContribution(to) - rarityOvrContribution(RARITIES[RARITIES.indexOf(to) - 1]);
    const perPoint = (RARITIES.slice(1) as Exclude<Rarity, "common">[])
      .map((r) => RARITY.upgradeCost[r] / gain(r));
    for (let i = 1; i < perPoint.length; i += 1) {
      expect(perPoint[i]).toBeGreaterThan(perPoint[i - 1]);
    }
  });
});

describe("цена улучшения тира", () => {
  it("upgradeCost: цена достижения тира, immortal без апгрейда", () => {
    expect(upgradeCost("common")).toBe(RARITY.upgradeCost.unique);
    expect(upgradeCost("mythic")).toBe(RARITY.upgradeCost.immortal);
    expect(upgradeCost("immortal")).toBeNull();
  });
});

describe("rollHeroRarity", () => {
  it("тот же (seed, heroId, stage) ⇒ та же редкость", () => {
    expect(rollHeroRarity("s", 14, 3)).toBe(rollHeroRarity("s", 14, 3));
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

  it("rarityOvrContribution — сумма частей, ею рынок сравнивает карты", () => {
    expect(rarityOvrContribution("common")).toBe(0);
    expect(rarityOvrContribution("immortal")).toBeCloseTo(
      RARITY.heroSynergyBonus.immortal + RARITY.immortalBaseBonus,
      5,
    );
  });

  it("весь common ⇒ нулевой вклад", () => {
    expect(rarityModifiers({}, [1, 2, 3, 4, 5])).toEqual({ base: 0, heroSynergy: 0, chemistry: 0 });
  });
});
