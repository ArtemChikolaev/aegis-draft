import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, DT, sec } from "../src/game/arcade/config.ts";
import { BLINK_MASK, IDLE_INPUT, type ArcadeInput, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { LEGENDARY_UPGRADES, UPGRADES, UPGRADE_BY_ID, upgradeFigures } from "../src/game/arcade/content/schools.ts";

// Blink (седьмой тип благословений DMD — «Dash»): рывок героя с зарядами и неуязвимостью, благословения типа `dash`
// по одному на школу и три легендарки Blink из Dota. Числа — ARCADE.blink и зеркало upgradeFigures.
type Priv = {
  applyOffer(o: unknown): void;
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  petPower(): number;
};
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const take = (sim: ArcadeSim, id: string, rarity = "standard") => priv(sim).applyOffer({ kind: "upgrade", id, rarity });
const B = ARCADE.blink;

/** Чистое поле: без камней и деревьев, без врагов и лагерной охраны, герой автоатакой и умениями не бьёт. */
function field(seed: string, opts: ConstructorParameters<typeof ArcadeSim>[1] = {}): ArcadeSim {
  const sim = new ArcadeSim(seed, { composition: "all", ...opts });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}
const go = (sim: ArcadeSim, input: Partial<ArcadeInput> = {}) => { sim.player.hp = sim.player.stats.maxHp; sim.step({ ...IDLE_INPUT, ...input }); };
const idle = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n; i++) go(sim); };
/** Живая мишень с огромным HP в точке. */
function dummy(sim: ArcadeSim, x: number, y: number): Enemy {
  const e = priv(sim).spawnEnemy(ENEMY_KINDS.kobold, x, y);
  e.hp = e.maxHp = 1e6;
  return e;
}

describe("Blink: рывок героя", () => {
  it("по направлению движения на dist, тратит заряд, даёт неуязвимость; заряд копится recharge", () => {
    const sim = field("blink-1");
    const x0 = sim.player.x, y0 = sim.player.y;
    go(sim, { mx: 16, cast: BLINK_MASK });
    const walked = sim.player.stats.speed * DT;
    expect(sim.player.x - x0).toBeCloseTo(walked + B.dist, 6);
    expect(sim.player.y).toBeCloseTo(y0, 6);
    expect(sim.player.blinkCharges).toBe(0);
    expect(sim.player.invulnUntil).toBe(sim.tick + B.invuln);
    expect(sim.events.blinks).toBe(1);
    expect(sim.fx.some((f) => f.kind === "blink")).toBe(true);
    // Без заряда — ничего.
    const x1 = sim.player.x;
    go(sim, { cast: BLINK_MASK });
    expect(sim.player.x).toBe(x1);
    // Заряд возвращается ровно через recharge тиков после рывка (один из них уже прошёл).
    const need = sim.blinkRechargeTicks();
    expect(need).toBe(sec(B.recharge * (1 - sim.player.stats.cooldown)));
    idle(sim, need - 2);
    expect(sim.player.blinkCharges).toBe(0);
    idle(sim, 1);
    expect(sim.player.blinkCharges).toBe(1);
    expect(sim.player.blinkCd).toBe(0);
  });

  it("стоя — туда, куда смотрит; оглушённый не блинкует", () => {
    const sim = field("blink-2");
    go(sim, { mx: -16 }); // развернулся влево
    const x0 = sim.player.x;
    go(sim, { cast: BLINK_MASK });
    expect(x0 - sim.player.x).toBeCloseTo(B.dist, 6);
    const stunned = field("blink-3");
    stunned.player.stunUntil = stunned.tick + sec(2);
    const sx = stunned.player.x;
    go(stunned, { mx: 16, cast: BLINK_MASK });
    expect(stunned.player.x).toBe(sx);
    expect(stunned.player.blinkCharges).toBe(1);
  });

  it("неуязвимость рывка гасит удар, который пришёл бы без неё", () => {
    const sim = field("blink-4");
    go(sim, { mx: 16, cast: BLINK_MASK });
    const hp = sim.player.hp;
    (sim as unknown as { damagePlayer(n: number): void }).damagePlayer(200);
    expect(sim.player.hp).toBe(hp);
  });

  it("в разломе рывок не выносит за арену (испытание не проваливается), а «Безмолвие» его не глушит", () => {
    const sim = field("blink-5");
    const rift = sim.rift!;
    expect(rift).toBeTruthy();
    rift.state = "active"; rift.rule = "silence"; rift.endsAt = sim.tick + sec(60); rift.nextWaveAt = 1e9;
    sim.player.x = rift.x + ARCADE.rift.arena - 60; sim.player.y = rift.y;
    go(sim, { mx: 16, cast: BLINK_MASK });
    expect(sim.player.blinkCharges).toBe(0);
    expect(Math.hypot(sim.player.x - rift.x, sim.player.y - rift.y)).toBeLessThanOrEqual(ARCADE.rift.arena - ARCADE.player.r + 1e-6);
    go(sim);
    expect(rift.state).toBe("active");
  });
});

