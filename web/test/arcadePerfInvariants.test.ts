import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { ObstacleGrid } from "../src/game/arcade/mapgen.ts";

// Допущения перф-правок сима (M15): сами правки сверены ботом бит-в-бит, а эти тесты держат то, на чём они стоят.
describe("Аркада: допущения быстрых путей", () => {
  it("все виды врагов — одной формы (одни и те же ключи в одном порядке)", () => {
    const shapes = new Set(Object.values(ENEMY_KINDS).map((k) => Object.keys(k).join(",")));
    expect(shapes.size).toBe(1);
  });

  it("спать умеют только elite/totem: быстрый выход isDormant не отсекает ни одного чемпиона", () => {
    for (const id of ["centaur_warden", "troll_necromancer", "bone_idol", "thunder_golem", "river_warden", "dire_stalker"] as const) {
      const k = ENEMY_KINDS[id];
      expect(k.elite === true || k.totem === true, id).toBe(true);
    }
    // И по факту: чемпионы мест на старте спят, рядовой враг — нет.
    const sim = new ArcadeSim("perf-dormant", { act: "full", composition: "all" });
    expect(sim.centaur && sim.isDormant(sim.centaur)).toBe(true);
    expect(sim.necromancer && sim.isDormant(sim.necromancer)).toBe(true);
  });

  it("сетка препятствий: плоская часть и запасная Map отдают одно и то же, правки add/remove видны в обеих", () => {
    const rock = { x: 300, y: 300, r: 20, kind: "rock" as const };
    const edge = { x: 5, y: 5, r: 20, kind: "tree" as const }; // запас регистрации уходит в отрицательные ячейки
    const grid = new ObstacleGrid([rock, edge]);
    expect(grid.near(300, 300)).toContain(rock);
    expect(grid.near(250, 250)).toContain(rock); // соседняя ячейка в пределах запаса PAD
    expect(grid.near(-10, -10)).toContain(edge); // за пределами мира — через Map
    expect(grid.near(3000, 3000)).toEqual([]);
    expect(grid.near(Number.NaN, 0)).toEqual([]);
    expect(grid.blocked(300, 300, 10)).toBe(true);
    grid.remove((o) => o.kind === "rock");
    expect(grid.blocked(300, 300, 10)).toBe(false);
    const late = { x: 1000, y: 1000, r: 14, kind: "rock" as const };
    grid.add(late);
    expect(grid.blocked(1000, 1000, 10)).toBe(true);
    expect(grid.resolve(1000, 1005, 10)[1]).toBeGreaterThan(1005);
  });

  it("запросы по врагам с грубым отсевом совпадают с полным перебором", () => {
    const sim = new ArcadeSim("perf-query", { act: "short" });
    let guard = 0;
    while (sim.tick < 60 * 40 && !sim.over && guard++ < 60 * 200) {
      sim.player.hp = sim.player.stats.maxHp;
      const m = sim.activeModal();
      sim.step(m === "pending" ? { mx: 0, my: 0, cast: 0, choose: 0, act: 0 } : { mx: 0, my: 0, cast: 0, choose: -1, act: m ? 5 : 0 });
    }
    const p = sim.player;
    for (const radius of [0, 0.5, 40, 150, 420, 5000]) {
      const brute = sim.enemies.filter((e) => e.alive && !sim.isDormant(e) && Math.sqrt((e.x - p.x) ** 2 + (e.y - p.y) ** 2) <= radius + e.kind.r);
      expect(sim.enemiesWithin(p.x, p.y, radius)).toEqual(brute);
      expect(sim.countEnemiesWithin(p.x, p.y, radius)).toBe(brute.length);
      let best = null, bestD = radius;
      for (const e of sim.enemies) { if (!e.alive || sim.isDormant(e)) continue; const d = Math.sqrt((e.x - p.x) ** 2 + (e.y - p.y) ** 2) - e.kind.r; if (d < bestD) { bestD = d; best = e; } }
      expect(sim.nearestEnemy(p.x, p.y, radius)).toBe(best);
    }
  });
});
