import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, SHOP_ACT } from "../src/game/arcade/types.ts";

// Второй Рошан не появляется при живом первом (аудит 2026-09-19): `this.roshan` перезаписывался, два босса стояли в одной
// точке, первый терял привязку (в River яму можно просто не посещать). Теперь второй ждёт смерти первого + respawnGap.
const step = (sim: ArcadeSim, n: number) => {
  for (let i = 0, guard = 0; i < n && !sim.over && guard < n * 20; guard++) {
    sim.player.hp = sim.player.stats.maxHp;
    const t = sim.tick;
    sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.activeModal() ? { ...IDLE_INPUT, act: SHOP_ACT.close } : IDLE_INPUT);
    if (sim.tick > t) i++;
  }
};
const roshans = (sim: ArcadeSim) => sim.enemies.filter((e) => e.alive && e.kind.id === "roshan");

describe("второй Рошан", () => {
  it("по расписанию при живом первом не спавнится; после смерти первого — через respawnGap, усиленный", () => {
    const sim = new ArcadeSim("roshan-two", { act: "river" });
    const t0 = sim.actTick;
    (sim as unknown as { roshanAt: number[] }).roshanAt = [t0 + 2, t0 + 12];
    step(sim, 4);
    expect(roshans(sim).length).toBe(1);
    const first = sim.roshan!;
    step(sim, 30); // расписание второго прошло, первый жив (в яму не ходили)
    expect(roshans(sim).length).toBe(1);
    expect(sim.roshan).toBe(first);
    sim.player.x = first.x + 40; sim.player.y = first.y; // в яме: вне её Рошан лечится
    step(sim, 1);
    first.hp = 1; sim.damageEnemy(first, 1e9, "hit");
    expect(roshans(sim).length).toBe(0);
    step(sim, ARCADE.secondRoshan.respawnGap - 5);
    expect(roshans(sim).length).toBe(0); // передышка
    step(sim, 10);
    expect(roshans(sim).length).toBe(1);
    expect(sim.roshan!.maxHp).toBeGreaterThan(first.kind.hp); // второй — усиленный
  });
});
