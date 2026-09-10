import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type Enemy } from "../src/game/arcade/types.ts";

// Заражённый лагерь (T13.40, этап 1 аудита 2026-09-08): первая «цель карты» с маршрутом и выбором.
// Три тотема порчи по seed; охрана прибывает, пока герой внутри; снёс все — награда; можно уйти без штрафа.
const C = ARCADE.camp;

const totems = (sim: ArcadeSim): Enemy[] => sim.enemies.filter((e) => e.alive && e.kind.id === "corruption_totem");
const guards = (sim: ArcadeSim): Enemy[] => sim.enemies.filter((e) => e.alive && !e.kind.totem);
const idle = (sim: ArcadeSim, ticks: number) => { for (let i = 0; i < ticks && !sim.over; i++) { sim.player.hp = 1e6; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); } };
/** Убить обычных врагов, чтобы тесты про охрану считали только прибывших. */
const wipe = (sim: ArcadeSim) => { for (const e of guards(sim)) e.alive = false; sim.defiler = null; };

describe("заражённый лагерь", () => {
  it("стоит по seed на кольце от старта, три тотема свободны от препятствий, детерминирован", () => {
    for (const act of ["short", "full", "dire", "river"] as const) {
      const a = new ArcadeSim("camp-1", { act }), b = new ArcadeSim("camp-1", { act });
      expect(a.camp).toEqual(b.camp);
      const camp = a.camp!;
      const d = Math.hypot(camp.x - ARCADE.world.w / 2, camp.y - ARCADE.world.h / 2);
      expect(d, act).toBeGreaterThanOrEqual(C.distMin - 80); // clamp у края мира может чуть подрезать
      expect(d, act).toBeLessThanOrEqual(C.distMax + 80);
      expect(totems(a), act).toHaveLength(C.totems);
      for (const t of totems(a)) expect(a.obstacles.blocked(t.x, t.y, 20), act).toBe(false);
      if (act === "river") expect(Math.abs(camp.y - ARCADE.river.y)).toBeGreaterThan(ARCADE.river.halfWidth);
    }
    // Другой seed — другое место.
    expect(new ArcadeSim("camp-2").camp).not.toEqual(new ArcadeSim("camp-1").camp);
  });

  it("тотем стоит, не бьёт, не берёт статусы, но получает урон и умирает как враг", () => {
    const sim = new ArcadeSim("camp-3");
    const t = totems(sim)[0];
    const [x0, y0] = [t.x, t.y];
    sim.player.x = t.x + 20; sim.player.y = t.y; // вплотную
    sim.camp!.nextGuardAt = 1e9; // охрану проверяет следующий тест — здесь только сам тотем
    sim.defiler!.alive = false; sim.defiler = null; // Осквернитель — в своём тесте (ссылку снимаем, как killEnemy: пул переиспользует объект)
    const hurt0 = sim.events.hurt;
    idle(sim, sec(2));
    expect([t.x, t.y]).toEqual([x0, y0]);
    expect(sim.events.hurt).toBe(hurt0); // тотем не бьёт даже вплотную
    sim.applyPoison(t, 10);
    (sim as unknown as { applyBurn(e: Enemy, dps: number, s: number): void }).applyBurn(t, 10, 2);
    expect(t.poisonStacks).toBe(0);
    expect(t.burnUntil).toBe(0);
    const kills = sim.player.kills;
    sim.damageEnemy(t, t.hp + 1, "hit");
    expect(t.alive).toBe(false);
    expect(sim.player.kills).toBe(kills + 1);
    expect(sim.camp!.destroyed).toBe(1);
    expect(sim.camp!.cleared).toBe(false);
  });

  it("охрана прибывает только пока герой в лагере; каждый снесённый тотем усиливает её; уход останавливает", () => {
    const sim = new ArcadeSim("camp-4");
    const camp = sim.camp!;
    // Далеко от лагеря: 8 секунд — охраны нет (обычный спавн чистим).
    idle(sim, sec(8)); wipe(sim);
    sim.player.x = camp.x; sim.player.y = camp.y;
    wipe(sim);
    idle(sim, 2);
    const first = guards(sim).filter((e) => e.kind.id === "satyr");
    expect(first).toHaveLength(C.guardBase);
    for (const g of first) expect(Math.hypot(g.x - camp.x, g.y - camp.y)).toBeLessThanOrEqual(C.guardRingMax + 40);
    const hp1 = first[0].maxHp;
    // Снесли тотем — следующая партия больше и крепче.
    sim.damageEnemy(totems(sim)[0], 1e9, "hit");
    wipe(sim);
    idle(sim, C.guardEvery + 2);
    const second = guards(sim).filter((e) => e.kind.id === "satyr");
    expect(second.length).toBeGreaterThanOrEqual(C.guardBase + C.guardPerDestroyed);
    expect(second[0].maxHp).toBeGreaterThan(hp1 * (1 + C.guardHpPerDestroyed) * 0.98);
    // Ушли за радиус — охрана не прибывает.
    sim.player.x = camp.x + C.engageRadius + 400; sim.player.y = camp.y;
    wipe(sim);
    idle(sim, C.guardEvery * 2);
    expect(guards(sim).filter((e) => e.kind.id === "satyr" && Math.hypot(e.x - camp.x, e.y - camp.y) <= C.guardRingMax + 40)).toHaveLength(0);
  });

  it("снос всех тотемов = очищение: награда из трёх карт редкости exotic без реролла, мир стоит до выбора", () => {
    const sim = new ArcadeSim("camp-5");
    idle(sim, sec(5));
    const camp = sim.camp!;
    for (const t of totems(sim)) sim.damageEnemy(t, 1e9, "hit");
    expect(camp.cleared).toBe(false); // тотемы снесены, но Осквернитель жив
    sim.damageEnemy(sim.defiler!, 1e9, "hit");
    expect(sim.defiler).toBeNull();
    expect(camp.cleared).toBe(true);
    expect(sim.events.camps).toBe(1);
    expect(sim.pendingSource).toBe("camp");
    expect(sim.pending).toHaveLength(3);
    for (const o of sim.pending!) { expect(o.kind).toBe("upgrade"); if (o.kind === "upgrade") expect(o.rarity).toBe(C.rewardRarity); }
    const tick = sim.tick;
    sim.step({ ...IDLE_INPUT, choose: -2 }); // реролл — запрещён для награды
    expect(sim.pending).toHaveLength(3);
    expect(sim.tick).toBe(tick);
    const gold = sim.player.gold;
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.pending).toBeNull();
    expect(sim.pendingSource).toBe("level");
    expect(sim.player.gold).toBe(gold);
    expect(Object.keys(sim.player.upgrades)).toHaveLength(1);
    idle(sim, 5);
    expect(sim.tick).toBe(tick + 5);
    // Повторного очищения нет.
    expect(sim.events.camps).toBe(1);
  });

  it("награда ждёт, если в момент очищения висит выбор уровня; итог забега помнит очищение", () => {
    const sim = new ArcadeSim("camp-6");
    idle(sim, sec(5));
    // Форсируем уровень: pending от уровня.
    sim.player.xp = sim.player.xpNext; (sim as unknown as { gainXp(n: number): void }).gainXp(0);
    expect(sim.pending).not.toBeNull();
    expect(sim.pendingSource).toBe("level");
    for (const t of totems(sim)) sim.damageEnemy(t, 1e9, "hit");
    sim.damageEnemy(sim.defiler!, 1e9, "hit");
    expect(sim.camp!.cleared).toBe(true);
    expect(sim.pendingSource).toBe("level"); // уровень первый
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.pendingSource).toBe("camp"); // теперь награда
    expect(sim.pending).toHaveLength(3);
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.pending).toBeNull();
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.campsCleared).toBe(1);
  });

  it("реплей с лагерем детерминирован: снос тотемов и награда попадают в digest", () => {
    const run = () => {
      const sim = new ArcadeSim("camp-7", { hero: "juggernaut" });
      const camp = sim.camp!;
      sim.player.x = camp.x; sim.player.y = camp.y;
      idle(sim, sec(20));
      return sim;
    };
    const a = run(), b = run();
    expect(a.digest()).toBe(b.digest());
    expect(a.camp!.destroyed).toBe(b.camp!.destroyed);
  });
});
