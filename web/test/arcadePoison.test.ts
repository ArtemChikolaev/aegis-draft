import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { IDLE_INPUT, type Enemy } from "../src/game/arcade/types.ts";

// Яд (T13.39, аудит 2026-09-08): самостоятельный статус со стаками, а не горение. Раньше Poison Sting и
// Poison Attack шли через `searing → applyBurn`, и зелёная перекраска не давала новой механики.
const P = ARCADE.poison;

function target(sim: ArcadeSim): Enemy {
  for (let i = 0; i < sec(20) && !sim.enemies.some((e) => e.alive && !e.kind.elite); i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
  const e = sim.enemies.find((x) => x.alive && !x.kind.elite)!;
  expect(e).toBeTruthy();
  e.hp = e.maxHp = 1e6; // чтобы цель не умерла посреди замера
  return e;
}

describe("яд Аркады", () => {
  it("стаки копятся до потолка с общим обновляемым таймером; dps стака — сильнейший источник", () => {
    const sim = new ArcadeSim("poison-1", { hero: "venomancer" });
    const e = target(sim);
    sim.applyPoison(e, 10);
    expect(e.poisonStacks).toBe(1);
    expect(e.poisonDps).toBe(10);
    const until1 = e.poisonUntil;
    expect(until1).toBe(sim.tick + sec(P.seconds));
    for (let i = 0; i < 10; i++) sim.applyPoison(e, 6);
    expect(e.poisonStacks).toBe(P.maxStacks);
    expect(e.poisonDps).toBe(10); // слабый источник не сбивает сильный, пока яд активен
    expect(e.poisonUntil).toBe(until1); // тот же тик — таймер тот же; позже он обновится
    sim.applyPoison(e, 10, 8);
    expect(e.poisonUntil).toBe(sim.tick + sec(8));
  });

  it("урон за тик растёт со стаками, а истёкший яд теряет все стаки", () => {
    const sim = new ArcadeSim("poison-2", { hero: "venomancer" });
    const e = target(sim);
    // Ставим врага далеко: считаем только тики яда, без контакта и автоатаки.
    e.x = sim.player.x + 900; e.y = sim.player.y + 900;
    // Прямая проверка формулы: damageEnemy с 1 и 5 стаками.
    e.poisonUntil = 0; sim.applyPoison(e, 10);
    let hp0 = e.hp; sim.damageEnemy(e, e.poisonDps * e.poisonStacks * P.tickShare, "burst");
    const one = hp0 - e.hp;
    e.poisonUntil = 0; for (let i = 0; i < P.maxStacks; i++) sim.applyPoison(e, 10);
    hp0 = e.hp; sim.damageEnemy(e, e.poisonDps * e.poisonStacks * P.tickShare, "burst");
    const five = hp0 - e.hp;
    expect(five).toBeCloseTo(one * P.maxStacks, 6);
    // Живой тик: через tickEvery тиков hp уменьшилось на dps × стаки × доля.
    e.poisonUntil = 0; e.poisonStacks = 0;
    for (let i = 0; i < 3; i++) sim.applyPoison(e, 10);
    hp0 = e.hp;
    for (let i = 0; i < P.tickEvery; i++) { sim.player.hp = 1e6; sim.step(IDLE_INPUT); }
    expect(hp0 - e.hp).toBeCloseTo(10 * 3 * P.tickShare, 3);
    // Истечение: после таймера стаки сгорают, новый стак начинает с 1.
    for (let i = 0; i < sec(P.seconds) + 2; i++) { sim.player.hp = 1e6; sim.step(IDLE_INPUT); }
    expect(sim.tick).toBeGreaterThanOrEqual(e.poisonUntil);
    sim.applyPoison(e, 4);
    expect(e.poisonStacks).toBe(1);
    expect(e.poisonDps).toBe(4);
  });

  it("яд — не горение: не оставляет пепла, не срабатывает Blast и не берётся неостановимыми", () => {
    const sim = new ArcadeSim("poison-3", { hero: "venomancer" });
    const e = target(sim);
    sim.applyPoison(e, 10);
    expect(e.burnUntil).toBe(0);
    (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id: "rad_blast", rarity: "arcana" });
    const fx0 = sim.fx.length;
    e.hp = 1; sim.damageEnemy(e, 5, "hit");
    expect(e.alive).toBe(false);
    expect(sim.fx.slice(fx0).some((f) => f.kind === "ash")).toBe(false);
    expect(sim.fx.slice(fx0).filter((f) => f.kind === "burst" && f.x2 === 60)).toHaveLength(0); // Blast — только по горящим
    const roshan = (sim as unknown as { spawnEnemy(k: unknown, x: number, y: number): Enemy }).spawnEnemy(ENEMY_KINDS.tormentor, 100, 100);
    sim.applyPoison(roshan, 50);
    expect(roshan.poisonStacks).toBe(0);
  });

  it("источники героев: Poison Sting кладёт стак с удара, Shadow Poison — с зоны; ранг с сопротивлением статусам укорачивает яд", () => {
    for (const [hero, key] of [["venomancer", "w"], ["viper", "q"]] as const) {
      const ab = HEROES[hero].abilities[key];
      expect(ab.kind).toBe("venom");
      expect(ab.passive).toBe(true);
    }
    for (const [hero, key] of [["venomancer", "q"], ["venomancer", "r"], ["viper", "w"], ["dazzle", "q"], ["shadow_demon", "q"]] as const) {
      expect(HEROES[hero].abilities[key].poison, `${hero}.${key}`).toBeGreaterThan(0);
    }
    // Живой удар: Venomancer с изученной W отравляет цель автоатакой.
    const sim = new ArcadeSim("poison-4", { hero: "venomancer" });
    sim.player.abilities.w = 1;
    const e = target(sim);
    e.x = sim.player.x + 40; e.y = sim.player.y;
    for (let i = 0; i < sec(3) && e.poisonStacks === 0; i++) { sim.player.hp = 1e6; e.x = sim.player.x + 40; e.y = sim.player.y; sim.step(IDLE_INPUT); }
    expect(e.poisonStacks).toBeGreaterThan(0);
    expect(e.burnUntil).toBe(0);
    // Сопротивление статусам (ранг): яд короче.
    const tough = new ArcadeSim("poison-5", { hero: "venomancer", rank: 30 }); // Divine+: resistStatus
    const t = target(tough);
    tough.applyPoison(t, 10);
    const plain = new ArcadeSim("poison-5", { hero: "venomancer", rank: 0 });
    const q = target(plain);
    plain.applyPoison(q, 10);
    expect(t.poisonUntil - tough.tick).toBeLessThan(q.poisonUntil - plain.tick);
  });
});
