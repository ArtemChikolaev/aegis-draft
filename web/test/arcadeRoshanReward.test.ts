import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { shardTalents } from "../src/game/arcade/content/talents.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";

// Награда Рошана на выбор (T20.2): Aegis, Cheese или Refresher Shard. Раньше оба Рошана роняли одинаковый Aegis, а второй
// дроп затирал точку первого, неподобранного.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; killEnemy(e: Enemy): void; damagePlayer(amount: number): number };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;

function field(seed: string, hero = "juggernaut"): ArcadeSim {
  const sim = new ArcadeSim(seed, { hero, rank: 10 });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}
const pick = (sim: ArcadeSim, act: number) => { sim.step(IDLE_INPUT); sim.step({ ...IDLE_INPUT, act }); };

describe("награда Рошана", () => {
  it("каждый убитый Рошан кладёт свой дроп: второй не затирает первый", () => {
    const sim = field("rosh-drops");
    const p = sim.player;
    for (const dx of [300, 600]) { const r = priv(sim).spawnEnemy(ENEMY_KINDS.roshan, p.x + dx, p.y); priv(sim).killEnemy(r); }
    expect(sim.roshanDrops.length).toBe(2);
  });

  it("Cheese: HP упало до четверти — полное восстановление, один раз; удар, убивший сразу, мимо него", () => {
    const sim = field("rosh-cheese");
    const p = sim.player;
    sim.roshanDrops.push({ x: p.x, y: p.y });
    pick(sim, 2);
    expect(p.cheese).toBe(true);
    expect(sim.roshanDrops.length).toBe(0);
    p.hp = p.stats.maxHp * 0.3;
    priv(sim).damagePlayer(p.stats.maxHp * 0.1 / (1 - 0.06 * p.stats.armor / (1 + 0.06 * p.stats.armor)));
    expect(p.hp).toBeCloseTo(p.stats.maxHp, 6);
    expect(p.cheese).toBe(false);
    expect(sim.events.cheeses).toBe(1);
    // Второй Cheese и смертельный удар: HP ≤ 0 — Cheese не спасает, решают Aegis и выкуп.
    p.cheese = true; p.hp = 5;
    priv(sim).damagePlayer(1e6);
    expect(p.cheese).toBe(true);
    expect(p.hp).toBeLessThanOrEqual(0);
  });

  it("Refresher Shard: ульт не уходит в перезарядку, Q/W/E сброшены — и только один раз", () => {
    const sim = field("rosh-shard", "zeus");
    const p = sim.player;
    sim.roshanDrops.push({ x: p.x, y: p.y });
    pick(sim, 3);
    expect(p.refresherShard).toBe(true);
    const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, p.x + 80, p.y);
    e.hp = e.maxHp = 1e6;
    p.abilities.r = 1; p.abilities.q = 1; p.cooldowns.q = 500; p.cooldowns.r = 0;
    sim.step({ ...IDLE_INPUT, cast: 8 }); // R
    expect(sim.events.refreshers).toBe(1);
    expect(p.refresherShard).toBe(false);
    expect(p.cooldowns.q).toBe(0);
    expect(p.cooldowns.r).toBeLessThanOrEqual(1);
    sim.step(IDLE_INPUT);
    sim.step({ ...IDLE_INPUT, cast: 8 }); // второй ульт сразу — теперь уходит в перезарядку
    expect(p.cooldowns.r).toBeGreaterThan(60);
    expect(sim.events.refreshers).toBe(1);
  });

  it("Aghanim's Shard (M23): запасные таланты Q/W/E сразу, один на забег", () => {
    const sim = field("rosh-aghanim");
    const p = sim.player;
    const ids = shardTalents("juggernaut");
    expect(ids.length).toBeGreaterThan(0);
    sim.roshanDrops.push({ x: p.x, y: p.y });
    pick(sim, 4);
    expect(p.aghanimShard).toBe(true);
    expect(ids.every((id) => p.talents.includes(id))).toBe(true);
    expect(sim.roshanOptions().aghanims_shard).toBe(false);
    expect(sim.hero.abilities.q.value[4]).toBeGreaterThan(HEROES.juggernaut.abilities.q.value[4]); // Blade Fury: урон
  });

  it("выбор без смысла закрыт: при пассивном ульте Shard недоступен, при всех наградах окно не открывается", () => {
    const passive = Object.values(HEROES).find((h) => h.abilities.r.passive)!;
    const sim = field("rosh-passive", passive.id);
    expect(sim.roshanOptions().refresher_shard).toBe(false);
    const full = field("rosh-full");
    const p = full.player;
    p.aegis = true; p.cheese = true; p.refresherShard = true; p.aghanimShard = true;
    full.roshanDrops.push({ x: p.x, y: p.y });
    full.step(IDLE_INPUT);
    expect(full.roshanOpen).toBe(false);
    expect(full.roshanDrops.length).toBe(1); // лежит, пока не понадобится
    expect(ARCADE.roshanReward.cheeseAt).toBeGreaterThan(0);
  });
});
