import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, SHOP_ACT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { rollGear } from "../src/game/arcade/content/gear.ts";
import { Rng } from "../src/game/rng.ts";

// Выкуп (ARCADE.buyback) и доделки баланса T15.5: мягкий старт Herald/Guardian, порча на оставленном предмете, лут
// поддержки, сила Зверинца от редкости, всплеск дальнобойных, BKB без дублей, рост чемпионов к минуте пробуждения.
type Priv = {
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  killEnemy(e: Enemy): void;
  damagePlayer(n: number): number;
  applyOffer(o: unknown): void;
  spawnBase(): number;
  rollShopOffers(): { id: string }[];
};
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const act = (a: number) => ({ ...IDLE_INPUT, act: a });

function field(seed: string, opts: ConstructorParameters<typeof ArcadeSim>[1] = {}): ArcadeSim {
  const sim = new ArcadeSim(seed, opts);
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}
/** Смертельный удар по герою и шаг, в конце которого сим решает судьбу героя. */
function kill(sim: ArcadeSim): void {
  sim.player.hp = 1;
  sim.player.invulnUntil = 0;
  priv(sim).damagePlayer(10_000);
  sim.step(IDLE_INPUT);
}

describe("выкуп", () => {
  it("смерть с золотом — окно, мир стоит; выкуп: цена, половина HP, неуязвимость; второй раз за забег — смерть", () => {
    const sim = field("bb-1");
    sim.player.gold = 5000;
    const price = sim.buybackPrice();
    // Большее из пола по минуте и доли золота на руках (как в Dota, где цена растёт с ценностью героя).
    expect(price).toBe(Math.max(Math.round(ARCADE.buyback.base + ARCADE.buyback.perMin * sim.minutes), Math.round(5000 * ARCADE.buyback.goldShare)));
    kill(sim);
    expect(sim.over).toBeNull();
    expect(sim.activeModal()).toBe("buyback");
    const tick = sim.tick;
    sim.step(IDLE_INPUT);
    expect(sim.tick).toBe(tick);
    sim.step(act(1));
    expect(sim.buybackOpen).toBe(false);
    expect(sim.player.gold).toBe(5000 - price);
    expect(sim.player.hp).toBeCloseTo(sim.player.stats.maxHp * ARCADE.buyback.hpFrac, 6);
    expect(sim.player.invulnUntil).toBe(sim.tick + sec(ARCADE.buyback.invulnSec));
    expect(sim.events.buybacks).toBe(1);
    // Лимит за забег исчерпан — второй смертельный удар без окна.
    expect(sim.buybackAvailable()).toBe(ARCADE.buyback.maxPerAct > 1);
    kill(sim);
    expect(sim.over?.outcome).toBe("dead");
    expect(sim.over?.buybacks).toBe(1);
    expect(sim.over?.revived).toBe(true);
  });

  it("не хватает золота — окна нет, сразу смерть; «Сдаться» — смерть; Aegis срабатывает раньше выкупа", () => {
    const poor = field("bb-2");
    poor.player.gold = 0;
    kill(poor);
    expect(poor.over?.outcome).toBe("dead");
    const quitter = field("bb-4");
    quitter.player.gold = 5000;
    kill(quitter);
    quitter.step(act(SHOP_ACT.close));
    expect(quitter.over?.outcome).toBe("dead");
    expect(quitter.over?.buybacks).toBe(0);
    const rich = field("bb-3");
    rich.player.gold = 5000; rich.player.aegis = true;
    kill(rich);
    expect(rich.buybackOpen).toBe(false);
    expect(rich.player.aegis).toBe(false);
    expect(rich.over).toBeNull();
  });
});

