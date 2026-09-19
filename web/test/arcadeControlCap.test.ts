import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Контроль чемпионов (аудит 2026-09-19): стан режется до ccCap и ДЕЙСТВУЕТ все ccCap тиков; иммунитет ccResist — только
// после его конца. Раньше иммунитет включался на следующем же тике и обнулял сам контроль: стан жил один тик.
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); } };
const quiet = (sim: ArcadeSim, keep: unknown) => { sim.camp!.nextGuardAt = 1e9; for (const e of sim.enemies) if (e.alive && !e.kind.totem && e !== keep) e.alive = false; };

describe("предел контроля чемпиона", () => {
  it("Осквернитель: стан 5 с держится ccCap тиков (не один), затем ccResist иммунитета, затем снова контролируется", () => {
    const D = ARCADE.defiler;
    const sim = new ArcadeSim("cc-cap-1");
    const s = sim.defiler!, camp = sim.camp!;
    quiet(sim, s);
    sim.player.x = camp.x; sim.player.y = camp.y; s.x = camp.x + 200; s.y = camp.y;
    step(sim, 2); // лагерь проснулся
    s.stunUntil = sim.tick + sec(5);
    const t0 = sim.tick;
    step(sim, 1);
    expect(s.stunUntil - sim.tick).toBeLessThanOrEqual(D.ccCap);
    const x0 = s.x, y0 = s.y;
    step(sim, D.ccCap - 3);
    expect(sim.tick < s.stunUntil, "через ccCap−2 тика всё ещё оглушён").toBe(true);
    expect([s.x, s.y]).toEqual([x0, y0]); // и правда стоит
    // Контроль нельзя продлить повторным станом, пока идёт первый.
    s.stunUntil = sim.tick + sec(5);
    step(sim, 1);
    expect(s.stunUntil).toBeLessThanOrEqual(t0 + 1 + D.ccCap);
    step(sim, 3);
    expect(sim.tick < s.stunUntil).toBe(false);
    // Окно иммунитета: новые станы и заморозки отбрасываются.
    s.stunUntil = sim.tick + sec(2); s.freezeUntil = sim.tick + sec(2);
    step(sim, 1);
    expect([s.stunUntil, s.freezeUntil]).toEqual([0, 0]);
    step(sim, D.ccResist);
    // Иммунитет кончился — контроль снова проходит и снова держится.
    s.stunUntil = sim.tick + sec(5);
    step(sim, Math.max(2, D.ccCap - 2));
    expect(sim.tick < s.stunUntil).toBe(true);
  });

  it("Кентавр: врезался в камень — оглушён все rockStun (окно ×stunnedDmgMult), а не один тик", () => {
    const C = ARCADE.centaur;
    const sim = new ArcadeSim("centaur-3");
    const s = sim.centaur!, g = sim.grove!;
    for (const e of sim.enemies) if (e.alive && e !== s && !e.kind.totem) e.alive = false;
    sim.defiler = null; sim.camp!.nextGuardAt = 1e9;
    const grid = sim.obstacles as unknown as { cells: Map<number, { kind: string }[]> };
    for (const [k, list] of grid.cells) grid.cells.set(k, list.filter((o) => o.kind !== "rock"));
    const rock = { x: g.x + 150, y: g.y, r: 14, kind: "rock" as const };
    const key = Math.floor(rock.y / 256) * 4096 + Math.floor(rock.x / 256);
    const list = grid.cells.get(key); if (list) list.push(rock); else grid.cells.set(key, [rock]);
    sim.player.x = g.x + 250; sim.player.y = g.y; g.engaged = true;
    step(sim, 2);
    expect(s.chargeLeft).toBe(-1);
    let guard = 0;
    while (!(sim.tick < s.stunUntil) && guard++ < sec(3)) { sim.player.y = g.y + 250; step(sim, 1); }
    expect(sim.tick < s.stunUntil).toBe(true);
    for (let i = 0; i < C.rockStun - 10; i++) { sim.player.y = g.y + 250; step(sim, 1); }
    expect(sim.tick < s.stunUntil, "за 10 тиков до конца rockStun всё ещё оглушён").toBe(true);
    const hp0 = s.hp; sim.damageEnemy(s, 100, "hit");
    expect(hp0 - s.hp).toBeCloseTo(100 * C.stunnedDmgMult, 5);
  });
});
