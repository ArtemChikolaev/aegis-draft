import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type ArcadeInput } from "../src/game/arcade/types.ts";

/** Скриптованный ввод: кайт по квадрату + всегда берём первую карточку уровня. */
function scriptedInput(sim: ArcadeSim, tick: number): ArcadeInput {
  if (sim.pending) return { ...IDLE_INPUT, choose: 0 };
  const phase = Math.floor(tick / 90) % 4;
  const dirs = [[16, 0], [0, 16], [-16, 0], [0, -16]];
  return { mx: dirs[phase][0], my: dirs[phase][1], cast: 0, choose: -1 };
}

function run(seed: string, ticks: number): ArcadeSim {
  const sim = new ArcadeSim(seed);
  for (let i = 0; i < ticks && !sim.over; i++) sim.step(scriptedInput(sim, sim.tick));
  return sim;
}

describe("arcade sim", () => {
  it("тот же сид и ввод — тот же дайджест (бит-в-бит)", () => {
    const a = run("det-1", sec(120));
    const b = run("det-1", sec(120));
    expect(a.digest()).toBe(b.digest());
    expect(a.tick).toBe(b.tick);
    expect(a.player.level).toBeGreaterThan(1);
    expect(a.player.kills).toBeGreaterThan(10);
  });

  it("другой сид — другой забег", () => {
    expect(run("det-1", sec(60)).digest()).not.toBe(run("det-2", sec(60)).digest());
  });

  it("реплей input-лога воспроизводит состояние", () => {
    const live = run("replay-1", sec(150));
    const replayed = ArcadeSim.replay("replay-1", live.log, live.steps);
    expect(replayed.tick).toBe(live.tick);
    expect(replayed.digest()).toBe(live.digest());
  });

  it("level-up останавливает мир до выбора карточки", () => {
    const sim = new ArcadeSim("pause-1");
    while (!sim.pending && sim.tick < sec(120)) sim.step({ mx: 16, my: 0, cast: 0, choose: -1 });
    expect(sim.pending).not.toBeNull();
    const tick = sim.tick;
    sim.step({ mx: 16, my: 0, cast: 0, choose: -1 });
    expect(sim.tick).toBe(tick);
    sim.step({ mx: 0, my: 0, cast: 0, choose: 0 });
    expect(sim.pending).toBeNull();
    sim.step(IDLE_INPUT);
    expect(sim.tick).toBe(tick + 1);
  });

  it("Рошан появляется на 7:00 и обычный спавн стоит, пока он жив", () => {
    const sim = new ArcadeSim("rosh-1");
    // Бессмертный игрок ради расписания: чиним HP каждый тик.
    while (sim.tick < ARCADE.roshanAt + sec(5)) {
      sim.player.hp = sim.player.stats.maxHp;
      sim.step(scriptedInput(sim, sim.tick));
    }
    expect(sim.roshan?.alive).toBe(true);
    const before = sim.aliveEnemies();
    for (let i = 0; i < sec(3); i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
    expect(sim.aliveEnemies()).toBeLessThanOrEqual(before);
  });

  it("школ не больше трёх", () => {
    const sim = run("schools-1", sec(400));
    expect(sim.player.schools.length).toBeLessThanOrEqual(3);
  });

  it("производительность: тик с толпой укладывается в бюджет", () => {
    const sim = new ArcadeSim("perf-1");
    for (let i = 0; i < sec(200); i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(scriptedInput(sim, sim.tick)); }
    const alive = sim.aliveEnemies();
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(scriptedInput(sim, sim.tick)); }
    const perTick = (performance.now() - t0) / 600;
    expect(alive).toBeGreaterThan(50);
    expect(perTick).toBeLessThan(4);
  });
});
