import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Гром-голем (T13.53, «Громозавр» аудита): три заряженные зоны вокруг героя, четвёртая сторона безопасна; удар, потом цепь между зонами.
const T = ARCADE.thunder;
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.contractOpen || sim.forgeOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); } };
const quiet = (sim: ArcadeSim) => { for (const e of sim.enemies) if (e.alive && e !== sim.thunder && !e.kind.totem) e.alive = false; sim.defiler = null; sim.centaur = null; sim.necromancer = null; sim.camp!.nextGuardAt = 1e9; };
const hold = (sim: ArcadeSim, x: number, y: number, n: number) => { for (let i = 0; i < n; i++) { sim.player.x = x; sim.player.y = y; step(sim, 1); } };

describe("Гром-голем", () => {
  it("логово по seed вдали от других мест; спит и неуязвим; будится входом; в бою ставит три зоны в трёх из четырёх сторон", () => {
    const sim = new ArcadeSim("thunder-1");
    for (const o of [sim.camp!, sim.outpost!, sim.pond!, sim.grove!, sim.barrow!, sim.forge!]) expect(Math.hypot(sim.lair!.x - o.x, sim.lair!.y - o.y)).toBeGreaterThanOrEqual(T.minFromOthers - 60);
    expect(new ArcadeSim("thunder-1").lair).toEqual(sim.lair);
    quiet(sim);
    const g = sim.thunder!, l = sim.lair!;
    expect(sim.isDormant(g)).toBe(true);
    const hp = g.hp; sim.damageEnemy(g, 100, "hit"); expect(g.hp).toBe(hp);
    hold(sim, l.x + T.wakeRadius - 10, l.y, 1);
    expect(sim.playerAtLair()).toBe(true);
    expect(sim.isDormant(g)).toBe(false);
    // Первый паттерн: зоны вокруг героя, ровно три, все на zoneDist, одна сторона свободна.
    hold(sim, l.x + 150, l.y, 3);
    const px = sim.player.x, py = sim.player.y; // после коллизий героя: зоны считаются от фактической позиции
    expect(l.zones).toHaveLength(T.zones);
    for (const z of l.zones) expect(Math.abs(Math.hypot(z.x - px, z.y - py) - T.zoneDist)).toBeLessThan(12);
    const sides = l.zones.map((z) => `${Math.sign(Math.round(z.x - px))},${Math.sign(Math.round(z.y - py))}`);
    expect(new Set(sides).size).toBe(3);
    expect(l.telegraphUntil - sim.tick).toBeLessThanOrEqual(T.telegraph);
  });

  it("телеграф без урона; удар бьёт стоящего в зоне, не бьёт в безопасной стороне; цепь бьёт на отрезке между зонами", () => {
    const sim = new ArcadeSim("thunder-2");
    quiet(sim);
    const l = sim.lair!;
    l.engaged = true;
    const px = l.x + 150, py = l.y;
    hold(sim, px, py, 3);
    expect(l.zones).toHaveLength(3);
    // Стоим в первой зоне весь телеграф — урона нет до удара, удар есть.
    const z = l.zones[0];
    const h0 = sim.events.hurt;
    while (sim.tick < l.telegraphUntil - 1) hold(sim, z.x, z.y, 1);
    expect(sim.events.hurt).toBe(h0);
    hold(sim, z.x, z.y, 2);
    expect(sim.events.hurt).toBeGreaterThanOrEqual(h0 + 1); // удар; зона — конец отрезка цепи, она может добавить второй
    // Безопасная сторона: на новом сиде встаём в пропущенную сторону — ни удар, ни цепь не достают.
    const sim2 = new ArcadeSim("thunder-2b");
    quiet(sim2);
    const l2 = sim2.lair!; l2.engaged = true;
    const p2x = l2.x + 150, p2y = l2.y;
    hold(sim2, p2x, p2y, 3);
    const used = new Set(l2.zones.map((z) => `${Math.sign(Math.round(z.x - p2x))},${Math.sign(Math.round(z.y - p2y))}`));
    const safe = [[1, 0], [0, 1], [-1, 0], [0, -1]].find(([sx, sy]) => !used.has(`${sx},${sy}`))!;
    const sx = p2x + safe[0] * (T.zoneDist + 60), sy = p2y + safe[1] * (T.zoneDist + 60);
    const h2 = sim2.events.hurt;
    sim2.thunder!.x = l2.x - 400; sim2.thunder!.y = l2.y - 400; // сам голем далеко: считаем только зоны
    while (sim2.tick <= l2.activeUntil + 1) hold(sim2, sx, sy, 1);
    expect(sim2.events.hurt).toBe(h2);
    // Цепь: середина отрезка между зонами 0 и 1 в активной фазе бьёт.
    const sim3 = new ArcadeSim("thunder-2c");
    quiet(sim3);
    const l3 = sim3.lair!; l3.engaged = true;
    hold(sim3, l3.x + 150, l3.y, 3);
    sim3.thunder!.x = l3.x - 400; sim3.thunder!.y = l3.y - 400;
    const m = { x: (l3.zones[0].x + l3.zones[1].x) / 2, y: (l3.zones[0].y + l3.zones[1].y) / 2 };
    while (sim3.tick <= l3.telegraphUntil + 1) hold(sim3, l3.x + 150 + 400, l3.y + 400, 1); // удар мимо
    const h3 = sim3.events.hurt;
    hold(sim3, m.x, m.y, 3);
    expect(sim3.events.hurt).toBeGreaterThan(h3);
  });

  it("поводок и награда: вне логова возвращается и лечится; смерть — гибрид молнии, если школы есть, иначе карта Maelstrom; цель контракта и итог", () => {
    const sim = new ArcadeSim("thunder-3");
    quiet(sim);
    const g = sim.thunder!, l = sim.lair!;
    g.x = l.x + T.leash + 150; g.y = l.y; g.hp = g.maxHp * 0.5;
    hold(sim, g.x + 40, g.y, sec(2));
    expect(Math.hypot(g.x - l.x, g.y - l.y)).toBeLessThan(T.leash + 100);
    expect(g.hp).toBeGreaterThan(g.maxHp * 0.5);
    hold(sim, l.x, l.y, 1);
    sim.player.schools.push("maelstrom", "skadi");
    sim.damageEnemy(g, 1e9, "hit");
    expect(sim.thunder).toBeNull();
    expect(sim.pending).toHaveLength(1);
    expect(sim.pending![0]).toMatchObject({ kind: "upgrade", id: "hyb_superconductor", rarity: "exotic" });
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.thunderSlain).toBe(true);
    const sim2 = new ArcadeSim("thunder-4");
    quiet(sim2);
    sim2.lair!.engaged = true;
    sim2.damageEnemy(sim2.thunder!, 1e9, "hit");
    expect(sim2.pending![0]).toMatchObject({ kind: "upgrade", rarity: "exotic" });
    if (sim2.pending![0].kind === "upgrade") expect(sim2.pending![0].id.startsWith("mae_") || sim2.pending![0].id.startsWith("leg_mae")).toBe(true);
    const sim3 = new ArcadeSim("thunder-5");
    expect((sim3 as unknown as { contractTargets(): string[] }).contractTargets()).toContain("thunder");
  });
});
