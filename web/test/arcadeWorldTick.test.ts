import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { IDLE_INPUT, SHOP_ACT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { rollGear } from "../src/game/arcade/content/gear.ts";
import { Rng } from "../src/game/rng.ts";

// Мировые системы идут всегда (M15, B1): тишина боя с Рошаном и передышка после разлома глушат лесной спавн, а не места,
// залпы лучников, сроки событий и контракт. Раньше всё это стояло в spawnTick ниже раннего `return`.
type Internals = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; enterRift(rule: "surge"): void; takenByKind: Record<string, number> };
const inner = (sim: ArcadeSim) => sim as unknown as Internals;

/** Прогнать `ticks` тиков мира: окна закрываются (иначе тик стоит), потолок шагов — чтобы красный тест падал, а не висел. */
function advance(sim: ArcadeSim, ticks: number): void {
  const target = sim.tick + ticks;
  let steps = 0;
  while (sim.tick < target && !sim.over && steps++ < ticks * 4 + 200) {
    sim.player.hp = sim.player.stats.maxHp;
    const m = sim.activeModal();
    sim.step(m === "pending" ? { ...IDLE_INPUT, choose: 0 } : m ? { ...IDLE_INPUT, act: SHOP_ACT.close } : IDLE_INPUT);
  }
  expect(sim.tick).toBe(target);
}

/** Живой Рошан далеко от героя: за время теста не дойдёт, но «тишина» уже действует. */
function withRoshan(sim: ArcadeSim): Enemy {
  const r = inner(sim).spawnEnemy(ENEMY_KINDS.roshan, 80, 80);
  r.hp = r.maxHp = 1e9;
  sim.roshan = r;
  return r;
}

/** Линия лучников в 300 px от героя — собрана руками, как её собирает сим (leader = id линии, wpX — место в строю). */
function archerLine(sim: ArcadeSim) {
  const p = sim.player, C = ARCADE.archers;
  const line = { id: 987654, cx: p.x + 300, cy: p.y, dirX: 0, dirY: 0, fireAt: 0, nextAt: 0 };
  for (let i = 0; i < C.count; i++) {
    const off = (i - (C.count - 1) / 2) * C.spacing;
    const e = inner(sim).spawnEnemy(ENEMY_KINDS.archer, p.x + 300, p.y + off);
    e.hp = e.maxHp = 1e9; e.leader = line.id; e.wpX = off;
  }
  sim.archerLines.push(line);
  return line;
}

const quiet = (sim: ArcadeSim) => { for (const e of sim.enemies) if (e.alive && !e.kind.totem && !e.kind.elite) e.alive = false; };

