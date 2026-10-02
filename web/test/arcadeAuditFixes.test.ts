import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { BLINK_MASK, IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { AFFIX, ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { rollGear } from "../src/game/arcade/content/gear.ts";
import { Rng } from "../src/game/rng.ts";

// Исправления по аудиту 2026-09-27 в механиках M16–M18: яд «шлейфа», подтяжка чемпионов, отмывание проклятого предмета,
// прицел засады после Blink, аффиксы дальнобойной элиты, Рёв от силы, контрольная сумма нового состояния.
type Priv = {
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  applyOffer(o: unknown): void;
  spawnAffixed(pool: readonly EnemyKind[]): void;
  petPower(): number;
  prevPx: number;
};
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const take = (sim: ArcadeSim, id: string, rarity = "standard") => priv(sim).applyOffer({ kind: "upgrade", id, rarity });

function field(seed: string, opts: ConstructorParameters<typeof ArcadeSim>[1] = {}): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10, ...opts });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}

describe("исправления по аудиту 2026-09-27", () => {
  it("«Ядовитый шлейф» кладёт dps без Вирулентности — она умножает на тике, как у остальных источников", () => {
    const sim = field("fix-slip");
    take(sim, "ven_virulence"); take(sim, "ven_virulence"); take(sim, "ven_slip");
    const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x - 30, sim.player.y);
    e.hp = e.maxHp = 1e6;
    sim.step({ ...IDLE_INPUT, mx: 16, cast: BLINK_MASK });
    expect(e.poisonDps).toBeCloseTo(4 * sim.upgradePower("ven_slip"), 6);
  });

  it("чемпион подтягивается при каждом новом пробуждении: проход мимо на 1-й минуте не фиксирует силу навсегда", () => {
    const sim = new ArcadeSim("fix-champ", { composition: "wilds" });
    const c = sim.centaur!, g = sim.grove!;
    for (const e of sim.enemies) if (e !== c) e.alive = false;
    const hp0 = c.maxHp;
    // Окна (контракт, карточки) держат мир — закрываем их, иначе шаг не двигает тик.
    const step = () => { const m = sim.activeModal(); sim.step(m === "pending" ? { ...IDLE_INPUT, choose: 0 } : m ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); };
    const settle = () => { for (let i = 0; i < 5 && sim.activeModal(); i++) step(); step(); };
    const wake = (min: number) => { sim.tick = sec(60 * min); g.engaged = true; sim.player.x = g.x; sim.player.y = g.y; settle(); g.engaged = false; sim.player.x = g.x + 2000; settle(); };
    wake(1);
    expect(c.maxHp).toBeCloseTo(hp0 * (1 + ARCADE.spawn.hpPerMin * 1), 0); // пробуждение — тиком позже ровной минуты
    wake(5);
    expect(c.maxHp).toBeCloseTo(hp0 * (1 + ARCADE.spawn.hpPerMin * 5), 0); // пробуждение — тиком позже ровной минуты
    wake(12); // выше потолка scaleCapMin — не дальше него
    expect(c.maxHp).toBeCloseTo(hp0 * (1 + ARCADE.spawn.hpPerMin * ARCADE.champion.scaleCapMin), 0); // пробуждение — тиком позже ровной минуты
  });

  it("проклятый предмет не отмывается кнопкой «в сумку» при полной сумке; с использованным прудом — не взять", () => {
    const sim = field("fix-launder");
    const item = rollGear(new Rng("fix-launder"), 1, "exotic", "u-cursed");
    for (let i = 0; i < ARCADE.loot.bagCap; i++) sim.player.bag.push(rollGear(new Rng(`bag-${i}`), 1, "standard", `b-${i}`));
    sim.groundLoot.push({ x: sim.player.x + 10, y: sim.player.y, item, until: sim.tick + sec(60), curse: "withering" });
    sim.step(IDLE_INPUT);
    sim.step({ ...IDLE_INPUT, act: 61 });
    expect(sim.lootCursed).toBe(true);
    sim.step({ ...IDLE_INPUT, act: 2 }); // сумка полна — окно остаётся, порча на месте
    expect(sim.lootOpen).toBe(item);
    expect(sim.lootCursed).toBe(true);
    sim.step({ ...IDLE_INPUT, act: 1 });
    expect(sim.player.curse).toBe("withering");
    // Пруд использован: проклятое с земли не взять — снять порчу будет нечем.
    const used = field("fix-pond");
    used.pond!.used = true;
    used.groundLoot.push({ x: used.player.x + 10, y: used.player.y, item: rollGear(new Rng("p"), 1, "exotic", "u-2"), until: used.tick + sec(60), curse: "debt" });
    used.step(IDLE_INPUT);
    used.step({ ...IDLE_INPUT, act: 61 });
    expect(used.lootBlockReason()).toBe("pond");
    used.step({ ...IDLE_INPUT, act: 1 });
    expect(used.player.curse).toBeNull();
  });

  it("Blink не сбивает упреждение засады: скорость героя после рывка — шаг бега, а не длина рывка", () => {
    const sim = field("fix-aim");
    sim.step({ ...IDLE_INPUT, mx: 16, cast: BLINK_MASK });
    expect(sim.player.x - priv(sim).prevPx).toBeCloseTo(sim.player.stats.speed / 60, 6);
  });

  it("дальнобойная элита не получает «Вампира» и «Морозного» — оба срабатывают только на контактном ударе", () => {
    const sim = field("fix-ranged", { act: "dire", rank: 25 });
    for (let i = 0; i < 40; i++) priv(sim).spawnAffixed([ENEMY_KINDS.dark_troll]);
    const masks = sim.enemies.filter((e) => e.alive && e.affix !== 0).map((e) => e.affix);
    expect(masks.length).toBe(40);
    for (const m of masks) expect(m & (AFFIX.vampiric | AFFIX.frost)).toBe(0);
  });

  it("Рёв зверей растёт с редкостью карты (сила), как урон волка", () => {
    const sim = field("fix-roar");
    take(sim, "beast_wolf"); take(sim, "beast_roar", "exotic");
    expect(priv(sim).petPower()).toBeCloseTo(1 + 0.35 * ARCADE.rarity.mult.exotic, 6);
  });

  it("контрольная сумма видит новое состояние: заряды Blink, серию, выкуп, аффиксы", () => {
    const a = field("fix-digest"), b = field("fix-digest");
    expect(a.digest()).toBe(b.digest());
    b.player.streak = 12;
    expect(a.digest()).not.toBe(b.digest());
    b.player.streak = 0; b.player.blinkCharges = 0;
    expect(a.digest()).not.toBe(b.digest());
  });
});

