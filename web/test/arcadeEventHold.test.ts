// «Пришёл — твоё» (T13.86): таймер bounty/сундука замирает, пока герой рядом, при приходе остаток не меньше holdMin;
// у приглашений с таймером есть until/life для дуги остатка на указателе.
import { describe, it, expect } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

const mk = () => new ArcadeSim("hold-test", { hero: "juggernaut", act: "short", composition: "all" });
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.lootOpen ? { ...IDLE_INPUT, cancel: true } : IDLE_INPUT); } };

describe("события на карте: таймер замирает рядом с героем", () => {
  it("bounty вдали от героя истекает по сроку, рядом — держится, остаток при приходе не меньше holdMin", () => {
    const sim = mk();
    step(sim, 5);
    const far = { alive: true, x: sim.player.x + 900, y: sim.player.y, until: sim.tick + 30, value: 10 };
    sim.bounty = far;
    step(sim, 40);
    expect(sim.bounty.alive).toBe(false);
    // Рядом: остаток 30 тиков поднимается до holdMin и дальше не убывает.
    sim.bounty = { alive: true, x: sim.player.x + 40, y: sim.player.y, until: sim.tick + 30, value: 10 };
    const t0 = sim.tick;
    step(sim, 1);
    expect(sim.bounty.until - sim.tick).toBeGreaterThanOrEqual(ARCADE.events.holdMin - 2);
    step(sim, ARCADE.events.holdMin * 2);
    if (sim.bounty.alive) expect(sim.bounty.until - sim.tick).toBeGreaterThanOrEqual(ARCADE.events.holdMin - 2);
    expect(sim.tick - t0).toBeGreaterThan(ARCADE.events.holdMin);
  });
  it("сундук: то же правило; за радиусом таймер снова идёт", () => {
    const sim = mk();
    step(sim, 5);
    sim.chest = { alive: true, x: sim.player.x + 100, y: sim.player.y, until: sim.tick + 30, value: 0 };
    step(sim, 60);
    expect(sim.chest.alive).toBe(true);
    sim.chest.x = sim.player.x + ARCADE.events.holdRadius + 400;
    step(sim, ARCADE.events.holdMin + 5);
    expect(sim.chest.alive).toBe(false);
  });
  it("приглашения bounty/сундука несут until и life для дуги остатка", () => {
    const sim = mk();
    step(sim, 5);
    if (sim.outpost) sim.outpost.captured = true;
    sim.bounty = { alive: true, x: sim.player.x + 500, y: sim.player.y, until: sim.tick + 100, value: 10 };
    sim.chest = { alive: true, x: sim.player.x - 500, y: sim.player.y, until: sim.tick + 100, value: 0 };
    const inv = sim.invitations();
    const b = inv.find((i) => i.kind === "bounty")!, ch = inv.find((i) => i.kind === "chest")!;
    expect(b.until).toBe(sim.bounty.until); expect(b.life).toBe(ARCADE.bounty.lifetime);
    expect(ch.until).toBe(sim.chest.until); expect(ch.life).toBe(ARCADE.loot.chestLifetime);
  });
});
