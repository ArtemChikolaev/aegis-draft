import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, TICK_HZ, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { UPGRADES, UPGRADE_BY_ID, upgradeFigures } from "../src/game/arcade/content/schools.ts";

// Благословения «Каст» (ARCADE.castProc): попадание умения героя (Q/W/E/R) накладывает статус школы не чаще раза в
// `castProc.every` на цель. Раньше статусы школ шли только с автоатаки, таймеров и Blink — кит кастера в школьный билд не входил.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; applyOffer(o: unknown): void };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const take = (sim: ArcadeSim, id: string) => priv(sim).applyOffer({ kind: "upgrade", id, rarity: "standard" });
const CAST = ["rad_spellfire", "ska_spellfrost", "mae_spellstorm", "ven_spelltoxin"];

function field(seed: string, hero: string): ArcadeSim {
  const sim = new ArcadeSim(seed, { hero, rank: 10 });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}
function dummy(sim: ArcadeSim, dx: number, dy = 0): Enemy {
  const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + dx, sim.player.y + dy);
  e.hp = e.maxHp = 1e6; e.stunUntil = 1e9;
  return e;
}
const go = (sim: ArcadeSim, n: number, cast = 0) => { for (let i = 0; i < n; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step({ ...IDLE_INPUT, cast: i === 0 ? cast : 0 }); } };

describe("благословения «Каст»", () => {
  it("по карте на школу огня, холода, молнии и яда; каждая — источник модификаторов своей школы, у каждой есть числа", () => {
    const cast = UPGRADES.filter((u) => u.type === "cast" && CAST.includes(u.id));
    expect(cast.map((u) => u.school).sort()).toEqual(["maelstrom", "radiance", "skadi", "venom"]);
    for (const u of cast) expect(upgradeFigures(u.id, 1, 1, { power: () => 0 }).length, u.id).toBeGreaterThan(0);
    // Цифра «на цель раз в» на карточке — зеркало конфига: правка отката не должна разойтись с текстом карты.
    for (const u of cast) {
      const per = upgradeFigures(u.id, 1, 1, { power: () => 0 }).find((f) => f.key === "perTarget");
      if (per) expect(per.value, u.id).toBe(ARCADE.castProc.every / TICK_HZ);
    }
    expect(UPGRADE_BY_ID.rad_inferno.requires).toContain("rad_spellfire");
    expect(UPGRADE_BY_ID.ska_snap.requires).toContain("ska_spellfrost");
    expect(UPGRADE_BY_ID.mae_mjollnir.requires).toContain("mae_spellstorm");
    expect(UPGRADE_BY_ID.ven_spread.requires).toContain("ven_spelltoxin");
  });

  it("умение (Blade Fury) поджигает, охлаждает и травит; автоатака — нет", () => {
    const withAbility = field("cast-1", "juggernaut");
    for (const id of ["rad_spellfire", "ska_spellfrost", "ven_spelltoxin"]) take(withAbility, id);
    const a = dummy(withAbility, 40);
    withAbility.player.abilities.q = 1; withAbility.player.cooldowns.q = 0;
    go(withAbility, 10, 1);
    expect(a.burnUntil).toBeGreaterThan(withAbility.tick);
    expect(a.chillUntil).toBeGreaterThan(withAbility.tick);
    expect(a.poisonStacks).toBeGreaterThan(0);

    const withAttack = field("cast-2", "juggernaut");
    for (const id of ["rad_spellfire", "ska_spellfrost", "ven_spelltoxin"]) take(withAttack, id);
    const b = dummy(withAttack, 40);
    withAttack.player.autoAttack = true;
    go(withAttack, sec(2));
    expect(b.hp).toBeLessThan(1e6); // удары прошли
    expect(b.burnUntil).toBeLessThanOrEqual(withAttack.tick);
    expect(b.poisonStacks).toBe(0);
  });

  it("не чаще раза в castProc.every на цель: вихрь бьёт каждые 6 тиков, а стаков яда за 2 с — по числу окон отката", () => {
    const sim = field("cast-3", "juggernaut");
    take(sim, "ven_spelltoxin");
    const e = dummy(sim, 40);
    sim.player.abilities.q = 1; sim.player.cooldowns.q = 0;
    go(sim, sec(2), 1);
    expect(e.poisonStacks).toBeGreaterThan(0);
    expect(e.poisonStacks).toBeLessThanOrEqual(Math.ceil(sec(2) / ARCADE.castProc.every) + 1);
  });

  it("«Грозовые чары» не запускают цепь изнутри цепи Arc Lightning: первая цель ранена ровно одним разрядом", () => {
    const sim = field("cast-4", "zeus");
    take(sim, "mae_spellstorm");
    (sim as unknown as { rng: { float(): number } }).rng.float = () => 0; // срабатывает всегда
    const first = dummy(sim, 60);
    for (let i = 1; i <= 6; i++) dummy(sim, 60 + i * 90);
    sim.player.abilities.q = 1; sim.player.cooldowns.q = 0;
    const zap = HEROES.zeus.abilities.q.value[1];
    sim.step({ ...IDLE_INPUT, cast: 1 });
    // Разряд умения — один; молния «чар» с первой цели уходит дальше по цепи, назад к ней — нет.
    expect(1e6 - first.hp).toBeCloseTo(zap, 6);
  });
});