describe("Аркада: мировые системы при живом Рошане и на передышке", () => {
  it("живой Рошан: сундук истекает в срок", () => {
    const sim = new ArcadeSim("world-chest");
    quiet(sim); withRoshan(sim);
    sim.chest = { alive: true, x: sim.player.x + 1200, y: sim.player.y, until: sim.tick + 30, value: 0 };
    advance(sim, 60);
    expect(sim.roshan?.alive).toBe(true);
    expect(sim.chest.alive).toBe(false);
  });

  it("живой Рошан: лучники объявляют полосу и дают залп", () => {
    const sim = new ArcadeSim("world-archers");
    quiet(sim); withRoshan(sim);
    const line = archerLine(sim);
    advance(sim, 10);
    expect(line.fireAt).toBeGreaterThan(0); // телеграф объявлен
    advance(sim, sec(ARCADE.archers.telegraphSec) + 5);
    expect(line.fireAt).toBe(0); // залп состоялся, а не висит
    expect(line.nextAt).toBeGreaterThan(sim.tick);
    expect(inner(sim).takenByKind.archer ?? 0).toBeGreaterThan(0);
  });

  it("живой Рошан: места просыпаются — герой вошёл в рощу, Кентавр проснулся", () => {
    const sim = new ArcadeSim("world-grove", { composition: "all" });
    quiet(sim); withRoshan(sim);
    const g = sim.grove!;
    expect(g.engaged).toBe(false);
    sim.player.x = g.x + 60; sim.player.y = g.y;
    advance(sim, 3);
    expect(g.engaged).toBe(true);
    expect(sim.isDormant(sim.centaur!)).toBe(false);
  });

  it("живой Рошан: контракт предлагается по расписанию", () => {
    const sim = new ArcadeSim("world-contract", { composition: "all" });
    quiet(sim); withRoshan(sim);
    sim.tick = ARCADE.contract.at.short;
    const tick0 = sim.tick;
    sim.step(IDLE_INPUT);
    expect(sim.tick).toBe(tick0 + 1);
    expect(sim.contractOpen).toBe(true);
    expect(sim.activeModal()).toBe("contract");
  });

  it("передышка после разлома: залпы идут, сроки событий истекают", () => {
    const sim = new ArcadeSim("world-respite");
    quiet(sim);
    sim.respiteUntil = sim.tick + sec(30);
    const line = archerLine(sim);
    sim.chest = { alive: true, x: sim.player.x + 1200, y: sim.player.y, until: sim.tick + 30, value: 0 };
    advance(sim, sec(ARCADE.archers.telegraphSec) + 20);
    expect(line.fireAt).toBe(0);
    expect(line.nextAt).toBeGreaterThan(sim.tick);
    expect(sim.chest.alive).toBe(false);
  });

  it("вход в разлом убирает линии лучников вместе с лучниками", () => {
    const sim = new ArcadeSim("world-rift", { composition: "all" });
    quiet(sim);
    const line = archerLine(sim);
    line.fireAt = sim.tick + 40; // полоса уже объявлена
    expect(sim.rift?.state).toBe("idle");
    inner(sim).enterRift("surge");
    expect(sim.rift?.state).toBe("active");
    expect(sim.enemies.some((e) => e.alive && e.kind.id === "archer")).toBe(false);
    expect(sim.archerLines).toHaveLength(0);
  });
});

// Сроки событий стоят вместе с часами акта, пока герой в разломе (M15, B10).
describe("Аркада: сроки событий в разломе", () => {
  it("сундук, торговец, добыча на земле и окно каравана не стареют за время испытания", () => {
    const sim = new ArcadeSim("world-rift-timers", { composition: "all" });
    quiet(sim);
    const p = sim.player, rift = sim.rift!, cv = sim.caravan!;
    p.x = rift.x; p.y = rift.y;
    const left = sec(20);
    sim.chest = { alive: true, x: p.x + 1200, y: p.y, until: sim.tick + left, value: 0 };
    sim.shopkeeper = { alive: true, x: p.x - 1200, y: p.y, until: sim.tick + left, value: 0 };
    sim.groundLoot.push({ x: p.x + 900, y: p.y + 900, item: rollGear(new Rng("world-rift-timers:gear"), 1, "standard", "t-1", "weapon"), until: sim.tick + left });
    cv.state = "waiting"; cv.leaveAt = sim.tick + left;
    inner(sim).enterRift("surge");
    const act0 = sim.actTick;
    let guard = 0;
    while (sim.rift!.state === "active" && guard++ < ARCADE.rift.duration + 10) { p.x = rift.x; p.y = rift.y; advance(sim, 1); }
    expect(sim.rift!.state).toBe("done");
    expect(sim.actTick).toBe(act0); // часы акта стояли
    expect(guard).toBeGreaterThan(left); // испытание длиннее срока — на старом коде всё истекло бы
    expect(sim.chest.until - sim.tick).toBe(left);
    expect(sim.shopkeeper.until - sim.tick).toBe(left);
    expect(sim.groundLoot[0].until - sim.tick).toBe(left);
    expect(cv.leaveAt - sim.tick).toBe(left);
    advance(sim, 5);
    expect(sim.chest.alive).toBe(true);
    expect(sim.shopkeeper.alive).toBe(true);
    expect(sim.groundLoot[0].until).toBeGreaterThan(0);
    expect(cv.state).toBe("waiting");
  });
});
