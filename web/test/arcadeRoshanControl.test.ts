import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { rankOf } from "../src/game/arcade/content/ranks.ts";

// Рошан (T15.5): контроль — с пределом, как у чемпионов (Time Lock под Frenzy и Berserker's Call держали его в почти
// вечном стане); удар по телеграфу растёт рангом, как контакт (был голой константой); в River часы ярости стоят, пока
// герой не пришёл в яму (пришедший после 9:00 сразу получал ×3).
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; roshanSpawnedAt: number };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); } };

function withRoshan(seed: string, opts: ConstructorParameters<typeof ArcadeSim>[1] = {}, dx = 300): { sim: ArcadeSim; r: Enemy } {
  const sim = new ArcadeSim(seed, opts);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  const r = priv(sim).spawnEnemy(ENEMY_KINDS.roshan, sim.player.x + dx, sim.player.y);
  priv(sim).roshanSpawnedAt = sim.tick;
  return { sim, r };
}

describe("Рошан", () => {
  it("стан держится не дольше ccCap, затем ccResist иммунитета, затем снова проходит", () => {
    const Bs = ARCADE.boss;
    const { sim, r } = withRoshan("rosh-cc");
    r.stunUntil = sim.tick + sec(6);
    step(sim, 1);
    expect(r.stunUntil - sim.tick).toBeLessThanOrEqual(Bs.ccCap);
    const x0 = r.x;
    step(sim, Bs.ccCap - 3);
    expect(sim.tick < r.stunUntil).toBe(true);
    expect(r.x).toBe(x0);
    step(sim, 3);
    expect(sim.tick < r.stunUntil).toBe(false);
    r.stunUntil = sim.tick + sec(2); r.freezeUntil = sim.tick + sec(2);
    step(sim, 1);
    expect([r.stunUntil, r.freezeUntil]).toEqual([0, 0]);
    step(sim, Bs.ccResist);
    r.stunUntil = sim.tick + sec(6);
    step(sim, 2);
    expect(sim.tick < r.stunUntil).toBe(true);
  });

  it("удар по телеграфу растёт с ранговым множителем урона, как контакт", () => {
    const hit = (rank: number) => {
      const { sim, r } = withRoshan(`rosh-slam-${rank}`, { rank }, 200);
      r.slamT = 1; r.slamX = sim.player.x; r.slamY = sim.player.y;
      const hp = sim.player.hp = sim.player.stats.maxHp;
      sim.step(IDLE_INPUT);
      return hp - sim.player.hp;
    };
    const herald = hit(0);
    expect(herald).toBeGreaterThan(0);
    expect(hit(20) / herald).toBeCloseTo(rankOf(20).dmgMult, 6);
  });

  it("River: пока герой вне ямы, часы ярости стоят; в яме — идут", () => {
    const P = ARCADE.pit;
    const sim = new ArcadeSim("rosh-pit", { act: "river" });
    for (const e of sim.enemies) e.alive = false;
    sim.player.autoAttack = false;
    const r = priv(sim).spawnEnemy(ENEMY_KINDS.roshan, P.x, P.y);
    expect(r.kind.boss).toBe(true);
    priv(sim).roshanSpawnedAt = sim.tick;
    const age = () => sim.tick - priv(sim).roshanSpawnedAt;
    sim.player.x = P.x + P.leash + 300; sim.player.y = P.y - 400;
    step(sim, sec(10));
    expect(age()).toBeLessThanOrEqual(1);
    sim.player.x = P.x + 60; sim.player.y = P.y;
    const before = age();
    for (let i = 0; i < sec(3); i++) { sim.player.x = P.x + 60; sim.player.y = P.y; step(sim, 1); }
    expect(age() - before).toBe(sec(3));
  });
});
