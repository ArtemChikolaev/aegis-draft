import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ENEMY_KINDS, type EnemyKind } from "../src/game/arcade/content/enemies.ts";
import type { AbilityDef } from "../src/game/arcade/content/heroes.ts";
import { IDLE_INPUT, type Enemy } from "../src/game/arcade/types.ts";

// Спящий/скрытый чемпион — не цель (аудит 2026-09-19): `nearestEnemy`/`enemiesWithin` это знали, а выборки «элита рядом»,
// «сильнейший», цель Culling Blade, цепь молний и клив шли по `this.enemies` мимо `isDormant` — автокаст жёг перезарядку
// в неуязвимого, статусы с клива писались на спящего, луч молнии выдавал скрытого Охотника.
type Internals = {
  eliteWithin(x: number, y: number, r: number): Enemy | null;
  strongestWithin(x: number, y: number, r: number): Enemy | null;
  cullTarget(ab: AbilityDef): Enemy | null;
  chainLightning(from: Enemy, dmg: number, targets: number): void;
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
};

/** Сим, где спящий Кентавр стоит вплотную к герою (роща не разбужена), а остальных врагов нет. */
const withSleeper = (seed: string, hero = "juggernaut") => {
  const sim = new ArcadeSim(seed, { hero, composition: "all" });
  const s = sim.centaur!, p = sim.player;
  for (const e of sim.enemies) if (e.alive && e !== s && !e.kind.totem) e.alive = false;
  sim.defiler = null; sim.camp!.nextGuardAt = 1e9;
  s.x = p.x + 60; s.y = p.y;
  expect(sim.isDormant(s)).toBe(true);
  return { sim, s, p, a: sim as unknown as Internals };
};

describe("выбор цели не видит спящих и скрытых", () => {
  it("eliteWithin / strongestWithin / cullTarget: спящий чемпион рядом — цели нет", () => {
    const { s, p, a } = withSleeper("target-1");
    expect(a.eliteWithin(p.x, p.y, 300)).toBeNull();
    expect(a.strongestWithin(p.x, p.y, 300)).toBeNull();
    const axe = withSleeper("target-1b", "axe");
    axe.p.abilities.r = 1; axe.s.hp = 10; // под порогом добивания
    expect(axe.a.cullTarget(axe.sim.hero.abilities.r)).toBeNull();
    // Проснулся — снова цель.
    axe.sim.grove!.engaged = true;
    expect(axe.a.cullTarget(axe.sim.hero.abilities.r)).toBe(axe.s);
    expect(s.alive).toBe(true);
  });

  it("цепь молний не прыгает в спящего и не рисует к нему луч", () => {
    const { sim, s, p, a } = withSleeper("target-2");
    const from = a.spawnEnemy(ENEMY_KINDS.ogre, p.x + 30, p.y);
    const fx0 = sim.fx.length;
    a.chainLightning(from, 10, 3);
    expect(sim.fx.slice(fx0).filter((f) => f.kind === "zap" && f.x2 === s.x && f.y2 === s.y)).toEqual([]);
  });

  it("клив автоатаки не тратит цель на спящего и не вешает на него статусы удара", () => {
    const { sim, s, p, a } = withSleeper("target-3");
    const target = a.spawnEnemy(ENEMY_KINDS.ogre, p.x + 30, p.y);
    target.hp = target.maxHp = 1e6;
    s.x = target.x + 20; s.y = target.y; // в радиусе клива от цели
    p.attackCd = 0;
    const hits0 = sim.events.hits;
    sim.step(IDLE_INPUT);
    expect(sim.events.hits - hits0).toBe(1); // только основная цель
  });
});
