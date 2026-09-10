import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type Enemy } from "../src/game/arcade/types.ts";

// Тролль-Некромант (T13.46, этап 3 аудита): идолы поднимают павших, снос идолов останавливает призыв и открывает его.
const N = ARCADE.necro;
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); } };
const idols = (sim: ArcadeSim): Enemy[] => sim.enemies.filter((e) => e.alive && e.kind.id === "bone_idol");
const skeletons = (sim: ArcadeSim): Enemy[] => sim.enemies.filter((e) => e.alive && e.kind.id === "skeleton_warrior");
const quiet = (sim: ArcadeSim) => { for (const e of sim.enemies) if (e.alive && e !== sim.necromancer && e.kind.id !== "bone_idol" && !e.kind.totem) e.alive = false; sim.defiler = null; sim.centaur = null; sim.camp!.nextGuardAt = 1e9; };

describe("Тролль-Некромант", () => {
  it("курган по seed вдали от других мест, два идола, спящие неуязвимы и не цели; вход будит", () => {
    for (const act of ["short", "full", "dire", "river"] as const) {
      const a = new ArcadeSim("necro-1", { act }), b = new ArcadeSim("necro-1", { act });
      expect(a.barrow).toEqual(b.barrow);
      const bw = a.barrow!;
      for (const o of [a.camp!, a.outpost!, a.pond!, a.grove!]) expect(Math.hypot(bw.x - o.x, bw.y - o.y), act).toBeGreaterThanOrEqual(N.minFromOthers - 60);
      expect(idols(a), act).toHaveLength(N.idols);
      expect(a.necromancer?.kind.id).toBe("troll_necromancer");
    }
    const sim = new ArcadeSim("necro-1");
    quiet(sim);
    const nm = sim.necromancer!, id = idols(sim)[0];
    expect(sim.isDormant(nm)).toBe(true); expect(sim.isDormant(id)).toBe(true);
    const hp = id.hp; sim.damageEnemy(id, 100, "hit"); expect(id.hp).toBe(hp);
    expect(sim.nearestEnemy(id.x, id.y, 60)).toBeNull();
    sim.player.x = sim.barrow!.x + N.wakeRadius - 10; sim.player.y = sim.barrow!.y; step(sim, 1);
    expect(sim.playerAtBarrow()).toBe(true);
    expect(sim.isDormant(id)).toBe(false);
  });

  it("подъём павших: пока герой у кургана и стоит идол — скелеты у идола каждые raiseEvery, с потолком; без идолов — нет", () => {
    const sim = new ArcadeSim("necro-2");
    quiet(sim);
    const bw = sim.barrow!;
    sim.player.x = bw.x; sim.player.y = bw.y + 120; sim.necromancer!.shotCd = 1e9;
    sim.player.autoAttack = false; sim.player.autoCast = { q: false, w: false, e: false, r: false }; // считаем поднятых, не убитых
    step(sim, 2);
    expect(skeletons(sim).length).toBe(N.raiseBase + N.idols);
    for (const s of skeletons(sim)) expect(Math.min(...idols(sim).map((i) => Math.hypot(s.x - i.x, s.y - i.y)))).toBeLessThan(90);
    step(sim, N.raiseEvery);
    expect(skeletons(sim).length).toBe(2 * (N.raiseBase + N.idols));
    for (let i = 0; i < 6; i++) step(sim, N.raiseEvery);
    expect(skeletons(sim).length).toBeLessThanOrEqual(N.maxRisen);
    // Снесли один идол — партия меньше; снесли оба — призыва нет, некромант открыт.
    for (const s of skeletons(sim)) s.alive = false;
    sim.damageEnemy(idols(sim)[0], 1e9, "hit");
    expect(bw.idolsDown).toBe(1);
    step(sim, N.raiseEvery + 1);
    expect(skeletons(sim).length).toBe(N.raiseBase + 1);
    for (const s of skeletons(sim)) s.alive = false;
    sim.damageEnemy(idols(sim)[0], 1e9, "hit");
    expect(idols(sim)).toHaveLength(0);
    step(sim, N.raiseEvery * 2);
    expect(skeletons(sim)).toHaveLength(0);
    const nm = sim.necromancer!;
    const hp0 = nm.hp; sim.damageEnemy(nm, 100, "hit");
    expect(hp0 - nm.hp).toBeCloseTo(100 * N.exposedDmgMult, 5);
  });

  it("держит дистанцию и стреляет; уход за поводок/из кургана — домой и лечится; контроль не дольше ccCap", () => {
    const sim = new ArcadeSim("necro-3");
    quiet(sim);
    const bw = sim.barrow!, nm = sim.necromancer!;
    bw.nextRaiseAt = 1e9;
    sim.player.x = nm.x + 60; sim.player.y = nm.y; bw.engaged = true;
    const d0 = Math.hypot(nm.x - sim.player.x, nm.y - sim.player.y);
    step(sim, 1);
    expect(nm.shotCd).toBeGreaterThan(0); // выстрелил сразу
    for (let i = 0; i < sec(1); i++) { sim.player.x = nm.x + 60; sim.player.y = nm.y; step(sim, 1); }
    expect(Math.hypot(nm.x - sim.player.x, nm.y - sim.player.y)).toBeGreaterThan(d0); // слишком близко — отходит
    expect(Math.hypot(nm.x - bw.x, nm.y - bw.y)).toBeLessThanOrEqual(N.leash + 5);
    sim.player.x = bw.x + N.engageRadius + 300; sim.player.y = bw.y;
    nm.hp = nm.maxHp * 0.5;
    step(sim, sec(2));
    expect(sim.playerAtBarrow()).toBe(false);
    expect(nm.hp).toBeGreaterThan(nm.maxHp * 0.5);
    expect(Math.hypot(nm.x - bw.x, nm.y - bw.y)).toBeLessThan(60);
    bw.engaged = true; sim.player.x = bw.x; sim.player.y = bw.y + 200;
    nm.stunUntil = sim.tick + sec(5);
    step(sim, 1);
    expect(nm.stunUntil - sim.tick).toBeLessThanOrEqual(N.ccCap);
  });

  it("смерть: скелеты рассыпаются, награда — три exotic-карты Зверинца (или обычные), итог помнит, digest детерминирован", () => {
    const sim = new ArcadeSim("necro-4");
    quiet(sim);
    const bw = sim.barrow!;
    sim.player.x = bw.x; sim.player.y = bw.y + 120;
    step(sim, 2);
    expect(skeletons(sim).length).toBeGreaterThan(0);
    sim.damageEnemy(sim.necromancer!, 1e9, "hit");
    expect(sim.necromancer).toBeNull();
    expect(skeletons(sim)).toHaveLength(0);
    expect(sim.pending).toHaveLength(3);
    expect(sim.pendingSource).toBe("camp");
    for (const o of sim.pending!) { expect(o.kind).toBe("upgrade"); if (o.kind === "upgrade") { expect(o.rarity).toBe("exotic"); expect(o.id.startsWith("beast_") || o.id.startsWith("leg_beast")).toBe(true); } }
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.player.schools).toContain("beast");
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.necromancerSlain).toBe(true);
    const run = () => { const x = new ArcadeSim("necro-5"); x.player.x = x.barrow!.x; x.player.y = x.barrow!.y + 120; step(x, sec(12)); return x.digest(); };
    expect(run()).toBe(run());
  });
});
