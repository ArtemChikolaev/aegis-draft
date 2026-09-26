import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, DT, sec, streakTierOf } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { AFFIX, ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";

// Серия убийств без урона (ARCADE.streak) и элита с аффиксами (ARCADE.affix).
type Priv = {
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  killEnemy(e: Enemy): void;
  damagePlayer(n: number): number;
  nextAffixAt: number;
};
const priv = (sim: ArcadeSim) => sim as unknown as Priv;

/** Чистое поле без камней, врагов и лагерной охраны; герой сам не бьёт и не регенерирует (числа урона считаются точно). */
function field(seed: string, opts: ConstructorParameters<typeof ArcadeSim>[1] = {}): ArcadeSim {
  const sim = new ArcadeSim(seed, opts);
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  sim.player.stats.regen = 0;
  return sim;
}
function dummy(sim: ArcadeSim, dx: number, dy = 0, kind: EnemyKind = ENEMY_KINDS.kobold): Enemy {
  return priv(sim).spawnEnemy(kind, sim.player.x + dx, sim.player.y + dy);
}
const killN = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n; i++) priv(sim).killEnemy(dummy(sim, 900)); };

describe("серия убийств", () => {
  it("копится без урона, ступени на порогах, лучшая серия — в итоге забега", () => {
    const sim = field("streak-1");
    const T = ARCADE.streak.tiers;
    killN(sim, T[0] - 1);
    expect(sim.streakTier()).toBe(0);
    expect(sim.events.streakUps).toBe(0);
    killN(sim, 1);
    expect(sim.streakTier()).toBe(1);
    expect(sim.events.streakUps).toBe(1);
    killN(sim, T[2] - T[0]);
    expect(sim.streakTier()).toBe(3);
    expect(sim.events.streakUps).toBe(3);
    expect(sim.player.bestStreak).toBe(T[2]);
    expect(streakTierOf(T[T.length - 1] + 500)).toBe(T.length);
  });

  it("баунти: золото за убийство × (1 + goldPerTier × ступень)", () => {
    const sim = field("streak-2");
    killN(sim, ARCADE.streak.tiers[3]);
    const tier = sim.streakTier();
    expect(tier).toBe(4);
    const e = dummy(sim, 900);
    const gold = sim.player.gold;
    priv(sim).killEnemy(e);
    expect(sim.player.gold - gold).toBe(Math.round((e.kind.gold + sim.player.stats.goldPerKill) * (1 + ARCADE.streak.goldPerTier * tier)));
  });

  it("удар, дошедший до HP, обрывает серию; щит руны и неуязвимость — нет", () => {
    const sim = field("streak-3");
    killN(sim, 30);
    const p = sim.player;
    p.shieldHp = 500; p.shieldUntil = sim.tick + sec(10);
    expect(priv(sim).damagePlayer(40)).toBe(0);
    expect(p.streak).toBe(30);
    p.shieldHp = 0; p.invulnUntil = sim.tick + 10;
    expect(priv(sim).damagePlayer(40)).toBe(0);
    expect(p.streak).toBe(30);
    p.invulnUntil = 0;
    expect(priv(sim).damagePlayer(40)).toBeGreaterThan(0);
    expect(p.streak).toBe(0);
    expect(p.bestStreak).toBe(30);
  });
});