describe("благословения типа «Рывок»", () => {
  it("по одному на каждую школу, с числами на карте; огонь/холод/молния/яд открывают модификаторы своей школы", () => {
    const dash = UPGRADES.filter((u) => u.type === "dash" && !u.legendary);
    expect(new Set(dash.map((u) => u.school))).toEqual(new Set(["radiance", "skadi", "maelstrom", "beast", "venom"]));
    for (const u of dash) expect(upgradeFigures(u.id, 1, 1, { power: () => 0 }).length, u.id).toBeGreaterThan(0);
    expect(UPGRADE_BY_ID.rad_blast.requires).toContain("rad_flare");
    expect(UPGRADE_BY_ID.ska_snap.requires).toContain("ska_frostblink");
    expect(UPGRADE_BY_ID.mae_mjollnir.requires).toContain("mae_blinkbolt");
    expect(UPGRADE_BY_ID.ven_virulence.requires).toContain("ven_slip");
    expect(LEGENDARY_UPGRADES.filter((u) => u.type === "dash").map((u) => u.id).sort()).toEqual(["leg_blink_arcane", "leg_blink_over", "leg_blink_swift"]);
  });

  it("Огненный след и Ядовитый шлейф — в точке ухода; Морозная вспышка и Грозовой шаг — в точке прибытия", () => {
    const sim = field("dash-1");
    for (const id of ["rad_flare", "ven_slip", "ska_frostblink", "mae_blinkbolt"]) take(sim, id);
    const { x, y } = sim.player;
    const back = dummy(sim, x - 40, y);
    const front = dummy(sim, x + B.dist + 50, y);
    go(sim, { mx: 16, cast: BLINK_MASK });
    expect(back.burnUntil).toBeGreaterThan(sim.tick);
    expect(back.poisonStacks).toBe(2);
    expect(back.hp).toBeLessThan(1e6);
    expect(front.chillUntil).toBeGreaterThan(sim.tick);
    expect(front.chillSlow).toBeCloseTo(0.4, 6);
    expect(front.hp).toBeLessThanOrEqual(1e6 - 12 - 22); // нова холода + молния
    expect(front.burnUntil).toBeLessThanOrEqual(sim.tick); // огонь остался позади
  });

  it("Стая следом: волки прыгают к точке прибытия и 3 с бьют сильнее", () => {
    const sim = field("dash-2");
    take(sim, "beast_wolf"); take(sim, "beast_pounce");
    const wolves = sim.pets.filter((p) => p.kind === "wolf");
    expect(wolves.length).toBeGreaterThan(0);
    for (const w of wolves) { w.x = sim.player.x - 300; w.y = sim.player.y; }
    const base = priv(sim).petPower();
    go(sim, { mx: 16, cast: BLINK_MASK });
    for (const w of sim.pets.filter((p) => p.kind === "wolf")) expect(Math.hypot(w.x - sim.player.x, w.y - sim.player.y)).toBeLessThan(60);
    expect(priv(sim).petPower()).toBeCloseTo(base * 1.3, 6);
    idle(sim, sec(3));
    expect(priv(sim).petPower()).toBeCloseTo(base, 6);
  });
});

describe("легендарки Blink", () => {
  it("Overwhelming: удар 60 + 6 за уровень и замедление 50% в точке прибытия", () => {
    const sim = field("leg-over");
    take(sim, "leg_blink_over", "arcana");
    const e = dummy(sim, sim.player.x + B.dist + 60, sim.player.y);
    go(sim, { mx: 16, cast: BLINK_MASK });
    expect(1e6 - e.hp).toBeCloseTo(B.over.dmg + B.over.perLevel * sim.player.level, 6);
    expect(e.chillSlow).toBe(B.over.slow);
  });

  it("Swift: 3 с быстрее бег", () => {
    const sim = field("leg-swift");
    take(sim, "leg_blink_swift", "arcana");
    go(sim, { mx: 16, cast: BLINK_MASK });
    const x0 = sim.player.x;
    go(sim, { mx: 16 });
    expect(sim.player.x - x0).toBeCloseTo(sim.player.stats.speed * B.swift.speedMult * DT, 6);
    expect(sim.player.swiftUntil).toBe(sim.tick - 1 + sec(B.swift.seconds));
  });

  it("Arcane: второй заряд сразу и вдвое быстрее копится", () => {
    const sim = field("leg-arcane");
    const slow = sim.blinkRechargeTicks();
    take(sim, "leg_blink_arcane", "arcana");
    go(sim);
    expect(sim.blinkMaxCharges()).toBe(2);
    expect(sim.player.blinkCharges).toBe(2);
    expect(sim.blinkRechargeTicks()).toBe(Math.round(slow * B.arcane.rechargeMult));
    const x0 = sim.player.x;
    go(sim, { mx: 16, cast: BLINK_MASK });
    idle(sim, B.lockout);
    go(sim, { mx: 16, cast: BLINK_MASK });
    expect(sim.player.x - x0).toBeGreaterThan(2 * B.dist);
    expect(sim.player.blinkCharges).toBe(0);
  });
});
