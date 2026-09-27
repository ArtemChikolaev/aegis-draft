import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { UPGRADE_BY_ID, UPGRADES, upgradeFigures } from "../src/game/arcade/content/schools.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind, type Offer } from "../src/game/arcade/types.ts";

// «Призыв» (T20.1) — седьмой тип благословений DMD: модификаторы Зверинца действуют на призывы и иллюзии героя, карта «Вожак»
// продлевает их и с 3-го ранга добавляет юнита. Раньше ветка призывов уходила раньше `petPower`, и Рёв им ничего не давал.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; applyOffer(o: Offer): void; rollUpgradeOffer(exclude: string[], only?: string): Offer | null };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const take = (sim: ArcadeSim, id: string, rarity: "standard" | "exotic" = "standard") => priv(sim).applyOffer({ kind: "upgrade", id, rarity } as Offer);

function field(seed: string, hero: string): ArcadeSim {
  const sim = new ArcadeSim(seed, { hero, rank: 10 });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  return sim;
}
/** Сумма урона по манекену за n тиков после каста клавиши key (призыв бьёт сам). */
function summonDamage(seed: string, hero: string, key: "q" | "w" | "e" | "r", ups: string[], n = 360): number {
  const sim = field(seed, hero);
  for (const id of ups) take(sim, id);
  const e = priv(sim).spawnEnemy(ENEMY_KINDS.ogre, sim.player.x + 70, sim.player.y);
  e.hp = e.maxHp = 1e7; e.stunUntil = 1e9;
  sim.player.abilities[key] = 1; sim.player.cooldowns[key] = 0;
  const mask = { q: 1, w: 2, e: 4, r: 8 }[key];
  for (let i = 0; i < n; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step({ ...IDLE_INPUT, cast: i === 0 ? mask : 0 }); }
  return 1e7 - e.hp;
}

describe("благословения «Призыв»", () => {
  it("«Вожак» — тип summon школы Зверинца; Рёв, «Стая следом» и Вожак доступны призывателю без волка и медведя", () => {
    expect(UPGRADE_BY_ID.beast_leader.type).toBe("summon");
    expect(upgradeFigures("beast_leader", 3, 3, { power: () => 0 }).find((f) => f.key === "summonExtra")?.value).toBe(1);
    const kit = UPGRADES.filter((u) => u.summonKit).map((u) => u.id).sort();
    expect(kit).toEqual(["beast_leader", "beast_pounce", "beast_roar"]);
    const offers = (hero: string) => { const sim = field(`kit-${hero}`, hero); const seen = new Set<string>(); for (let i = 0; i < 200; i++) { const o = priv(sim).rollUpgradeOffer([], "beast"); if (o?.kind === "upgrade") seen.add(o.id); } return seen; };
    expect(offers("lycan").has("beast_roar")).toBe(true); // волки Lycan — призыв
    expect(offers("phantom_lancer").has("beast_leader")).toBe(true); // иллюзии
    expect(offers("juggernaut").has("beast_roar")).toBe(false); // Healing Ward не боец — только через волка/медведя
  });

  it("Рёв усиливает призывы (волки Lycan) и иллюзии (Phantom Lancer)", () => {
    for (const [hero, key] of [["lycan", "q"], ["phantom_lancer", "r"]] as const) {
      const base = summonDamage(`roar-${hero}`, hero, key, []);
      const roar = summonDamage(`roar-${hero}`, hero, key, ["beast_roar"]);
      expect(base, hero).toBeGreaterThan(0);
      expect(roar / base, hero).toBeCloseTo(1.35, 1);
    }
  });

  it("«Вожак»: призыв живёт на 20% × сила дольше, с 3-го ранга юнитов на одного больше", () => {
    const sim = field("leader", "lycan");
    sim.player.abilities.q = 1; sim.player.cooldowns.q = 0;
    sim.step({ ...IDLE_INPUT, cast: 1 });
    const plain = sim.pets.filter((p) => p.kind === "summon");
    const life0 = (plain[0].until ?? 0) - sim.tick;
    const lead = field("leader", "lycan");
    for (let i = 0; i < 3; i++) take(lead, "beast_leader");
    lead.player.abilities.q = 1; lead.player.cooldowns.q = 0;
    lead.step({ ...IDLE_INPUT, cast: 1 });
    const led = lead.pets.filter((p) => p.kind === "summon");
    expect(led.length).toBe(plain.length + 1);
    expect(((led[0].until ?? 0) - lead.tick) / life0).toBeCloseTo(1 + 0.2 * lead.upgradePower("beast_leader"), 1);
    expect(led[0].dmg).toBeCloseTo(plain[0].dmg ?? 0, 6); // урон на юнита прежний — прибавка к общему
  });
});
