import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEROES, type AbilityDef } from "../src/game/arcade/content/heroes.ts";
import { SUMMONS } from "../src/game/arcade/content/pets.ts";
import { ENEMY_KINDS, type EnemyKind } from "../src/game/arcade/content/enemies.ts";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import type { AbilityKey, Enemy } from "../src/game/arcade/types.ts";

/** Поля Player, в которых вид умения держит своё состояние (синхронно с castAbility). Поля, которые виды только продлевают
 *  через Math.max (hasteUntil, invulnUntil), общими быть могут — затирания нет. */
function stateFields(ab: AbilityDef): string[] {
  switch (ab.kind) {
    case "spin": return ["spinUntil"];
    case "spirits": return ["spiritsUntil"];
    case "tether": return ["tetherUntil", "tetherPet"];
    case "ward": return ["wardUntil", "wardX", "wardY"];
    case "damage_ward": return ab.summon && (ab.summon.art === "illusion" || SUMMONS[ab.summon.art]) ? [] : ["wardUntil", "wardX", "wardY"];
    case "omni": return ["burstLeft", "burstNextAt"];
    case "freezing_field": return ["fieldUntil", "burstLeft", "burstNextAt"];
    case "shrapnel": return ["zoneUntil", "zoneX", "zoneY"];
    case "remnant": return ["remnantUntil", "remnantX", "remnantY"];
    case "edict": return ["edictUntil"];
    case "armor_buff": case "berserker_call": return ["armorBuffUntil"];
    case "metamorphosis": return ["formUntil", "metaUntil", "metaMult"];
    case "rage": return ["rageUntil", "rageMult"];
    case "death_pact": return ["pactUntil", "pactMult"];
    case "frenzy": return ab.form ? ["frenzyUntil", "frenzyMult", "formUntil"] : ["frenzyUntil", "frenzyMult"];
    case "mass_freeze": case "berserk_blood": return ["frenzyUntil", "frenzyMult"];
    case "haste": return ["evadeUntil", "evadeChance"];
    case "life_drain": return ["drainUntil", "drainTarget"];
    default: return [];
  }
}

type Internals = { castAbility(k: AbilityKey, ab: AbilityDef): void; tickActiveAbilities(): void; spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; dealtBySource: Record<string, number> };

describe("состояние умений не общее между видами (T13.66)", () => {
  it("у героя нет двух видов умений с общим полем Player", () => {
    const player = new ArcadeSim("fields").player as unknown as Record<string, unknown>;
    const clash: string[] = [];
    for (const hero of Object.values(HEROES)) {
      const keys = ["q", "w", "e", "r"] as const;
      for (const k of keys) for (const f of stateFields(hero.abilities[k])) expect(f in player, `${hero.id}.${k}: поля ${f} нет у Player`).toBe(true);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = hero.abilities[keys[i]], b = hero.abilities[keys[j]];
        const shared = stateFields(a).filter((f) => stateFields(b).includes(f));
        if (shared.length) clash.push(`${hero.id}: ${keys[i]}:${a.kind} и ${keys[j]}:${b.kind} → ${shared.join(",")}`);
      }
    }
    expect(clash).toEqual([]);
  });

  it("Dark Willow: взорвавшаяся мина E не гасит Bedlam R, а одна мина не бьёт от имени R", () => {
    const setup = (seed: string, dist: number) => {
      const sim = new ArcadeSim(seed, { hero: "dark_willow", act: "short" });
      const a = sim as unknown as Internals, p = sim.player;
      p.abilities.e = 1; p.abilities.r = 1; p.invulnUntil = 1e12;
      for (let i = 0; i < 6; i++) { const e = a.spawnEnemy(ENEMY_KINDS.ogre, p.x + dist * Math.cos(i), p.y + dist * Math.sin(i)); e.hp = e.maxHp = 1e7; }
      return { sim, a, p };
    };
    const { sim, a, p } = setup("dw-er", 40);
    a.castAbility("e", sim.hero.abilities.e); sim.tick++; a.tickActiveAbilities();
    expect(p.remnantUntil).toBe(0); // мина взорвалась
    expect(a.dealtBySource.e).toBeGreaterThan(0);
    a.castAbility("r", sim.hero.abilities.r);
    for (let i = 0; i < 600; i++) { sim.tick++; a.tickActiveAbilities(); }
    expect(a.dealtBySource.r).toBeGreaterThan(0);
    const only = setup("dw-e", 250); // вне порога мины, но в радиусе Bedlam
    only.a.castAbility("e", only.sim.hero.abilities.e);
    for (let i = 0; i < 720; i++) { only.sim.tick++; only.a.tickActiveAbilities(); }
    expect(only.a.dealtBySource.r).toBeUndefined();
  });

  it("Terrorblade: Sunder R не перетирает урон формы Metamorphosis E", () => {
    const sim = new ArcadeSim("tb-er", { hero: "terrorblade", act: "short" });
    const a = sim as unknown as Internals, p = sim.player;
    p.abilities.e = 1; p.abilities.r = 1;
    a.castAbility("e", sim.hero.abilities.e);
    const metaUntil = p.metaUntil;
    a.castAbility("r", sim.hero.abilities.r);
    expect(p.metaUntil).toBe(metaUntil);
    expect(p.metaMult).toBe(sim.hero.abilities.e.value[1]);
    expect(p.pactMult).toBe(sim.hero.abilities.r.value[1]);
    expect(p.pactUntil).toBeGreaterThan(sim.tick);
  });
});

