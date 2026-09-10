import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type Enemy } from "../src/game/arcade/types.ts";

// Сатир-Осквернитель (T13.41, этап 1 аудита): чемпион лагеря с телеграфом, окном ответа и возможностью отступить.
const D = ARCADE.defiler, C = ARCADE.camp;
const totems = (sim: ArcadeSim): Enemy[] => sim.enemies.filter((e) => e.alive && e.kind.totem);
const step = (sim: ArcadeSim, n: number, keepHp = true) => { for (let i = 0; i < n && !sim.over; i++) { if (keepHp) sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); } };
/** Убрать всё лишнее: обычный спавн и охрану, чтобы считать только сатира. */
const quiet = (sim: ArcadeSim) => { sim.camp!.nextGuardAt = 1e9; for (const e of sim.enemies) if (e.alive && !e.kind.totem && e !== sim.defiler) e.alive = false; };

describe("Сатир-Осквернитель", () => {
  it("стоит в центре лагеря, спит и лечится, пока герой снаружи; в лагере — гонит героя", () => {
    const sim = new ArcadeSim("defiler-1");
    const s = sim.defiler!, camp = sim.camp!;
    expect(s.kind.id).toBe("satyr_defiler");
    expect([Math.round(s.x), Math.round(s.y)]).toEqual([Math.round(camp.x), Math.round(camp.y)]);
    s.hp = s.maxHp * 0.5;
    step(sim, sec(3));
    expect([Math.round(s.x), Math.round(s.y)]).toEqual([Math.round(camp.x), Math.round(camp.y)]);
    expect(s.hp).toBeGreaterThan(s.maxHp * 0.5); // регенерация дома
    quiet(sim);
    sim.player.x = camp.x + 300; sim.player.y = camp.y; // между wakeRadius и engageRadius: лагерь ещё спит
    const d0 = Math.hypot(s.x - sim.player.x, s.y - sim.player.y);
    step(sim, sec(1));
    expect(sim.playerAtCamp()).toBe(false);
    expect(Math.hypot(s.x - sim.player.x, s.y - sim.player.y)).toBeCloseTo(d0, 0);
    // Удар по тотему будит лагерь издалека — сатир идёт к герою.
    sim.damageEnemy(totems(sim)[0], 1, "hit");
    expect(sim.playerAtCamp()).toBe(true);
    step(sim, sec(1));
    expect(Math.hypot(s.x - sim.player.x, s.y - sim.player.y)).toBeLessThan(d0 - 60);
  });

  it("щит тотемов: с тремя берёт четверть урона, без тотемов — весь", () => {
    const sim = new ArcadeSim("defiler-2");
    const s = sim.defiler!;
    const hit = () => { const hp = s.hp; sim.damageEnemy(s, 100, "hit"); return hp - s.hp; };
    expect(hit()).toBeCloseTo(100 * (1 - D.shieldPerTotem * 3), 5);
    sim.damageEnemy(totems(sim)[0], 1e9, "hit");
    expect(hit()).toBeCloseTo(100 * (1 - D.shieldPerTotem * 2), 5);
    for (const t of totems(sim)) sim.damageEnemy(t, 1e9, "hit");
    expect(hit()).toBeCloseTo(100, 5);
  });

  it("«порыв»: телеграф на позиции героя, взрыв бьёт только оставшегося в круге, потом окно восстановления", () => {
    const sim = new ArcadeSim("defiler-3");
    quiet(sim);
    const s = sim.defiler!;
    sim.player.x = s.x + 40; sim.player.y = s.y;
    step(sim, 2);
    expect(s.slamT).toBeGreaterThan(0);
    expect([s.slamX, s.slamY]).toEqual([sim.player.x, sim.player.y]);
    // Ушли из круга — взрыв мимо.
    const hurt0 = sim.events.hurt;
    sim.player.x = s.slamX + D.galeRadius + 60;
    step(sim, D.galeTelegraph);
    expect(s.slamT).toBe(0);
    expect(sim.events.hurt).toBe(hurt0);
    expect(s.slamCd).toBeGreaterThanOrEqual(D.galeCooldown - 2);
    // Окно восстановления: сатир не двигается.
    const [x0, y0] = [s.x, s.y];
    step(sim, D.galeRecovery - 2);
    expect([s.x, s.y]).toEqual([x0, y0]);
    // Второй порыв, стоим в круге — получаем урон.
    const sim2 = new ArcadeSim("defiler-3b");
    quiet(sim2);
    const s2 = sim2.defiler!;
    sim2.player.x = s2.x + 40; sim2.player.y = s2.y;
    step(sim2, 2);
    const h2 = sim2.events.hurt;
    sim2.player.invulnUntil = 0;
    step(sim2, D.galeTelegraph);
    expect(sim2.events.hurt).toBeGreaterThan(h2);
  });

  it("полоса порчи между тотемами: телеграф → активна, бьёт стоящего на ней; без второго тотема полос нет", () => {
    const sim = new ArcadeSim("defiler-4");
    quiet(sim);
    const camp = sim.camp!, s = sim.defiler!;
    s.x = camp.x - 400; s.y = camp.y; s.slamCd = 1e9; // сатир далеко и без порыва: считаем только полосу
    sim.player.x = camp.x; sim.player.y = camp.y;
    step(sim, 2);
    expect(camp.line).not.toBeNull();
    const L = camp.line!;
    expect(L.telegraphUntil - sim.tick).toBeLessThanOrEqual(D.lineTelegraph);
    // Во время телеграфа урона нет даже на линии.
    sim.player.x = (L.ax + L.bx) / 2; sim.player.y = (L.ay + L.by) / 2;
    const hurt0 = sim.events.hurt;
    step(sim, L.telegraphUntil - sim.tick - 1);
    expect(sim.events.hurt).toBe(hurt0);
    step(sim, 3);
    expect(sim.events.hurt).toBeGreaterThan(hurt0);
    // Рядом с линией, но вне полосы — нет.
    const sim2 = new ArcadeSim("defiler-4");
    quiet(sim2);
    const c2 = sim2.camp!, s2 = sim2.defiler!;
    s2.x = c2.x - 400; s2.y = c2.y; s2.slamCd = 1e9;
    sim2.player.x = c2.x; sim2.player.y = c2.y;
    step(sim2, 2);
    const L2 = sim2.camp!.line!;
    const nx = -(L2.by - L2.ay), ny = L2.bx - L2.ax, nl = Math.hypot(nx, ny) || 1;
    sim2.player.x = (L2.ax + L2.bx) / 2 + nx / nl * (D.lineWidth / 2 + ARCADE.player.r + 30);
    sim2.player.y = (L2.ay + L2.by) / 2 + ny / nl * (D.lineWidth / 2 + ARCADE.player.r + 30);
    const h2 = sim2.events.hurt;
    step(sim2, D.lineTelegraph + D.lineActive + 2);
    expect(sim2.events.hurt).toBe(h2);
    expect(sim2.camp!.line).toBeNull();
    // Один тотем — полос нет.
    const sim3 = new ArcadeSim("defiler-4");
    quiet(sim3);
    for (const t of totems(sim3).slice(0, 2)) sim3.damageEnemy(t, 1e9, "hit");
    sim3.defiler!.x -= 400; sim3.defiler!.slamCd = 1e9;
    sim3.player.x = sim3.camp!.x; sim3.player.y = sim3.camp!.y;
    step(sim3, sec(8));
    expect(sim3.camp!.line).toBeNull();
  });

  it("поводок: далеко от лагеря возвращается домой и лечится; контроль не дольше ccCap, потом иммунитет", () => {
    const sim = new ArcadeSim("defiler-5");
    quiet(sim);
    const s = sim.defiler!, camp = sim.camp!;
    s.x = camp.x + C.radius + D.leash + 100; s.y = camp.y; s.hp = s.maxHp * 0.5;
    sim.player.x = s.x + 30; sim.player.y = s.y; // герой вне engageRadius — сон/поводок
    const home0 = Math.hypot(s.x - camp.x, s.y - camp.y);
    step(sim, sec(2));
    expect(Math.hypot(s.x - camp.x, s.y - camp.y)).toBeLessThan(home0 - 100);
    expect(s.hp).toBeGreaterThan(s.maxHp * 0.5);
    // Контроль: стан 5 с режется до ccCap, затем повторный стан игнорируется.
    sim.player.x = camp.x; sim.player.y = camp.y; s.x = camp.x + 200; s.y = camp.y;
    s.stunUntil = sim.tick + sec(5);
    step(sim, 1);
    expect(s.stunUntil - sim.tick).toBeLessThanOrEqual(D.ccCap);
    step(sim, D.ccCap + 1);
    s.stunUntil = sim.tick + sec(2);
    step(sim, 1);
    expect(s.stunUntil).toBe(0);
  });

  it("лагерь очищается только когда сняты тотемы и убит Осквернитель; он роняет добычу как элита; детерминизм", () => {
    const sim = new ArcadeSim("defiler-6");
    sim.damageEnemy(sim.defiler!, sim.defiler!.maxHp * 1.2, "hit"); // под щитом ×0.25 — переживёт удар в 120% HP
    expect(sim.defiler!.alive).toBe(true);
    for (const t of totems(sim)) sim.damageEnemy(t, 1e9, "hit");
    expect(sim.camp!.cleared).toBe(false);
    const loot0 = sim.groundLoot.length;
    sim.damageEnemy(sim.defiler!, 1e9, "hit");
    expect(sim.defiler).toBeNull();
    expect(sim.camp!.cleared).toBe(true);
    expect(sim.groundLoot.length).toBe(loot0 + 1);
    expect(sim.events.eliteKills).toBe(1);
    const run = () => { const x = new ArcadeSim("defiler-7"); x.player.x = x.camp!.x; x.player.y = x.camp!.y; step(x, sec(15)); return x.digest(); };
    expect(run()).toBe(run());
  });
});
