import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Строй стрелков (T13.81, аудит §4): линия лучников, телеграф полосы, залп только по тем, кто остался в полосе.
const C = ARCADE.archers;
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.lootOpen || sim.pondOpen || sim.forgeOpen || sim.riftOpen || sim.neutralOpen || sim.contractOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); } };
const untilMinute = (sim: ArcadeSim, min: number) => { let g = 0; while (sim.minutes < min && !sim.over && g++ < sec(60 * 30)) step(sim, 1); };
const archers = (sim: ArcadeSim, id: number) => sim.enemies.filter((e) => e.alive && e.kind.id === "archer" && e.leader === id);

describe("строй стрелков", () => {
  it("линия приходит с fromMin поперёк направления на героя; телеграф объявляется в дальности; залп бьёт в полосе и не бьёт сбоку", () => {
    const sim = new ArcadeSim("archers-1", { act: "short", composition: "all" });
    untilMinute(sim, C.fromMin + 0.02);
    expect(sim.archerLines).toHaveLength(1);
    const line = sim.archerLines[0];
    expect(archers(sim, line.id)).toHaveLength(C.count);
    // Поставить героя в дальности перед строем и дождаться телеграфа.
    const p = sim.player;
    for (const e of archers(sim, line.id)) { e.x = p.x + C.range + e.wpX * 0; e.y = p.y + e.wpX; }
    line.nextAt = sim.tick;
    sim.step(IDLE_INPUT);
    expect(line.fireAt).toBeGreaterThan(sim.tick);
    // Герой стоит в полосе → залп бьёт; сравниваем с героем, шагнувшим вбок на ширину полосы.
    const inside = new ArcadeSim("archers-1", { act: "short", composition: "all" });
    untilMinute(inside, C.fromMin + 0.02);
    const li = inside.archerLines[0]; const pi = inside.player;
    for (const e of inside.enemies) if (e.alive && e.kind.id !== "archer") e.alive = false; // чтобы урон был только от залпа
    for (const e of archers(inside, li.id)) { e.x = pi.x + C.range; e.y = pi.y + e.wpX; }
    li.nextAt = inside.tick; inside.step(IDLE_INPUT);
    const fireAt = li.fireAt;
    pi.hp = pi.stats.maxHp; pi.invulnUntil = 0;
    while (inside.tick < fireAt) inside.step(IDLE_INPUT);
    expect(inside.player.hp).toBeLessThan(inside.player.stats.maxHp);
    expect(li.fireAt).toBe(0);
    expect(li.nextAt).toBeGreaterThan(inside.tick);
    const aside = new ArcadeSim("archers-1", { act: "short", composition: "all" });
    untilMinute(aside, C.fromMin + 0.02);
    const la = aside.archerLines[0]; const pa = aside.player;
    for (const e of aside.enemies) if (e.alive && e.kind.id !== "archer") e.alive = false;
    for (const e of archers(aside, la.id)) { e.x = pa.x + C.range; e.y = pa.y + e.wpX; }
    la.nextAt = aside.tick; aside.step(IDLE_INPUT);
    const fa = la.fireAt;
    // Шаг вбок на ширину полосы — телеграф уже зафиксирован по прежней позиции.
    const y0 = pa.y;
    pa.y = y0 + C.width + 10; pa.hp = pa.stats.maxHp; pa.invulnUntil = 0;
    const before = pa.hp;
    while (aside.tick < fa) { aside.step(IDLE_INPUT); pa.y = y0 + C.width + 10; }
    expect(la.fireAt).toBe(0);
    expect(pa.hp).toBeGreaterThanOrEqual(before - 1e-6);
  }, 60_000);

  it("лучники держат дистанцию (не идут вплотную), линия исчезает, когда все мертвы; строев не больше maxLines", () => {
    const sim = new ArcadeSim("archers-2", { act: "short", composition: "all" });
    untilMinute(sim, C.fromMin + 0.02);
    const line = sim.archerLines[0];
    const p = sim.player;
    for (const e of archers(sim, line.id)) { e.x = p.x + C.range; e.y = p.y + e.wpX; }
    step(sim, 120);
    for (const e of archers(sim, line.id)) expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeGreaterThan(C.range - 100);
    for (const e of archers(sim, line.id)) sim.damageEnemy(e, 1e9, "hit");
    sim.step(IDLE_INPUT);
    expect(sim.archerLines.some((l) => l.id === line.id)).toBe(false);
    const many = new ArcadeSim("archers-3", { act: "short", composition: "all" });
    untilMinute(many, C.fromMin + (C.every * 4) / 3600 + 0.02);
    expect(many.archerLines.length).toBeLessThanOrEqual(C.maxLines);
  }, 60_000);
});