// Умение должно работать в любом слоте (T13.25). Тик активных эффектов раньше искал вид по букве —
// `H.q.kind === "spin"`, `H.w.kind === "ward"` — и одиннадцать умений молчали: Rolling Thunder у
// Pangolier и Raptor Dance у Kez стоят в R, Hand of God у Chen — в R, Cold Embrace у Winter Wyvern — в E.
// Каст ставил spinUntil/wardUntil, а тик их не видел, и ульт не делал ничего.
const SIM = readFileSync(new URL("../src/game/arcade/sim.ts", import.meta.url), "utf8");

describe("слоты умений Аркады", () => {
  it("сим не ищет вид умения по букве слота", () => {
    const hardcoded = [...SIM.matchAll(/H\.([qwer])\.kind === "([a-z_]+)"/g)].map((m) => `H.${m[1]}.kind === "${m[2]}"`);
    expect(hardcoded, "вид умения ищут через ABILITY_KEYS.find, иначе умение в другом слоте мертво").toEqual([]);
  });

  it("рендер тоже не берёт радиус по букве слота", () => {
    const R = readFileSync(new URL("../src/features/arcade/renderer.ts", import.meta.url), "utf8");
    const hardcoded = [...R.matchAll(/abilities\.([qwer])\.(kind|radius)/g)].map((m) => m[0]);
    expect(hardcoded.filter((h) => !h.endsWith(".radius")), "вид умения — через ArcadeRenderer.slot").toEqual([]);
  });

  // Виды, которые сим и рендер читают из фиксированного слота (пассивки и добивание). Пока каждый
  // такой вид стоит у всех героев в одном слоте, это безопасно; тест ловит момент, когда перестанет.
  it("пассивки с фиксированным слотом стоят у всех героев именно в нём", () => {
    const LOCKED: Record<string, string> = {
      static_field: "e", headshot: "w", presence: "e", counter_helix: "e",
      reincarnation: "r", culling_blade: "r", omni: "r", freezing_field: "r",
    };
    for (const hero of Object.values(HEROES)) {
      for (const [slot, ab] of Object.entries(hero.abilities)) {
        const want = LOCKED[ab.kind];
        if (want) expect(slot, `${hero.id}: ${ab.kind} читают только из ${want}`).toBe(want);
      }
    }
  });

  it("виды, у которых есть тик-обработчик, встречаются в разных слотах — значит поиск по виду обязателен", () => {
    const slots: Record<string, Set<string>> = {};
    for (const hero of Object.values(HEROES)) {
      for (const [slot, ab] of Object.entries(hero.abilities)) (slots[ab.kind] ??= new Set()).add(slot);
    }
    // Эти виды живут в тике (вихрь, лечащий тотем, серии ударов) и точно стоят у героев в разных слотах.
    for (const kind of ["spin", "ward"]) expect(slots[kind]?.size, `${kind}: ожидали несколько слотов`).toBeGreaterThan(1);
  });
});
