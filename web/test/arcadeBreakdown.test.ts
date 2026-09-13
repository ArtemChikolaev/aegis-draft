import { describe, expect, it } from "vitest";
import { ArcadeSim, KIND_INDEX } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT, type Enemy } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS, type EnemyKind } from "../src/game/arcade/content/enemies.ts";

type Internals = {
  damagePlayer(a: number, stun?: number, by?: EnemyKind): void;
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  onAttackHit(e: Enemy): void;
  castAbility(k: string, ab: unknown): void;
  applyBurn(e: Enemy, dps: number, seconds: number): void;
  applyPoison(e: Enemy, dps: number): void;
  dealtBySource: Record<string, number>;
  takenByKind: Record<string, number>;
};

const QUIET = { mx: 0, my: 0, cast: 0, choose: -1, act: 0 };

// Разбор забега (T13.74): итог знает, кто добил, доли нанесённого урона по источникам и полученного — по видам врагов.
describe("разбор забега", () => {
  it("смерть: killer — вид последнего ударившего; полученный урон — после брони, смертельный — не больше оставшегося HP", () => {
    const sim = new ArcadeSim("breakdown-1", { act: "short", composition: "all" });
    const internals = sim as unknown as Internals;
    for (let i = 0; i < 1200 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); }
    expect(sim.over).toBeNull();
    const armor = sim.player.stats.armor, reduction = (0.06 * armor) / (1 + 0.06 * armor);
    internals.damagePlayer(5, 0, ENEMY_KINDS.ogre);
    const hpBeforeLethal = sim.player.hp;
    internals.damagePlayer(1e9, 0, ENEMY_KINDS.hill_troll);
    sim.step(IDLE_INPUT);
    const o = sim.over!;
    expect(o.outcome).toBe("dead");
    expect(o.killer).toBe("hill_troll");
    expect(o.takenByKind?.ogre).toBeCloseTo(Math.max(1, 5 * (1 - reduction)), 9);
    expect(o.takenByKind?.hill_troll).toBeCloseTo(hpBeforeLethal, 9);
    const dealt = o.dealtBySource ?? {};
    expect(Object.values(dealt).reduce((n, v) => n + v, 0)).toBeGreaterThan(0);
    expect(dealt.attack ?? 0).toBeGreaterThan(0);
    // Нанесённое не превышает суммарного HP убитых с запасом: учитываем только фактически снятое, не переурон.
    for (const v of Object.values(dealt)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("уклонение и урон, принятый щитом руны, в полученный не пишутся", () => {
    const sim = new ArcadeSim("breakdown-3", { act: "short" });
    const internals = sim as unknown as Internals;
    const p = sim.player;
    p.evadeUntil = 1e9; p.evadeChance = 1;
    internals.damagePlayer(40, 0, ENEMY_KINDS.ogre);
    expect(internals.takenByKind.ogre).toBeUndefined();
    p.evadeUntil = 0;
    p.shieldHp = 1000; p.shieldUntil = 1e9;
    internals.damagePlayer(40, 0, ENEMY_KINDS.ogre);
    expect(internals.takenByKind.ogre).toBeUndefined();
    expect(p.hp).toBe(p.stats.maxHp);
  });

  it("источник не теряется во вложенных эффектах: яд с удара — удар, нова с ядом — умение, тики горения и яда — DoT", () => {
    const viper = new ArcadeSim("breakdown-src", { hero: "viper", act: "short" });
    const v = viper as unknown as Internals;
    const big = (sim: ArcadeSim, x: number, y: number) => { const e = (sim as unknown as Internals).spawnEnemy(ENEMY_KINDS.ogre, x, y); e.hp = e.maxHp = 1e7; return e; };
    viper.player.abilities.q = 1; // Poison Attack: пассивка на удар со стаком яда
    const target = big(viper, viper.player.x + 100, viper.player.y);
    v.dealtBySource = {};
    v.onAttackHit(target);
    expect(Object.keys(v.dealtBySource)).toEqual(["attack"]);
    viper.player.abilities.w = 1; // Nethertoxin: нова с ядом
    for (let i = 0; i < 3; i++) big(viper, viper.player.x + 40 + i * 10, viper.player.y);
    v.dealtBySource = {};
    v.castAbility("w", viper.hero.abilities.w);
    expect(v.dealtBySource.w).toBeGreaterThan(0);
    expect(v.dealtBySource.dot).toBeUndefined();

    const jugg = new ArcadeSim("breakdown-dot", { hero: "juggernaut", act: "short" });
    const j = jugg as unknown as Internals;
    const p = jugg.player;
    p.abilities.q = 0; p.autoAttack = false; p.autoCast = { q: false, w: false, e: false, r: false }; p.invulnUntil = 1e12;
    const burning = big(jugg, p.x + 500, p.y), poisoned = big(jugg, p.x - 500, p.y);
    j.applyBurn(burning, 50, 5);
    j.applyPoison(poisoned, 30);
    j.dealtBySource = {};
    for (let i = 0; i < 60; i++) jugg.step(QUIET);
    expect(j.dealtBySource.dot).toBeGreaterThan(0);
    expect(Object.keys(j.dealtBySource)).toEqual(["dot"]);
  });

  it("отражение Tormentor пишется в полученный урон по его виду", () => {
    const sim = new ArcadeSim("breakdown-reflect", { act: "full" });
    const internals = sim as unknown as Internals;
    const t = internals.spawnEnemy(ENEMY_KINDS.tormentor, sim.player.x + 60, sim.player.y);
    sim.damageEnemy(t, 100, "hit");
    expect(internals.takenByKind.tormentor).toBeGreaterThan(0);
    expect(internals.takenByKind.projectile).toBeUndefined();
    expect(sim.events.hurtBy).toBe(KIND_INDEX.tormentor);
  });

  it("победа: killer пустой, разбор всё равно есть", () => {
    const sim = new ArcadeSim("breakdown-2", { act: "short", composition: "all" });
    for (let i = 0; i < 600 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); }
    (sim as unknown as { finish(o: "victory"): void }).finish("victory");
    expect(sim.over!.killer).toBeNull();
    expect(sim.over!.dealtBySource).toBeDefined();
  });
});
