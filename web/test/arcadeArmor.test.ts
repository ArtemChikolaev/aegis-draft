import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";

// Отрицательная броня (аудит 2026-09-19): формула 0.06a/(1+0.06a) имеет полюс при a ≈ −16.7 (Mask of Madness −4 за штуку,
// покупается повторно): у полюса урон ×25, за ним — «отрицательный» (герой почти неуязвим). Для a < 0 — формула Dota:
// множитель 1 + 0.06|a|/(1+0.06|a|), монотонный и не выше ×2.
type Internals = { damagePlayer(amount: number): void };
const takenAt = (armor: number): number => {
  const sim = new ArcadeSim("armor-neg");
  const p = sim.player;
  p.stats.maxHp = 1e6; p.hp = 1e6; p.stats.armor = armor;
  (sim as unknown as Internals).damagePlayer(100);
  return 1e6 - p.hp;
};

describe("броня героя", () => {
  it("положительная броня — прежняя формула", () => {
    expect(takenAt(0)).toBeCloseTo(100, 6);
    expect(takenAt(10)).toBeCloseTo(100 * (1 - 0.6 / 1.6), 6);
  });

  it("отрицательная броня: без полюса, монотонно, не больше ×2", () => {
    expect(takenAt(-4)).toBeCloseTo(100 * (1 + 0.24 / 1.24), 6);
    expect(takenAt(-16)).toBeCloseTo(100 * (1 + 0.96 / 1.96), 6); // было ×25
    expect(takenAt(-20)).toBeCloseTo(100 * (1 + 1.2 / 2.2), 6); // было «отрицательно» → 1
    let prev = takenAt(0);
    for (let a = -1; a >= -60; a--) { const t = takenAt(a); expect(t).toBeGreaterThan(prev); expect(t).toBeLessThan(200); prev = t; }
  });
});
