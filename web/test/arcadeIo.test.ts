import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";

// Io (владелец 2026-09-12): Tether только к своему юниту с лучом; Spirits — шары по орбите, бьют при касании, автоатака идёт.
const cast = (sim: ArcadeSim, key: "q" | "w") => (sim as unknown as { castAbility(k: string, ab: unknown): void }).castAbility(key, sim.hero.abilities[key]);
const spawn = (sim: ArcadeSim, x: number, y: number) => (sim as unknown as { spawnEnemy(k: unknown, x: number, y: number): { hp: number; maxHp: number; x: number; y: number; alive: boolean } }).spawnEnemy(ENEMY_KINDS.kobold, x, y);
const quiet = (sim: ArcadeSim) => { for (const e of sim.enemies) e.alive = false; };
const pet = (sim: ArcadeSim, dx: number) => { sim.pets.push({ kind: "wolf", x: sim.player.x + dx, y: sim.player.y, cd: 0, facingX: 1, facingY: 0, hitAt: -999, inReach: false }); return sim.pets.length - 1; };

describe("Io", () => {
  it("Tether без своего юнита не срабатывает и не тратит перезарядку; с юнитом — связь, лечение и разрыв, когда юнит ушёл", () => {
    const sim = new ArcadeSim("io-1", { hero: "io" });
    quiet(sim);
    const p = sim.player;
    p.abilities.q = 1; p.cooldowns.q = 0;
    expect(sim.tetherTarget(sim.hero.abilities.q)).toBe(-1);
    cast(sim, "q");
    expect(p.tetherUntil).toBe(0);
    expect(p.cooldowns.q).toBe(0);
    const i = pet(sim, 120);
    expect(sim.tetherTarget(sim.hero.abilities.q)).toBe(i);
    cast(sim, "q");
    expect(p.tetherPet).toBe(i);
    expect(p.tetherUntil).toBe(sim.tick + sec(sim.hero.abilities.q.duration ?? 8));
    expect(p.cooldowns.q).toBeGreaterThan(0);
    p.hp = p.stats.maxHp * 0.5;
    const hp0 = p.hp;
    for (let t = 0; t < sec(2); t++) { sim.pets[i].x = p.x + 120; sim.pets[i].y = p.y; sim.step(IDLE_INPUT); }
    expect(p.hp).toBeGreaterThan(hp0);
    // Юнит пропал (истёк призыв) — связь рвётся; за радиус питомец не уходит, он бегает за героем.
    sim.pets.length = 0;
    sim.step(IDLE_INPUT);
    expect(sim.tick >= p.tetherUntil).toBe(true);
    expect(p.tetherPet).toBe(-1);
  });

  it("Spirits: пять шаров по орбите, бьют только того, кого коснулись; герой в центре бьёт автоатакой как обычно", () => {
    const sim = new ArcadeSim("io-2", { hero: "io" });
    quiet(sim);
    const p = sim.player, ab = sim.hero.abilities.w;
    p.abilities.w = 1; p.cooldowns.w = 0;
    expect(sim.spiritOrbs()).toEqual([]);
    cast(sim, "w");
    const orbs = sim.spiritOrbs();
    expect(orbs.length).toBe(5);
    for (const [ox, oy] of orbs) expect(Math.hypot(ox - p.x, (oy - p.y) / 0.8)).toBeCloseTo(ab.radius ?? 130, 3);
    // Медленный оборот: за секунду шар проходит меньше полукруга.
    const [x0, y0] = orbs[0];
    for (let t = 0; t < sec(1); t++) sim.step(IDLE_INPUT);
    const [x1, y1] = sim.spiritOrbs()[0];
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan((ab.radius ?? 130) * 2);
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeGreaterThan(20);
    // Враг на орбите получает урон, враг далеко за орбитой — нет; спин-вихрь не включён, атака не заблокирована.
    const far = spawn(sim, p.x + 800, p.y); far.hp = 1e6; far.maxHp = 1e6; (far as unknown as { stunUntil: number }).stunUntil = 1e9; // вне орбиты и вне дальности атаки, стоит на месте
    const onOrbit = spawn(sim, p.x + (ab.radius ?? 130), p.y); onOrbit.hp = 1e6; onOrbit.maxHp = 1e6; (onOrbit as unknown as { stunUntil: number }).stunUntil = 1e9;
    for (let t = 0; t < sec(4); t++) { p.hp = p.stats.maxHp; sim.step(IDLE_INPUT); }
    expect(onOrbit.hp).toBeLessThan(1e6);
    expect(far.hp).toBe(1e6);
    expect(sim.tick < p.spinUntil).toBe(false);
    const hits0 = sim.events.hits;
    const near = spawn(sim, p.x + 30, p.y); near.hp = 1e6; near.maxHp = 1e6;
    for (let t = 0; t < sec(2); t++) { p.hp = p.stats.maxHp; sim.step(IDLE_INPUT); }
    expect(sim.events.hits).toBeGreaterThan(hits0);
    expect(ARCADE.io.orbitSec).toBeGreaterThanOrEqual(3);
  });
});
