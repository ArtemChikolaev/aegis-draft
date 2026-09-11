import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";

// Прилив (T13.61, River): цикл по часам акта, широкое русло и замедление в воде; брод и яма всегда сухие.
const T = ARCADE.tide, R = ARCADE.river;
const period = sec(T.lowSec) + sec(T.warnSec) + sec(T.highSec);
const at = (sim: ArcadeSim, tick: number) => { sim.tick = tick; return sim.tidePhase(); };

describe("прилив", () => {
  it("фаза — чистая функция часов акта: до firstAt отлив, потом прилив → отлив → подъём по кругу; вне River всегда отлив", () => {
    const sim = new ArcadeSim("tide-1", { act: "river" });
    expect(at(sim, 0).phase).toBe("low");
    expect(at(sim, T.firstAt - 1).phase).toBe("low");
    expect(at(sim, T.firstAt)).toEqual({ phase: "warn", left: sec(T.warnSec) }); // первый прилив тоже телеграфирован
    expect(at(sim, T.firstAt + sec(T.warnSec))).toEqual({ phase: "high", left: sec(T.highSec) });
    expect(at(sim, T.firstAt + sec(T.warnSec) + sec(T.highSec)).phase).toBe("low");
    expect(at(sim, T.firstAt + period)).toEqual({ phase: "warn", left: sec(T.warnSec) });
    expect(at(sim, T.firstAt + period * 3 + sec(T.warnSec) + 10).phase).toBe("high");
    // Часы акта, не тик: пауза разлома фазу не двигает.
    sim.tick = T.firstAt + period; sim.pausedTicks = period; expect(sim.tidePhase().phase).toBe("warn"); sim.pausedTicks = 0;
    for (const a of ["short", "full", "dire"] as const) { const x = new ArcadeSim("tide-1", { act: a }); expect(at(x, T.firstAt).phase).toBe("low"); expect(x.riverHalfWidth()).toBe(R.halfWidth); }
  });

  it("в прилив русло шире, герой в воде медленнее на slow; у брода, в яме и в отлив — обычная скорость", () => {
    const sim = new ArcadeSim("tide-2", { act: "river" });
    const HIGH = T.firstAt + sec(T.warnSec);
    sim.tick = HIGH;
    expect(sim.riverHalfWidth()).toBeCloseTo(R.halfWidth * T.halfWidthMult, 5);
    const run = (x: number, y: number, tick: number) => { const s = new ArcadeSim("tide-2", { act: "river" }); s.tick = tick; s.player.x = x; s.player.y = y; for (const e of s.enemies) e.alive = false; const x0 = s.player.x; s.step({ ...IDLE_INPUT, mx: 16, my: 0 }); return s.player.x - x0; };
    const fordX = sim.ford!.x;
    const openX = fordX + T.safeHalfW + 400 > ARCADE.world.w - 200 ? fordX - T.safeHalfW - 400 : fordX + T.safeHalfW + 400;
    const wideY = R.y + R.halfWidth + 40; // вне обычного русла, но внутри приливного
    const dry = run(openX, R.y - R.halfWidth - 200, HIGH);
    const wet = run(openX, wideY, HIGH);
    expect(wet).toBeCloseTo(dry * (1 - T.slow), 3);
    expect(run(openX, wideY, HIGH + sec(T.highSec) + 5)).toBeCloseTo(dry, 3); // отлив: та же точка — суша
    expect(run(fordX, R.y, HIGH)).toBeCloseTo(dry, 3); // брод сухой
    expect(sim.inCurrent(ARCADE.pit.x, ARCADE.pit.y)).toBe(false); // яма сухая
    expect(sim.inCurrent(openX, R.y)).toBe(true);
  });

  it("рядовой враг в течении медленнее, Страж переправы и неудержимые — нет; детерминизм", () => {
    const mk = () => { const s = new ArcadeSim("tide-3", { act: "river" }); s.tick = T.firstAt + sec(T.warnSec); for (const e of s.enemies) e.alive = false; s.warden = null; s.stalker = null; return s; };
    const spawn = (s: ArcadeSim, kind: keyof typeof ENEMY_KINDS, x: number, y: number) => (s as unknown as { spawnEnemy(k: unknown, x: number, y: number): { x: number; y: number } }).spawnEnemy(ENEMY_KINDS[kind], x, y);
    const fordX = mk().ford!.x;
    const x0 = fordX > ARCADE.world.w / 2 ? fordX - 500 : fordX + 500;
    const a = mk(); a.player.x = x0 + 300; a.player.y = R.y; const k1 = spawn(a, "kobold", x0, R.y); a.step(IDLE_INPUT); const wet = k1.x - x0;
    const b = mk(); b.player.x = x0 + 300; b.player.y = R.y - 600; const k2 = spawn(b, "kobold", x0, R.y - 600); b.step(IDLE_INPUT); const dry = k2.x - x0;
    expect(wet).toBeCloseTo(dry * (1 - T.slow), 3);
    expect(a.inCurrent(x0, R.y)).toBe(true);
    const run = () => { const s = new ArcadeSim("tide-4", { act: "river" }); s.tick = T.firstAt - 30; for (let i = 0; i < sec(8); i++) { s.player.hp = s.player.stats.maxHp; s.step(s.pending ? { ...IDLE_INPUT, choose: 0 } : { ...IDLE_INPUT, mx: 0, my: 16 }); } return s.digest(); };
    expect(run()).toBe(run());
  });
});
