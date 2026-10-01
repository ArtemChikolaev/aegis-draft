import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES, type AbilityDef } from "../src/game/arcade/content/heroes.ts";
import { ARCADE_ITEM_BY_ID, itemEffectsAt, type ShopOffer } from "../src/game/arcade/content/items.ts";
import { rollGear, uniqueGear, GEAR_SALVAGE } from "../src/game/arcade/content/gear.ts";
import { scepterTalents } from "../src/game/arcade/content/talents.ts";
import { Rng } from "../src/game/rng.ts";
import { IDLE_INPUT, SHOP_ACT, type AbilityKey, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { settleAegis } from "../src/state/arcadeStore.ts";

// Баланс M23: Aghanim's Scepter в лавке, убывание повторной массовой заморозки, сгорающий Aegis of the Immortal и
// Butterfly, который больше не в разы хуже Desolator за золото.
type Priv = {
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  castAbility(key: AbilityKey, ab: AbilityDef): void;
  rollShopOffers(): ShopOffer[];
  shopIdx: number;
  damagePlayer(amount: number): number;
  finish(o: "dead" | "victory"): void;
};
const priv = (sim: ArcadeSim) => sim as unknown as Priv;

function field(seed: string, hero: string, gear = [] as ReturnType<typeof uniqueGear>[]): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10, hero, gear });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}

describe("Aghanim's Scepter в лавке", () => {
  it("в продаже с окна 6:00, поглощается без слота, отдаёт оба таланта ульта и второй раз не предлагается", () => {
    const sim = field("m23-scepter", "sniper");
    const seen = (idx: number) => { priv(sim).shopIdx = idx; let n = 0; for (let i = 0; i < 200; i++) if (priv(sim).rollShopOffers().some((o) => o.id === "aghanims_scepter")) n++; return n; };
    expect(seen(1)).toBe(0);
    expect(seen(2)).toBeGreaterThan(0);
    const p = sim.player;
    p.items = Array.from({ length: ARCADE.shop.slots }, () => ({ id: "magic_wand", rarity: "standard" as const }));
    p.gold = 1000;
    sim.shopOffers = [{ id: "aghanims_scepter", rarity: "standard", price: 160 }];
    sim.shopOpen = true;
    sim.step({ ...IDLE_INPUT, act: SHOP_ACT.buy1 });
    expect(p.aghanimScepter).toBe(true);
    expect(p.items.length).toBe(ARCADE.shop.slots); // слот не занят
    expect(p.gold).toBe(1000 - 160);
    expect(scepterTalents("sniper").every((id) => p.talents.includes(id))).toBe(true);
    expect(sim.hero.abilities.r.cooldown).toBeLessThan(HEROES.sniper.abilities.r.cooldown);
    expect(seen(3)).toBe(0); // уже есть — не предлагается
    expect(ARCADE_ITEM_BY_ID.aghanims_scepter.consumed).toBe(true);
  });
});

describe("массовая заморозка: убывание повторной", () => {
  it("вторая заморозка вскоре после конца первой вдвое короче; после паузы — снова полная", () => {
    const sim = field("m23-freeze", "meepo");
    sim.player.abilities.q = 4;
    const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + 80, sim.player.y);
    e.hp = e.maxHp = 1e6;
    const cast = () => { priv(sim).castAbility("q", sim.hero.abilities.q); return e.freezeUntil - sim.tick; };
    const full = cast();
    expect(full).toBeGreaterThan(sec(1));
    sim.tick = e.freezeUntil + sec(1); // заморозка кончилась, но окно убывания идёт
    expect(Math.abs(cast() - full * ARCADE.massFreeze.drMult)).toBeLessThanOrEqual(1); // ±1 тик округления `sec`
    sim.tick = e.freezeResistUntil + 1; // окно прошло
    expect(cast()).toBe(full);
  });
});

describe("Aegis of the Immortal: сгорает, копить нельзя", () => {
  it("воскрешение надетого Aegis отмечается в итоге забега", () => {
    const sim = field("m23-aegis", "juggernaut", [uniqueGear("aegis_of_the_immortal", "aegis-1", 3)]);
    expect(sim.player.aegis).toBe(true);
    sim.player.invulnUntil = 0;
    priv(sim).damagePlayer(1e7);
    sim.step(IDLE_INPUT); // смерть разбирает тик (`onLethal`)
    expect(sim.player.aegisUsed).toBe(true);
    priv(sim).finish("dead");
    expect(sim.over?.gearAegisUsed).toBe(true);
    const clean = field("m23-noaegis", "juggernaut");
    priv(clean).finish("dead");
    expect(clean.over?.gearAegisUsed).toBe(false);
  });

  it("стор: сгоревший уходит из инвентаря, лишний разбирается на осколки, надетый остаётся", () => {
    const a1 = uniqueGear("aegis_of_the_immortal", "aegis-1", 3), a2 = uniqueGear("aegis_of_the_immortal", "aegis-2", 3);
    const helm = rollGear(new Rng("m23-helm"), 2, "exotic", "m23-helm", "helm");
    const gear = { items: [a1, helm, a2], equipped: { amulet: a1.uid, helm: helm.uid } };
    const used = settleAegis(gear, [a1, helm], true);
    expect(used.consumed?.uid).toBe(a1.uid);
    expect(used.gear.items.map((i) => i.uid)).toEqual([helm.uid, a2.uid]); // новый с Рошана остаётся — он один
    expect(used.gear.equipped).toEqual({ helm: helm.uid });
    const kept = settleAegis(gear, [a1, helm], false);
    expect(kept.consumed).toBeNull();
    expect(kept.gear.items.map((i) => i.uid)).toEqual([a1.uid, helm.uid]); // лишний — в осколки
    expect(kept.salvaged).toBe(GEAR_SALVAGE.arcana);
  });
});

describe("Butterfly", () => {
  it("за золото не хуже чем вдвое Desolator (прежде — в 4–9 раз) на типичных статах середины забега", () => {
    // Урон удара в секунду ∝ урон × скорость атаки × (1 + шанс крита × (множитель − 1)).
    const dps = (dmg: number, as: number, crit: number) => dmg * as * (1 + crit * 0.8);
    const base = dps(45, 1.3, 0.1);
    const gain = (id: string) => {
      const e = itemEffectsAt(ARCADE_ITEM_BY_ID[id], "standard")[0].e;
      return (dps(45 + (e.damage ?? 0), 1.3 + (e.attackSpeed ?? 0), 0.1 + (e.crit ?? 0)) / base - 1) / ARCADE_ITEM_BY_ID[id].price;
    };
    expect(gain("butterfly") * 2).toBeGreaterThan(gain("desolator"));
  });
});
