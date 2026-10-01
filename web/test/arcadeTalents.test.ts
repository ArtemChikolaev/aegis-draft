import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES, HERO_IDS, type AbilityDef } from "../src/game/arcade/content/heroes.ts";
import { GENERIC_TALENTS, TALENT_LEVELS, heroTalents, kitTalent, talentLabel } from "../src/game/arcade/content/talents.ts";
import { IDLE_INPUT, type AbilityKey, type Enemy, type EnemyKind, type Offer } from "../src/game/arcade/types.ts";

// Таланты героя (T22.2): на 10/15/20/25 — пара по киту героя («Blade Fury: 4 → 5 с») вместо восьми общих на всех.
// Талант правит копию героя в симе: числа умения меняются у этого забега и только у него.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; castAbility(key: AbilityKey, ab: AbilityDef): void; applyOffer(o: Offer): void; rollOffers(): Offer[] };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const take = (sim: ArcadeSim, id: string) => priv(sim).applyOffer({ kind: "talent", id });

function field(seed: string, hero: string): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10, hero });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}

describe("таланты по киту героя", () => {
  it("у каждого героя на каждом уровне два разных таланта, и почти все — по его киту", () => {
    let kit = 0, all = 0;
    for (const h of HERO_IDS) {
      for (const lvl of TALENT_LEVELS) {
        const [a, b] = heroTalents(h)[lvl];
        expect(a, `${h}@${lvl}`).not.toBe(b);
        for (const id of [a, b]) {
          all++;
          const kt = kitTalent(id);
          if (!kt) { expect(GENERIC_TALENTS, id).toContain(id); continue; }
          kit++;
          const ab = HEROES[h].abilities[kt.key];
          // Поле, которое талант усиливает, у умения есть: иначе талант был бы пустым, как прежний t25_ult у 28 героев.
          if (kt.mod === "value") expect(ab.value.some((v) => v > 0), `${h}.${id}`).toBe(true);
          if (kt.mod === "duration") expect(ab.duration, `${h}.${id}`).toBeGreaterThan(0);
          if (kt.mod === "radius") expect(ab.radius, `${h}.${id}`).toBeGreaterThan(0);
          if (kt.mod === "count") expect(ab.count?.some((c) => c > 0), `${h}.${id}`).toBe(true);
        }
      }
      // Ульт — всегда свой: на 25-м хотя бы один талант по R.
      expect(heroTalents(h)[25].some((id) => kitTalent(id)?.key === "r"), h).toBe(true);
    }
    expect(kit / all).toBeGreaterThan(0.85);
  });

  it("Juggernaut: «Blade Fury: 4 → 6 с» на 10-м — подпись и сим совпадают, общий HEROES не тронут", () => {
    const to = 4 * (1 + ARCADE.talents.duration);
    expect(heroTalents("juggernaut")[10][0]).toBe("q_duration");
    expect(talentLabel("juggernaut", "q_duration")).toEqual({ key: "arcade.talent.duration", vars: { from: 4, to }, ability: "q" });
    const sim = field("tal-jugg", "juggernaut");
    sim.player.abilities.q = 1;
    take(sim, "q_duration");
    expect(sim.player.talents).toEqual(["q_duration"]);
    priv(sim).castAbility("q", sim.hero.abilities.q);
    expect(sim.player.spinUntil - sim.tick).toBe(Math.round(to * 60));
    expect(HEROES.juggernaut.abilities.q.duration).toBe(4);
    const fresh = field("tal-jugg-fresh", "juggernaut");
    expect(fresh.hero.abilities.q.duration).toBe(4); // следующий забег — без таланта
    take(sim, "q_duration"); // повторный выбор не удваивает
    expect(sim.hero.abilities.q.duration).toBe(to);
  });

  it("урон умения растёт на долю таланта, у ульта — сильнее", () => {
    const T = ARCADE.talents;
    const hit = (talent: string | null): number => {
      const sim = field("tal-lina", "lina");
      sim.player.abilities.q = 4;
      if (talent) take(sim, talent);
      const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + 60, sim.player.y);
      e.hp = e.maxHp = 1e6;
      priv(sim).castAbility("q", sim.hero.abilities.q);
      return 1e6 - e.hp;
    };
    const kt = kitTalent(heroTalents("lina")[10][0])!;
    expect(kt).toEqual({ id: "q_value", key: "q", mod: "value" });
    expect(hit("q_value") / hit(null)).toBeCloseTo(1 + T.value, 6);
    const sim = field("tal-lina-r", "lina");
    const cd0 = sim.hero.abilities.r.cooldown;
    take(sim, "r_value");
    expect(sim.hero.abilities.r.value[3] / HEROES.lina.abilities.r.value[3]).toBeCloseTo(1 + T.value * T.ult, 6);
    expect(sim.hero.abilities.r.cooldown).toBe(cd0);
  });

  it("перезарядка, радиус и число целей — каждое своим полем", () => {
    const T = ARCADE.talents;
    expect(heroTalents("zeus")[20]).toContain("q_count");
    const zeus = field("tal-zeus", "zeus");
    const count0 = [...HEROES.zeus.abilities.q.count!];
    take(zeus, "q_count");
    expect(zeus.hero.abilities.q.count).toEqual(count0.map((c) => (c > 0 ? c + T.count : 0)));
    expect(heroTalents("sniper")[25]).toContain("r_cooldown");
    const sniper = field("tal-cd", "sniper");
    take(sniper, "r_cooldown");
    expect(sniper.hero.abilities.r.cooldown).toBeCloseTo(HEROES.sniper.abilities.r.cooldown * (1 - T.cooldown * T.ult), 1);
    expect(heroTalents("crystal_maiden")[20]).toContain("q_radius");
    const cm = field("tal-radius", "crystal_maiden");
    take(cm, "q_radius");
    expect(cm.hero.abilities.q.radius).toBe(Math.round(HEROES.crystal_maiden.abilities.q.radius! * (1 + T.radius)));
    expect(talentLabel("crystal_maiden", "q_radius").vars).toEqual({ from: HEROES.crystal_maiden.abilities.q.radius, to: cm.hero.abilities.q.radius });
  });

  it("на 10-м уровне — пара талантов героя и одна карта; общий запасной талант работает, как раньше", () => {
    const sim = field("tal-offer", "juggernaut");
    sim.player.level = 10;
    const offers = priv(sim).rollOffers();
    expect(offers.filter((o) => o.kind === "talent").map((o) => (o as { id: string }).id)).toEqual([...heroTalents("juggernaut")[10]]);
    expect(offers.length).toBeLessThanOrEqual(3);
    const hp0 = sim.player.stats.maxHp;
    take(sim, "t15_hp");
    expect(sim.player.stats.maxHp).toBe(hp0 + 150);
    sim.step(IDLE_INPUT);
  });
});