describe("мелочи сима по аудиту 2026-09-27 (M24)", () => {
  it("взрыв горящих (rad_blast) идёт очередью: цепочка смертей не углубляет стек и выкашивается целиком", () => {
    const sim = field("fix-blast");
    sim.player.upgrades.rad_blast = { rank: 1, power: 1, cap: 1 };
    type Internals = { killEnemy(e: Enemy): void };
    const a = sim as unknown as Internals;
    // 60 горящих кобольдов сеткой с шагом 50 px: взрыв (60 px, 25 урона) убивает соседей, те взрываются дальше.
    const N = 60, chain: Enemy[] = [];
    for (let i = 0; i < N; i++) {
      const e = priv(sim).spawnEnemy(ENEMY_KINDS.kobold, sim.player.x + 300 + (i % 12) * 50, sim.player.y + 300 + Math.floor(i / 12) * 50);
      e.hp = e.maxHp = 5; e.burnUntil = sim.tick + sec(10);
      chain.push(e);
    }
    const orig = a.killEnemy.bind(sim);
    let depth = 0, maxDepth = 0, deaths = 0;
    a.killEnemy = (e: Enemy) => { depth++; deaths++; maxDepth = Math.max(maxDepth, depth); try { orig(e); } finally { depth--; } };
    sim.damageEnemy(chain[0], 100, "burst");
    expect(chain.every((e) => !e.alive)).toBe(true);
    expect(deaths).toBe(N);
    expect(maxDepth).toBeLessThanOrEqual(2); // было: глубина = длина цепочки (killEnemy → damageEnemy → killEnemy)
    expect(sim.fx.filter((f) => f.kind === "burst" && f.x2 === 60)).toHaveLength(N);
  });

  it("питомец держит цель, пока она жива и в радиусе поиска, — новый враг ближе не перебивает её", () => {
    const sim = field("fix-pet-target");
    take(sim, "beast_wolf");
    sim.step(IDLE_INPUT);
    const wolf = sim.pets.find((p) => p.kind === "wolf")!;
    expect(wolf).toBeTruthy();
    const first = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, wolf.x + 150, wolf.y);
    first.hp = first.maxHp = 1e6;
    sim.step(IDLE_INPUT);
    expect(wolf.target).toBe(first);
    const near = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, wolf.x + 14, wolf.y);
    near.hp = near.maxHp = 1e6;
    for (let i = 0; i < 30; i++) sim.step(IDLE_INPUT);
    expect(wolf.target).toBe(first);
    expect(wolf.targetId).toBe(first.id);
    first.alive = false;
    sim.step(IDLE_INPUT);
    expect(wolf.target).toBe(near);
  });
});
