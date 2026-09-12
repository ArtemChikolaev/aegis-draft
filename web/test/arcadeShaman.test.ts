import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Шаман поддержки (T13.79, аудит §4): группа с временным щитом; приоритет цели — шаман, его смерть снимает щит.
const C = ARCADE.shaman;
const untilMinute = (sim: ArcadeSim, min: number) => { let g = 0; while (sim.minutes < min && !sim.over && g++ < sec(60 * 30)) step(sim, 1); };
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.lootOpen || sim.pondOpen || sim.forgeOpen || sim.riftOpen || sim.neutralOpen || sim.contractOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); } };

describe("шаман поддержки", () => {
  it("приходит с fromMin с охраной; держит дистанцию; щит снижает урон союзникам, не самому шаману, и истекает", () => {
    const sim = new ArcadeSim("shaman-1", { act: "short", composition: "all" });
    untilMinute(sim, C.fromMin + 0.02);
    const shamans = sim.enemies.filter((e) => e.alive && e.kind.id === "shaman");
    expect(shamans).toHaveLength(1);
    const sh = shamans[0];
    const guards = sim.enemies.filter((e) => e.alive && e.leader === sh.id);
    expect(guards).toHaveLength(C.guards);
    // Подтянуть группу к герою на дистанцию удержания, дать щиту сработать.
    const p = sim.player;
    sh.x = p.x + C.keepRange; sh.y = p.y; sh.shotCd = 0;
    for (const g of guards) { g.x = sh.x + 20; g.y = sh.y + 10; }
    step(sim, 2);
    const shielded = guards.filter((g) => g.alive && sim.tick < g.shieldUntil && g.shieldBy === sh.id);
    expect(shielded.length).toBeGreaterThan(0);
    expect(sim.tick < sh.shieldUntil).toBe(false);
    const g = shielded[0];
    const hp0 = g.hp; sim.damageEnemy(g, 10, "zap");
    expect(hp0 - g.hp).toBeCloseTo(10 * C.shieldMult, 5);
    const sh0 = sh.hp; sim.damageEnemy(sh, 10, "zap");
    expect(sh0 - sh.hp).toBeCloseTo(10, 5);
    // Шаман не подходит вплотную: на keepRange стоит на месте.
    const sx = sh.x; step(sim, 30);
    expect(Math.abs(sh.x - sx)).toBeLessThan(40);
    // Истечение щита.
    g.shieldUntil = sim.tick; const h1 = g.hp; sim.damageEnemy(g, 10, "zap");
    expect(h1 - g.hp).toBeCloseTo(10, 5);
  }, 30_000);

  it("смерть шамана снимает щит со всей группы; живых шаманов не больше maxAlive", () => {
    const sim = new ArcadeSim("shaman-2", { act: "short", composition: "all" });
    untilMinute(sim, C.fromMin + 0.02);
    const sh = sim.enemies.find((e) => e.alive && e.kind.id === "shaman")!;
    const guards = sim.enemies.filter((e) => e.alive && e.leader === sh.id);
    for (const g of guards) { g.shieldUntil = sim.tick + 600; g.shieldBy = sh.id; }
    sim.damageEnemy(sh, 1e9, "hit");
    expect(sh.alive).toBe(false);
    for (const g of guards) if (g.alive) { expect(g.shieldUntil).toBe(0); expect(g.leader).toBe(0); }
    // Дальше по расписанию — не больше maxAlive живых одновременно.
    const many = new ArcadeSim("shaman-3", { act: "short", composition: "all" });
    untilMinute(many, C.fromMin + (C.every * 4) / 3600 + 0.02);
    expect(many.enemies.filter((e) => e.alive && e.kind.id === "shaman").length).toBeLessThanOrEqual(C.maxAlive);
    // До fromMin шаманов нет.
    const early = new ArcadeSim("shaman-4", { act: "short", composition: "all" });
    untilMinute(early, C.fromMin - 0.05);
    expect(early.enemies.some((e) => e.alive && e.kind.id === "shaman")).toBe(false);
  }, 30_000);
});
