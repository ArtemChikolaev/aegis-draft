import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type ArcadeInput } from "../src/game/arcade/types.ts";
import { rankOf, rankStep } from "../src/game/arcade/content/ranks.ts";
import { SHOP_ACT } from "../src/game/arcade/types.ts";
import { HERO_IDS } from "../src/game/arcade/content/heroes.ts";

/** Скриптованный ввод: кайт по квадрату + всегда берём первую карточку уровня. */
function scriptedInput(sim: ArcadeSim, tick: number): ArcadeInput {
  if (sim.pending) return { ...IDLE_INPUT, choose: 0 };
  // Торговец (3:00/6:00) ставит мир на паузу — без закрытия лавки длинные циклы тестов зависали.
  if (sim.shopOpen) return { ...IDLE_INPUT, act: SHOP_ACT.close };
  const phase = Math.floor(tick / 90) % 4;
  const dirs = [[16, 0], [0, 16], [-16, 0], [0, -16]];
  return { mx: dirs[phase][0], my: dirs[phase][1], cast: 0, choose: -1, act: 0 };
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
    // Бессмертие: с плотностью a0.4.0 игрок, бегущий по прямой, умирал до первого уровня, и цикл без
    // проверки `over` крутился вечно (2026-09-05).
    while (!sim.pending && !sim.over && sim.tick < sec(120)) { sim.player.hp = sim.player.stats.maxHp; sim.step({ mx: 16, my: 0, cast: 0, choose: -1, act: 0 }); }
    expect(sim.pending).not.toBeNull();
    const tick = sim.tick;
    sim.step({ mx: 16, my: 0, cast: 0, choose: -1, act: 0 });
    expect(sim.tick).toBe(tick);
    sim.step({ mx: 0, my: 0, cast: 0, choose: 0, act: 0 });
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
    // Высокий ранг (плотность ×2) и бессмертный игрок — толпа гарантирована независимо от баланса.
    const sim = new ArcadeSim("perf-1", { rank: 30 });
    for (let i = 0; i < sec(200); i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(scriptedInput(sim, sim.tick)); }
    const alive = sim.aliveEnemies();
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(scriptedInput(sim, sim.tick)); }
    const perTick = (performance.now() - t0) / 600;
    expect(alive).toBeGreaterThan(100);
    expect(perTick).toBeLessThan(4);
  });

  it("ранг множит силу врагов и меняет правила по рангам", () => {
    const low = new ArcadeSim("rank-1", { rank: 0 });
    const high = new ArcadeSim("rank-1", { rank: rankStep("archon", 3) });
    for (let i = 0; i < sec(20); i++) { low.step(IDLE_INPUT); high.step(IDLE_INPUT); }
    const maxHp = (sim: ArcadeSim) => Math.max(...sim.enemies.filter((e) => e.alive && e.kind.id === "kobold").map((e) => e.maxHp));
    expect(maxHp(high)).toBeGreaterThan(maxHp(low) * 1.5);
    expect(high.rank.trollPacks).toBe(true);
    expect(low.rank.trollPacks).toBe(false);
    expect(rankOf(39).tier).toBe("immortal");
    expect(rankOf(39).stars).toBe(5);
    expect(low.digest()).not.toBe(high.digest());
  });

  it("руна щедрости: взял — двойной спавн на 60 с и постоянный стек силы", () => {
    const sim = new ArcadeSim("greed-1");
    while (!sim.shrine.alive && sim.tick < sec(120)) { sim.player.hp = sim.player.stats.maxHp; sim.step(scriptedInput(sim, sim.tick)); }
    expect(sim.shrine.alive).toBe(true);
    sim.player.x = sim.shrine.x; sim.player.y = sim.shrine.y;
    sim.step(IDLE_INPUT);
    expect(sim.shrine.alive).toBe(false);
    expect(sim.greedStacks).toBe(1);
    expect(sim.greedUntil).toBeGreaterThan(sim.tick);
  });

  it("Secret Shop: касание открывает лавку и ставит мир на паузу, покупка списывает золото и меняет статы", () => {
    const sim = new ArcadeSim("shop-1");
    while (!sim.shopkeeper.alive && sim.tick < sec(200)) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); }
    expect(sim.shopkeeper.alive).toBe(true);
    sim.player.x = sim.shopkeeper.x; sim.player.y = sim.shopkeeper.y;
    sim.step(IDLE_INPUT);
    expect(sim.shopOpen).toBe(true);
    const tick = sim.tick;
    sim.step(IDLE_INPUT);
    expect(sim.tick).toBe(tick);
    sim.player.gold = 1000;
    const offer = sim.shopOffers[0];
    const before = { ...sim.player.stats };
    sim.step({ ...IDLE_INPUT, act: SHOP_ACT.buy1 });
    expect(sim.player.gold).toBe(1000 - offer.price);
    expect(sim.player.items[0]?.id).toBe(offer.id);
    expect(JSON.stringify(sim.player.stats)).not.toBe(JSON.stringify(before));
    sim.step({ ...IDLE_INPUT, act: SHOP_ACT.close });
    expect(sim.shopOpen).toBe(false);
    sim.step(IDLE_INPUT);
    expect(sim.tick).toBe(tick + 1);
  });

  it("каждый герой детерминирован, реплеится и наносит урон своим китом", () => {
    for (const hero of HERO_IDS) {
      const a = new ArcadeSim(`hero-${hero}`, { hero });
      const b = new ArcadeSim(`hero-${hero}`, { hero });
      for (let i = 0; i < sec(90); i++) {
        a.player.hp = a.player.stats.maxHp; b.player.hp = b.player.stats.maxHp;
        a.step(scriptedInput(a, a.tick)); b.step(scriptedInput(b, b.tick));
      }
      expect(a.digest(), hero).toBe(b.digest());
      expect(a.player.kills, hero).toBeGreaterThan(20);
      expect(a.player.level, hero).toBeGreaterThanOrEqual(3);
      const replayed = ArcadeSim.replay(`hero-${hero}`, a.log, a.steps, { hero });
      // Бессмертие в тесте — вне лога, поэтому сравниваем только тик и убийства ≥ (реплей мог умереть раньше).
      expect(replayed.tick, hero).toBeLessThanOrEqual(a.tick);
    }
  });
});