describe("доделки баланса T15.5", () => {
  it("мягкий старт: на Herald база спавна растёт от from к base за минуту; с Crusader — сразу base", () => {
    const G = ARCADE.spawn.gentleStart;
    const herald = field("gentle-1");
    expect(priv(herald).spawnBase()).toBeCloseTo(G.from, 6);
    herald.tick = sec(G.sec / 2);
    expect(priv(herald).spawnBase()).toBeCloseTo((G.from + ARCADE.spawn.base) / 2, 6);
    herald.tick = sec(G.sec);
    expect(priv(herald).spawnBase()).toBe(ARCADE.spawn.base);
    expect(priv(field("gentle-2", { rank: 10 })).spawnBase()).toBe(ARCADE.spawn.base);
  });

  it("проклятый предмет на земле не взять, пока на герое другая порча", () => {
    const sim = field("curse-block");
    const item = rollGear(new Rng("curse-block"), 1, "exotic", "u-1");
    sim.groundLoot.push({ x: sim.player.x + 10, y: sim.player.y, item, until: sim.tick + sec(60), curse: "withering" });
    sim.player.curse = "debt"; sim.player.debtLeft = 100;
    sim.step(IDLE_INPUT);
    sim.step(act(61)); // PICKUP_ACT
    expect(sim.lootCursed).toBe(true);
    expect(sim.lootBlocked()).toBe(true);
    sim.step(act(1));
    sim.step(act(2));
    expect(sim.player.curse).toBe("debt");
    expect(sim.player.gear[item.slot]).not.toBe(item);
    expect(sim.player.bag).not.toContain(item);
  });

  it("шаман и знаменосец роняют предмет с шансом supportChance, а не всегда", () => {
    const sim = field("support-loot");
    let drops = 0;
    for (let i = 0; i < 200; i++) {
      const before = sim.groundLoot.length;
      priv(sim).killEnemy(priv(sim).spawnEnemy(i % 2 ? ENEMY_KINDS.shaman : ENEMY_KINDS.standard_bearer, sim.player.x + 900, sim.player.y));
      if (sim.groundLoot.length > before) drops++;
    }
    expect(drops).toBeGreaterThan(200 * ARCADE.loot.supportChance * 0.5);
    expect(drops).toBeLessThan(200 * ARCADE.loot.supportChance * 1.6);
  });

  it("Зверинец: урон волка растёт с редкостью карты (сила), а не только с рангом", () => {
    const bite = (rarity: string) => {
      const sim = field(`beast-${rarity}`);
      priv(sim).applyOffer({ kind: "upgrade", id: "beast_wolf", rarity });
      const wolf = sim.pets.find((p) => p.kind === "wolf")!;
      const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, wolf.x + 20, wolf.y);
      e.hp = e.maxHp = 1e6; e.stunUntil = 1e9;
      for (let i = 0; i < sec(3) && e.hp === 1e6; i++) sim.step(IDLE_INPUT);
      return 1e6 - e.hp;
    };
    expect(bite("exotic") / bite("standard")).toBeCloseTo(ARCADE.rarity.mult.exotic, 3);
  });

  it("дальнобойный с кливом бьёт всплеском соседей цели; без клива — только цель", () => {
    const splash = (cleave: number) => {
      const sim = field(`splash-${cleave}`, { hero: "sniper" });
      sim.player.autoAttack = true;
      sim.player.stats.cleave = cleave;
      const t = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + 200, sim.player.y);
      const n = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + 200, sim.player.y + 30);
      for (const e of [t, n]) { e.hp = e.maxHp = 1e6; e.stunUntil = 1e9; }
      for (let i = 0; i < sec(2) && t.hp === 1e6 && n.hp === 1e6; i++) sim.step(IDLE_INPUT);
      return { t: 1e6 - t.hp, n: 1e6 - n.hp };
    };
    const off = splash(0), on = splash(2);
    expect(off.t + off.n).toBeGreaterThan(0);
    expect(Math.min(off.t, off.n)).toBe(0); // снаряд без пробития — одна цель
    expect(Math.min(on.t, on.n)).toBeGreaterThan(0);
  });

  it("BKB не предлагается второй раз", () => {
    const sim = field("bkb-once");
    sim.player.items.push({ id: "black_king_bar", rarity: "standard" });
    for (let i = 0; i < 60; i++) expect(priv(sim).rollShopOffers().map((o) => o.id)).not.toContain("black_king_bar");
  });

  it("чемпион при первом пробуждении подтягивается к минуте (не дальше scaleCapMin)", () => {
    const sim = new ArcadeSim("champ-scale", { composition: "wilds" });
    const c = sim.centaur!, g = sim.grove!;
    expect(c?.alive).toBe(true);
    for (const e of sim.enemies) if (e !== c) e.alive = false;
    const hp0 = c.maxHp, dmg0 = c.dmg;
    sim.tick = sec(60 * 10);
    g.engaged = true;
    sim.player.x = g.x; sim.player.y = g.y;
    sim.step(IDLE_INPUT);
    const m = Math.min(10, ARCADE.champion.scaleCapMin);
    expect(c.maxHp).toBeCloseTo(hp0 * (1 + ARCADE.spawn.hpPerMin * m), 6);
    expect(c.dmg).toBeCloseTo(dmg0 * (1 + ARCADE.spawn.dmgPerMin * m), 6);
    // Второе пробуждение не множит ещё раз.
    g.engaged = false; sim.step(IDLE_INPUT); g.engaged = true; sim.step(IDLE_INPUT);
    expect(c.maxHp).toBeCloseTo(hp0 * (1 + ARCADE.spawn.hpPerMin * m), 6);
  });
});
