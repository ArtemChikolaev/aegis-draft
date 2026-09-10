import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type Enemy } from "../src/game/arcade/types.ts";
import { LEGENDARY_UPGRADES, SCHOOLS, UPGRADES, upgradeFigures } from "../src/game/arcade/content/schools.ts";

// Школа Venom (T13.47, этап 3 аудита): пять узлов поверх статуса яда, две легендарные развилки, три гибрида.
const P = ARCADE.poison;
const apply = (sim: ArcadeSim, id: string, rarity = "standard") => (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id, rarity });
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); } };
function target(sim: ArcadeSim, far = false): Enemy {
  for (let i = 0; i < sec(20) && !sim.enemies.some((e) => e.alive && !e.kind.elite && !e.kind.totem && !sim.isDormant(e)); i++) step(sim, 1);
  const e = sim.enemies.find((x) => x.alive && !x.kind.elite && !x.kind.totem && !sim.isDormant(x))!;
  e.hp = e.maxHp = 1e6;
  if (far) { e.x = sim.player.x + 900; e.y = sim.player.y + 900; }
  return e;
}
/** Две обычные живые цели рядом друг с другом (ждём, пока спавн даст вторую). */
function pair(sim: ArcadeSim, far = false): [Enemy, Enemy] {
  const ok = (x: Enemy) => x.alive && !x.kind.elite && !x.kind.totem && !sim.isDormant(x);
  for (let i = 0; i < sec(30) && sim.enemies.filter(ok).length < 2; i++) step(sim, 1);
  const [a, b] = sim.enemies.filter(ok);
  expect(b).toBeTruthy();
  a.hp = a.maxHp = 1e6; b.hp = b.maxHp = 1e6;
  if (far) { a.x = sim.player.x + 900; a.y = sim.player.y + 900; }
  b.x = a.x + 30; b.y = a.y;
  return [a, b];
}
const stop = (sim: ArcadeSim) => { sim.player.autoAttack = false; sim.player.autoCast = { q: false, w: false, e: false, r: false }; };