describe("элита с аффиксами", () => {
  it("по расписанию приходит обычный враг пула ×hpMult с одним аффиксом; с ранга secondRank — с двумя", () => {
    const count = (mask: number) => [...Array(5)].reduce((n, _, i) => n + ((mask >> i) & 1), 0);
    for (const [rank, n] of [[0, 1], [ARCADE.affix.secondRank, 2]] as const) {
      const sim = field(`affix-spawn-${rank}`, { rank });
      priv(sim).nextAffixAt = sim.actTick + 1;
      for (let i = 0; i < 3; i++) sim.step(IDLE_INPUT);
      const elites = sim.enemies.filter((e) => e.alive && e.affix !== 0);
      expect(elites).toHaveLength(1);
      expect(count(elites[0].affix)).toBe(n);
      expect(elites[0].kind.elite).toBeFalsy();
      expect(priv(sim).nextAffixAt).toBeGreaterThan(sim.actTick + ARCADE.affix.every - 5);
    }
  });

  it("Быстрый бегает на 40% быстрее", () => {
    const sim = field("affix-haste");
    const e = dummy(sim, 400);
    e.affix = AFFIX.haste;
    const x0 = e.x;
    sim.step(IDLE_INPUT);
    expect(x0 - e.x).toBeCloseTo(e.kind.speed * ARCADE.affix.haste.speedMult * DT, 6);
  });

  it("Вампир лечится вчетверо от урона своего удара, Морозный замедляет героя", () => {
    const sim = field("affix-vamp");
    const e = dummy(sim, e0r(), 0, ENEMY_KINDS.ogre);
    e.affix = AFFIX.vampiric | AFFIX.frost;
    e.hp = e.maxHp / 2;
    const hp0 = sim.player.hp, ehp0 = e.hp;
    sim.step(IDLE_INPUT);
    const taken = hp0 - sim.player.hp;
    expect(taken).toBeGreaterThan(0);
    expect(e.hp - ehp0).toBeCloseTo(taken * ARCADE.affix.vampiric.healMult, 6);
    expect(sim.player.frostUntil).toBe(sim.tick + sec(ARCADE.affix.frost.seconds));
  });

  it("Взрывной: после смерти телеграф, через delay — урон внутри круга; вышел из круга — цел", () => {
    for (const inside of [true, false]) {
      const sim = field(`affix-volatile-${inside}`);
      const e = dummy(sim, 40);
      e.affix = AFFIX.volatile;
      priv(sim).killEnemy(e);
      expect(sim.blasts).toHaveLength(1);
      const b = sim.blasts[0];
      if (!inside) { sim.player.x = b.x + b.r + 60; }
      const hp = sim.player.hp;
      for (let i = 0; i < ARCADE.affix.volatile.delay + 1; i++) sim.step(IDLE_INPUT);
      expect(sim.blasts).toHaveLength(0);
      if (inside) expect(hp - sim.player.hp).toBeGreaterThan(e.dmg);
      else expect(sim.player.hp).toBe(hp);
    }
  });

  it("Раскол: после смерти двое того же вида по 30% HP без аффиксов; награда ×xpMult/×goldMult", () => {
    const sim = field("affix-split");
    const e = dummy(sim, 600, 0, ENEMY_KINDS.satyr);
    e.affix = AFFIX.splitter;
    e.maxHp *= ARCADE.affix.hpMult; e.hp = e.maxHp;
    const gold = sim.player.gold, maxHp = e.maxHp;
    priv(sim).killEnemy(e);
    // Награда — с самой элиты: объект умирающего врага не отдан пулу посреди killEnemy.
    expect(sim.player.gold - gold).toBe(Math.round(e.kind.gold * ARCADE.affix.goldMult + sim.player.stats.goldPerKill));
    expect(sim.shards.some((s) => s.alive && s.xp === e.kind.xp * ARCADE.affix.xpMult)).toBe(true);
    expect(sim.enemies.filter((o) => o.alive && o.kind.id === "satyr")).toHaveLength(0);
    sim.step(IDLE_INPUT); // дети встают в конце тика
    const kids = sim.enemies.filter((o) => o.alive && o.kind.id === "satyr");
    expect(kids).toHaveLength(ARCADE.affix.splitter.count);
    for (const k of kids) { expect(k.affix).toBe(0); expect(k.maxHp).toBeCloseTo(maxHp * ARCADE.affix.splitter.hpFrac, 6); }
  });
});

/** Дистанция контакта огра с героем (удар проходит на этом же тике). */
function e0r(): number {
  return ENEMY_KINDS.ogre.r + ARCADE.player.r;
}
