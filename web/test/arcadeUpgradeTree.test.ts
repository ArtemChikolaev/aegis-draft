import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { UPGRADES, UPGRADE_BY_ID } from "../src/game/arcade/content/schools.ts";

describe("дерево школ: модификаторы только после источника (T13.6, фидбэк владельца 2026-09-06)", () => {
  it("на любом уровне предложенный модификатор имеет взятый источник", () => {
    for (const seed of ["tree-1", "tree-2", "tree-3"]) {
      const sim = new ArcadeSim(seed, { hero: "juggernaut" });
      sim.player.hp = 1e6;
      for (let round = 0; round < 25; round++) {
        (sim as unknown as { gainXp(n: number): void }).gainXp(sim.player.xpNext - sim.player.xp + 1);
        sim.step(IDLE_INPUT);
        for (const o of sim.pending ?? []) {
          if (o.kind !== "upgrade") continue;
          const def = UPGRADE_BY_ID[o.id];
          if (def.requires) expect(def.requires.some((id) => (sim.player.upgrades[id]?.rank ?? 0) > 0), `${seed}: ${o.id} без источника`).toBe(true);
        }
        if (sim.pending) sim.step({ ...IDLE_INPUT, choose: 0 });
      }
    }
  });
});

// Редкость поднимает потолок рангов (T13.18, «как в Death Must Die»): обычный вариант упирается
// в `maxRank`, экзотический даёт +1 ступень, арканный +2. Потолок только растёт и не касается
// легендарок — они берутся один раз.
describe("потолок рангов от редкости", () => {
  const take = (sim: ArcadeSim, id: string, rarity: "standard" | "refined" | "exotic" | "arcana") =>
    (sim as unknown as { applyOffer(o: { kind: "upgrade"; id: string; rarity: string }): void }).applyOffer({ kind: "upgrade", id, rarity });

  it("экзотический вариант поднимает потолок на ступень, арканный — на две", () => {
    const sim = new ArcadeSim("cap-1", { rank: 0, hero: "juggernaut", act: "short" });
    const def = UPGRADES.find((u) => !u.legendary && u.maxRank >= 3)!;
    take(sim, def.id, "standard");
    expect(sim.player.upgrades[def.id].cap).toBe(def.maxRank);
    take(sim, def.id, "exotic");
    expect(sim.player.upgrades[def.id].cap).toBe(def.maxRank + 1);
    take(sim, def.id, "arcana");
    expect(sim.player.upgrades[def.id].cap).toBe(def.maxRank + 2);
    // Потолок только растёт: обычный вариант его не опускает.
    take(sim, def.id, "standard");
    expect(sim.player.upgrades[def.id].cap).toBe(def.maxRank + 2);
  });

  it("легендарка остаётся одноразовой, хотя приходит с редкостью arcana", () => {
    const sim = new ArcadeSim("cap-2", { rank: 0, hero: "juggernaut", act: "short" });
    const leg = UPGRADES.find((u) => u.legendary)!;
    take(sim, leg.id, "arcana");
    expect(sim.player.upgrades[leg.id].cap).toBe(leg.maxRank);
  });

  it("апгрейд с поднятым потолком снова попадает в предложения после базового максимума", () => {
    const sim = new ArcadeSim("cap-3", { rank: 0, hero: "juggernaut", act: "short" });
    const def = UPGRADES.find((u) => !u.legendary && u.maxRank >= 3 && !u.requires && !u.requiresSchools)!;
    for (let i = 0; i < def.maxRank; i++) take(sim, def.id, i === 0 ? "arcana" : "standard");
    expect(sim.player.upgrades[def.id].rank).toBe(def.maxRank);
    const offerable = (sim as unknown as { rollUpgradeOffer(x: string[]): { id: string } | null });
    let seen = false;
    for (let i = 0; i < 400 && !seen; i++) seen = offerable.rollUpgradeOffer([])?.id === def.id;
    expect(seen, `${def.id} с потолком ${sim.player.upgrades[def.id].cap} должен снова предлагаться`).toBe(true);
  });
});
