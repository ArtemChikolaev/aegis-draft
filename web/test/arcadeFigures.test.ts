// Цифры карточек школ (upgradeFigures) — зеркало формул sim.ts. Тест держит их в согласии на
// ключевых точках: аура Radiance с Инферно, шанс молнии, замедление Skadi, разряд Maelstrom.
import { describe, expect, it } from "vitest";
import { UPGRADES, upgradeFigures } from "../src/game/arcade/content/schools.ts";
import { ARCADE } from "../src/game/arcade/config.ts";

const ctx = (powers: Record<string, number> = {}) => ({ power: (id: string) => powers[id] ?? 0 });

describe("цифры карточек школ", () => {
  it("каждый не-легендарный апгрейд показывает хотя бы одно число", () => {
    for (const u of UPGRADES) {
      if (u.legendary) continue;
      expect(upgradeFigures(u.id, 1, 1, ctx()).length, u.id).toBeGreaterThan(0);
    }
  });
  it("аура Radiance: 8 урона/с за единицу мощи, Инферно множит ×(1+0.25·p), Солнце ×1.75", () => {
    expect(upgradeFigures("rad_aura", 1, 1, ctx())[0].value).toBe(8);
    expect(upgradeFigures("rad_aura", 2, 2.35, ctx({ rad_inferno: 2 }))[0].value).toBeCloseTo(8 * 2.35 * 1.5, 6);
    expect(upgradeFigures("rad_aura", 1, 1, ctx({ leg_rad_sun: 1 }))[0].value).toBeCloseTo(8 * 1.75, 6);
  });
  it("следующий ранг растёт на множитель редкости, а не на единицу", () => {
    const cur = upgradeFigures("ska_shards", 1, 1, ctx())[0].value;
    const next = upgradeFigures("ska_shards", 2, 1 + ARCADE.rarity.mult.exotic, ctx())[0].value;
    expect(next / cur).toBeCloseTo(1 + ARCADE.rarity.mult.exotic, 6);
  });
  it("замедление Skadi упирается в 60%, поле — в 50%", () => {
    expect(upgradeFigures("ska_bite", 9, 9, ctx())[0].value).toBe(0.6);
    expect(upgradeFigures("ska_aura", 9, 9, ctx())[0].value).toBe(0.5);
  });
  it("цепная молния: шанс 25%+8%·p, целей 3 + Мьёльнир·2 + Гром 4", () => {
    const f = upgradeFigures("mae_chain", 1, 1, ctx({ mae_mjollnir: 1.35, leg_mae_thunder: 1 }));
    expect(f.find((x) => x.key === "chainChance")?.value).toBeCloseTo(0.33, 6);
    expect(f.find((x) => x.key === "chainTargets")?.value).toBe(3 + 2 + 4);
  });
});
