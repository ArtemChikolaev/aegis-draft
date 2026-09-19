import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS, type EnemyKind } from "../src/game/arcade/content/enemies.ts";
import type { Enemy } from "../src/game/arcade/types.ts";

// Все лечения идут через heal() (аудит 2026-09-19): вампиризм с удара и Death Pact с убийства писали в hp напрямую,
// и порча «Увядание» (лечение ×healMult) на них не действовала.
type Internals = { onAttackHit(e: Enemy, scale?: number): void; spawnEnemy(k: EnemyKind, x: number, y: number): Enemy };
const W = ARCADE.curse.withering.healMult;

describe("лечение мимо heal()", () => {
  it("вампиризм с удара режется Увяданием и не рисует всплывающее число на каждый удар", () => {
    const healed = (cursed: boolean) => {
      const sim = new ArcadeSim("heal-lifesteal");
      const a = sim as unknown as Internals, p = sim.player;
      const e = a.spawnEnemy(ENEMY_KINDS.ogre, p.x + 30, p.y);
      e.hp = e.maxHp = 1e6;
      p.stats.lifesteal = 0.5; p.stats.critChance = 0; p.hp = 50;
      if (cursed) p.curse = "withering";
      const fx0 = sim.fx.filter((f) => f.kind === "heal").length;
      a.onAttackHit(e);
      expect(sim.fx.filter((f) => f.kind === "heal").length).toBe(fx0);
      return { heal: p.hp - 50, dealt: 1e6 - e.hp };
    };
    const clean = healed(false), cursed = healed(true);
    expect(clean.heal).toBeCloseTo(clean.dealt * 0.5, 5);
    expect(cursed.heal).toBeCloseTo(cursed.dealt * 0.5 * W, 5);
  });

  it("Death Pact (Clinkz): лечение с убийства режется Увяданием", () => {
    const healed = (cursed: boolean) => {
      const sim = new ArcadeSim("heal-deathpact", { hero: "clinkz" });
      const a = sim as unknown as Internals, p = sim.player;
      const e = a.spawnEnemy(ENEMY_KINDS.kobold, p.x + 30, p.y);
      p.hp = 50;
      if (cursed) p.curse = "withering";
      sim.damageEnemy(e, 1e9, "burst");
      expect(e.alive).toBe(false);
      return p.hp - 50;
    };
    const clean = healed(false), cursed = healed(true);
    expect(clean).toBeGreaterThan(0);
    expect(cursed).toBeCloseTo(clean * W, 5);
  });
});
