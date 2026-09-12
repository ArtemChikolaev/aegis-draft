import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";

// Спороносец (T13.82, аудит §4): лужи на ходу и после смерти; герой в луже получает урон и замедлен; лужи ограничены.
const C = ARCADE.spores;
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.lootOpen || sim.pondOpen || sim.forgeOpen || sim.riftOpen || sim.neutralOpen || sim.contractOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); } };
const untilMinute = (sim: ArcadeSim, min: number) => { let g = 0; while (sim.minutes < min && !sim.over && g++ < sec(60 * 30)) step(sim, 1); };
const spawn = (s: ArcadeSim, x: number, y: number) => (s as unknown as { spawnEnemy(k: typeof ENEMY_KINDS.sporebearer, x: number, y: number): { x: number; y: number; alive: boolean; shotCd: number; hp: number } }).spawnEnemy(ENEMY_KINDS.sporebearer, x, y);

describe("спороносец", () => {
  it("приходит парой с fromMin; оставляет лужи на ходу и большую после смерти; луж не больше maxPuddles", () => {
    const sim = new ArcadeSim("spores-1", { act: "short", composition: "all" });
    untilMinute(sim, C.fromMin + 0.02);
    expect(sim.enemies.filter((e) => e.alive && e.kind.id === "sporebearer")).toHaveLength(C.count);
    const before = sim.spores.length;
    step(sim, C.dropEvery + 5);
    expect(sim.spores.length).toBeGreaterThan(before);
    for (const sp of sim.spores) expect(sp.r).toBeLessThanOrEqual(C.deathR);
    const bearer = sim.enemies.find((e) => e.alive && e.kind.id === "sporebearer")!;
    sim.damageEnemy(bearer, 1e9, "hit");
    const big = sim.spores.find((sp) => sp.r === C.deathR && sp.x === bearer.x && sp.y === bearer.y);
    expect(big).toBeDefined();
    // Лимит: лишние гаснут первыми.
    const many = new ArcadeSim("spores-2", { act: "short", composition: "all" });
    for (let i = 0; i < C.maxPuddles + 4; i++) (many as unknown as { dropSpore(x: number, y: number, r: number, s: number): void }).dropSpore(100 + i * 10, 100, 40, 8);
    expect(many.spores.length).toBe(C.maxPuddles);
  }, 60_000);

  it("герой в луже получает урон и замедлен; вне лужи — нет; лужа гаснет по времени", () => {
    const sim = new ArcadeSim("spores-3", { act: "short", composition: "all" });
    step(sim, 30);
    for (const e of sim.enemies) if (e.alive) e.alive = false;
    const p = sim.player;
    (sim as unknown as { dropSpore(x: number, y: number, r: number, s: number): void }).dropSpore(p.x, p.y, 80, 3);
    expect(sim.inSpore(p.x, p.y)).toBe(true);
    p.hp = p.stats.maxHp; p.invulnUntil = 0;
    const x0 = p.x;
    for (let i = 0; i < 60; i++) { sim.step({ ...IDLE_INPUT, mx: 16, my: 0 }); }
    const movedIn = p.x - x0;
    expect(p.hp).toBeLessThan(p.stats.maxHp);
    // Тот же путь без лужи — быстрее.
    const free = new ArcadeSim("spores-3", { act: "short", composition: "all" });
    step(free, 30);
    for (const e of free.enemies) if (e.alive) e.alive = false;
    const fx0 = free.player.x;
    for (let i = 0; i < 60; i++) free.step({ ...IDLE_INPUT, mx: 16, my: 0 });
    expect(free.player.x - fx0).toBeGreaterThan(movedIn * 1.2);
    // Гаснет: через 3 с лужи нет.
    step(sim, sec(3) + 60);
    expect(sim.spores.length).toBe(0);
    expect(sim.inSpore(p.x, p.y)).toBe(false);
  });
});
