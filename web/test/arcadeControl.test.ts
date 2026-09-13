import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ENEMY_KINDS, type EnemyKind } from "../src/game/arcade/content/enemies.ts";
import type { Enemy } from "../src/game/arcade/types.ts";

type Internals = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; thunderclap(): void; onLethal(): void; onAttackHit(e: Enemy): void };

// Контроль и неуязвимые цели (T13.66): unstoppable не оглушается ни одним источником, удар по неуязвимой цели не лечит.
describe("контроль и неуязвимые цели", () => {
  it("unstoppable не оглушается и не отталкивается: Thunderclap, подъём Aegis", () => {
    const sim = new ArcadeSim("cc-unstoppable", { act: "full" });
    const a = sim as unknown as Internals, p = sim.player;
    p.upgrades.mae_clap = { rank: 1, power: 1, cap: 3 };
    p.invulnUntil = 1e12; // отражение Tormentor не мешает проверке
    const tormentor = a.spawnEnemy(ENEMY_KINDS.tormentor, p.x + 60, p.y); tormentor.hp = tormentor.maxHp = 1e7;
    const kobold = a.spawnEnemy(ENEMY_KINDS.kobold, p.x - 60, p.y); kobold.hp = kobold.maxHp = 1e7;
    a.thunderclap();
    expect(tormentor.stunUntil).toBe(0);
    expect(kobold.stunUntil).toBeGreaterThan(sim.tick);
    kobold.stunUntil = 0;
    const tx = tormentor.x;
    p.aegis = true; p.hp = 0;
    a.onLethal();
    expect(tormentor.stunUntil).toBe(0);
    expect(tormentor.x).toBe(tx);
    expect(kobold.stunUntil).toBeGreaterThan(sim.tick);
  });

  it("удар по неуязвимой цели не лечит: Кровавик и вампиризм по спящему чемпиону; по живой цели — лечат", () => {
    const sim = new ArcadeSim("cc-heal", { act: "full", composition: "all" });
    const a = sim as unknown as Internals, p = sim.player;
    const centaur = sim.centaur!;
    expect(sim.isDormant(centaur)).toBe(true);
    p.upgrades.leg_bloodstone = { rank: 1, power: 1, cap: 1 };
    p.stats.lifesteal = 0.5;
    p.hp = 100;
    sim.damageEnemy(centaur, 500, "burst");
    a.onAttackHit(centaur);
    expect(p.hp).toBe(100);
    const kobold = a.spawnEnemy(ENEMY_KINDS.kobold, p.x + 30, p.y); kobold.hp = kobold.maxHp = 1e7;
    sim.damageEnemy(kobold, 500, "burst");
    expect(p.hp).toBeGreaterThan(100);
  });
});
