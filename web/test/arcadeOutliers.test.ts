import { beforeEach, describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES, type AbilityDef } from "../src/game/arcade/content/heroes.ts";
import { rollGear, uniqueGear, type GearItem, type GearSlot } from "../src/game/arcade/content/gear.ts";
import { Rng } from "../src/game/rng.ts";
import { IDLE_INPUT, type AbilityKey, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { dropWornRapier, emptyProgress, getArcadeSim, useArcade } from "../src/state/arcadeStore.ts";
import "./arcadeSimRegistry.ts";

// Выбросы баланса (T22.1): потолок уклонения у ускорений, разряды edict «в секунду» по каждой цели, потолок перезарядки
// с постоянной экипировки и риск Divine Rapier (теряется при смерти или брошенном забеге).
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; castAbility(key: AbilityKey, ab: AbilityDef): void };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;

function field(seed: string, hero: string, gear: GearItem[] = []): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10, hero, gear });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}
const dummy = (sim: ArcadeSim, dx: number, dy = 0) => { const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + dx, sim.player.y + dy); e.hp = e.maxHp = 1e6; e.stunUntil = 1e9; return e; };
const idle = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); } };
const gearWith = (slot: GearSlot, uid: string, cooldown: number): GearItem => ({ ...rollGear(new Rng(uid), 3, "arcana", uid, slot), affixes: [{ stat: "cooldown", value: cooldown }] });

describe("уклонение: потолок у ускорений", () => {
  it("ни одно ускорение не обещает больше потолка, а каст режет лишнее", () => {
    for (const h of Object.values(HEROES)) for (const ab of Object.values(h.abilities)) {
      if (ab.kind === "haste") expect(Math.max(...ab.value), h.id).toBeLessThanOrEqual(ARCADE.player.evasionCap);
    }
    const sim = field("evade-cap", "mirana");
    sim.player.abilities.r = 1;
    priv(sim).castAbility("r", { kind: "haste", value: [0, 0.9], cooldown: 60, duration: 8 }); // как было бы с талантом ульта
    expect(sim.player.evadeChance).toBe(ARCADE.player.evasionCap);
  });
});

describe("edict: урон в секунду по каждой цели", () => {
  it("одну цель разряд бьёт не чаще раза в секунду — по Рошану больше нет 7.5 ударов в секунду", () => {
    const sim = field("edict-one", "razor");
    sim.player.abilities.r = 3;
    const e = dummy(sim, 120);
    priv(sim).castAbility("r", HEROES.razor.abilities.r);
    idle(sim, 8); // первый разряд
    const hit = 1e6 - e.hp;
    expect(hit).toBeGreaterThan(0);
    idle(sim, sec(3) - 8);
    expect((1e6 - e.hp) / hit).toBeCloseTo(3, 5); // три удара за три секунды, а не 22
  });

  it("в толпе поток разрядов прежний: 7.5 в секунду, каждого врага — не чаще раза в секунду", () => {
    const sim = field("edict-crowd", "razor");
    sim.player.abilities.r = 3;
    const crowd = Array.from({ length: 12 }, (_, i) => dummy(sim, 110 * Math.cos(i / 2), 110 * Math.sin(i / 2)));
    priv(sim).castAbility("r", HEROES.razor.abilities.r);
    idle(sim, sec(3));
    const per = HEROES.razor.abilities.r.value[3];
    const hits = crowd.map((e) => Math.round((1e6 - e.hp) / per));
    expect(hits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(20); // ≈ 3 с × 7.5
    expect(Math.max(...hits)).toBeLessThanOrEqual(3);
  });
});

describe("перезарядка: потолок постоянной экипировки", () => {
  it("четыре слота с аффиксом дают не больше своего потолка; одна вещь — сколько написано", () => {
    const four = field("cd-four", "juggernaut", [gearWith("helm", "cd-h", 0.2), gearWith("armor", "cd-a", 0.2), gearWith("amulet", "cd-m", 0.2), gearWith("ring", "cd-r", 0.2)]);
    expect(four.player.stats.cooldown).toBeCloseTo(ARCADE.player.gearCooldownCap, 9);
    const one = field("cd-one", "juggernaut", [gearWith("helm", "cd-h1", 0.1)]);
    expect(one.player.stats.cooldown).toBeCloseTo(0.1, 9);
  });
});

describe("Divine Rapier: риск", () => {
  const rapier = () => uniqueGear("divine_rapier", "rapier-1", 3);
  const helm = () => rollGear(new Rng("rapier-helm"), 2, "exotic", "rapier-helm", "helm");

  it("надетая пропадает; в сумке и без Рапиры — ничего не меняется", () => {
    const r = rapier(), h = helm();
    const gear = { items: [r, h], equipped: { weapon: r.uid, helm: h.uid } };
    const out = dropWornRapier(gear, [r, h]);
    expect(out.lost?.uid).toBe(r.uid);
    expect(out.gear.items.map((i) => i.uid)).toEqual([h.uid]);
    expect(out.gear.equipped).toEqual({ helm: h.uid });
    expect(dropWornRapier(gear, [h])).toEqual({ gear, lost: null }); // лежит в инвентаре, не на герое
  });

  describe("завершение забега", () => {
    beforeEach(() => {
      const r = rapier();
      useArcade.setState({ status: "setup", hero: "juggernaut", act: "short", rank: 0, trait: null, progress: emptyProgress(), gear: { items: [r], equipped: { weapon: r.uid } }, replayLog: null, lostRapier: null });
    });
    const finishAs = (outcome: "dead" | "victory") => {
      useArcade.getState().start(`rapier-${outcome}`);
      (getArcadeSim()! as unknown as { finish(o: "dead" | "victory"): void }).finish(outcome);
      useArcade.getState().finish();
    };

    it("смерть отнимает Рапиру и пишет об этом на экране итога; победа — нет", () => {
      finishAs("dead");
      expect(useArcade.getState().gear.items).toEqual([]);
      expect(useArcade.getState().gear.equipped.weapon).toBeUndefined();
      expect(useArcade.getState().lostRapier?.unique).toBe("divine_rapier");
      useArcade.setState({ gear: { items: [rapier()], equipped: { weapon: "rapier-1" } } });
      finishAs("victory");
      expect(useArcade.getState().gear.equipped.weapon).toBe("rapier-1");
      expect(useArcade.getState().lostRapier).toBeNull();
    });

    it("брошенный посреди боя забег — как смерть: выход не спасает Рапиру", () => {
      useArcade.getState().start("rapier-quit");
      useArcade.getState().quit();
      expect(useArcade.getState().gear.items).toEqual([]);
      expect(useArcade.getState().gear.equipped.weapon).toBeUndefined();
    });
  });
});
