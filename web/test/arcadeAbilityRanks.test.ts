import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES, UTILITY_RANK, abilityRankFigures, abilityRankScale } from "../src/game/arcade/content/heroes.ts";

// Мёртвые ранги (T15.5): у 34 умений `value` не рос с рангом (20× armor_buff всегда +25 брони, рывки и чистый контроль
// с нулём) — карточка уровня предлагала ранги 2–4, которые ничего не меняли. Теперь броня растёт значением, а у умений без
// числа ранг сокращает перезарядку и продлевает действие (abilityRankScale).
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; damagePlayer(n: number): void };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const CAST = { q: 1, w: 2, e: 4, r: 8 } as const;

function ready(hero: string, key: "q" | "w" | "e" | "r", lvl: number): ArcadeSim {
  const sim = new ArcadeSim(`ranks-${hero}-${key}-${lvl}`, { hero });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  sim.player.abilities[key] = lvl;
  sim.player.cooldowns[key] = 0;
  const e = priv(sim).spawnEnemy(ENEMY_KINDS.kobold, sim.player.x + 120, sim.player.y);
  e.hp = e.maxHp = 1e6;
  return sim;
}

describe("каждый ранг умения что-то меняет", () => {
  it("по всем героям: на каждом следующем ранге растёт значение, число целей или перезарядка/длительность", () => {
    const dead: string[] = [];
    for (const h of Object.values(HEROES)) {
      for (const key of ["q", "w", "e", "r"] as const) {
        const ab = h.abilities[key];
        if (ab.passive) continue;
        for (let lvl = 2; lvl < ab.value.length; lvl++) {
          const a = abilityRankScale(ab, lvl - 1), b = abilityRankScale(ab, lvl);
          const grows = ab.value[lvl] !== ab.value[lvl - 1] || (ab.count?.[lvl] ?? 0) !== (ab.count?.[lvl - 1] ?? 0) || a.cd !== b.cd || a.dur !== b.dur;
          if (!grows) dead.push(`${h.id}.${key}@${lvl}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it("броня armor_buff — значение умения по рангу, и урон по герою режется сильнее", () => {
    const taken = (lvl: number) => {
      const sim = ready("sven", "e", lvl);
      sim.step({ ...IDLE_INPUT, cast: CAST.e });
      expect(sim.player.armorBuffAmt).toBe(HEROES.sven.abilities.e.value[lvl]);
      const hp = sim.player.hp = sim.player.stats.maxHp;
      sim.player.invulnUntil = 0;
      priv(sim).damagePlayer(200);
      return hp - sim.player.hp;
    };
    expect(taken(4)).toBeLessThan(taken(1));
  });

  it("Blink Anti-Mage: ранг 4 — перезарядка на 30% короче ранга 1", () => {
    const cd = (lvl: number) => {
      const sim = ready("anti_mage", "w", lvl);
      sim.step({ ...IDLE_INPUT, cast: CAST.w });
      return { cd: sim.player.cooldowns.w, stat: sim.player.stats.cooldown };
    };
    const one = cd(1), four = cd(4);
    const base = HEROES.anti_mage.abilities.w.cooldown;
    expect(one.cd).toBe(sec(base * (1 - one.stat)));
    expect(four.cd).toBe(sec(base * (1 - 3 * UTILITY_RANK.cdStep) * (1 - four.stat)));
  });

  it("Chronosphere: ранг 3 держит врагов дольше ранга 1", () => {
    const frozen = (lvl: number) => {
      const sim = ready("faceless_void", "r", lvl);
      const e = sim.enemies.find((x) => x.alive)!;
      sim.step({ ...IDLE_INPUT, cast: CAST.r });
      return e.freezeUntil - sim.tick;
    };
    const dur = HEROES.faceless_void.abilities.r.duration!;
    expect(frozen(1)).toBe(sec(dur));
    expect(frozen(3)).toBe(sec(dur * (1 + 2 * UTILITY_RANK.durStep)));
  });

  it("карточка уровня показывает, что даст ранг: броня, перезарядка, длительность", () => {
    expect(abilityRankFigures(HEROES.sven.abilities.e, 2).find((f) => f.key === "abArmor")?.value).toBe(26);
    expect(abilityRankFigures(HEROES.anti_mage.abilities.w, 2)[0]).toEqual({ key: "abCooldown", value: HEROES.anti_mage.abilities.w.cooldown * 0.9, unit: "s" });
    expect(abilityRankFigures(HEROES.faceless_void.abilities.r, 3).map((f) => f.key)).toEqual(["abCooldown", "abDuration"]);
    expect(abilityRankFigures(HEROES.juggernaut.abilities.q, 2)).toEqual([]); // растёт уроном — цифры не нужны
  });
});

describe("Io", () => {
  it("первое очко — в Spirits, а не в Tether без своего юнита", () => {
    const sim = new ArcadeSim("io-start", { hero: "io" });
    expect(sim.player.abilities).toEqual({ q: 0, w: 1, e: 0, r: 0 });
    expect(new ArcadeSim("jugg-start").player.abilities.q).toBe(1);
  });
});
