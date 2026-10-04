import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS, spawnPool } from "../src/game/arcade/content/enemies.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";

// Древние лагеря (M25): в актах Dire и реки раз в 75 с приходит стая — Black Dragon (Fireball по точке героя), Гранитный
// голем (аура брони союзникам) и Ледяной шаман (Frost Armor). В обычный пул они не входят, в лесу Radiant их нет.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; nextAncientAt: number; castAbility(k: string, ab: unknown): void };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const NC = ARCADE.neutralCasts;
const ANCIENTS = ARCADE.ancients.pack as readonly string[];

function field(seed: string, act: "dire" | "short" = "dire", minute = 6, hero = "juggernaut"): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10, act, hero });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  sim.tick = sec(minute * 60);
  return sim;
}
const spawn = (sim: ArcadeSim, kind: EnemyKind, dx: number, dy = 0) => {
  const e = priv(sim).spawnEnemy(kind, sim.player.x + dx, sim.player.y + dy);
  e.hp = e.maxHp = 1e6;
  return e;
};
/** Шаги со «своими» врагами: остальной спавн глушим, окна закрываем, героя держим живым. */
function run(sim: ArcadeSim, n: number, keep: Enemy[] = []): void {
  for (let i = 0; i < n; i++) {
    for (const e of sim.enemies) if (e.alive && !keep.includes(e)) e.alive = false;
    sim.player.hp = sim.player.stats.maxHp;
    for (let k = 0; k < 6 && sim.activeModal(); k++) sim.step(sim.activeModal() === "pending" ? { ...IDLE_INPUT, choose: 0 } : { ...IDLE_INPUT, act: 5 });
    sim.step(IDLE_INPUT);
  }
}

describe("Древние лагеря", () => {
  it("стая из трёх древних приходит по расписанию в Dire, но не в лесу Radiant и не из обычного пула", () => {
    for (const act of ["dire", "short"] as const) {
      const sim = field(`anc-pack-${act}`, act);
      priv(sim).nextAncientAt = sim.actTick + 1;
      sim.step(IDLE_INPUT);
      sim.step(IDLE_INPUT);
      const ids = sim.enemies.filter((e) => e.alive && ANCIENTS.includes(e.kind.id)).map((e) => e.kind.id).sort();
      expect(ids, act).toEqual(act === "dire" ? [...ANCIENTS].sort() : []);
    }
    for (const act of ["dire", "river", "short"]) expect(spawnPool(30, act).some((k) => ANCIENTS.includes(k.id))).toBe(false);
  });

  it("Fireball: круг ложится на точку героя и бьёт издалека; ушёл из круга — мимо", () => {
    for (const leave of [false, true]) {
      const sim = field(`anc-fire-${leave}`);
      const d = spawn(sim, ENEMY_KINDS.black_dragon, NC.fireball.range - 40);
      run(sim, 1, [d]);
      expect(d.castT).toBe(NC.fireball.tele);
      expect(Math.hypot(d.castX - sim.player.x, d.castY - sim.player.y)).toBeLessThan(5);
      const hurt0 = sim.events.hurt;
      if (leave) sim.player.x += NC.fireball.radius + 60;
      run(sim, NC.fireball.tele, [d]);
      expect(d.castT).toBe(0);
      expect(sim.events.hurt > hurt0, `leave=${leave}`).toBe(!leave);
    }
  });

  it("Гранитная аура: союзники голема под бронёй, сам голем — нет; Purge снимает, следующий импульс возвращает", () => {
    const sim = field("anc-aura");
    const g = spawn(sim, ENEMY_KINDS.granite_golem, 200);
    // Союзники без своих умений: огр сам вешает Frost Armor на соседа — и на голема.
    const ally = spawn(sim, ENEMY_KINDS.wildwing, 260);
    const far = spawn(sim, ENEMY_KINDS.wildwing, -400);
    run(sim, ARCADE.ancients.auraEvery + 1, [g, ally, far]);
    expect(ally.armorUntil).toBeGreaterThan(sim.tick);
    expect(g.armorUntil).toBeLessThanOrEqual(sim.tick);
    expect(far.armorUntil).toBeLessThanOrEqual(sim.tick);
    ally.armorUntil = 0; // как после Purge
    run(sim, ARCADE.ancients.auraEvery, [g, ally, far]);
    expect(ally.armorUntil).toBeGreaterThan(sim.tick);
  });

  it("Rubick крадёт Fireball дракона: огненный круг по ближайшему врагу, урон и горение", () => {
    const sim = field("anc-steal", "dire", 6, "rubick");
    sim.player.abilities.r = 1;
    spawn(sim, ENEMY_KINDS.black_dragon, 300);
    const target = spawn(sim, ENEMY_KINDS.wildwing, 120);
    sim.player.cooldowns.r = 0;
    priv(sim).castAbility("r", sim.hero.abilities.r);
    expect(sim.player.stolen).toBe("fireball");
    expect(target.hp).toBeLessThan(1e6);
    expect(target.burnUntil).toBeGreaterThan(sim.tick);
  });
});
