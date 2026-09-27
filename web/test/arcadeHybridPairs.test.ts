import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { SCHOOLS, UPGRADES } from "../src/game/arcade/content/schools.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind, type Offer } from "../src/game/arcade/types.ts";

// Гибриды недостающих пар (T21.3): огонь + звери, молния + звери, молния + яд — теперь гибрид есть у каждой из 10 пар школ.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; applyOffer(o: Offer): void; damageEnemy(e: Enemy, amount: number, fx: string): boolean; applyPoison(e: Enemy, dps: number): void };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const take = (sim: ArcadeSim, id: string) => priv(sim).applyOffer({ kind: "upgrade", id, rarity: "standard" } as Offer);

function field(seed: string): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10 });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}
const dummy = (sim: ArcadeSim, dx: number, dy = 0) => { const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + dx, sim.player.y + dy); e.hp = e.maxHp = 1e6; e.stunUntil = 1e9; return e; };
const idle = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); } };

describe("гибриды всех пар школ", () => {
  it("у каждой из 10 пар школ есть гибрид", () => {
    const pairs = new Set(UPGRADES.filter((u) => u.requiresSchools?.length === 2).map((u) => [...u.requiresSchools!].sort().join("+")));
    const all = SCHOOLS.flatMap((a, i) => SCHOOLS.slice(i + 1).map((b) => [a, b].sort().join("+")));
    expect(all.length).toBe(10);
    for (const pair of all) expect(pairs.has(pair), pair).toBe(true);
  });

  it("Огненная стая: укус волка поджигает цель", () => {
    const sim = field("hyb-fire");
    take(sim, "beast_wolf"); take(sim, "hyb_fire_beast");
    const e = dummy(sim, 60);
    idle(sim, 120);
    expect(e.hp).toBeLessThan(1e6);
    expect(e.burnUntil).toBeGreaterThan(sim.tick);
  });

  it("Грозовая стая: каждый третий укус пускает молнию на соседей", () => {
    const sim = field("hyb-storm");
    take(sim, "beast_wolf"); take(sim, "hyb_storm_beast");
    dummy(sim, 60);
    const other = dummy(sim, 60, 120);
    other.stunUntil = 1e9;
    let hits = 0;
    for (let i = 0; i < 600 && other.hp === 1e6; i++) { idle(sim, 1); hits = (sim as unknown as { packHits: number }).packHits; }
    expect(other.hp).toBeLessThan(1e6); // молния дошла до второго манекена, которого волк не кусал
    expect(hits).toBeGreaterThanOrEqual(3);
  });

  it("Токсичный разряд: молния по отравленной цели кладёт стак — раз в секунду на цель", () => {
    const sim = field("hyb-toxic");
    take(sim, "hyb_storm_venom");
    const e = dummy(sim, 60);
    priv(sim).applyPoison(e, 5);
    const s0 = e.poisonStacks;
    priv(sim).damageEnemy(e, 10, "zap");
    expect(e.poisonStacks).toBe(s0 + 1);
    priv(sim).damageEnemy(e, 10, "zap");
    expect(e.poisonStacks).toBe(s0 + 1); // в пределах секунды — без нового стака
    const clean = dummy(sim, -60);
    priv(sim).damageEnemy(clean, 10, "zap");
    expect(clean.poisonStacks).toBe(0); // неотравленную молния не травит
  });
});
