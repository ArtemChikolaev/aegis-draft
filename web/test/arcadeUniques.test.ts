import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { uniqueGear, type GearItem } from "../src/game/arcade/content/gear.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";

// Свойства уникальных предметов боссов (M25), как в Dota: Manta — иллюзии, Giant's Ring — урон вокруг, Tormentor's Shard —
// отражение, Сердце Древнего — восстановление вне боя. Без надетого предмета свойства нет.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; dealtBySource: Record<string, number> };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const U = ARCADE.uniques;

function field(seed: string, gear: GearItem[] = []): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10, hero: "juggernaut", gear });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}
const wear = (id: NonNullable<GearItem["unique"]>) => [uniqueGear(id, 1, 3)];
const dummy = (sim: ArcadeSim, dx: number): Enemy => {
  const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + dx, sim.player.y);
  e.hp = e.maxHp = 1e6; e.speed = 0;
  return e;
};
const run = (sim: ArcadeSim, ticks: number) => { for (let i = 0; i < ticks; i++) sim.step(IDLE_INPUT); };
/** Долгий прогон: стоящий герой на ранге 10 иначе гибнет от спавна, и сим замирает. */
const runAlive = (sim: ArcadeSim, ticks: number) => { for (let i = 0; i < ticks; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); } };

describe("свойства уникальных предметов", () => {
  it("Manta of Illusions: рядом с врагом — пара иллюзий раз в 14 с; без врага не тратится", () => {
    const sim = field("u-manta", wear("manta_of_illusions"));
    runAlive(sim, 30);
    expect(sim.pets.filter((p) => p.kind === "illusion")).toHaveLength(0); // врагов нет — иллюзий нет
    dummy(sim, 120);
    runAlive(sim, 2);
    expect(sim.pets.filter((p) => p.kind === "illusion")).toHaveLength(U.manta.count);
    runAlive(sim, U.manta.seconds * 60 + 5);
    expect(sim.pets.filter((p) => p.kind === "illusion")).toHaveLength(0); // ушли по таймеру
    runAlive(sim, U.manta.every - (U.manta.seconds * 60 + 5) - 4);
    expect(sim.pets.filter((p) => p.kind === "illusion")).toHaveLength(0); // перезарядка ещё идёт
    runAlive(sim, 6);
    expect(sim.pets.filter((p) => p.kind === "illusion")).toHaveLength(U.manta.count);
    expect(field("u-manta-none").pets).toHaveLength(0);
  });

  it("Giant's Ring: враги вокруг теряют base + доля макс. HP раз в 0.5 с — урон «экипировки»", () => {
    const sim = field("u-giant", wear("giants_ring"));
    const near = dummy(sim, 100), far = dummy(sim, U.giantsRing.radius + 120);
    run(sim, 60);
    const perPulse = U.giantsRing.base + U.giantsRing.hpFrac * sim.player.stats.maxHp;
    expect(1e6 - near.hp).toBeCloseTo(perPulse * 2, 0);
    expect(far.hp).toBe(1e6);
    expect(priv(sim).dealtBySource.gear).toBeGreaterThan(0);
    const bare = field("u-giant-none"), e = dummy(bare, 100);
    run(bare, 60);
    expect(e.hp).toBe(1e6);
  });

  it("Tormentor's Shard: четверть снятого с HP урона — всем врагам рядом, не чаще раза в 0.25 с", () => {
    const sim = field("u-torm", wear("tormentors_shard"));
    const e = dummy(sim, 90);
    const hp0 = sim.player.hp;
    sim.damagePlayer(80);
    const taken = hp0 - sim.player.hp;
    expect(taken).toBeGreaterThan(0);
    expect(1e6 - e.hp).toBeCloseTo(taken * U.tormentor.frac, 6);
    sim.damagePlayer(80); // тот же тик — без второго отражения
    expect(1e6 - e.hp).toBeCloseTo(taken * U.tormentor.frac, 6);
  });

  it("Сердце Древнего: после 4 с без урона — 4% макс. HP в секунду поверх регена; удар сбрасывает отдых", () => {
    const sim = field("u-heart", wear("heart_of_the_ancient"));
    const max = sim.player.stats.maxHp, regen = sim.player.stats.regen, idle = sec(U.heart.idleSec);
    sim.player.hp = max * 0.3;
    sim.damagePlayer(1); // удар запускает отсчёт отдыха
    const hp0 = sim.player.hp;
    run(sim, idle - 6);
    // До отдыха — только реген (10 импульсов по 0.1 в секунду).
    expect(sim.player.hp - hp0).toBeCloseTo(regen * Math.floor((idle - 6) / 6) * 0.1, 6);
    run(sim, 6);
    const hp1 = sim.player.hp;
    run(sim, 60);
    // Секунда отдыха — реген + 4% макс. HP.
    expect((sim.player.hp - hp1 - regen) / max).toBeCloseTo(U.heart.hpFrac, 3);
    // Новый удар — снова только реген.
    sim.damagePlayer(1);
    const hp2 = sim.player.hp;
    run(sim, 60);
    expect(sim.player.hp - hp2).toBeCloseTo(regen, 6);
  });
});

describe("Time Walk: откат урона (M25)", () => {
  it("рывок возвращает HP, снятые за последние 2 с, и только их; откаченное второй раз не вернуть", () => {
    const sim = new ArcadeSim("tw-back", { rank: 10, hero: "faceless_void" });
    sim.obstacles.remove(() => true);
    for (const e of sim.enemies) e.alive = false;
    sim.player.autoAttack = false;
    sim.player.autoCast = { q: false, w: false, e: false, r: false };
    sim.player.abilities.q = 1;
    expect(sim.hero.abilities.q.backtrack).toBe(ARCADE.backtrackWindow);
    const target = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + 200, sim.player.y);
    target.hp = target.maxHp = 1e6;
    sim.player.stats.regen = 0;
    sim.damagePlayer(100); // старый удар — выпадет из окна
    run(sim, sec(ARCADE.backtrackWindow) + 10);
    const hp0 = sim.player.hp;
    sim.damagePlayer(60); sim.damagePlayer(40); // свежие удары в окне
    const lost = hp0 - sim.player.hp;
    const cast = (s: ArcadeSim) => (s as unknown as { castAbility(k: string, ab: unknown): void }).castAbility("q", s.hero.abilities.q);
    cast(sim);
    expect(sim.player.hp).toBeCloseTo(hp0, 6); // вернулись ровно свежие удары
    sim.player.cooldowns.q = 0;
    const hp1 = sim.player.hp;
    cast(sim);
    expect(sim.player.hp).toBeCloseTo(hp1, 6); // окно пустое — второй откат ничего не даёт
    expect(lost).toBeGreaterThan(0);
  });
});
