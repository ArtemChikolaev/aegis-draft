import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, PICKUP_ACT } from "../src/game/arcade/types.ts";

// Лотосовый пруд и порча «Увядание» с проклятого сундука (T13.43, этап 1 аудита 2026-09-08).
const P = ARCADE.pond, C = ARCADE.curse;
const step = (sim: ArcadeSim, n: number, input = IDLE_INPUT) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = Math.max(sim.player.hp, 1); sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : input); } };
const atPond = (sim: ArcadeSim) => { sim.player.x = sim.pond!.x + 10; sim.player.y = sim.pond!.y; };
const act = (n: number) => ({ ...IDLE_INPUT, act: n });

describe("лотосовый пруд и порча", () => {
  it("пруд стоит по seed вдали от лагеря и аванпоста, детерминирован, не в дереве", () => {
    for (const a of ["short", "full", "dire", "river"] as const) {
      const s = new ArcadeSim("pond-1", { act: a }), s2 = new ArcadeSim("pond-1", { act: a });
      expect(s.pond).toEqual(s2.pond);
      const pond = s.pond!;
      expect(Math.hypot(pond.x - s.camp!.x, pond.y - s.camp!.y), a).toBeGreaterThanOrEqual(P.minFromOthers - 60);
      expect(Math.hypot(pond.x - s.outpost!.x, pond.y - s.outpost!.y), a).toBeGreaterThanOrEqual(P.minFromOthers - 60);
      expect(s.obstacles.blocked(pond.x, pond.y, 20), a).toBe(false);
      expect(pond.used).toBe(false);
    }
  });

  it("кнопка подбора рядом открывает выбор, мир стоит; лечение — половина HP, один раз", () => {
    const sim = new ArcadeSim("pond-2");
    step(sim, 5);
    expect(sim.nearPond).toBe(false);
    atPond(sim); step(sim, 1);
    expect(sim.nearPond).toBe(true);
    sim.step(act(PICKUP_ACT));
    expect(sim.pondOpen).toBe(true);
    const tick = sim.tick;
    sim.step(IDLE_INPUT); sim.step(IDLE_INPUT);
    expect(sim.tick).toBe(tick); // мир стоит
    sim.step(act(5)); // уйти — пруд остаётся
    expect(sim.pondOpen).toBe(false);
    expect(sim.pond!.used).toBe(false);
    sim.player.hp = 100;
    sim.step(act(PICKUP_ACT)); sim.step(act(1));
    expect(sim.player.hp).toBeCloseTo(100 + sim.player.stats.maxHp * P.healFrac, 3);
    expect(sim.pond!.used).toBe(true);
    step(sim, 1);
    expect(sim.nearPond).toBe(false); // использованный пруд больше не приглашает
    sim.step(act(PICKUP_ACT));
    expect(sim.pondOpen).toBe(false);
  });

  it("проклятый сундук: предмет на ступень выше; взять = Увядание, оставить = чисто; порча режет лечение и регенерацию; пруд снимает", () => {
    const sim = new ArcadeSim("pond-3");
    step(sim, 5);
    // Форсируем проклятый сундук у ног.
    sim.chest = { alive: true, x: sim.player.x + 20, y: sim.player.y, until: sim.tick + sec(60), value: 1 };
    step(sim, 1);
    expect(sim.nearLoot?.kind).toBe("chest");
    sim.step(act(PICKUP_ACT));
    expect(sim.lootOpen).not.toBeNull();
    expect(sim.lootCursed).toBe(true);
    expect(sim.lootOpen!.rarity).not.toBe("standard"); // минимум refined: rollRarity на 0-й минуте почти всегда standard, +1 ступень
    sim.step(act(5)); // оставить у ног — без порчи
    expect(sim.player.curse).toBeNull();
    expect(sim.lootCursed).toBe(false);
    expect(sim.groundLoot.some((g) => g.until > 0)).toBe(true);
    // Подобрать с земли — предмет уже чистый.
    step(sim, 1);
    expect(sim.nearLoot?.kind).toBe("ground");
    sim.step(act(PICKUP_ACT));
    expect(sim.lootCursed).toBe(false);
    sim.step(act(2)); // в сумку
    expect(sim.player.curse).toBeNull();
    // Второй проклятый сундук — принимаем.
    sim.chest = { alive: true, x: sim.player.x + 20, y: sim.player.y, until: sim.tick + sec(60), value: 1 };
    step(sim, 1); sim.step(act(PICKUP_ACT)); sim.step(act(1));
    expect(sim.player.curse).toBe("withering");
    // Лечение и регенерация ослаблены.
    const p = sim.player;
    p.hp = 100;
    (sim as unknown as { heal(n: number): void }).heal(100);
    expect(p.hp).toBeCloseTo(100 + 100 * C.withering.healMult, 3);
    p.hp = 100; sim.player.x = 200; sim.player.y = 200; // подальше от врагов
    const before = p.hp;
    step(sim, 60);
    const gainCursed = p.hp - before;
    p.curse = null; p.hp = 100;
    step(sim, 60);
    const gainClean = p.hp - 100;
    expect(gainCursed).toBeGreaterThan(0);
    expect(gainCursed).toBeLessThan(gainClean * 0.6);
    // Снятие у пруда.
    p.curse = "withering";
    atPond(sim); step(sim, 1); sim.step(act(PICKUP_ACT));
    expect(sim.pondOpen).toBe(true);
    sim.step(act(2));
    expect(p.curse).toBeNull();
    expect(sim.pond!.used).toBe(true);
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.cursesTaken).toBe(1);
    expect(sim.over?.cursed).toBe(false);
  });

  it("проклятые сундуки появляются только пока пруд не использован; первый сундук всегда чистый", () => {
    const spawnChests = (used: boolean, n = 12) => {
      const sim = new ArcadeSim("pond-4");
      sim.pond!.used = used;
      const values: number[] = [];
      for (let i = 0; i < n; i++) {
        // Ждём спавн сундука, читаем метку, «съедаем» его.
        let guard = 0;
        while (!sim.chest.alive && guard++ < sec(200)) { sim.player.hp = 1e6; sim.player.x = 1600; sim.player.y = 1600; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen ? act(5) : IDLE_INPUT); }
        if (!sim.chest.alive) break;
        values.push(sim.chest.value);
        sim.chest.alive = false;
        (sim as unknown as { nextChestAt: number }).nextChestAt = sim.tick + 1;
      }
      return values;
    };
    const clean = spawnChests(true);
    expect(clean.length).toBeGreaterThan(5);
    expect(clean.every((v) => v === 0)).toBe(true);
    const live = spawnChests(false);
    expect(live[0]).toBe(0);
    expect(live.some((v) => v === 1)).toBe(true);
    // Пруд снимает порчу лечением? Нет: лечение не трогает порчу.
    const sim = new ArcadeSim("pond-5");
    sim.player.curse = "withering";
    atPond(sim); step(sim, 1); sim.step(act(PICKUP_ACT)); sim.step(act(1));
    expect(sim.player.curse).toBe("withering");
    expect(sim.pond!.used).toBe(true);
  });
});
