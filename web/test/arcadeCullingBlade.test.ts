import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS, type EnemyKind } from "../src/game/arcade/content/enemies.ts";
import type { AbilityDef } from "../src/game/arcade/content/heroes.ts";
import type { AbilityKey, Enemy } from "../src/game/arcade/types.ts";

// Culling Blade — добивание (аудит 2026-09-19): цель под порогом умирает ВСЕГДА. Раньше «убийство» было уроном hp+1,
// который резали Клятва охотника (×0.85 по толпе) и щит шамана (×0.3): цель выживала, а умение всё равно уходило на
// короткую перезарядку и давало ускорение.
type Internals = { castAbility(k: AbilityKey, ab: AbilityDef): void; spawnEnemy(k: EnemyKind, x: number, y: number): Enemy };

const setup = (seed: string) => {
  const sim = new ArcadeSim(seed, { hero: "axe", act: "short" });
  const a = sim as unknown as Internals, p = sim.player;
  for (const e of sim.enemies) if (e.alive && !e.kind.totem) e.alive = false;
  p.abilities.r = 1;
  const threshold = sim.hero.abilities.r.value[1];
  const target = a.spawnEnemy(ENEMY_KINDS.ogre, p.x + 40, p.y);
  target.maxHp = 5000; target.hp = threshold - 1;
  return { sim, a, p, target };
};

describe("Culling Blade", () => {
  it("Клятва охотника (×0.85 по толпе) не спасает цель под порогом", () => {
    const { sim, a, p, target } = setup("cull-oath");
    sim.contract = { target: "centaur", reward: "weapon", done: false, oath: true };
    const kills0 = p.kills;
    a.castAbility("r", sim.hero.abilities.r);
    expect(target.alive).toBe(false);
    expect(p.kills).toBe(kills0 + 1);
    expect(p.cooldowns.r).toBe(sec(1.5)); // добил — короткая перезарядка
    expect(p.hasteUntil).toBeGreaterThan(sim.tick);
  });

  it("щит шамана (×0.3) не спасает цель под порогом", () => {
    const { sim, a, target } = setup("cull-shield");
    target.shieldUntil = sim.tick + 600;
    a.castAbility("r", sim.hero.abilities.r);
    expect(target.alive).toBe(false);
  });
});
