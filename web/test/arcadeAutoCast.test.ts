import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ATTACK_MASK, AUTOATTACK_ACT, AUTOCAST_ACT, IDLE_INPUT } from "../src/game/arcade/types.ts";

// Владелец 2026-09-06: «умения не должны нажиматься сами — только по кнопке, пока не включишь переключатель».
// Состояние автокаста живёт в симе и меняется через `act`, поэтому попадает в input-лог и реплей точен.
describe("автокаст умений", () => {
  const warm = (seed: string) => {
    const sim = new ArcadeSim(seed, { hero: "lina" });
    sim.player.abilities.q = 1;
    for (let i = 0; i < 60 * 8 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
    return sim;
  };

  it("по умолчанию включён (так гоняется бот калибровки и читаются старые реплеи)", () => {
    const sim = new ArcadeSim("ac-default", { hero: "lina" });
    expect(sim.player.autoCast).toEqual({ q: true, w: true, e: true, r: true });
  });

  it("act = AUTOCAST_ACT + i переключает своё умение и пишется в лог", () => {
    const sim = new ArcadeSim("ac-toggle", { hero: "lina" });
    sim.step({ ...IDLE_INPUT, act: AUTOCAST_ACT });
    expect(sim.player.autoCast.q).toBe(false);
    expect(sim.player.autoCast.w).toBe(true);
    sim.step({ ...IDLE_INPUT, act: AUTOCAST_ACT + 3 });
    expect(sim.player.autoCast.r).toBe(false);
    expect(sim.log.some((e) => e[5] === AUTOCAST_ACT)).toBe(true);
    sim.step({ ...IDLE_INPUT, act: AUTOCAST_ACT });
    expect(sim.player.autoCast.q).toBe(true);
  });

  it("выключенное умение не срабатывает само, но срабатывает по нажатию", () => {
    const off = warm("ac-off");
    off.step({ ...IDLE_INPUT, act: AUTOCAST_ACT });
    off.player.cooldowns.q = 0;
    const before = off.events.casts;
    for (let i = 0; i < 60 * 6 && !off.over; i++) { off.player.hp = off.player.stats.maxHp; off.step(IDLE_INPUT); }
    expect(off.events.casts).toBe(before);
    off.player.cooldowns.q = 0;
    off.step({ ...IDLE_INPUT, cast: 1 });
    expect(off.events.casts).toBeGreaterThan(before);
  });

  it("включённое умение срабатывает само по перезарядке", () => {
    const on = warm("ac-on");
    const before = on.events.casts;
    for (let i = 0; i < 60 * 6 && !on.over; i++) { on.player.hp = on.player.stats.maxHp; on.step(IDLE_INPUT); }
    expect(on.events.casts).toBeGreaterThan(before);
  });
});

describe("автоатака", () => {
  const warm = (seed: string) => {
    const sim = new ArcadeSim(seed, { hero: "juggernaut" });
    for (let i = 0; i < 60 * 8 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
    return sim;
  };

  it("включена по умолчанию; act переключает её", () => {
    const sim = new ArcadeSim("aa-default", { hero: "juggernaut" });
    expect(sim.player.autoAttack).toBe(true);
    sim.step({ ...IDLE_INPUT, act: AUTOATTACK_ACT });
    expect(sim.player.autoAttack).toBe(false);
    expect(sim.player.autoCast).toEqual({ q: true, w: true, e: true, r: true });
  });

  it("выключенная автоатака молчит, а бит ATTACK_MASK бьёт", () => {
    const sim = warm("aa-off");
    sim.step({ ...IDLE_INPUT, act: AUTOATTACK_ACT });
    // Во время Blade Fury герой не бьёт по правилам сима — гасим вихрь, иначе тест мерил бы не то.
    sim.player.spinUntil = 0;
    for (let i = 0; i < 4; i++) sim.step({ ...IDLE_INPUT, act: AUTOCAST_ACT + i });
    const e = sim.enemies.find((x) => x.alive)!;
    const hold = () => { sim.player.hp = 1e6; e.x = sim.player.x + 20; e.y = sim.player.y; e.hp = 1e6; };
    const before = sim.events.hits;
    for (let i = 0; i < 120; i++) { hold(); sim.step(IDLE_INPUT); }
    expect(sim.events.hits).toBe(before);
    for (let i = 0; i < 30; i++) { hold(); sim.step({ ...IDLE_INPUT, cast: ATTACK_MASK }); }
    expect(sim.events.hits).toBeGreaterThan(before);
  });
});
