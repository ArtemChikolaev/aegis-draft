import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { NEUTRALS } from "../src/game/arcade/content/neutrals.ts";
import { BLINK_MASK, IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";

// Нейтралки со свойством (T20.5): раньше все 30 давали только статы, и выбор сводился к сравнению чисел.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; recomputeStats(): void; spawnProjectile(x: number, y: number, vx: number, vy: number, r: number, dmg: number, life: number, pierce: number, kind: string, fromEnemy: boolean): void };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;

function field(seed: string, neutral: string, hero = "juggernaut"): ArcadeSim {
  const sim = new ArcadeSim(seed, { hero, rank: 10 });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  sim.player.neutral = neutral;
  priv(sim).recomputeStats();
  return sim;
}
const dummy = (sim: ArcadeSim, dx: number) => { const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + dx, sim.player.y); e.hp = e.maxHp = 1e6; e.stunUntil = 1e9; return e; };
const idle = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); } };

describe("нейтралки со свойством", () => {
  it("свойство есть у семи предметов пяти тиров", () => {
    const withProp = NEUTRALS.filter((n) => n.prop);
    expect(withProp.map((n) => n.id).sort()).toEqual(["arcane_ring", "cloak_of_flames", "ex_machina", "fallen_sky", "mirror_shield", "timeless_relic", "trusty_shovel"]);
    expect(new Set(withProp.map((n) => n.tier))).toEqual(new Set([1, 3, 4, 5]));
  });

  it("Arcane Ring: каст умения сокращает перезарядку заряда Blink", () => {
    const sim = field("np-ring", "arcane_ring");
    const p = sim.player;
    sim.step({ ...IDLE_INPUT, mx: 16, cast: BLINK_MASK });
    const cd0 = p.blinkCd;
    p.abilities.q = 1; p.cooldowns.q = 0;
    sim.step({ ...IDLE_INPUT, cast: 1 });
    expect(p.blinkCd).toBe(cd0 - 1 - ARCADE.neutralProps.arcaneRingBlink);
  });

  it("Trusty Shovel: раз в период выкапывает золото", () => {
    const sim = field("np-shovel", "trusty_shovel");
    const gold0 = sim.player.gold;
    idle(sim, ARCADE.neutralProps.shovelEvery + 2);
    expect(sim.player.gold).toBeGreaterThan(gold0);
  });

  it("Cloak of Flames: враги вокруг горят, дальние — нет", () => {
    const sim = field("np-cloak", "cloak_of_flames");
    const near = dummy(sim, 60), far = dummy(sim, 400);
    idle(sim, 3);
    expect(near.burnUntil).toBeGreaterThan(sim.tick);
    expect(far.burnUntil).toBeLessThanOrEqual(sim.tick);
  });

  it("Timeless Relic: статусы героя на врагах длятся на 30% дольше", () => {
    const plain = field("np-relic", "arcane_ring"), relic = field("np-relic", "timeless_relic");
    const a = dummy(plain, 60), b = dummy(relic, 60);
    const burn = (sim: ArcadeSim, e: Enemy) => { (sim as unknown as { applyBurn(e: Enemy, d: number, s: number): void }).applyBurn(e, 5, 2); return e.burnUntil - sim.tick; };
    expect(burn(relic, b)).toBe(Math.round(burn(plain, a) * ARCADE.neutralProps.relicMult));
  });

  it("Mirror Shield: вражеский снаряд гаснет, следующий в перезарядке щита — бьёт", () => {
    const sim = field("np-mirror", "mirror_shield");
    const p = sim.player;
    const shoot = () => priv(sim).spawnProjectile(p.x + 30, p.y, -400, 0, 6, 50, sec(1), 0, "arrow", true);
    shoot();
    idle(sim, 10);
    expect(sim.projectiles.some((pr) => pr.alive)).toBe(false); // долетел и погас о щит
    expect(sim.events.hurt).toBe(0);
    shoot();
    p.invulnUntil = 0;
    for (let i = 0; i < 10; i++) sim.step(IDLE_INPUT);
    expect(sim.events.hurt).toBe(1);
  });

  it("Fallen Sky: Blink приземляется метеором — урон и оглушение в точке прибытия", () => {
    const sim = field("np-sky", "fallen_sky");
    const e = dummy(sim, 150 + 40);
    e.stunUntil = 0;
    sim.step({ ...IDLE_INPUT, mx: 16, cast: BLINK_MASK });
    expect(e.hp).toBeLessThan(1e6);
    expect(e.stunUntil).toBeGreaterThan(sim.tick);
  });

  it("Ex Machina: раз в период перезарядка Q/W/E сброшена", () => {
    const sim = field("np-ex", "ex_machina");
    sim.player.cooldowns.q = 1e6; sim.player.cooldowns.w = 1e6;
    idle(sim, ARCADE.neutralProps.exMachinaEvery + 2);
    expect(sim.player.cooldowns.q).toBeLessThan(1e6 - ARCADE.neutralProps.exMachinaEvery - 2);
    expect(sim.player.cooldowns.w).toBeLessThan(1e6 - ARCADE.neutralProps.exMachinaEvery - 2);
  });
});
