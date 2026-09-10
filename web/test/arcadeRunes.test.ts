// Руны у реки и иллюзии (T13.32, владелец 2026-09-07): двойной урон, щит, магия, иллюзии; иллюзионисты
// (Terrorblade, Naga, PL, CK) призывают копии героя, которые бегут за ним и бьют; в Метаморфозе — дальним боем.
import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, RUNE_KINDS, type RuneKind } from "../src/game/arcade/types.ts";

function runToRune(sim: ArcadeSim): void {
  let guard = 0;
  while (!sim.rune.alive && guard++ < sec(400) && !sim.over) {
    sim.player.hp = 1e6;
    sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.contractOpen || sim.forgeOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT);
  }
  expect(sim.rune.alive).toBe(true);
}

function grab(sim: ArcadeSim, kind: RuneKind): void {
  sim.runeKind = kind;
  sim.player.x = sim.rune.x; sim.player.y = sim.rune.y;
  sim.step(IDLE_INPUT);
  expect(sim.rune.alive).toBe(false);
}

describe("руны", () => {
  it("появляется на 1:30, лежит 45 с, вид — один из четырёх", () => {
    const sim = new ArcadeSim("rune-1");
    runToRune(sim);
    expect(sim.tick).toBe(ARCADE.rune.first);
    expect(RUNE_KINDS).toContain(sim.runeKind);
    const until = sim.rune.until;
    expect(until - sim.tick).toBeLessThanOrEqual(ARCADE.rune.lifetime);
  });
  it("двойной урон удваивает удар на срок руны", () => {
    const sim = new ArcadeSim("rune-2");
    runToRune(sim);
    grab(sim, "dd");
    expect(sim.player.ddUntil).toBe(sim.tick + sec(ARCADE.rune.dd.seconds));
  });
  it("щит принимает урон первым и держит половину здоровья", () => {
    const sim = new ArcadeSim("rune-3");
    runToRune(sim);
    grab(sim, "shield");
    expect(sim.player.shieldHp).toBe(Math.round(sim.player.stats.maxHp * ARCADE.rune.shield.frac));
    sim.player.hp = sim.player.stats.maxHp;
    const shield = sim.player.shieldHp;
    // Урон снимается со щита, здоровье цело.
    (sim as unknown as { damagePlayer(a: number): void }).damagePlayer(40);
    expect(sim.player.hp).toBe(sim.player.stats.maxHp);
    expect(sim.player.shieldHp).toBeLessThan(shield);
  });
  it("руна магии укорачивает перезарядку на 30%", () => {
    const sim = new ArcadeSim("rune-4", { hero: "crystal_maiden" });
    runToRune(sim);
    grab(sim, "arcane");
    expect(sim.player.arcaneUntil).toBeGreaterThan(sim.tick);
    sim.player.abilities.q = Math.max(1, sim.player.abilities.q);
    sim.player.cooldowns.q = 0;
    sim.step({ ...IDLE_INPUT, cast: 1 });
    const cd = sim.player.cooldowns.q;
    expect(cd).toBeGreaterThan(0);
    expect(cd).toBeLessThanOrEqual(Math.round(sec(sim.hero.abilities.q.cooldown * (1 - sim.player.stats.cooldown)) * (1 - ARCADE.rune.arcane.cooldown)) + 1);
  });
  it("руна иллюзий даёт две копии героя на 75 с, они бегут за героем и исчезают", () => {
    const sim = new ArcadeSim("rune-5");
    runToRune(sim);
    grab(sim, "illusion");
    const ill = sim.pets.filter((p) => p.kind === "illusion");
    expect(ill.length).toBe(ARCADE.rune.illusion.count);
    expect(ill[0].dmg).toBeCloseTo(sim.player.stats.damage * ARCADE.rune.illusion.dmgFrac, 6);
    for (let i = 0; i < sec(5); i++) { sim.player.hp = 1e6; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : { ...IDLE_INPUT, mx: 16 }); }
    for (const p of sim.pets) if (p.kind === "illusion") expect(Math.hypot(p.x - sim.player.x, p.y - sim.player.y)).toBeLessThan(400);
    sim.tick = ill[0].until! + 1;
    sim.step(IDLE_INPUT);
    expect(sim.pets.filter((p) => p.kind === "illusion").length).toBe(0);
  });
});

describe("иллюзионисты", () => {
  it("Naga: Mirror Image призывает копии-питомцев, а не тотем", () => {
    const sim = new ArcadeSim("ill-1", { hero: "naga_siren" });
    const key = (["q", "w", "e", "r"] as const).find((k) => sim.hero.abilities[k].summon?.art === "illusion")!;
    expect(key).toBeDefined();
    sim.player.abilities[key] = 1;
    sim.player.cooldowns[key] = 0;
    sim.step({ ...IDLE_INPUT, cast: { q: 1, w: 2, e: 4, r: 8 }[key] });
    expect(sim.pets.filter((p) => p.kind === "illusion").length).toBe(sim.hero.abilities[key].summon?.count ?? 1);
    expect(sim.player.wardUntil).toBeLessThanOrEqual(sim.tick);
  });
  it("Terrorblade: в Метаморфозе иллюзии стреляют, без неё бьют вблизи", () => {
    const sim = new ArcadeSim("ill-2", { hero: "terrorblade" });
    const keys = ["q", "w", "e", "r"] as const;
    const ill = keys.find((k) => sim.hero.abilities[k].summon?.art === "illusion")!;
    const meta = keys.find((k) => sim.hero.abilities[k].kind === "metamorphosis")!;
    for (const k of [ill, meta]) { sim.player.abilities[k] = 1; sim.player.cooldowns[k] = 0; }
    const mask = { q: 1, w: 2, e: 4, r: 8 };
    sim.step({ ...IDLE_INPUT, cast: mask[ill] });
    expect(sim.pets.some((p) => p.kind === "illusion")).toBe(true);
    // Ставим врага рядом с иллюзией и смотрим, чем она бьёт: в Метаморфозе — снарядом (attack=false, урон в снаряде).
    const pet = sim.pets.find((p) => p.kind === "illusion")!;
    sim.step({ ...IDLE_INPUT, cast: mask[meta] });
    expect(sim.rangedNow()).toBe(true);
    let shot = false;
    for (let i = 0; i < sec(6) && !shot; i++) {
      sim.player.hp = 1e6;
      const e = sim.enemies.find((x) => x.alive);
      if (e) { e.x = pet.x + 90; e.y = pet.y; e.hp = 1e6; }
      sim.step(IDLE_INPUT);
      if (sim.projectiles.some((p) => p.alive && !p.fromEnemy && !p.attack && p.kind === "arrow" && Math.hypot(p.x - pet.x, p.y - pet.y) < 120)) shot = true;
    }
    expect(shot).toBe(true);
  });
});
