import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Страж переправы (T13.54, только River): щит по фазам, волны через русло с островком, руническая награда.
const Wd = ARCADE.warden, R = ARCADE.river;
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.contractOpen || sim.forgeOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); } };
const hold = (sim: ArcadeSim, x: number, y: number, n: number) => { for (let i = 0; i < n; i++) { sim.player.x = x; sim.player.y = y; step(sim, 1); } };
const quiet = (sim: ArcadeSim) => { for (const e of sim.enemies) if (e.alive && e !== sim.warden && !e.kind.totem) e.alive = false; sim.defiler = null; sim.centaur = null; sim.necromancer = null; sim.thunder = null; sim.camp!.nextGuardAt = 1e9; };

describe("Страж переправы", () => {
  it("есть только в River, стоит в русле по seed; спит и неуязвим; будится входом; фазы щит → открыт", () => {
    expect(new ArcadeSim("ford-1", { act: "full" }).ford).toBeNull();
    const sim = new ArcadeSim("ford-1", { act: "river" });
    expect(new ArcadeSim("ford-1", { act: "river" }).ford).toEqual(sim.ford);
    const f = sim.ford!, w = sim.warden!;
    expect(Math.abs(f.y - R.y)).toBeLessThan(1);
    expect(Math.abs(f.x - ARCADE.pit.x)).toBeGreaterThanOrEqual(Wd.fordDx[0] - 1);
    quiet(sim);
    expect(sim.isDormant(w)).toBe(true);
    const hp = w.hp; sim.damageEnemy(w, 100, "hit"); expect(w.hp).toBe(hp);
    hold(sim, f.x + Wd.wakeRadius - 10, f.y, 1);
    expect(sim.playerAtFord()).toBe(true);
    // Первая фаза — щит: урон не проходит; после shieldSec — открыт: проходит.
    hold(sim, f.x + 160, f.y, 2);
    expect(sim.wardenShielded()).toBe(true);
    const h1 = w.hp; sim.damageEnemy(w, 100, "hit"); expect(w.hp).toBe(h1);
    hold(sim, f.x + 160, f.y, sec(Wd.shieldSec) + 2);
    expect(sim.wardenShielded()).toBe(false);
    sim.damageEnemy(w, 100, "hit"); expect(w.hp).toBeLessThan(h1);
    hold(sim, f.x + 160, f.y, sec(Wd.openSec) + 2);
    expect(sim.wardenShielded()).toBe(true); // снова щит
  });

  it("волны идут через русло и бьют стоящего в воде вне островка; в разрыве и на берегу — нет; страж не выходит из воды", () => {
    const sim = new ArcadeSim("ford-2", { act: "river" });
    quiet(sim);
    const f = sim.ford!, w = sim.warden!;
    f.engaged = true;
    hold(sim, f.x + 180, f.y, 2);
    expect(f.waves.length).toBeGreaterThan(0);
    const wave = f.waves[0];
    // Стоим на пути волны в воде, вне разрыва.
    const yHit = wave.gapY > R.y ? R.y - R.halfWidth + 30 : R.y + R.halfWidth - 30;
    const xStand = wave.x + wave.dir * 200;
    const h0 = sim.events.hurt;
    let guard = 0;
    while (guard++ < sec(3) && sim.events.hurt === h0) hold(sim, xStand, yHit, 1);
    expect(sim.events.hurt).toBeGreaterThan(h0);
    // Островок: та же волна на новом сиде, стоим в разрыве — не бьёт; на берегу — не бьёт.
    const sim2 = new ArcadeSim("ford-2", { act: "river" });
    quiet(sim2);
    const f2 = sim2.ford!; f2.engaged = true;
    hold(sim2, f2.x + 180, f2.y, 2);
    const w2 = f2.waves[0];
    const h2 = sim2.events.hurt;
    sim2.warden!.x = f2.x - 600; // стража подальше, считаем только волну
    for (let i = 0; i < sec(3); i++) hold(sim2, w2.x + w2.dir * 200, w2.gapY, 1);
    expect(sim2.events.hurt).toBe(h2);
    const sim3 = new ArcadeSim("ford-2", { act: "river" });
    quiet(sim3);
    const f3 = sim3.ford!; f3.engaged = true;
    hold(sim3, f3.x + 180, f3.y, 2);
    const w3 = f3.waves[0];
    const h3 = sim3.events.hurt;
    sim3.warden!.x = f3.x - 600;
    for (let i = 0; i < sec(3); i++) hold(sim3, w3.x + w3.dir * 200, R.y + R.halfWidth + 60, 1);
    expect(sim3.events.hurt).toBe(h3);
    // Страж держится в воде, даже когда герой на берегу.
    const sim4 = new ArcadeSim("ford-2", { act: "river" });
    quiet(sim4);
    sim4.ford!.engaged = true;
    for (let i = 0; i < sec(4); i++) hold(sim4, sim4.ford!.x + 100, R.y - R.halfWidth - 200, 1);
    expect(Math.abs(sim4.warden!.y - R.y)).toBeLessThanOrEqual(R.halfWidth);
    void w;
  });

  it("смерть в открытой фазе: руны DD/щит/магия на runeSec, амулет exotic, цель контракта, итог и отметка", () => {
    const sim = new ArcadeSim("ford-3", { act: "river" });
    quiet(sim);
    const f = sim.ford!, w = sim.warden!;
    f.engaged = true;
    hold(sim, f.x + 160, f.y, sec(Wd.shieldSec) + 3);
    expect(sim.wardenShielded()).toBe(false);
    const loot0 = sim.groundLoot.length;
    sim.damageEnemy(w, 1e9, "hit");
    expect(sim.warden).toBeNull();
    const p = sim.player;
    expect(p.ddUntil - sim.tick).toBe(sec(Wd.runeSec));
    expect(p.arcaneUntil - sim.tick).toBe(sec(Wd.runeSec));
    expect(p.shieldHp).toBeGreaterThan(0);
    expect(sim.groundLoot.slice(loot0).map((l) => l.item.slot)).toEqual(["amulet"]);
    expect((sim as unknown as { contractTargets(): string[] }).contractTargets()).not.toContain("warden");
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.wardenSlain).toBe(true);
    expect((new ArcadeSim("ford-4", { act: "river" }) as unknown as { contractTargets(): string[] }).contractTargets()).toContain("warden");
  });
});
