import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import type { AbilityDef, AbilityKey } from "../src/game/arcade/content/heroes.ts";
import { rankStep } from "../src/game/arcade/content/ranks.ts";
import type { Enemy, EnemyKind } from "../src/game/arcade/types.ts";

// Правило ранга Divine «горение, заморозка и стан на врагах короче на 30%» (M15, B6): множитель живёт внутри stun(), как у
// горения и холода. Раньше его применял вызывающий — и только умения; Thunderclap, Headshot, Time Lock, подъём после
// смерти и медведь оглушали на полный срок.
type Internals = {
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  onAttackHit(e: Enemy, scale?: number): void;
  thunderclap(): void;
  revive(hp: number): void;
  tickPets(): void;
  castAbility(k: AbilityKey, ab: AbilityDef): void;
};
const DIVINE = rankStep("divine", 1);

function arena(hero: string, seed: string, rank = DIVINE) {
  const sim = new ArcadeSim(seed, { hero, rank });
  for (const e of sim.enemies) if (e.alive) e.alive = false;
  const p = sim.player;
  const dummy = (sim as unknown as Internals).spawnEnemy(ENEMY_KINDS.ogre, p.x + 30, p.y);
  dummy.hp = dummy.maxHp = 1e9;
  return { sim, p, dummy, a: sim as unknown as Internals };
}
/** Длительность свежего стана в тиках. */
const stunOf = (sim: ArcadeSim, e: Enemy) => e.stunUntil - sim.tick;

describe("Аркада: сопротивление статусам на Divine действует на все станы", () => {
  it("Thunderclap, подъём после смерти, Headshot, Time Lock, медведь — 70% срока", () => {
    // Thunderclap (Maelstrom): 0.6 с.
    { const { sim, p, dummy, a } = arena("juggernaut", "resist-clap"); expect(sim.rank.resistStatus).toBe(true);
      p.upgrades.mae_clap = { rank: 1, power: 1, cap: 3 }; a.thunderclap(); expect(stunOf(sim, dummy)).toBe(sec(0.6 * 0.7)); }
    // Подъём после смерти (Aegis/Reincarnation): 1.2 с.
    { const { sim, dummy, a } = arena("juggernaut", "resist-revive"); a.revive(100); expect(stunOf(sim, dummy)).toBe(sec(1.2 * 0.7)); }
    // Headshot (Sniper): 0.25 с, шанс 30% — бьём, пока не выпадет.
    { const { sim, p, dummy, a } = arena("sniper", "resist-headshot"); p.abilities.w = 1;
      for (let i = 0; i < 300 && dummy.stunUntil === 0; i++) a.onAttackHit(dummy);
      expect(stunOf(sim, dummy)).toBe(sec(0.25 * 0.7)); }
    // Time Lock (Faceless Void): 0.5 с.
    { const { sim, dummy, a } = arena("faceless_void", "resist-timelock");
      const sig = HEROES.faceless_void.signature!; expect(sig.kind).toBe("timelock");
      for (let i = 0; i < 300 && dummy.stunUntil === 0; i++) a.onAttackHit(dummy);
      expect(stunOf(sim, dummy)).toBe(sec((sig.duration ?? 0.5) * 0.7)); }
    // Медведь Зверинца: 0.3 с, шанс 20%.
    { const { sim, dummy, a } = arena("juggernaut", "resist-bear");
      sim.pets.push({ kind: "bear", x: dummy.x - 20, y: dummy.y, cd: 0, facingX: 1, facingY: 0, hitAt: -999, inReach: true });
      for (let i = 0; i < 300 && dummy.stunUntil === 0; i++) { sim.pets[0].cd = 0; a.tickPets(); }
      expect(stunOf(sim, dummy)).toBe(sec(0.3 * 0.7)); }
  });

  it("умения, где множитель уже был, не режутся дважды; без правила ранга срок полный", () => {
    const ab = HEROES.axe.abilities.q;
    expect(ab.kind).toBe("berserker_call");
    const divine = arena("axe", "resist-call");
    divine.p.abilities.q = 1;
    divine.a.castAbility("q", ab);
    expect(stunOf(divine.sim, divine.dummy)).toBe(sec(ab.value[1] * 0.7));
    const herald = arena("axe", "resist-call", 0);
    expect(herald.sim.rank.resistStatus).toBe(false);
    herald.p.abilities.q = 1;
    herald.a.castAbility("q", ab);
    expect(stunOf(herald.sim, herald.dummy)).toBe(sec(ab.value[1]));
  });
});
