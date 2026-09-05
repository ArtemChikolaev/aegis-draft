import { describe, expect, it } from "vitest";
import { COSMETICS, DUPLICATE_SHARDS, rollCosmeticDrops } from "../src/game/arcade/content/cosmetics.ts";
import type { ArcadeOutcome } from "../src/game/arcade/types.ts";

const outcome = (over: Partial<ArcadeOutcome>): ArcadeOutcome => ({
  outcome: "dead", tick: 60 * 300, level: 10, kills: 300, gold: 100, schools: [], upgrades: [], roshanKilled: false, rank: 0, greedStacks: 0, items: [], hero: "juggernaut", act: "full", ...over,
});

describe("arcade cosmetics drops", () => {
  it("детерминированы сидом и исходом; число бросков растёт с Рошаном и победой", () => {
    const a = rollCosmeticDrops("s1", outcome({}), []);
    const b = rollCosmeticDrops("s1", outcome({}), []);
    expect(a).toEqual(b);
    expect(a.length).toBe(1);
    expect(rollCosmeticDrops("s1", outcome({ roshanKilled: true }), []).length).toBe(2);
    expect(rollCosmeticDrops("s1", outcome({ roshanKilled: true, outcome: "victory" }), []).length).toBe(3);
    expect(rollCosmeticDrops("s1", outcome({ tick: 60 * 30 }), []).length).toBe(0);
  });

  it("дубликат даёт осколки по редкости, новый предмет — нет", () => {
    const first = rollCosmeticDrops("s2", outcome({}), [])[0];
    expect(first.duplicate).toBe(false);
    const again = rollCosmeticDrops("s2", outcome({}), [first.id])[0];
    expect(again.id).toBe(first.id);
    expect(again.duplicate).toBe(true);
    expect(again.shards).toBe(DUPLICATE_SHARDS[COSMETICS.find((c) => c.id === first.id)!.rarity]);
  });

  it("высокий ранг сдвигает редкость вверх", () => {
    const rare = (rank: number) => {
      let n = 0;
      for (let i = 0; i < 300; i++) for (const d of rollCosmeticDrops(`r${i}`, outcome({ rank }), [])) if (COSMETICS.find((c) => c.id === d.id)!.rarity !== "standard") n++;
      return n;
    };
    expect(rare(20)).toBeGreaterThan(rare(0) * 1.5);
  });
});
