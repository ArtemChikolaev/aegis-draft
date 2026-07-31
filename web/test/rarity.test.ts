import { describe, expect, it } from "vitest";
import { RARITIES, isRarity, nextRarity, rarityRank, rollRarity, type Rarity } from "../src/game/rarity.ts";

describe("лестница качества", () => {
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

  it("isRarity отсеивает мусор из сейва", () => {
    expect(isRarity("mythic")).toBe(true);
    expect(isRarity("legendary")).toBe(false);
  });
});

describe("rollRarity — детерминизм и кривая по этапу", () => {
  it("тот же (seed, key, stage) ⇒ тот же тир", () => {
    expect(rollRarity("s", "hero-14", 3)).toBe(rollRarity("s", "hero-14", 3));
  });

  it("ключ разводит сущности: герой и карточка роллят независимо", () => {
    const heroes = Array.from({ length: 60 }, (_, i) => rollRarity("mix", `hero-${i}`, 4));
    const cards = Array.from({ length: 60 }, (_, i) => rollRarity("mix", `card-${i}`, 4));
    expect(heroes).not.toEqual(cards);
  });

  // R11.4: жёсткой привязки тиров к этапу нет — верхние тиры возможны с первого Буткемпа, как
  // `FORM_ODDS` для форм игроков. Раньше mythic был невозможен на этапе 1, immortal — до этапа 4.
  it("верхние тиры возможны уже на первом этапе", () => {
    const counts: Record<Rarity, number> = { common: 0, unique: 0, mythic: 0, immortal: 0 };
    for (let h = 0; h < 3000; h++) counts[rollRarity("floor", `hero-${h}`, 1)] += 1;
    expect(counts.mythic).toBeGreaterThan(0);
    expect(counts.immortal).toBeGreaterThan(0);
    // Но остаются редкостью: вместе меньше десятой части первого Буткемпа.
    expect(counts.mythic + counts.immortal).toBeLessThan(3000 * 0.1);
    // Common всё ещё доминирует на старте.
    expect(counts.common).toBeGreaterThan(3000 * 0.6);
  });

  it("доля каждого верхнего тира не убывает с этапом", () => {
    const share = (stage: number, tier: Rarity) => {
      let n = 0;
      for (let h = 0; h < 1200; h++) if (rollRarity("curve2", `hero-${h}`, stage) === tier) n += 1;
      return n / 1200;
    };
    for (const tier of ["mythic", "immortal"] as Rarity[]) {
      const shares = [1, 3, 5].map((s) => share(s, tier));
      expect(shares[1]).toBeGreaterThan(shares[0]);
      expect(shares[2]).toBeGreaterThan(shares[1]);
    }
  });

  // R12.4: прежняя кривая упиралась в потолки к ПЯТОМУ этапу, и 20 из 25 этапов сезона имели одно и
  // то же распределение — лестница качества заканчивалась в первом акте, а refined оставался
  // модальным тиром до конца забега. Здесь фиксируется, что лестница идёт весь сезон.
  describe("R12.4 — лестница качества идёт весь сезон, а не первые пять этапов", () => {
    const dist = (stage: number) => {
      const counts: Record<Rarity, number> = { common: 0, unique: 0, mythic: 0, immortal: 0 };
      for (let h = 0; h < 4000; h += 1) counts[rollRarity(`walk-${h}`, "card-x", stage)] += 1;
      return counts;
    };
    const modal = (stage: number): Rarity => RARITIES.reduce(
      (best, r) => (dist(stage)[r] > dist(stage)[best] ? r : best),
      "common" as Rarity,
    );

    it("модальный тир поднимается по лестнице: common → unique → mythic", () => {
      // Проверяем именно СМЕНУ модального тира: прежняя кривая держала unique модальным с 5-го
      // этапа до 25-го, и никакая проверка «доля растёт» этого не улавливала.
      expect(modal(1)).toBe("common");
      expect(modal(12)).toBe("unique");
      expect(modal(22)).toBe("mythic");
    });

    it("распределение продолжает двигаться после пятого этапа", () => {
      const share = (stage: number, tier: Rarity) => dist(stage)[tier] / 4000;
      // Именно этого не было: между этапами 6 и 25 доли стояли на месте (±1%).
      expect(share(20, "mythic")).toBeGreaterThan(share(6, "mythic") + 0.1);
      expect(share(20, "common")).toBeLessThan(share(6, "common") - 0.1);
    });

    it("качество — конечная ось: в Династии центр останавливается, arcana не становится модальной", () => {
      expect(modal(60)).toBe("mythic");
      const deep = dist(60);
      expect(deep.immortal).toBeLessThan(deep.mythic);
      // Но и не исчезает: у каждого тира есть хвост на любом этапе (требование R11.4).
      expect(deep.common).toBeGreaterThan(0);
    });
  });

  it("ранние этапы почти всё common, поздние дают редких заметно чаще", () => {
    const dist = (stage: number) => {
      const counts: Record<Rarity, number> = { common: 0, unique: 0, mythic: 0, immortal: 0 };
      for (let h = 0; h < 400; h++) counts[rollRarity("curve", `hero-${h}`, stage)] += 1;
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
