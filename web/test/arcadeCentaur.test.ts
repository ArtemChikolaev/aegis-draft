import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Кентавр-Страж рощи (T13.45, этап 3 аудита): размеченный рывок, врезался в камень — оглушён, потом широкий удар.
const C = ARCADE.centaur;
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); } };
/** Убрать обычный спавн и лагерных, чтобы считать только кентавра. */
/** Убрать камни из сетки препятствий — рывок по чистому полю. */
const clearRocks = (sim: ArcadeSim) => { const cells = (sim.obstacles as unknown as { cells: Map<number, { kind: string }[]> }).cells; for (const [k, list] of cells) cells.set(k, list.filter((o) => o.kind !== "rock")); };
const quiet = (sim: ArcadeSim) => { for (const e of sim.enemies) if (e.alive && e !== sim.centaur && !e.kind.totem) e.alive = false; sim.defiler = null; sim.camp!.nextGuardAt = 1e9; };

describe("Кентавр-Страж рощи", () => {
  it("роща по seed вдали от лагеря/аванпоста/пруда, детерминирована, кентавр дома и спит, пока рощу не разбудили", () => {
    for (const act of ["short", "full", "dire", "river"] as const) {
      const a = new ArcadeSim("centaur-1", { act }), b = new ArcadeSim("centaur-1", { act });
      expect(a.grove).toEqual(b.grove);
      const g = a.grove!;
      for (const o of [a.camp!, a.outpost!, a.pond!]) expect(Math.hypot(g.x - o.x, g.y - o.y), act).toBeGreaterThanOrEqual(C.minFromOthers - 60);
      expect(a.centaur?.kind.id).toBe("centaur_warden");
      expect([Math.round(a.centaur!.x), Math.round(a.centaur!.y)]).toEqual([Math.round(g.x), Math.round(g.y)]);
    }
    const sim = new ArcadeSim("centaur-1");
    quiet(sim);
    const s = sim.centaur!;
    s.hp = s.maxHp * 0.5;
    sim.player.x = sim.grove!.x + 400; sim.player.y = sim.grove!.y; // между wake и engage
    step(sim, sec(3));
    expect(sim.playerAtGrove()).toBe(false);
    expect([Math.round(s.x), Math.round(s.y)]).toEqual([Math.round(sim.grove!.x), Math.round(sim.grove!.y)]);
    expect(s.hp).toBeGreaterThan(s.maxHp * 0.5);
    // Спящий: не цель и не берёт урон; будит только вход в рощу.
    expect(sim.isDormant(s)).toBe(true);
    const hp1 = s.hp; sim.damageEnemy(s, 100, "hit");
    expect(s.hp).toBe(hp1);
    expect(sim.nearestEnemy(s.x, s.y, 50)).toBeNull();
    sim.player.x = sim.grove!.x + C.wakeRadius - 10; step(sim, 1);
    expect(sim.playerAtGrove()).toBe(true);
    expect(sim.isDormant(s)).toBe(false);
  });

  it("рывок: телеграф на позицию героя, затем бросок по прямой; попадание бьёт, промах кончается широким ударом", () => {
    const sim = new ArcadeSim("centaur-2");
    quiet(sim);
    const s = sim.centaur!, g = sim.grove!;
    clearRocks(sim); // чистое поле: рывок ничего не прервёт
    sim.player.x = g.x + 250; sim.player.y = g.y;
    g.engaged = true;
    step(sim, 2);
    expect(s.chargeLeft).toBe(-1);
    expect(s.slamT).toBeGreaterThan(0);
    expect([s.slamX, s.slamY]).toEqual([sim.player.x, sim.player.y]);
    expect(s.chargeDx).toBeCloseTo(1, 3);
    // Стоим на пути — получаем удар рывка.
    const hurt0 = sim.events.hurt;
    step(sim, C.chargeTelegraph + 12);
    expect(s.chargeLeft).toBeGreaterThan(0); // рывок идёт
    step(sim, 30); // 250 px при 540 px/с — герой на пути получает удар
    expect(sim.events.hurt).toBeGreaterThan(hurt0);
    // Уходим с пути на новом сиде и уклоняемся: без попадания, после пробега — широкий удар с телеграфом.
    const sim2 = new ArcadeSim("centaur-2b");
    quiet(sim2); clearRocks(sim2);
    const s2 = sim2.centaur!, g2 = sim2.grove!;
    sim2.player.x = g2.x + 250; sim2.player.y = g2.y; g2.engaged = true;
    step(sim2, 2);
    expect(s2.chargeLeft).toBe(-1);
    sim2.player.y = g2.y + 200; // в сторону
    const h2 = sim2.events.hurt;
    let guard = 0;
    while (s2.chargeLeft !== 0 && guard++ < sec(4)) { sim2.player.y = g2.y + 200; step(sim2, 1); }
    expect(s2.chargeHit || sim2.events.hurt > h2).toBe(false);
    expect(s2.slamT).toBeGreaterThan(0); // добежал — телеграф широкого удара на своей позиции
    expect([s2.slamX, s2.slamY]).toEqual([s2.x, s2.y]);
  });

  it("врезался в камень: оглушён на rockStun, берёт ×1.5 урона, звук/окно; контроль игрока не дольше ccCap", () => {
    const sim = new ArcadeSim("centaur-3");
    quiet(sim);
    const s = sim.centaur!, g = sim.grove!;
    clearRocks(sim);
    // Ставим камень прямо на пути рывка.
    const rock = { x: g.x + 150, y: g.y, r: 14, kind: "rock" as const };
    const grid = sim.obstacles as unknown as { cells: Map<number, unknown[]> };
    const key = Math.floor(rock.y / 256) * 4096 + Math.floor(rock.x / 256);
    const list = grid.cells.get(key); if (list) list.push(rock); else grid.cells.set(key, [rock]);
    sim.player.x = g.x + 250; sim.player.y = g.y; g.engaged = true;
    step(sim, 2);
    expect(s.chargeLeft).toBe(-1);
    sim.player.y = g.y + 250; // с дороги, но в пределах engageRadius — иначе он уснёт и станет неуязвим
    let guard = 0;
    while (!(sim.tick < s.stunUntil) && guard++ < sec(3)) { sim.player.y = g.y + 250; step(sim, 1); }
    expect(sim.tick < s.stunUntil).toBe(true);
    expect(s.stunUntil - sim.tick).toBeGreaterThan(C.rockStun - 20);
    expect(s.chargeLeft).toBe(0);
    const hp0 = s.hp; sim.damageEnemy(s, 100, "hit");
    expect(hp0 - s.hp).toBeCloseTo(100 * C.stunnedDmgMult, 5);
    // После оглушения — ограниченный контроль: стан 5 с режется до ccCap.
    step(sim, C.rockStun + 5);
    expect(sim.tick < s.stunUntil).toBe(false);
    step(sim, C.ccResist + 2);
    s.slamCd = 1e9; s.chargeLeft = 0; s.slamT = 0; // вне рывка: там контроль не режется (он короче окна)
    s.stunUntil = sim.tick + sec(5);
    step(sim, 1);
    expect(s.stunUntil - sim.tick).toBeLessThanOrEqual(C.ccCap);
  });

  it("поводок и награда: далеко от рощи возвращается и лечится; смерть роняет броню и сапоги exotic, итог помнит", () => {
    const sim = new ArcadeSim("centaur-4");
    quiet(sim);
    const s = sim.centaur!, g = sim.grove!;
    s.x = g.x + C.leash + 150; s.y = g.y; s.hp = s.maxHp * 0.5;
    sim.player.x = s.x + 40; sim.player.y = s.y; g.engaged = true;
    const home0 = Math.hypot(s.x - g.x, s.y - g.y);
    step(sim, sec(2));
    expect(Math.hypot(s.x - g.x, s.y - g.y)).toBeLessThan(home0 - 100);
    expect(s.hp).toBeGreaterThan(s.maxHp * 0.5);
    // Вне рощи он спит и неуязвим — будим входом и только потом добиваем.
    sim.player.x = g.x; sim.player.y = g.y; step(sim, 1);
    expect(sim.isDormant(s)).toBe(false);
    const loot0 = sim.groundLoot.length;
    sim.damageEnemy(s, 1e9, "hit");
    expect(sim.centaur).toBeNull();
    const dropped = sim.groundLoot.slice(loot0).map((l) => l.item);
    expect(dropped.map((i) => i.slot).sort()).toEqual(["armor", "boots"]);
    expect(dropped.every((i) => i.rarity === "exotic")).toBe(true);
    expect(sim.events.eliteKills).toBe(1);
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.centaurSlain).toBe(true);
    // Детерминизм боя у рощи.
    const run = () => { const x = new ArcadeSim("centaur-5"); x.player.x = x.grove!.x + 200; x.player.y = x.grove!.y; x.grove!.engaged = true; step(x, sec(12)); return x.digest(); };
    expect(run()).toBe(run());
  });
});
