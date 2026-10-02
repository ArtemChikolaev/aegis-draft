import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { HEROES, type AbilityDef } from "../src/game/arcade/content/heroes.ts";
import { heroTalents } from "../src/game/arcade/content/talents.ts";
import type { AbilityKey, Enemy, EnemyKind } from "../src/game/arcade/types.ts";

// Spell Steal (M24): ульт Rubick крадёт умение ближайшего нейтрала-колдуна (War Stomp, Thunder Clap, Purge, Frost Armor),
// колдует его сам — крупнее и без телеграфа — и держит украденное до следующей кражи.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; castAbility(key: AbilityKey, ab: AbilityDef): void; wantsCast(ab: AbilityDef): boolean };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const S = ARCADE.spellSteal;

function field(seed: string): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10, hero: "rubick" });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  sim.player.abilities.r = 1;
  return sim;
}
const spawn = (sim: ArcadeSim, kind: EnemyKind, dx: number, dy = 0): Enemy => {
  const e = priv(sim).spawnEnemy(kind, sim.player.x + dx, sim.player.y + dy);
  e.hp = e.maxHp = 1e6;
  return e;
};
const ult = (sim: ArcadeSim) => { sim.player.cooldowns.r = 0; priv(sim).castAbility("r", sim.hero.abilities.r); };

describe("Spell Steal (Rubick)", () => {
  it("ульт Rubick — кража, а не подпись: урон по рангу, таланты ульта по киту", () => {
    const r = HEROES.rubick.abilities.r;
    expect(r.kind).toBe("spell_steal");
    expect(r.value.slice(1).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1]))).toBe(true);
    expect(heroTalents("rubick")[25]).toContain("r_value");
  });

  it("крадёт у ближайшего колдуна, а колдующего прямо сейчас — первым; без колдуна и украденного каст не тратится", () => {
    const sim = field("steal-pick");
    spawn(sim, ENEMY_KINDS.kobold, 80);
    expect(priv(sim).wantsCast(sim.hero.abilities.r)).toBe(false);
    ult(sim);
    expect(sim.player.stolen).toBeNull();
    expect(sim.player.cooldowns.r).toBe(0); // перезарядка не потрачена
    const centaur = spawn(sim, ENEMY_KINDS.centaur, 260);
    spawn(sim, ENEMY_KINDS.satyr, 0, 120);
    ult(sim);
    expect(sim.player.stolen).toBe("purge"); // сатир ближе
    expect(sim.player.cooldowns.r).toBeGreaterThan(0);
    centaur.castT = 20; // кентавр колдует War Stomp — крадём его, хоть он и дальше
    ult(sim);
    expect(sim.player.stolen).toBe("stomp");
  });

  it("украденное держится: колдунов не осталось — ульт колдует то же умение", () => {
    const sim = field("steal-hold");
    const ogre = spawn(sim, ENEMY_KINDS.ogre, 120);
    ult(sim);
    expect(sim.player.stolen).toBe("frost_armor");
    ogre.alive = false;
    sim.player.armorBuffUntil = 0;
    ult(sim);
    expect(sim.player.stolen).toBe("frost_armor");
    expect(sim.player.armorBuffAmt).toBe(S.frostArmor.armor[1]);
    expect(sim.player.armorBuffUntil).toBeGreaterThan(sim.tick);
  });

  it("War Stomp оглушает, Thunder Clap замедляет — по кругу вокруг Rubick, с уроном ульта", () => {
    for (const [kind, spell] of [[ENEMY_KINDS.centaur, "stomp"], [ENEMY_KINDS.hellbear, "clap"]] as const) {
      const sim = field(`steal-${spell}`);
      const caster = spawn(sim, kind, 150);
      const near = spawn(sim, ENEMY_KINDS.wildwing, -60); // не колдун: красть у него нечего
      ult(sim);
      expect(sim.player.stolen).toBe(spell);
      expect(near.hp).toBeLessThan(1e6);
      if (spell === "stomp") expect(near.stunUntil).toBeGreaterThan(sim.tick);
      else { expect(near.chillUntil).toBeGreaterThan(sim.tick); expect(near.chillSlow).toBe(S.clap.slow); }
      // Кентавр в 150 — внутри круга Stomp (170), медведь в 150 — внутри Clap (200).
      expect(caster.hp).toBeLessThan(1e6);
    }
  });

  it("Purge бьёт линией к цели и снимает с врагов щит шамана, Frost Armor и клич", () => {
    const sim = field("steal-purge");
    spawn(sim, ENEMY_KINDS.satyr, 0, 300); // колдун — в стороне от линии
    ult(sim);
    expect(sim.player.stolen).toBe("purge");
    // Не колдуны: иначе ульт украл бы у них, а не колдовал Purge. Линия идёт к ближайшему врагу — цели справа (200 < 300).
    const target = spawn(sim, ENEMY_KINDS.wildwing, 200);
    target.shieldUntil = target.armorUntil = target.ampUntil = sim.tick + 600;
    const off = spawn(sim, ENEMY_KINDS.wildwing, -200, 200); // вне линии
    ult(sim);
    expect(sim.player.stolen).toBe("purge");
    expect(target.hp).toBeLessThan(1e6);
    expect(target.shieldUntil).toBe(0);
    expect(target.armorUntil).toBe(0);
    expect(target.ampUntil).toBe(0);
    expect(target.chillUntil).toBeGreaterThan(sim.tick);
    expect(off.hp).toBe(1e6);
  });

  it("украденное — в контрольной сумме: реплей с другим украденным расходится", () => {
    const a = field("steal-digest"), b = field("steal-digest");
    expect(a.digest()).toBe(b.digest());
    b.player.stolen = "clap";
    expect(a.digest()).not.toBe(b.digest());
  });
});