describe("школа Venom", () => {
  it("реестр: пятая школа, 5 узлов, 2 легендарки, 3 гибрида, у всех карточек есть числа и тексты", () => {
    expect(SCHOOLS).toContain("venom");
    const ven = UPGRADES.filter((u) => u.school === "venom");
    expect(ven.filter((u) => !u.legendary && !u.requiresSchools)).toHaveLength(5);
    expect(ven.filter((u) => u.legendary)).toHaveLength(2);
    expect(ven.filter((u) => u.requiresSchools)).toHaveLength(3);
    expect(LEGENDARY_UPGRADES.length).toBeGreaterThanOrEqual(20);
    const ctx = { power: () => 0 };
    for (const u of ven) if (!u.legendary) expect(upgradeFigures(u.id, 1, 1, ctx).length, u.id).toBeGreaterThan(0);
    // Модификаторы требуют источник — как у остальных школ.
    expect(UPGRADES.find((u) => u.id === "ven_spread")?.requires).toContain("ven_sting");
  });

  it("жало кладёт стак с удара; вирулентность множит урон тика и продлевает яд; клыки — стак ближайшему по таймеру", () => {
    const sim = new ArcadeSim("venom-1", { hero: "juggernaut" });
    stop(sim);
    const e = target(sim, true);
    apply(sim, "ven_virulence"); apply(sim, "ven_virulence"); // power 2 → ×1.5, +1 с
    sim.applyPoison(e, 10);
    expect(e.poisonUntil - sim.tick).toBe(sec(P.seconds + 1));
    const hp0 = e.hp;
    for (let i = 0; i < P.tickEvery; i++) step(sim, 1);
    expect(hp0 - e.hp).toBeCloseTo(10 * 1 * P.tickShare * 1.5, 3);
    // Клыки: ближайший враг получает стак раз в 1.5 с даже без атак.
    const sim2 = new ArcadeSim("venom-2", { hero: "juggernaut" });
    stop(sim2);
    const t = target(sim2);
    t.x = sim2.player.x + 120; t.y = sim2.player.y;
    apply(sim2, "ven_fangs");
    for (let i = 0; i < 3; i++) { t.x = sim2.player.x + 120; t.y = sim2.player.y; step(sim2, 1); }
    expect(t.poisonStacks).toBeGreaterThanOrEqual(1);
    const st = t.poisonStacks;
    for (let i = 0; i < sec(1.5) + 2; i++) { t.x = sim2.player.x + 120; t.y = sim2.player.y; step(sim2, 1); }
    expect(t.poisonStacks).toBe(st + 1);
    // Жало: автоатака кладёт стак.
    const sim3 = new ArcadeSim("venom-3", { hero: "juggernaut" });
    const t3 = target(sim3);
    apply(sim3, "ven_sting");
    for (let i = 0; i < sec(3) && t3.poisonStacks === 0; i++) { t3.x = sim3.player.x + 40; t3.y = sim3.player.y; step(sim3, 1); }
    expect(t3.poisonStacks).toBeGreaterThan(0);
  });

  it("облако кладёт стак всем в радиусе у ближайшего; заражение передаёт стаки соседям при смерти; Пандемия — всё всем", () => {
    const sim = new ArcadeSim("venom-4", { hero: "juggernaut" });
    stop(sim);
    const [a, b] = pair(sim);
    a.x = sim.player.x + 150; a.y = sim.player.y; b.x = a.x + 40; b.y = a.y;
    apply(sim, "ven_cloud");
    for (let i = 0; i < 3; i++) { a.x = sim.player.x + 150; a.y = sim.player.y; b.x = a.x + 40; b.y = a.y; step(sim, 1); }
    expect(a.poisonStacks).toBeGreaterThanOrEqual(1);
    expect(b.poisonStacks).toBeGreaterThanOrEqual(1);
    // Заражение: a умирает с 3 стаками → b получает min(3, 1+rank) стаков сверх своих.
    apply(sim, "ven_spread");
    a.poisonStacks = 3; a.poisonDps = 10; a.poisonUntil = sim.tick + sec(3);
    const bs = b.poisonStacks;
    sim.damageEnemy(a, 1e9, "hit");
    expect(b.poisonStacks).toBe(Math.min(P.maxStacks, bs + 2));
    // Пандемия: все стаки всем в 160.
    const sim2 = new ArcadeSim("venom-5", { hero: "juggernaut" });
    stop(sim2);
    const [c, d] = pair(sim2, true);
    d.x = c.x + 100; d.y = c.y;
    apply(sim2, "leg_ven_pandemic", "arcana");
    c.poisonStacks = 4; c.poisonDps = 10; c.poisonUntil = sim2.tick + sec(3);
    sim2.damageEnemy(c, 1e9, "hit");
    expect(d.poisonStacks).toBe(4);
    expect(d.poisonUntil - sim2.tick).toBe(sec(P.seconds + 2));
  });

  it("Дистилляция: шестой стак тратит пять на взрыв ×6 и половину соседям; без неё стаки просто держатся на потолке", () => {
    const sim = new ArcadeSim("venom-6", { hero: "juggernaut" });
    stop(sim);
    const [a, b] = pair(sim, true);
    for (let i = 0; i < 6; i++) sim.applyPoison(a, 10);
    expect(a.poisonStacks).toBe(P.maxStacks);
    apply(sim, "leg_ven_distill", "arcana");
    const ha = a.hp, hb = b.hp;
    sim.applyPoison(a, 10);
    expect(a.poisonStacks).toBe(0);
    expect(ha - a.hp).toBeCloseTo(10 * 5 * 6, 3);
    expect(hb - b.hp).toBeCloseTo(10 * 5 * 6 * 0.5, 3);
    sim.applyPoison(a, 10);
    expect(a.poisonStacks).toBe(1); // после взрыва копится заново
  });

  it("гибриды: холод продлевает яд, питомцы кладут стак, огонь + полный стек — взрыв без цепи", () => {
    const sim = new ArcadeSim("venom-7", { hero: "juggernaut" });
    stop(sim);
    const [a, b] = pair(sim, true);
    sim.player.schools.push("venom", "skadi", "radiance", "beast");
    apply(sim, "hyb_venom_frost");
    sim.applyPoison(a, 10);
    const until = a.poisonUntil;
    (sim as unknown as { applyChill(e: Enemy, s: number, sec: number, st?: boolean): void }).applyChill(a, 0.3, 1, false);
    expect(a.poisonUntil).toBe(until + sec(0.6));
    // Огонь: полный стек + горение → взрыв 30·p по цели и 15·p соседям, стаки не растут выше потолка, второго взрыва без нового стака нет.
    apply(sim, "hyb_venom_fire");
    (sim as unknown as { applyBurn(e: Enemy, d: number, s: number): void }).applyBurn(a, 1, 5);
    for (let i = 0; i < 5; i++) sim.applyPoison(a, 10);
    const ha = a.hp, hb = b.hp;
    sim.applyPoison(a, 10);
    expect(ha - a.hp).toBeCloseTo(30, 3);
    expect(hb - b.hp).toBeCloseTo(15, 3);
    expect(a.poisonStacks).toBe(P.maxStacks);
    // Питомцы: волк кусает — стак.
    const sim2 = new ArcadeSim("venom-8", { hero: "juggernaut" });
    stop(sim2);
    sim2.player.schools.push("venom", "beast");
    apply(sim2, "beast_wolf"); apply(sim2, "hyb_venom_beast");
    const t = target(sim2);
    let guard = 0;
    while (t.poisonStacks === 0 && guard++ < sec(8)) { t.x = sim2.player.x + 30; t.y = sim2.player.y; step(sim2, 1); }
    expect(t.poisonStacks).toBeGreaterThan(0);
  });
});
