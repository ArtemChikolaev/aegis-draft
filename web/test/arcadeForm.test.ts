import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";

// Владелец 2026-09-06: «у Terrorblade третий скилл — Metamorphosis: меняется модель и он бьёт дальнобойно,
// а сейчас он просто нажимает скилл и ничего не происходит».
describe("смена формы (Metamorphosis / Elder Dragon Form / True Form)", () => {
  const cast = (sim: ArcadeSim, key: "q" | "w" | "e" | "r") =>
    (sim as unknown as { castAbility(k: string, ab: unknown): void }).castAbility(key, sim.hero.abilities[key]);

  it("Terrorblade из ближнего боя переходит в дальний и возвращается", () => {
    const sim = new ArcadeSim("meta-tb", { hero: "terrorblade" });
    expect(sim.hero.ranged).toBe(false);
    expect(sim.rangedNow()).toBe(false);
    const meleeRange = sim.attackRange();
    sim.player.abilities.e = 1; sim.player.cooldowns.e = 0;
    cast(sim, "e");
    expect(sim.player.formUntil).toBeGreaterThan(sim.tick);
    expect(sim.rangedNow()).toBe(true);
    expect(sim.attackRange()).toBeGreaterThan(meleeRange);
    sim.player.formUntil = sim.tick;
    expect(sim.rangedNow()).toBe(false);
    expect(sim.attackRange()).toBe(meleeRange);
  });

  it("Alchemist: Chemical Rage — форма «мечи наголо» на время бафа, бой не меняется (владелец 2026-09-12)", () => {
    const sim = new ArcadeSim("meta-alch", { hero: "alchemist" });
    const range = sim.attackRange();
    expect(sim.formNow()).toBeNull();
    sim.player.abilities.r = 1; sim.player.cooldowns.r = 0;
    cast(sim, "r");
    expect(sim.player.frenzyUntil).toBeGreaterThan(sim.tick);
    expect(sim.player.formUntil).toBe(sim.player.frenzyUntil);
    expect(sim.formNow()).not.toBeNull();
    expect(sim.rangedNow()).toBe(false);
    expect(sim.attackRange()).toBe(range);
    // В ярости перезарядка удара короче базового интервала, и рендер должен вести анимацию по фактической длине.
    for (const e of sim.enemies) e.alive = false;
    const foe = (sim as unknown as { spawnEnemy(k: unknown, x: number, y: number): { hp: number; maxHp: number; stunUntil: number } }).spawnEnemy(ENEMY_KINDS.kobold, sim.player.x + 30, sim.player.y);
    foe.hp = 1e6; foe.maxHp = 1e6; foe.stunUntil = 1e9;
    sim.player.attackCd = 0;
    let guard = 0; while (sim.player.attackCd === 0 && guard++ < 30) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
    expect(sim.player.attackCd).toBeGreaterThan(0);
    expect(sim.player.attackCdMax).toBeGreaterThanOrEqual(sim.player.attackCd);
    expect(sim.player.attackCdMax).toBeLessThan(Math.round(sim.player.stats.attackInterval * 60));
    // Листы формы есть в обоих пиксельных манифестах — у базы и у обоих сетов.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    for (const man of ["scripts/blender/dota_manifest_px2.tsv", "scripts/blender/dota_manifest_px.tsv"]) {
      const ids = new Set(readFileSync(man, "utf8").split("\n").map((l) => l.split("\t")[0]));
      for (const id of ["alchemist@meta", "alchemist@frankenstein@meta", "alchemist@jungle_chief@meta"]) expect(ids.has(id), `${man} ${id}`).toBe(true);
      // Клинки ножен висят на костях hand_weapon и в ярости сами уходят в руки; вне ярости их нет вовсе:
      // база — ножны с `--drop-vgroup hand_weapon` (пустые), сеты — без оружия и ножен; @meta — ножны с клинками (база) или оружие сета.
      for (const l of readFileSync(man, "utf8").split("\n")) {
        const c = l.split("\t"); if (!c[0]?.startsWith("alchemist")) continue;
        expect(c[3] ?? "", c[0]).not.toContain("alchemist_sword"); // отдельная модель мечей не нужна: клинки — в ножнах
        if (c[0] === "alchemist") { expect(c[2]).toContain("--drop-vgroup (?i)hand_weapon"); expect(c[3]).toContain("alchemist_scabbard"); }
        else if (c[0] === "alchemist@meta") { expect(c[2]).not.toContain("--drop-vgroup"); expect(c[3]).toContain("alchemist_scabbard"); }
        else if (c[0].endsWith("@meta")) expect(c[3] ?? "", c[0]).toMatch(/_weapon\.vmdl_c/);
        else expect(c[3] ?? "", c[0]).not.toMatch(/_weapon\.vmdl_c|alchemist_scabbard/);
      }
    }
  });

  it("Lone Druid в True Form наоборот становится ближним бойцом", () => {
    const sim = new ArcadeSim("meta-ld", { hero: "lone_druid" });
    expect(sim.hero.ranged).toBe(true);
    sim.player.abilities.r = 1; sim.player.cooldowns.r = 0;
    cast(sim, "r");
    expect(sim.rangedNow()).toBe(false);
    expect(sim.attackRange()).toBeLessThan(sim.player.stats.range);
  });

  it("в форме автоатака летит снарядом у ближнего героя", () => {
    const sim = new ArcadeSim("meta-proj", { hero: "terrorblade" });
    for (let i = 0; i < 60 * 8 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
    sim.player.abilities.e = 1; sim.player.cooldowns.e = 0;
    cast(sim, "e");
    const before = sim.projectiles.filter((pr) => pr.alive).length;
    for (let i = 0; i < 90 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
    expect(sim.projectiles.filter((pr) => pr.alive).length).toBeGreaterThanOrEqual(before);
    expect(sim.projectiles.some((pr) => !pr.fromEnemy)).toBe(true);
  });

  it("вид metamorphosis объявлен ровно у героев со сменой формы", () => {
    const withForm = Object.values(HEROES).filter((h) => Object.values(h.abilities).some((a) => a.kind === "metamorphosis"));
    expect(withForm.map((h) => h.id).sort()).toEqual(["dragon_knight", "lone_druid", "terrorblade"]);
    for (const h of withForm) for (const a of Object.values(h.abilities)) if (a.kind === "metamorphosis") expect(a.form).toBeTruthy();
  });
});
