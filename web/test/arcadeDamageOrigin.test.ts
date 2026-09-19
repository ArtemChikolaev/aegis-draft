import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import type { AbilityDef, AbilityKey } from "../src/game/arcade/content/heroes.ts";
import type { Enemy, EnemyKind } from "../src/game/arcade/types.ts";

// Происхождение урона (M15, B3): «автоатака героя» / «умение» / «призыв» — отдельный признак, а не вид эффекта FxKind.
// Раньше автоатаку узнавали по fx "hit": питомцы и иллюзии (тоже "hit") включали Vampiric Spirit и Backstab героя, крит
// героя ("crit") их терял, а Кровавик не лечил с умений, рисующих "crit" (Assassinate, Laguna, Finger, Sun Strike, Mana Void).
type Internals = {
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  onAttackHit(e: Enemy, scale?: number): void;
  tickPets(): void;
  castAbility(k: AbilityKey, ab: AbilityDef): void;
};
const inner = (sim: ArcadeSim) => sim as unknown as Internals;

function arena(hero: string, seed: string) {
  const sim = new ArcadeSim(seed, { hero });
  for (const e of sim.enemies) if (e.alive) e.alive = false;
  const p = sim.player;
  const dummy = inner(sim).spawnEnemy(ENEMY_KINDS.ogre, p.x + 30, p.y);
  dummy.hp = dummy.maxHp = 1e7;
  p.stats.critChance = 0;
  return { sim, p, dummy, a: inner(sim) };
}
const wolfAt = (sim: ArcadeSim, e: Enemy) => { sim.pets.push({ kind: "wolf", x: e.x - 20, y: e.y, cd: 0, facingX: 1, facingY: 0, hitAt: -999, inReach: true }); };

describe("Аркада: происхождение урона", () => {
  it("Vampiric Spirit: лечит удар героя и его крит, не лечит укус питомца", () => {
    const { sim, p, dummy, a } = arena("wraith_king", "origin-vamp");
    expect(HEROES.wraith_king.signature?.kind).toBe("vampiric");
    p.hp = 100;
    wolfAt(sim, dummy);
    const hp0 = dummy.hp;
    a.tickPets();
    expect(dummy.hp).toBeLessThan(hp0); // волк укусил
    expect(p.hp).toBe(100); // было: лечил, как автоатака героя
    a.onAttackHit(dummy);
    const afterHit = p.hp;
    expect(afterHit).toBeGreaterThan(100);
    p.stats.critChance = 1;
    a.onAttackHit(dummy);
    expect(p.hp).toBeGreaterThan(afterHit); // было: крит героя не лечил
  });

  it("Backstab: бонус у удара героя (и у крита), у питомца его нет", () => {
    const { sim, p, dummy, a } = arena("riki", "origin-backstab");
    const sig = HEROES.riki.signature!;
    expect(sig.kind).toBe("backstab");
    const dealt = (fn: () => void) => { const h = dummy.hp; fn(); return h - dummy.hp; };
    // Питомец по оглушённой и по свободной цели бьёт одинаково.
    wolfAt(sim, dummy);
    const free = dealt(() => a.tickPets());
    dummy.stunUntil = sim.tick + 600;
    sim.pets[0].cd = 0;
    const stunned = dealt(() => a.tickPets());
    expect(free).toBeGreaterThan(0);
    expect(stunned).toBeCloseTo(free, 6); // было: ×(1 + value) от пассивки героя
    // Крит героя по оглушённой получает бонус.
    sim.pets.length = 0;
    p.stats.critChance = 1;
    const critStunned = dealt(() => a.onAttackHit(dummy));
    dummy.stunUntil = 0; dummy.chillUntil = 0; dummy.freezeUntil = 0; // волк ещё и замедляет — «свободная» цель без статусов
    const critFree = dealt(() => a.onAttackHit(dummy));
    expect(critStunned / critFree).toBeCloseTo(1 + sig.value, 6); // было: 1 — крит терял пассивку
  });

  it("Кровавик: лечит с умения, рисующего «crit» (Assassinate), от нанесённого; автоатака и питомец не лечат", () => {
    const { sim, p, dummy, a } = arena("sniper", "origin-bloodstone");
    p.upgrades.leg_bloodstone = { rank: 1, power: 1, cap: 1 };
    p.stats.lifesteal = 0;
    p.hp = 100;
    const ab = HEROES.sniper.abilities.r;
    expect(ab.kind).toBe("assassinate");
    p.abilities.r = 1;
    a.castAbility("r", ab);
    expect(p.hp).toBeCloseTo(100 + ab.value[1] * 0.1, 6); // было: 100 — fx "crit" считался автоатакой
    // От нанесённого, не от номинала: цель с 40 HP под ударом на 450 лечит на 4, а не на 45.
    p.hp = 100;
    dummy.alive = false;
    const weak = a.spawnEnemy(ENEMY_KINDS.ogre, p.x + 30, p.y);
    weak.hp = 40;
    sim.damageEnemy(weak, 450, "burst", "ability");
    expect(weak.alive).toBe(false);
    expect(p.hp).toBeCloseTo(104, 6);
    // Автоатака героя (в т.ч. крит) и питомец — не «урон умениями».
    const d2 = a.spawnEnemy(ENEMY_KINDS.ogre, p.x + 30, p.y); d2.hp = d2.maxHp = 1e7;
    p.hp = 100; p.stats.critChance = 1;
    a.onAttackHit(d2);
    wolfAt(sim, d2);
    a.tickPets();
    expect(p.hp).toBe(100);
  });
});
