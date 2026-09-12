import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Аванпост (T13.42, «обзорная башня» аудита): удержание области копит захват, выход ставит на паузу, не сбрасывает;
// захват открывает точки карты маркерами и расширяет ночной обзор.
const O = ARCADE.outpost;
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); } };

describe("аванпост", () => {
  it("стоит по seed на кольце от старта, далеко от лагеря, не в дереве; детерминирован", () => {
    for (const act of ["short", "full", "dire", "river"] as const) {
      const a = new ArcadeSim("outpost-1", { act, composition: "all" }), b = new ArcadeSim("outpost-1", { act, composition: "all" });
      expect(a.outpost).toEqual(b.outpost);
      const o = a.outpost!;
      const d = Math.hypot(o.x - ARCADE.world.w / 2, o.y - ARCADE.world.h / 2);
      expect(d, act).toBeGreaterThanOrEqual(O.distMin - 80);
      expect(d, act).toBeLessThanOrEqual(O.distMax + 80);
      expect(Math.hypot(o.x - a.camp!.x, o.y - a.camp!.y), act).toBeGreaterThanOrEqual(O.minFromCamp - 60);
      expect(a.obstacles.blocked(o.x, o.y, 20), act).toBe(false);
      expect(o.need).toBe(sec(O.captureSec));
      if (act === "river") expect(Math.abs(o.y - ARCADE.river.y)).toBeGreaterThan(ARCADE.river.halfWidth);
    }
    expect(new ArcadeSim("outpost-2").outpost).not.toEqual(new ArcadeSim("outpost-1").outpost);
  });

  it("захват копится только в зоне, снаружи стоит на паузе без сброса, продолжается при возврате", () => {
    const sim = new ArcadeSim("outpost-3");
    const o = sim.outpost!;
    step(sim, sec(2));
    expect(o.progress).toBe(0);
    sim.player.x = o.x + 30; sim.player.y = o.y;
    const hold = (n: number) => { for (let i = 0; i < n; i++) { sim.player.x = o.x + 30; sim.player.y = o.y; step(sim, 1); } };
    hold(sec(5));
    expect(o.progress).toBeGreaterThanOrEqual(sec(5) - 3); // минус шаги выбора уровня (тик стоит)
    const paused = o.progress;
    expect(sim.playerAtOutpost()).toBe(true);
    sim.player.x = o.x + O.radius + 200;
    step(sim, sec(3));
    expect(o.progress).toBe(paused); // пауза, не сброс
    expect(o.captured).toBe(false);
    // Выбор уровня съедает шаг без тика — держим до need-1 по прогрессу, не по числу шагов.
    let guard = 0;
    while (o.progress < o.need - 1 && guard++ < o.need * 2) hold(1);
    expect(o.progress).toBe(o.need - 1);
    expect(o.captured).toBe(false);
    const gold = sim.player.gold;
    hold(1);
    expect(o.captured).toBe(true);
    expect(sim.events.outposts).toBe(1);
    expect(sim.player.gold).toBeGreaterThan(gold);
    hold(sec(2));
    expect(sim.events.outposts).toBe(1); // повторно не начисляется
    expect(o.progress).toBe(o.need);
  });

  it("захват расширяет ночной обзор и попадает в итог; digest учитывает прогресс", () => {
    const sim = new ArcadeSim("outpost-4", { act: "dire" });
    expect(sim.visionMult()).toBe(1);
    sim.outpost!.captured = true;
    expect(sim.visionMult()).toBe(O.nightVisionMult);
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.outpostCaptured).toBe(true);
    const run = (hold: boolean) => { const x = new ArcadeSim("outpost-5"); if (hold) { x.player.x = x.outpost!.x; x.player.y = x.outpost!.y; } for (let i = 0; i < 30; i++) { if (hold) { x.player.x = x.outpost!.x; x.player.y = x.outpost!.y; } step(x, 1); } return x.digest(); };
    expect(run(true)).toBe(run(true));
    expect(run(true)).not.toBe(run(false));
  });
});
