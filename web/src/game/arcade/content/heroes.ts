// Герои Arcade (T13.9): кит героя — контент, а не код. Каждая способность — один из типовых
// «видов» (AbilityKind) с параметрами по уровню; механика видов живёт в sim.ts. Новый герой =
// запись здесь + тексты в i18n; новый вид способности = ветка в sim. Портреты — по `picture`
// из heroes.json (dotaId — чтобы брать имя из датасета).
import type { PlayerStats } from "../types.ts";

/** Уникальные киты — пять «ручных» героев; остальные — шаблоны по архетипам (ответ на «все герои»:
 *  архетип = набор уже реализованных видов способностей, герой = портрет + параметры). */
export type UniqueHeroId = "juggernaut" | "crystal_maiden" | "sniper" | "axe" | "zeus";
export type TemplateHeroId =
  | "phantom_assassin" | "anti_mage" | "lina" | "lich" | "drow_ranger" | "windranger"
  | "bristleback" | "sven" | "storm_spirit" | "leshrac"
  | "faceless_void" | "ursa" | "lion" | "shadow_fiend" | "pugna" | "invoker" | "tidehunter" | "mirana" | "clinkz"
  // Волна 2 (2026-09-06, владелец: «по итогу нужны абсолютно все персонажи»): киты из тех же видов + Reincarnation.
  | "wraith_king" | "dragon_knight" | "kunkka" | "necrophos" | "razor" | "venomancer" | "witch_doctor" | "luna"
  // Волна 3: новые виды rupture/corrosive/berserk_blood и пассивки aftershock/multicast/backstab/thirst.
  | "earthshaker" | "bloodseeker" | "riki" | "queen_of_pain" | "viper" | "ogre_magi" | "huskar" | "slardar"
  // Волна 4.
  | "tiny" | "spectre" | "chaos_knight" | "night_stalker" | "doom" | "legion_commander" | "templar_assassin" | "medusa"
  // Волна 5.
  | "silencer" | "skywrath_mage" | "dazzle" | "jakiro" | "shadow_shaman" | "warlock" | "enigma" | "tinker"
  // Волна 6.
  | "omniknight" | "abaddon" | "beastmaster" | "brewmaster" | "centaur" | "dark_seer" | "death_prophet" | "disruptor"
  // Волна 7.
  | "lycan" | "lone_druid" | "alchemist" | "bane" | "batrider" | "bounty_hunter" | "broodmother" | "clockwerk"
  // Волна 8.
  | "earth_spirit" | "elder_titan" | "ember_spirit" | "grimstroke" | "gyrocopter" | "keeper_of_the_light" | "magnus" | "mars"
  // Волна 9.
  | "morphling" | "naga_siren" | "natures_prophet" | "nyx_assassin" | "oracle" | "outworld_destroyer" | "pangolier" | "phoenix"
  // Волна 10.
  | "puck" | "pudge" | "rubick" | "sand_king" | "shadow_demon" | "slark" | "snapfire" | "spirit_breaker"
  // Волна 11.
  | "techies" | "terrorblade" | "timbersaw" | "treant" | "troll_warlord" | "tusk" | "underlord" | "undying"
  // Волна 12.
  | "vengeful_spirit" | "visage" | "void_spirit" | "weaver" | "winter_wyvern" | "arc_warden" | "dawnbreaker" | "hoodwink"
  // Волна 13 (Largo в локальном vpk без модели — пропущен).
  | "marci" | "muerta" | "primal_beast" | "kez" | "ringmaster" | "meepo" | "io"
  // Волна 15 (2026-09-06): последние семь из датасета. Остался только Largo — его модели в vpk нет.
  | "phantom_lancer" | "lifestealer" | "enchantress" | "chen" | "ancient_apparition" | "monkey_king" | "dark_willow";
export type HeroId = UniqueHeroId | TemplateHeroId;
export type ArchetypeId = "blademaster" | "frostfire" | "marksman" | "warlord" | "stormcaller";
export const HERO_IDS: readonly HeroId[] = [
  "juggernaut", "crystal_maiden", "sniper", "axe", "zeus",
  "phantom_assassin", "anti_mage", "lina", "lich", "drow_ranger", "windranger", "bristleback", "sven", "storm_spirit", "leshrac",
  "faceless_void", "ursa", "lion", "shadow_fiend", "pugna", "invoker", "tidehunter", "mirana", "clinkz",
  "wraith_king", "dragon_knight", "kunkka", "necrophos", "razor", "venomancer", "witch_doctor", "luna",
  "earthshaker", "bloodseeker", "riki", "queen_of_pain", "viper", "ogre_magi", "huskar", "slardar",
  "tiny", "spectre", "chaos_knight", "night_stalker", "doom", "legion_commander", "templar_assassin", "medusa",
  "silencer", "skywrath_mage", "dazzle", "jakiro", "shadow_shaman", "warlock", "enigma", "tinker",
  "omniknight", "abaddon", "beastmaster", "brewmaster", "centaur", "dark_seer", "death_prophet", "disruptor",
  "lycan", "lone_druid", "alchemist", "bane", "batrider", "bounty_hunter", "broodmother", "clockwerk",
  "earth_spirit", "elder_titan", "ember_spirit", "grimstroke", "gyrocopter", "keeper_of_the_light", "magnus", "mars",
  "morphling", "naga_siren", "natures_prophet", "nyx_assassin", "oracle", "outworld_destroyer", "pangolier", "phoenix",
  "puck", "pudge", "rubick", "sand_king", "shadow_demon", "slark", "snapfire", "spirit_breaker",
  "phantom_lancer", "lifestealer", "enchantress", "chen", "ancient_apparition", "monkey_king", "dark_willow",
  "techies", "terrorblade", "timbersaw", "treant", "troll_warlord", "tusk", "underlord", "undying",
  "vengeful_spirit", "visage", "void_spirit", "weaver", "winter_wyvern", "arc_warden", "dawnbreaker", "hoodwink",
  "marci", "muerta", "primal_beast", "kez", "ringmaster", "meepo", "io",
];

export type AbilityKind =
  | "spin" | "ward" | "crit" | "omni"
  | "nova" | "frostbite" | "arcane_aura" | "freezing_field"
  | "shrapnel" | "headshot" | "take_aim" | "assassinate"
  | "berserker_call" | "battle_hunger" | "counter_helix" | "culling_blade"
  | "arc_lightning" | "lightning_bolt" | "static_field" | "thundergod"
  // Виды для собственных китов шаблонных героев (владелец 2026-09-06: «каждый герой уникален»).
  | "dash" | "line_burst" | "meteor" | "armor_buff" | "rage" | "frenzy" | "haste" | "damage_ward" | "life_drain"
  | "gust" | "multishot" | "remnant" | "mass_freeze" | "requiem" | "goo" | "ravage" | "edict" | "death_pact"
  | "signature" | "presence" | "armor_passive" | "frost_arrows" | "searing" | "mana_break" | "coup" | "mana_void"
  | "reincarnation" | "rupture" | "corrosive" | "berserk_blood" | "metamorphosis";

/** Альтернативная форма (Metamorphosis у Terrorblade, Elder Dragon Form у Dragon Knight, True Form у Lone Druid):
 *  меняются модель, тип атаки и дальность — владелец 2026-09-06: «нажимает скилл и ничего не происходит». */
export interface FormDef {
  /** Тип атаки в форме: дальний бой или ближний. */
  ranged: boolean;
  /** Дальность атаки в форме (для ближней — радиус удара). */
  range: number;
}

/**
 * Умение героя. **Слот — это ещё и ключ к арту и звуку:** иконка лежит в
 * `art/abilities{,_px}/<hero>_<slot>.png`, звук каста — в `art/sfx/dota/pack/abilities` по тому же
 * ключу. Меняешь вид или название умения в слоте (или переставляешь умения местами) — переставь и
 * файлы, и строки в `scripts/dota_ability_icons.sh` и `scripts/dota_sfx_pack.py`, иначе на кнопке
 * Q останется старая картинка и старый звук (поймано на Slardar и Clinkz, 2026-09-06).
 */
export interface AbilityDef {
  kind: AbilityKind;
  /** Только для kind: "metamorphosis". Лист спрайта — `<heroId>@meta`. */
  form?: FormDef;
  /** Главная величина по уровню способности (index = уровень; 0 — не изучена). */
  value: number[];
  cooldown: number;
  radius?: number;
  duration?: number;
  /** Вторичное число по уровню (число целей/ударов, длительность стана и т.п.). */
  count?: number[];
  passive?: boolean;
  /** Вид призыва у kind: "damage_ward" — чисто визуальный (владелец 2026-09-06: «Terrorblade
   *  должен звать иллюзии, а он ставит на пол шарик»). Урон и радиус не меняются: сим по-прежнему
   *  считает один источник, рисуем то, что призывает герой в Dota. */
  summon?: SummonDef;
}

/** `art` — «illusion» (копия героя) или имя листа существа (`wolf`, `bear`, `treant`, `hawk`, `hellbear`). */
export interface SummonDef { art: string; count?: number }

/** Фирменная пассивка героя поверх кита архетипа (BACKLOG T13.15): то, что делает Shadow Fiend Shadow Fiend'ом. */
export type SignatureKind = "souls" | "swipes" | "cleave" | "timelock" | "deathpact" | "fiery_soul" | "overload" | "marksmanship" | "quill" | "blur" | "vampiric"
  | "aftershock" | "multicast" | "backstab" | "thirst"
  // Волна 14 (2026-09-06): виды под тех героев, чью пассивку в Dota нечем было выразить.
  // `crit` — Blade Dance (шанс на усиленный удар), `tough` — Kraken Shell (плоское снижение урона),
  // `aura_burn` — Heartstopper Aura (урон вокруг героя), `growth` — Flesh Heap (запас здоровья за убийства).
  | "crit" | "tough" | "aura_burn" | "growth";
export interface SignatureDef { kind: SignatureKind; value: number; cap?: number; radius?: number; duration?: number }

export interface HeroDef {
  id: HeroId;
  dotaId: number;
  picture: string;
  ranged: boolean;
  /** Ключ текстов способностей: `arcade.ab.<kit>.<q|w|e|r>` — свой id у уникальных, архетип у шаблонов. */
  kit: HeroId | ArchetypeId;
  /** `pickup` у дальнобойных больше: шарды падают на дистанции выстрела, и без этого стрелок с 55
   *  убийствами оставался 1-го уровня (headless-QA 2026-09-05). */
  base: Partial<Pick<PlayerStats, "maxHp" | "regen" | "armor" | "speed" | "damage" | "attackInterval" | "range" | "pickup">>;
  abilities: { q: AbilityDef; w: AbilityDef; e: AbilityDef; r: AbilityDef };
  signature?: SignatureDef;
}

const UNIQUE_HEROES: Record<UniqueHeroId, HeroDef> = {
  juggernaut: {
    id: "juggernaut", kit: "juggernaut", dotaId: 8, picture: "juggernaut", ranged: false,
    base: {},
    abilities: {
      q: { kind: "spin", value: [0, 38, 60, 82, 104], cooldown: 16, radius: 104, duration: 4 },
      // Healing Ward — настоящий тотем из Dota, а не зелёный шар (фидбэк владельца 2026-09-06).
      w: { kind: "ward", value: [0, 0.028, 0.034, 0.04, 0.046], cooldown: 32, radius: 170, duration: 8, summon: { art: "ward_healing" } },
      e: { kind: "crit", value: [0, 0.2, 0.25, 0.3, 0.35], cooldown: 0, passive: true },
      r: { kind: "omni", value: [0, 110, 200, 290], cooldown: 70, radius: 230, duration: 1.5, count: [0, 5, 7, 9] },
    },
  },
  crystal_maiden: {
    id: "crystal_maiden", kit: "crystal_maiden", dotaId: 5, picture: "crystal_maiden", ranged: true,
    base: { maxHp: 560, speed: 162, damage: 22, attackInterval: 1.0, range: 300, armor: 1, pickup: 230 },
    abilities: {
      q: { kind: "nova", value: [0, 110, 170, 230, 290], cooldown: 8, radius: 170, duration: 3 },
      w: { kind: "frostbite", value: [0, 140, 220, 300, 380], cooldown: 7, radius: 320, duration: 2 },
      e: { kind: "arcane_aura", value: [0, 0.06, 0.1, 0.14, 0.18], cooldown: 0, passive: true },
      r: { kind: "freezing_field", value: [0, 70, 105, 140], cooldown: 60, radius: 270, duration: 6 },
    },
  },
  sniper: {
    id: "sniper", kit: "sniper", dotaId: 35, picture: "sniper", ranged: true,
    base: { maxHp: 540, speed: 158, damage: 26, attackInterval: 0.9, range: 340, armor: 1, pickup: 250 },
    abilities: {
      q: { kind: "shrapnel", value: [0, 18, 28, 38, 48], cooldown: 12, radius: 180, duration: 8 },
      w: { kind: "headshot", value: [0, 20, 40, 60, 80], cooldown: 0, passive: true },
      e: { kind: "take_aim", value: [0, 60, 100, 140, 180], cooldown: 0, passive: true },
      r: { kind: "assassinate", value: [0, 450, 800, 1200], cooldown: 28, radius: 640 },
    },
  },
  axe: {
    id: "axe", kit: "axe", dotaId: 2, picture: "axe", ranged: false,
    base: { maxHp: 680, speed: 166, damage: 18, attackInterval: 0.95, range: 84, armor: 4, regen: 4 },
    abilities: {
      q: { kind: "berserker_call", value: [0, 1.4, 1.7, 2.0, 2.3], cooldown: 14, radius: 170, duration: 3 },
      w: { kind: "battle_hunger", value: [0, 14, 20, 26, 32], cooldown: 11, radius: 320, duration: 5, count: [0, 3, 4, 5, 6] },
      e: { kind: "counter_helix", value: [0, 45, 65, 85, 105], cooldown: 0, radius: 130, passive: true },
      r: { kind: "culling_blade", value: [0, 180, 300, 420], cooldown: 30, radius: 130, duration: 3 },
    },
  },
  zeus: {
    id: "zeus", kit: "zeus", dotaId: 22, picture: "zeus", ranged: true,
    base: { maxHp: 500, speed: 160, damage: 22, attackInterval: 1.0, range: 300, armor: 1, pickup: 230 },
    abilities: {
      q: { kind: "arc_lightning", value: [0, 40, 60, 80, 100], cooldown: 3.2, radius: 320, count: [0, 4, 6, 8, 10] },
      w: { kind: "lightning_bolt", value: [0, 140, 220, 300, 380], cooldown: 7, radius: 420, duration: 0.5 },
      e: { kind: "static_field", value: [0, 0.03, 0.045, 0.06, 0.075], cooldown: 0, radius: 320, passive: true },
      r: { kind: "thundergod", value: [0, 220, 340, 460], cooldown: 70, radius: 760 },
    },
  },
};

/** Архетипы шаблонных китов: только уже реализованные виды способностей — новый герой не требует кода сима. */
// Архетипы удраны 2026-09-06: у каждого шаблонного героя теперь собственный кит (см. TEMPLATE_HEROES ниже).

const MELEE_BASE: HeroDef["base"] = {};
const RANGED_BASE: HeroDef["base"] = { maxHp: 510, speed: 160, damage: 21, attackInterval: 1.0, range: 310, armor: 1, pickup: 230 };

type Kit = HeroDef["abilities"];
function hero(id: TemplateHeroId, dotaId: number, picture: string, ranged: boolean, base: HeroDef["base"], abilities: Kit, signature?: SignatureDef): HeroDef {
  return { id, kit: id, dotaId, picture, ranged, base: { ...(ranged ? RANGED_BASE : MELEE_BASE), ...base }, abilities, signature };
}
/** Пассивный слот, усиливающий фирменную пассивку героя (SignatureDef): множитель к её `value` по уровню. */
const SIG: AbilityDef = { kind: "signature", value: [0, 1, 1.35, 1.7, 2.05], cooldown: 0, passive: true };

/** Собственные киты: по четыре умения «как в Dota» на героя, значения в масштабе уникальных китов выше. */
const TEMPLATE_HEROES: Record<TemplateHeroId, HeroDef> = {
  phantom_assassin: hero("phantom_assassin", 44, "phantom_assassin", false, { speed: 176, damage: 26, maxHp: 560 }, {
    q: { kind: "goo", value: [0, 60, 90, 120, 150], cooldown: 6, radius: 320, duration: 2 },            // Stifling Dagger
    w: { kind: "dash", value: [0, 40, 60, 80, 100], cooldown: 9, radius: 280 },                          // Phantom Strike
    e: SIG,                                                                                              // Blur
    r: { kind: "coup", value: [0, 0.15, 0.2, 0.25], cooldown: 0, count: [0, 2.6, 3.2, 3.8], passive: true }, // Coup de Grace
  }, { kind: "blur", value: 0.22 }),
  anti_mage: hero("anti_mage", 1, "antimage", false, { speed: 182, attackInterval: 0.8, maxHp: 580 }, {
    q: { kind: "mana_break", value: [0, 8, 14, 20, 26], cooldown: 0, passive: true },                    // Mana Break
    w: { kind: "dash", value: [0, 0, 0, 0, 0], cooldown: 7, radius: 320 },                               // Blink
    e: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Counterspell
    r: { kind: "mana_void", value: [0, 260, 420, 580], cooldown: 60, radius: 320 },                      // Mana Void: ×(1 + потерянное HP цели), сплэш
  }, { kind: "blur", value: 0.2 }),
  lina: hero("lina", 25, "lina", true, { damage: 26, maxHp: 580, armor: 2 }, {
    q: { kind: "line_burst", value: [0, 70, 105, 140, 175], cooldown: 7, radius: 95, count: [0, 3, 3, 3, 3] },          // Dragon Slave
    w: { kind: "line_burst", value: [0, 90, 135, 180, 225], cooldown: 10, radius: 130, count: [0, 1, 1, 1, 1], duration: 0.9 }, // Light Strike Array
    e: SIG,                                                                                              // Fiery Soul
    r: { kind: "assassinate", value: [0, 350, 600, 850], cooldown: 55, radius: 340 },                    // Laguna Blade
  }, { kind: "fiery_soul", value: 0.3, duration: 6 }),
  lich: hero("lich", 31, "lich", true, { maxHp: 580, armor: 2, speed: 156 }, {
    q: { kind: "nova", value: [0, 90, 140, 190, 240], cooldown: 8, radius: 160, duration: 3 },           // Frost Blast
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 5 },                        // Frost Shield
    e: { kind: "frostbite", value: [0, 60, 100, 140, 180], cooldown: 12, radius: 320, duration: 1.6 },   // Sinister Gaze
    r: { kind: "arc_lightning", value: [0, 120, 190, 260], cooldown: 50, radius: 340, count: [0, 7, 9, 11] }, // Chain Frost
  }, { kind: "overload", value: 40, radius: 90 }),
  // Полный экран баланса 2026-09-06: 3–7% побед на 60 прогонах — худший герой набора. Причина не в
  // числах умений, а в раскладе слотов: два из четырёх у неё пассивные, весь урон идёт с автоатак,
  // а профиль атаки был базовый для дальнобойных. Ускорили атаку, подняли урон и саму Меткость.
  drow_ranger: hero("drow_ranger", 6, "drow_ranger", true, { range: 350, damage: 28, attackInterval: 0.85, maxHp: 660, armor: 3 }, {
    // Frost Arrows стали залпом по площади: пассивный слот у героя, где ещё и ульт — пассивка,
    // оставлял её с одним активным умением на всю толпу, и она гибла на второй минуте.
    q: { kind: "nova", value: [0, 50, 80, 110, 140], cooldown: 7, radius: 210, duration: 2 },            // Frost Arrows
    w: { kind: "gust", value: [0, 70, 110, 150, 190], cooldown: 10, radius: 240, duration: 2 },          // Gust
    e: { kind: "multishot", value: [0, 44, 62, 80, 100], cooldown: 7, radius: 380, count: [0, 5, 6, 7, 8] }, // Multishot
    r: SIG,                                                                                              // Marksmanship
    // Радиус Меткости 140, а не 220: бонус даётся за выстрел «издалека», но бой идёт вплотную —
    // на 220 он почти не срабатывал, и вся ставка героя на автоатаку не работала.
  }, { kind: "marksmanship", value: 0.5, radius: 140 }),
  windranger: hero("windranger", 21, "windrunner", true, { speed: 168, attackInterval: 0.85 }, {
    q: { kind: "lightning_bolt", value: [0, 70, 110, 150, 190], cooldown: 9, radius: 340, duration: 1.3 }, // Shackleshot
    w: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 95, count: [0, 4, 4, 4, 4] }, // Powershot
    e: { kind: "haste", value: [0, 0.4, 0.5, 0.6, 0.7], cooldown: 14, duration: 4 },                     // Windrun
    r: { kind: "frenzy", value: [0, 0.55, 0.65, 0.75], cooldown: 45, duration: 6 },                      // Focus Fire
  }, { kind: "marksmanship", value: 0.3, radius: 220 }),
  bristleback: hero("bristleback", 99, "bristleback", false, { maxHp: 680, armor: 5, regen: 3, damage: 18 }, {
    q: { kind: "nova", value: [0, 30, 45, 60, 75], cooldown: 5, radius: 150, duration: 1 },              // Quill Spray
    w: { kind: "goo", value: [0, 40, 60, 80, 100], cooldown: 7, radius: 300, duration: 3 },             // Viscous Nasal Goo
    e: { kind: "armor_passive", value: [0, 3, 4, 6, 7], cooldown: 0, passive: true },                    // Bristleback
    r: { kind: "rage", value: [0, 0.4, 0.6, 0.8], cooldown: 50, duration: 9 },                           // Warpath
  }, { kind: "quill", value: 18, radius: 110 }),
  sven: hero("sven", 18, "sven", false, { maxHp: 700, damage: 26, armor: 4, regen: 3 }, {
    q: { kind: "lightning_bolt", value: [0, 90, 140, 190, 240], cooldown: 9, radius: 320, duration: 1.2 }, // Storm Hammer
    w: SIG,                                                                                              // Great Cleave
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 16, duration: 6 },                        // Warcry
    r: { kind: "rage", value: [0, 1.0, 1.5, 2.0], cooldown: 60, duration: 10 },                          // God's Strength
  }, { kind: "cleave", value: 0.5, radius: 85 }),
  storm_spirit: hero("storm_spirit", 17, "storm_spirit", true, { speed: 168, maxHp: 540 }, {
    q: { kind: "remnant", value: [0, 60, 95, 130, 165], cooldown: 6, radius: 130, summon: { art: "illusion" } }, // Static Remnant
    w: { kind: "frostbite", value: [0, 50, 80, 110, 140], cooldown: 11, radius: 300, duration: 1.2 },    // Electric Vortex
    e: SIG,                                                                                              // Overload
    r: { kind: "dash", value: [0, 150, 230, 320], cooldown: 22, radius: 460 },                           // Ball Lightning
  }, { kind: "overload", value: 45, radius: 80 }),
  leshrac: hero("leshrac", 52, "leshrac", true, { damage: 24, maxHp: 520, armor: 2 }, {
    q: { kind: "line_burst", value: [0, 90, 135, 180, 225], cooldown: 8, radius: 100, count: [0, 1, 1, 1, 1], duration: 1.0 }, // Split Earth
    w: { kind: "edict", value: [0, 18, 26, 34, 42], cooldown: 14, radius: 260, duration: 7 },            // Diabolic Edict
    e: { kind: "arc_lightning", value: [0, 60, 90, 120, 150], cooldown: 5, radius: 320, count: [0, 3, 4, 5, 6] }, // Lightning Storm
    r: { kind: "freezing_field", value: [0, 50, 80, 110], cooldown: 55, radius: 240, duration: 7 },      // Pulse Nova
  }, { kind: "aura_burn", value: 10, radius: 155 }),
  faceless_void: hero("faceless_void", 41, "faceless_void", false, { speed: 170, damage: 25, maxHp: 600, armor: 4 }, {
    q: { kind: "dash", value: [0, 0, 0, 0, 0], cooldown: 10, radius: 320 },                              // Time Walk
    w: { kind: "nova", value: [0, 50, 80, 110, 140], cooldown: 9, radius: 200, duration: 5 },            // Time Dilation
    e: SIG,                                                                                              // Time Lock
    r: { kind: "mass_freeze", value: [0, 0, 0, 0], cooldown: 70, radius: 230, duration: 3.5 },           // Chronosphere
  }, { kind: "timelock", value: 0.18, duration: 0.5 }),
  ursa: hero("ursa", 70, "ursa", false, { attackInterval: 0.75, damage: 22, maxHp: 640, armor: 4 }, {
    q: { kind: "nova", value: [0, 50, 75, 100, 125], cooldown: 7, radius: 170, duration: 3 },            // Earthshock
    w: { kind: "frenzy", value: [0, 0.45, 0.55, 0.65, 0.72], cooldown: 12, duration: 4 },                // Overpower
    e: SIG,                                                                                              // Fury Swipes
    r: { kind: "rage", value: [0, 0.25, 0.38, 0.5], cooldown: 45, duration: 6 },                         // Enrage
  }, { kind: "swipes", value: 4, cap: 12 }),
  lion: hero("lion", 26, "lion", true, { maxHp: 480, damage: 20, speed: 158 }, {
    q: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 100, count: [0, 3, 3, 3, 3], duration: 1.0 }, // Earth Spike
    w: { kind: "frostbite", value: [0, 20, 30, 40, 50], cooldown: 12, radius: 320, duration: 2.2 },      // Hex
    e: { kind: "life_drain", value: [0, 20, 30, 40, 50], cooldown: 12, radius: 300, duration: 4 },       // Mana Drain
    r: { kind: "assassinate", value: [0, 400, 650, 900], cooldown: 60, radius: 340 },                    // Finger of Death
  }, { kind: "souls", value: 1.1, cap: 30 }),
  shadow_fiend: hero("shadow_fiend", 11, "nevermore", true, { damage: 30, maxHp: 470, attackInterval: 0.9 }, {
    q: { kind: "line_burst", value: [0, 75, 110, 145, 180], cooldown: 6, radius: 70, count: [0, 3, 3, 3, 3] }, // Shadowraze ×3
    w: SIG,                                                                                              // Necromastery
    e: { kind: "presence", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 0, radius: 300, passive: true },  // Presence of the Dark Lord
    r: { kind: "requiem", value: [0, 120, 200, 280], cooldown: 70, radius: 260, count: [0, 6, 9, 12] },   // Requiem of Souls
  }, { kind: "souls", value: 1.2, cap: 36 }),
  pugna: hero("pugna", 45, "pugna", true, { speed: 166, maxHp: 470, damage: 20 }, {
    q: { kind: "nova", value: [0, 90, 135, 180, 225], cooldown: 6, radius: 150, duration: 1 },           // Nether Blast
    w: { kind: "goo", value: [0, 30, 45, 60, 75], cooldown: 8, radius: 320, duration: 3 },               // Decrepify
    e: { kind: "damage_ward", value: [0, 18, 26, 34, 42], cooldown: 16, radius: 200, duration: 10, summon: { art: "ward_nether" } }, // Nether Ward
    r: { kind: "life_drain", value: [0, 60, 90, 120], cooldown: 40, radius: 340, duration: 5 },          // Life Drain
  }, { kind: "fiery_soul", value: 0.25, duration: 5 }),
  invoker: hero("invoker", 74, "invoker", true, { maxHp: 600, damage: 25, armor: 2 }, {
    q: { kind: "nova", value: [0, 55, 85, 115, 145], cooldown: 9, radius: 180, duration: 1 },            // EMP
    w: { kind: "assassinate", value: [0, 160, 240, 320, 400], cooldown: 9, radius: 360 },                // Sun Strike
    e: { kind: "meteor", value: [0, 70, 105, 140, 175], cooldown: 10, radius: 130, count: [0, 3, 3, 3, 3] }, // Chaos Meteor
    r: { kind: "ravage", value: [0, 150, 240, 330], cooldown: 60, radius: 240, duration: 1.2 },          // Deafening Blast
  }, { kind: "multicast", value: 0.45 }),
  tidehunter: hero("tidehunter", 29, "tidehunter", false, { maxHp: 820, armor: 7, regen: 4, speed: 158, damage: 16 }, {
    q: { kind: "goo", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 300, duration: 3 },            // Gush
    w: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Kraken Shell
    e: { kind: "nova", value: [0, 60, 90, 120, 150], cooldown: 5, radius: 140, duration: 1.5 },          // Anchor Smash
    r: { kind: "ravage", value: [0, 150, 230, 310], cooldown: 70, radius: 300, duration: 1.8 },          // Ravage
  }, { kind: "tough", value: 4 }),
  mirana: hero("mirana", 9, "mirana", true, { speed: 172, range: 330 }, {
    q: { kind: "nova", value: [0, 70, 105, 140, 180], cooldown: 8, radius: 280, duration: 0.5 },         // Starstorm
    w: { kind: "lightning_bolt", value: [0, 110, 170, 230, 290], cooldown: 12, radius: 380, duration: 2.0 }, // Sacred Arrow
    e: { kind: "dash", value: [0, 0, 0, 0, 0], cooldown: 9, radius: 300 },                               // Leap
    r: { kind: "haste", value: [0, 0.6, 0.7, 0.8], cooldown: 60, duration: 8 },                          // Moonlight Shadow
  }, { kind: "marksmanship", value: 0.3, radius: 230 }),
  clinkz: hero("clinkz", 56, "clinkz", true, { attackInterval: 0.85, damage: 20, maxHp: 470 }, {
    q: { kind: "multishot", value: [0, 55, 78, 100, 125], cooldown: 8, radius: 340, count: [0, 4, 5, 6, 7] }, // Burning Barrage
    w: { kind: "searing", value: [0, 12, 18, 24, 30], cooldown: 0, passive: true },                      // Searing Arrows
    e: { kind: "haste", value: [0, 0.4, 0.5, 0.6, 0.7], cooldown: 15, duration: 5 },                     // Skeleton Walk
    r: { kind: "death_pact", value: [0, 0.4, 0.6, 0.8], cooldown: 50, duration: 12 },                    // Death Pact
  }, { kind: "deathpact", value: 6 }),
  // ---- Волна 2 ----
  wraith_king: hero("wraith_king", 42, "skeleton_king", false, { maxHp: 760, armor: 5, damage: 27, speed: 158, regen: 2 }, {
    q: { kind: "lightning_bolt", value: [0, 90, 140, 190, 240], cooldown: 9, radius: 320, duration: 1.4 },  // Wraithfire Blast
    w: SIG,                                                                                              // Vampiric Spirit
    e: { kind: "crit", value: [0, 0.12, 0.16, 0.2, 0.24], cooldown: 0, passive: true },                  // Mortal Strike
    r: { kind: "reincarnation", value: [0, 0.4, 0.6, 0.8], cooldown: 150, passive: true },               // Reincarnation
  }, { kind: "vampiric", value: 0.14 }),
  dragon_knight: hero("dragon_knight", 49, "dragon_knight", false, { maxHp: 720, armor: 6, damage: 25, regen: 3, speed: 160 }, {
    q: { kind: "line_burst", value: [0, 90, 140, 190, 240], cooldown: 9, radius: 70, count: [0, 4, 4, 4, 4] }, // Breathe Fire
    w: { kind: "lightning_bolt", value: [0, 70, 110, 150, 190], cooldown: 10, radius: 220, duration: 1.8 }, // Dragon Tail
    e: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Dragon Blood
    r: { kind: "metamorphosis", value: [0, 0.6, 0.9, 1.2], cooldown: 60, duration: 12, form: { ranged: true, range: 340 } }, // Elder Dragon Form
  }, { kind: "cleave", value: 0.35, radius: 80 }),
  kunkka: hero("kunkka", 23, "kunkka", false, { maxHp: 700, armor: 4, damage: 28, regen: 2 }, {
    q: { kind: "meteor", value: [0, 120, 180, 240, 300], cooldown: 12, radius: 130, count: [0, 1, 1, 1, 1], duration: 1.6 }, // Torrent
    w: SIG,                                                                                              // Tidebringer
    e: { kind: "dash", value: [0, 50, 75, 100, 125], cooldown: 12, radius: 240 },                         // X Marks the Spot
    r: { kind: "line_burst", value: [0, 260, 390, 520], cooldown: 60, radius: 120, count: [0, 5, 5, 5], duration: 1.4 }, // Ghostship
  }, { kind: "cleave", value: 0.45, radius: 100 }),
  necrophos: hero("necrophos", 36, "necrolyte", true, { maxHp: 560, armor: 2, regen: 4, damage: 21, speed: 158 }, {
    q: { kind: "nova", value: [0, 60, 95, 130, 165], cooldown: 9, radius: 300, duration: 1.5 },           // Death Pulse
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 18, duration: 5 },                        // Ghost Shroud
    e: { kind: "presence", value: [0, 0.07, 0.1, 0.14, 0.17], cooldown: 0, radius: 260, passive: true }, // Heartstopper Aura
    r: { kind: "assassinate", value: [0, 450, 700, 950], cooldown: 55, radius: 340 },                    // Reaper's Scythe
  }, { kind: "aura_burn", value: 5, radius: 130 }),
  razor: hero("razor", 15, "razor", true, { maxHp: 560, armor: 3, damage: 22, speed: 170, attackInterval: 0.9 }, {
    q: { kind: "nova", value: [0, 80, 120, 160, 200], cooldown: 9, radius: 340, duration: 1.0 },          // Plasma Field
    w: { kind: "life_drain", value: [0, 18, 26, 34, 42], cooldown: 14, radius: 320, duration: 5 },        // Static Link
    e: { kind: "haste", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 20, duration: 8 },                   // Storm Surge
    r: { kind: "edict", value: [0, 60, 90, 120], cooldown: 50, duration: 12, radius: 320 },              // Eye of the Storm
  }, { kind: "swipes", value: 4, cap: 12 }),
  venomancer: hero("venomancer", 40, "venomancer", true, { maxHp: 520, armor: 2, damage: 20, speed: 160 }, {
    q: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 64, count: [0, 4, 4, 4, 4] }, // Venomous Gale
    w: { kind: "searing", value: [0, 8, 12, 16, 20], cooldown: 0, passive: true },                       // Poison Sting
    e: { kind: "damage_ward", value: [0, 24, 34, 44, 54], cooldown: 12, duration: 10, radius: 300, summon: { art: "ward_plague", count: 2 } }, // Plague Ward
    r: { kind: "nova", value: [0, 220, 340, 460], cooldown: 55, radius: 380, duration: 3 },              // Poison Nova
  }, { kind: "aura_burn", value: 9, radius: 160 }),
  witch_doctor: hero("witch_doctor", 30, "witch_doctor", true, { maxHp: 560, armor: 2, damage: 24, speed: 162 }, {
    q: { kind: "lightning_bolt", value: [0, 90, 135, 180, 225], cooldown: 6, radius: 320, duration: 1.2 }, // Paralyzing Cask
    w: { kind: "ward", value: [0, 12, 18, 24, 30], cooldown: 16, duration: 8 },                           // Voodoo Restoration
    e: { kind: "goo", value: [0, 80, 120, 160, 200], cooldown: 7, radius: 300, duration: 3 },             // Maledict
    r: { kind: "damage_ward", value: [0, 80, 120, 160], cooldown: 55, duration: 9, radius: 350, summon: { art: "ward_death" } }, // Death Ward
  }, { kind: "multicast", value: 0.28 }),
  luna: hero("luna", 48, "luna", true, { maxHp: 520, armor: 2, damage: 23, speed: 174, attackInterval: 0.85 }, {
    q: { kind: "lightning_bolt", value: [0, 80, 125, 170, 215], cooldown: 6, radius: 330, duration: 0.6 }, // Lucent Beam
    w: { kind: "multishot", value: [0, 30, 45, 60, 75], cooldown: 8, radius: 360, count: [0, 3, 4, 5, 6] }, // Moon Glaives
    e: { kind: "armor_passive", value: [0, 2, 3, 4, 5], cooldown: 0, passive: true },                    // Lunar Blessing
    r: { kind: "thundergod", value: [0, 120, 180, 240], cooldown: 60, radius: 420, count: [0, 6, 8, 10] }, // Eclipse
  }, { kind: "cleave", value: 0.45, radius: 90 }),
  // ---- Волна 3 ----
  earthshaker: hero("earthshaker", 7, "earthshaker", false, { maxHp: 700, armor: 4, damage: 26, regen: 2, speed: 160 }, {
    q: { kind: "line_burst", value: [0, 110, 160, 210, 260], cooldown: 8, radius: 64, count: [0, 4, 4, 4, 4], duration: 1.2 }, // Fissure
    w: { kind: "rage", value: [0, 0.8, 1.2, 1.6, 2.0], cooldown: 12, duration: 3 },                       // Enchant Totem
    e: SIG,                                                                                              // Aftershock
    r: { kind: "ravage", value: [0, 260, 390, 520], cooldown: 60, radius: 360, duration: 1.4 },          // Echo Slam
  }, { kind: "aftershock", value: 40, radius: 160 }),
  bloodseeker: hero("bloodseeker", 4, "bloodseeker", false, { maxHp: 720, armor: 4, damage: 28, speed: 182, attackInterval: 0.85, regen: 3 }, {
    q: { kind: "frenzy", value: [0, 0.25, 0.32, 0.39, 0.46], cooldown: 10, duration: 6 },                // Bloodrage
    w: { kind: "meteor", value: [0, 130, 190, 250, 310], cooldown: 10, radius: 150, count: [0, 1, 1, 1, 1], duration: 1.5 }, // Blood Rite
    e: SIG,                                                                                              // Thirst
    r: { kind: "rupture", value: [0, 40, 60, 80], cooldown: 45, radius: 340, duration: 9 },              // Rupture
  }, { kind: "thirst", value: 0.3, radius: 600 }),
  riki: hero("riki", 32, "riki", false, { maxHp: 560, armor: 3, damage: 24, speed: 182, attackInterval: 0.8 }, {
    q: { kind: "nova", value: [0, 60, 90, 120, 150], cooldown: 10, radius: 260, duration: 4 },           // Smoke Screen
    w: { kind: "dash", value: [0, 60, 90, 120, 150], cooldown: 8, radius: 300 },                          // Blink Strike
    e: { kind: "spin", value: [0, 70, 100, 130, 160], cooldown: 12, radius: 120, duration: 3 },          // Tricks of the Trade
    r: SIG,                                                                                              // Cloak and Dagger
  }, { kind: "backstab", value: 0.8 }),
  queen_of_pain: hero("queen_of_pain", 39, "queenofpain", true, { maxHp: 580, armor: 3, damage: 25, speed: 178 }, {
    q: { kind: "goo", value: [0, 80, 120, 160, 200], cooldown: 7, radius: 320, duration: 3 },             // Shadow Strike
    w: { kind: "dash", value: [0, 0, 0, 0, 0], cooldown: 9, radius: 300 },                                // Blink
    e: { kind: "nova", value: [0, 110, 160, 210, 260], cooldown: 5, radius: 300, duration: 0.8 },         // Scream of Pain
    r: { kind: "line_burst", value: [0, 260, 390, 520], cooldown: 60, radius: 110, count: [0, 5, 5, 5] }, // Sonic Wave
  }, { kind: "fiery_soul", value: 0.28, duration: 5 }),
  viper: hero("viper", 47, "viper", true, { maxHp: 640, armor: 3, damage: 24, speed: 158, regen: 2 }, {
    q: { kind: "searing", value: [0, 10, 15, 20, 25], cooldown: 0, passive: true },                      // Poison Attack
    w: { kind: "nova", value: [0, 90, 135, 180, 230], cooldown: 7, radius: 300, duration: 2.5 },          // Nethertoxin
    e: SIG,                                                                                              // Corrosive Skin
    r: { kind: "assassinate", value: [0, 380, 600, 820], cooldown: 50, radius: 340 },                    // Viper Strike
  }, { kind: "quill", value: 18, radius: 140 }),
  ogre_magi: hero("ogre_magi", 84, "ogre_magi", true, { maxHp: 760, armor: 6, damage: 24, speed: 160, range: 250, regen: 3 }, {
    q: { kind: "lightning_bolt", value: [0, 90, 140, 190, 240], cooldown: 7, radius: 320, duration: 1.4 }, // Fireblast
    w: { kind: "goo", value: [0, 90, 130, 170, 210], cooldown: 8, radius: 320, duration: 3 },             // Ignite
    e: { kind: "haste", value: [0, 0.08, 0.12, 0.16, 0.2], cooldown: 16, duration: 8 },                  // Bloodlust
    r: SIG,                                                                                              // Multicast
  }, { kind: "multicast", value: 0.25 }),
  huskar: hero("huskar", 59, "huskar", true, { maxHp: 700, armor: 2, damage: 24, regen: 4, speed: 164, range: 260 }, {
    q: { kind: "gust", value: [0, 80, 120, 160, 200], cooldown: 11, radius: 200, duration: 1.5 },        // Inner Fire
    w: { kind: "searing", value: [0, 10, 15, 20, 25], cooldown: 0, passive: true },                      // Burning Spear
    e: { kind: "berserk_blood", value: [0, 0.4, 0.5, 0.6, 0.7], cooldown: 0, passive: true },            // Berserker's Blood
    r: { kind: "dash", value: [0, 280, 420, 560], cooldown: 40, radius: 420 },                           // Life Break
  }, { kind: "thirst", value: 0.35, radius: 600 }),
  slardar: hero("slardar", 28, "slardar", false, { maxHp: 720, armor: 5, damage: 26, regen: 2, speed: 162 }, {
    q: { kind: "ravage", value: [0, 80, 125, 170, 215], cooldown: 11, radius: 200, duration: 1.2 },      // Slithereen Crush
    w: { kind: "haste", value: [0, 0.05, 0.08, 0.11, 0.14], cooldown: 14, duration: 7 },                 // Guardian Sprint
    e: SIG,                                                                                              // Bash of the Deep
    r: { kind: "corrosive", value: [0, 0.3, 0.45, 0.6], cooldown: 30, radius: 340, duration: 10 },       // Corrosive Haze
  }, { kind: "timelock", value: 0.18, duration: 0.5 }),
  // ---- Волна 4 ----
  tiny: hero("tiny", 19, "tiny", false, { maxHp: 800, armor: 3, damage: 30, speed: 150, regen: 2, attackInterval: 1.15 }, {
    q: { kind: "line_burst", value: [0, 110, 165, 220, 275], cooldown: 10, radius: 140, count: [0, 1, 1, 1, 1], duration: 1.2 }, // Avalanche
    w: { kind: "gust", value: [0, 90, 140, 190, 240], cooldown: 12, radius: 220, duration: 1.5 },        // Toss
    e: SIG,                                                                                              // Tree Grab
    r: { kind: "armor_passive", value: [0, 6, 9, 12], cooldown: 0, passive: true },                      // Grow
  }, { kind: "cleave", value: 0.5, radius: 95 }),
  spectre: hero("spectre", 67, "spectre", false, { maxHp: 680, armor: 5, damage: 27, speed: 172, regen: 2 }, {
    q: { kind: "goo", value: [0, 90, 135, 180, 225], cooldown: 7, radius: 320, duration: 3 },             // Spectral Dagger
    w: { kind: "crit", value: [0, 0.1, 0.14, 0.18, 0.22], cooldown: 0, passive: true },                  // Desolate
    e: SIG,                                                                                              // Dispersion
    r: { kind: "edict", value: [0, 80, 120, 160], cooldown: 50, duration: 8, radius: 420 },              // Haunt
  }, { kind: "quill", value: 14, radius: 160 }),
  chaos_knight: hero("chaos_knight", 81, "chaos_knight", false, { maxHp: 740, armor: 4, damage: 30, speed: 164, regen: 2 }, {
    q: { kind: "nova", value: [0, 85, 130, 175, 220], cooldown: 7, radius: 230, duration: 2.0 },         // Chaos Bolt
    w: { kind: "dash", value: [0, 60, 90, 120, 150], cooldown: 9, radius: 300 },                          // Reality Rift
    e: { kind: "crit", value: [0, 0.12, 0.16, 0.2, 0.24], cooldown: 0, passive: true },                  // Chaos Strike
    r: { kind: "damage_ward", value: [0, 52, 72, 92], cooldown: 40, duration: 14, radius: 320, summon: { art: "illusion", count: 3 } }, // Phantasm
  }, { kind: "crit", value: 0.2, cap: 2.4 }),
  night_stalker: hero("night_stalker", 60, "night_stalker", false, { maxHp: 800, armor: 5, damage: 29, speed: 178, regen: 3 }, {
    q: { kind: "goo", value: [0, 110, 160, 210, 260], cooldown: 7, radius: 320, duration: 3 },            // Void
    w: { kind: "nova", value: [0, 90, 135, 180, 225], cooldown: 8, radius: 320, duration: 3 },            // Crippling Fear
    e: { kind: "haste", value: [0, 0.08, 0.12, 0.16, 0.2], cooldown: 18, duration: 8 },                  // Hunter in the Night
    r: { kind: "frenzy", value: [0, 0.35, 0.42, 0.5], cooldown: 60, duration: 12 },                      // Dark Ascension
  }, { kind: "thirst", value: 0.2, radius: 460 }),
  doom: hero("doom", 69, "doom_bringer", false, { maxHp: 780, armor: 4, damage: 28, speed: 156, regen: 3 }, {
    q: { kind: "life_drain", value: [0, 20, 28, 36, 44], cooldown: 14, radius: 300, duration: 5 },        // Devour
    w: { kind: "remnant", value: [0, 90, 140, 190, 240], cooldown: 16, radius: 170 },                    // Scorched Earth
    e: { kind: "searing", value: [0, 12, 18, 24, 30], cooldown: 0, passive: true },                      // Infernal Blade
    r: { kind: "assassinate", value: [0, 420, 660, 900], cooldown: 60, radius: 340 },                    // Doom
  }, { kind: "deathpact", value: 7 }),
  legion_commander: hero("legion_commander", 104, "legion_commander", false, { maxHp: 620, armor: 3, damage: 24, speed: 164, regen: 2 }, {
    q: { kind: "nova", value: [0, 60, 100, 140, 180], cooldown: 9, radius: 300, duration: 1.0 },          // Overwhelming Odds
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 5 },                        // Press the Attack
    e: SIG,                                                                                              // Moment of Courage
    r: { kind: "assassinate", value: [0, 300, 470, 640], cooldown: 70, radius: 300 },                    // Duel
  }, { kind: "vampiric", value: 0.06 }),
  templar_assassin: hero("templar_assassin", 46, "templar_assassin", true, { maxHp: 560, armor: 3, damage: 26, speed: 168, range: 250 }, {
    q: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 15, duration: 6 },                        // Refraction
    w: { kind: "dash", value: [0, 100, 150, 200, 250], cooldown: 10, radius: 280 },                       // Meld
    e: SIG,                                                                                              // Psi Blades
    r: { kind: "damage_ward", value: [0, 60, 90, 120], cooldown: 45, duration: 10, radius: 320, summon: { art: "trap_psionic", count: 2 } }, // Psionic Trap
  }, { kind: "cleave", value: 0.5, radius: 120 }),
  medusa: hero("medusa", 94, "medusa", true, { maxHp: 560, armor: 3, damage: 22, speed: 158, range: 330 }, {
    q: { kind: "multishot", value: [0, 25, 35, 45, 55], cooldown: 7, radius: 360, count: [0, 3, 4, 5, 6] }, // Split Shot
    w: { kind: "arc_lightning", value: [0, 70, 105, 140, 175], cooldown: 8, radius: 320, count: [0, 3, 4, 5, 6] }, // Mystic Snake
    e: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Mana Shield
    r: { kind: "mass_freeze", value: [0, 200, 300, 400], cooldown: 60, radius: 400, duration: 2.5 },      // Stone Gaze
  }, { kind: "cleave", value: 0.4, radius: 95 }),
  // ---- Волна 5 ----
  silencer: hero("silencer", 75, "silencer", true, { maxHp: 540, armor: 2, damage: 24, speed: 162 }, {
    q: { kind: "nova", value: [0, 70, 110, 150, 190], cooldown: 8, radius: 320, duration: 3 },            // Arcane Curse
    w: { kind: "searing", value: [0, 10, 15, 20, 25], cooldown: 0, passive: true },                      // Glaives of Wisdom
    e: { kind: "lightning_bolt", value: [0, 90, 140, 190, 240], cooldown: 9, radius: 320, duration: 1.0 }, // Last Word
    r: { kind: "mass_freeze", value: [0, 0, 0, 0], cooldown: 60, radius: 600, duration: 2 },              // Global Silence
  }, { kind: "souls", value: 1.1, cap: 32 }),
  skywrath_mage: hero("skywrath_mage", 101, "skywrath_mage", true, { maxHp: 540, armor: 2, damage: 25, speed: 166, range: 340 }, {
    q: { kind: "arc_lightning", value: [0, 90, 135, 180, 225], cooldown: 4, radius: 340, count: [0, 3, 4, 4, 5] }, // Arcane Bolt
    w: { kind: "goo", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 340, duration: 3 },             // Concussive Shot
    e: { kind: "corrosive", value: [0, 0.2, 0.25, 0.3, 0.35], cooldown: 12, radius: 340, duration: 6 },  // Ancient Seal
    r: { kind: "line_burst", value: [0, 360, 540, 720], cooldown: 40, radius: 140, count: [0, 1, 1, 1], duration: 0.5 }, // Mystic Flare
  }, { kind: "multicast", value: 0.3 }),
  dazzle: hero("dazzle", 50, "dazzle", true, { maxHp: 640, armor: 4, damage: 27, speed: 164, regen: 3 }, {
    q: { kind: "line_burst", value: [0, 100, 150, 200, 250], cooldown: 6, radius: 85, count: [0, 3, 3, 3, 3] }, // Poison Touch
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 20, duration: 4 },                        // Shallow Grave
    e: { kind: "ward", value: [0, 12, 18, 24, 30], cooldown: 12, duration: 6 },                           // Shadow Wave
    r: { kind: "arcane_aura", value: [0, 0.1, 0.18, 0.25], cooldown: 0, passive: true },                 // Bad Juju
  }, { kind: "vampiric", value: 0.08 }),
  jakiro: hero("jakiro", 64, "jakiro", true, { maxHp: 660, armor: 3, damage: 24, speed: 158 }, {
    q: { kind: "line_burst", value: [0, 130, 190, 250, 300], cooldown: 6, radius: 78, count: [0, 3, 3, 3, 3] }, // Dual Breath
    w: { kind: "line_burst", value: [0, 70, 105, 140, 180], cooldown: 10, radius: 56, count: [0, 4, 4, 4, 4], duration: 1.5 }, // Ice Path
    e: { kind: "searing", value: [0, 10, 15, 20, 25], cooldown: 0, passive: true },                      // Liquid Fire
    r: { kind: "damage_ward", value: [0, 90, 135, 180], cooldown: 60, duration: 10, radius: 320 },        // Macropyre
  }, { kind: "cleave", value: 0.45, radius: 95 }),
  shadow_shaman: hero("shadow_shaman", 27, "shadow_shaman", true, { maxHp: 540, armor: 2, damage: 24, speed: 160 }, {
    q: { kind: "line_burst", value: [0, 100, 145, 190, 240], cooldown: 7, radius: 70, count: [0, 3, 3, 3, 3] }, // Ether Shock
    w: { kind: "frostbite", value: [0, 40, 60, 80, 100], cooldown: 12, radius: 320, duration: 2.5 },       // Hex
    e: { kind: "life_drain", value: [0, 20, 28, 36, 44], cooldown: 12, radius: 300, duration: 4 },        // Shackles
    r: { kind: "damage_ward", value: [0, 70, 105, 140], cooldown: 60, duration: 10, radius: 340, summon: { art: "ward_serpent", count: 3 } }, // Mass Serpent Ward
  }, { kind: "multicast", value: 0.28 }),
  warlock: hero("warlock", 37, "warlock", true, { maxHp: 640, armor: 3, damage: 25, speed: 160, regen: 2 }, {
    q: { kind: "nova", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 340, duration: 1 },            // Fatal Bonds
    w: { kind: "ward", value: [0, 10, 15, 20, 24], cooldown: 14, duration: 8 },                           // Shadow Word
    e: { kind: "nova", value: [0, 70, 105, 140, 170], cooldown: 12, radius: 300, duration: 4 },            // Upheaval
    r: { kind: "damage_ward", value: [0, 95, 140, 185], cooldown: 60, duration: 16, radius: 340, summon: { art: "warlock_golem" } }, // Rain of Chaos
  }, { kind: "deathpact", value: 7 }),
  enigma: hero("enigma", 33, "enigma", true, { maxHp: 620, armor: 3, damage: 25, speed: 160 }, {
    q: { kind: "lightning_bolt", value: [0, 110, 160, 210, 260], cooldown: 7, radius: 320, duration: 1.6 }, // Malefice
    w: { kind: "multishot", value: [0, 45, 58, 72, 85], cooldown: 7, radius: 360, count: [0, 3, 4, 5, 6] }, // Demonic Conversion
    e: { kind: "remnant", value: [0, 140, 200, 260, 320], cooldown: 12, radius: 200 },                   // Midnight Pulse
    r: { kind: "ravage", value: [0, 240, 360, 480], cooldown: 70, radius: 320, duration: 3 },            // Black Hole
  }, { kind: "cleave", value: 0.45, radius: 100 }),
  tinker: hero("tinker", 34, "tinker", true, { maxHp: 660, armor: 4, damage: 25, speed: 164, range: 320, regen: 2 }, {
    q: { kind: "lightning_bolt", value: [0, 130, 195, 260, 320], cooldown: 6, radius: 320, duration: 0.5 }, // Laser
    w: { kind: "arc_lightning", value: [0, 110, 160, 210, 260], cooldown: 7, radius: 340, count: [0, 2, 3, 4, 5] }, // Heat-Seeking Missile
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 6 },                        // Defense Matrix
    r: SIG,                                                                                              // Rearm
  }, { kind: "multicast", value: 0.4 }),
  // ---- Волна 6 ----
  omniknight: hero("omniknight", 57, "omniknight", false, { maxHp: 760, armor: 5, damage: 26, speed: 158, regen: 3 }, {
    q: { kind: "ward", value: [0, 14, 20, 26, 32], cooldown: 10, duration: 6 },                            // Purification
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 6 },                        // Heavenly Grace
    e: { kind: "searing", value: [0, 10, 15, 20, 25], cooldown: 0, passive: true },                      // Hammer of Purity
    r: { kind: "death_pact", value: [0, 0.6, 0.8, 1.0], cooldown: 60, duration: 8 },                      // Guardian Angel
  }, { kind: "tough", value: 5 }),
  abaddon: hero("abaddon", 102, "abaddon", false, { maxHp: 820, armor: 5, damage: 28, speed: 162, regen: 3 }, {
    q: { kind: "lightning_bolt", value: [0, 110, 165, 220, 270], cooldown: 5, radius: 300, duration: 0.3 }, // Mist Coil
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 12, duration: 5 },                        // Aphotic Shield
    e: { kind: "frost_arrows", value: [0, 0.1, 0.14, 0.18, 0.22], cooldown: 0, passive: true },          // Curse of Avernus
    r: { kind: "reincarnation", value: [0, 0.5, 0.7, 0.9], cooldown: 120, passive: true },               // Borrowed Time
  }, { kind: "vampiric", value: 0.1 }),
  beastmaster: hero("beastmaster", 38, "beastmaster", false, { maxHp: 700, armor: 4, damage: 28, speed: 164, regen: 2 }, {
    q: { kind: "line_burst", value: [0, 80, 125, 170, 215], cooldown: 8, radius: 64, count: [0, 3, 3, 3, 3] }, // Wild Axes
    w: { kind: "damage_ward", value: [0, 20, 28, 36, 44], cooldown: 14, duration: 12, radius: 300, summon: { art: "hellbear" } },     // Call of the Wild Boar
    e: { kind: "frenzy", value: [0, 0.2, 0.25, 0.3, 0.35], cooldown: 14, duration: 8 },                  // Inner Beast
    r: { kind: "ravage", value: [0, 200, 300, 400], cooldown: 60, radius: 260, duration: 2 },            // Primal Roar
  }, { kind: "cleave", value: 0.45, radius: 90 }),
  brewmaster: hero("brewmaster", 78, "brewmaster", false, { maxHp: 740, armor: 4, damage: 27, speed: 160, regen: 3 }, {
    q: { kind: "ravage", value: [0, 90, 135, 180, 230], cooldown: 10, radius: 240, duration: 1.0 },       // Thunder Clap
    w: { kind: "nova", value: [0, 60, 95, 130, 165], cooldown: 10, radius: 300, duration: 3 },            // Cinder Brew
    e: SIG,                                                                                              // Drunken Brawler
    r: { kind: "rage", value: [0, 0.8, 1.1, 1.4], cooldown: 70, duration: 12 },                          // Primal Split
  }, { kind: "blur", value: 0.2 }),
  centaur: hero("centaur", 96, "centaur", false, { maxHp: 840, armor: 4, damage: 28, speed: 158, regen: 3 }, {
    q: { kind: "ravage", value: [0, 100, 150, 200, 250], cooldown: 9, radius: 220, duration: 1.5 },       // Hoof Stomp
    w: { kind: "lightning_bolt", value: [0, 150, 220, 290, 360], cooldown: 5, radius: 180, duration: 0.2 }, // Double Edge
    e: SIG,                                                                                              // Retaliate
    r: { kind: "haste", value: [0, 0.1, 0.15, 0.2], cooldown: 50, duration: 6 },                          // Stampede
  }, { kind: "quill", value: 16, radius: 160 }),
  dark_seer: hero("dark_seer", 55, "dark_seer", false, { maxHp: 700, armor: 4, damage: 26, speed: 162, regen: 2 }, {
    q: { kind: "nova", value: [0, 70, 110, 150, 190], cooldown: 10, radius: 300, duration: 2 },           // Vacuum
    w: { kind: "edict", value: [0, 40, 60, 80, 100], cooldown: 14, duration: 8, radius: 260 },            // Ion Shell
    e: { kind: "haste", value: [0, 0.08, 0.12, 0.16, 0.2], cooldown: 12, duration: 6 },                  // Surge
    r: { kind: "line_burst", value: [0, 200, 300, 400], cooldown: 60, radius: 120, count: [0, 3, 3, 3], duration: 1.0 }, // Wall of Replica
  }, { kind: "aftershock", value: 36, radius: 160 }),
  death_prophet: hero("death_prophet", 43, "death_prophet", true, { maxHp: 560, armor: 2, damage: 24, speed: 164 }, {
    q: { kind: "line_burst", value: [0, 90, 135, 180, 230], cooldown: 7, radius: 70, count: [0, 3, 3, 3, 3] }, // Crypt Swarm
    w: { kind: "nova", value: [0, 40, 65, 90, 115], cooldown: 12, radius: 320, duration: 3 },             // Silence
    e: { kind: "life_drain", value: [0, 20, 28, 36, 44], cooldown: 12, radius: 320, duration: 5 },        // Spirit Siphon
    r: { kind: "edict", value: [0, 60, 90, 120], cooldown: 70, duration: 12, radius: 380 },              // Exorcism
  }, { kind: "aura_burn", value: 9, radius: 150 }),
  disruptor: hero("disruptor", 87, "disruptor", true, { maxHp: 600, armor: 3, damage: 24, speed: 162 }, {
    q: { kind: "lightning_bolt", value: [0, 100, 150, 200, 250], cooldown: 5, radius: 320, duration: 0.5 }, // Thunder Strike
    w: { kind: "goo", value: [0, 60, 95, 130, 165], cooldown: 9, radius: 340, duration: 3 },              // Glimpse
    e: { kind: "mass_freeze", value: [0, 0, 0, 0, 0], cooldown: 16, radius: 200, duration: 2 },           // Kinetic Field
    r: { kind: "nova", value: [0, 260, 390, 520], cooldown: 60, radius: 320, duration: 3 },              // Static Storm
  }, { kind: "timelock", value: 0.16, duration: 0.5 }),
  // ---- Волна 7 ----
  lycan: hero("lycan", 77, "lycan", false, { maxHp: 720, armor: 4, damage: 28, speed: 168, regen: 2 }, {
    q: { kind: "damage_ward", value: [0, 20, 28, 36, 44], cooldown: 14, duration: 12, radius: 300, summon: { art: "wolf", count: 2 } },     // Summon Wolves
    w: { kind: "rage", value: [0, 0.4, 0.55, 0.7, 0.85], cooldown: 12, duration: 6 },                    // Howl
    e: { kind: "crit", value: [0, 0.1, 0.14, 0.18, 0.22], cooldown: 0, passive: true },                  // Feral Impulse
    r: { kind: "frenzy", value: [0, 0.35, 0.42, 0.5], cooldown: 60, duration: 12 },                      // Shapeshift
  }, { kind: "vampiric", value: 0.12 }),
  lone_druid: hero("lone_druid", 80, "lone_druid", true, { maxHp: 660, armor: 4, damage: 27, speed: 164, range: 340 }, {
    q: { kind: "damage_ward", value: [0, 45, 58, 72, 85], cooldown: 18, duration: 15, radius: 320, summon: { art: "bear" } },     // Summon Spirit Bear
    w: SIG,                                                                                              // Spirit Link
    e: { kind: "gust", value: [0, 70, 105, 140, 170], cooldown: 11, radius: 260, duration: 1.5 },         // Savage Roar
    r: { kind: "metamorphosis", value: [0, 0.6, 0.8, 1.0], cooldown: 60, duration: 15, form: { ranged: false, range: 150 } }, // True Form
  }, { kind: "vampiric", value: 0.12 }),
  alchemist: hero("alchemist", 73, "alchemist", false, { maxHp: 720, armor: 4, damage: 26, speed: 160, regen: 3 }, {
    q: { kind: "nova", value: [0, 60, 95, 130, 165], cooldown: 12, radius: 300, duration: 4 },            // Acid Spray
    w: { kind: "lightning_bolt", value: [0, 90, 135, 180, 230], cooldown: 10, radius: 300, duration: 1.8 }, // Unstable Concoction
    e: { kind: "frost_arrows", value: [0, 0.1, 0.14, 0.18, 0.22], cooldown: 0, passive: true },          // Corrosive Weaponry
    r: { kind: "frenzy", value: [0, 0.35, 0.42, 0.5], cooldown: 60, duration: 15 },                      // Chemical Rage
  }, { kind: "souls", value: 1.2, cap: 34 }),
  bane: hero("bane", 3, "bane", true, { maxHp: 620, armor: 3, damage: 25, speed: 162 }, {
    q: { kind: "nova", value: [0, 90, 135, 180, 225], cooldown: 7, radius: 240, duration: 2 },            // Enfeeble
    w: { kind: "life_drain", value: [0, 34, 46, 58, 70], cooldown: 8, radius: 320, duration: 3 },         // Brain Sap
    e: { kind: "frostbite", value: [0, 60, 90, 120, 150], cooldown: 12, radius: 320, duration: 3 },       // Nightmare
    r: { kind: "assassinate", value: [0, 380, 590, 800], cooldown: 60, radius: 340 },                    // Fiend's Grip
  }, { kind: "blur", value: 0.2 }),
  batrider: hero("batrider", 65, "batrider", true, { maxHp: 640, armor: 3, damage: 24, speed: 168, range: 300 }, {
    q: { kind: "goo", value: [0, 80, 120, 160, 200], cooldown: 5, radius: 320, duration: 4 },             // Sticky Napalm
    w: { kind: "gust", value: [0, 110, 160, 210, 260], cooldown: 10, radius: 240, duration: 2 },         // Flamebreak
    e: { kind: "haste", value: [0, 0.08, 0.12, 0.16, 0.2], cooldown: 16, duration: 8 },                  // Firefly
    r: { kind: "frostbite", value: [0, 150, 250, 350], cooldown: 60, radius: 340, duration: 3 },          // Flaming Lasso
  }, { kind: "swipes", value: 4, cap: 12 }),
  bounty_hunter: hero("bounty_hunter", 62, "bounty_hunter", false, { maxHp: 660, armor: 4, damage: 27, speed: 178, attackInterval: 0.85 }, {
    q: { kind: "arc_lightning", value: [0, 120, 175, 230, 290], cooldown: 7, radius: 320, count: [0, 2, 3, 3, 4] }, // Shuriken Toss
    w: { kind: "crit", value: [0, 0.14, 0.18, 0.22, 0.26], cooldown: 0, passive: true },                 // Jinada
    e: { kind: "dash", value: [0, 110, 160, 210, 260], cooldown: 11, radius: 280 },                       // Shadow Walk
    r: { kind: "corrosive", value: [0, 0.25, 0.32, 0.4], cooldown: 20, radius: 340, duration: 10 },      // Track
  }, { kind: "backstab", value: 0.5 }),
  broodmother: hero("broodmother", 61, "broodmother", false, { maxHp: 600, armor: 3, damage: 24, speed: 170 }, {
    q: { kind: "damage_ward", value: [0, 20, 28, 36, 44], cooldown: 12, duration: 12, radius: 300, summon: { art: "spiderling", count: 3 } }, // Spawn Spiderlings
    w: { kind: "haste", value: [0, 0.08, 0.12, 0.16, 0.2], cooldown: 14, duration: 8 },                  // Spin Web
    e: { kind: "frost_arrows", value: [0, 0.15, 0.2, 0.25, 0.3], cooldown: 0, passive: true },           // Incapacitating Bite
    r: { kind: "rage", value: [0, 0.5, 0.7, 0.9], cooldown: 50, duration: 10 },                           // Insatiable Hunger
  }, { kind: "vampiric", value: 0.07 }),
  clockwerk: hero("clockwerk", 51, "rattletrap", false, { maxHp: 740, armor: 5, damage: 26, speed: 160, regen: 2 }, {
    q: { kind: "edict", value: [0, 40, 60, 80, 100], cooldown: 14, duration: 8, radius: 200 },            // Battery Assault
    w: { kind: "mass_freeze", value: [0, 0, 0, 0, 0], cooldown: 15, radius: 180, duration: 2 },           // Power Cogs
    e: { kind: "line_burst", value: [0, 60, 95, 130, 165], cooldown: 8, radius: 60, count: [0, 4, 4, 4, 4] }, // Rocket Flare
    r: { kind: "dash", value: [0, 150, 250, 350], cooldown: 40, radius: 500 },                           // Hookshot
  }, { kind: "timelock", value: 0.16, duration: 0.5 }),
  // ---- Волна 8 ----
  earth_spirit: hero("earth_spirit", 107, "earth_spirit", false, { maxHp: 780, armor: 5, damage: 28, speed: 166, regen: 3 }, {
    q: { kind: "lightning_bolt", value: [0, 120, 175, 230, 290], cooldown: 7, radius: 320, duration: 1.2 }, // Boulder Smash
    w: { kind: "dash", value: [0, 80, 120, 160, 200], cooldown: 9, radius: 300 },                         // Rolling Boulder
    e: { kind: "goo", value: [0, 90, 135, 180, 225], cooldown: 9, radius: 340, duration: 3 },             // Geomagnetic Grip
    r: { kind: "edict", value: [0, 80, 120, 160], cooldown: 60, duration: 8, radius: 300 },              // Magnetize
  }, { kind: "aftershock", value: 34, radius: 160 }),
  elder_titan: hero("elder_titan", 103, "elder_titan", false, { maxHp: 820, armor: 5, damage: 29, speed: 158, regen: 3 }, {
    q: { kind: "ravage", value: [0, 110, 160, 210, 260], cooldown: 11, radius: 260, duration: 2 },        // Echo Stomp
    w: { kind: "line_burst", value: [0, 100, 145, 190, 240], cooldown: 8, radius: 74, count: [0, 3, 3, 3, 3] }, // Astral Spirit
    e: { kind: "corrosive", value: [0, 0.2, 0.25, 0.3, 0.35], cooldown: 12, radius: 320, duration: 8 },  // Natural Order
    r: { kind: "line_burst", value: [0, 260, 390, 520], cooldown: 60, radius: 90, count: [0, 5, 5, 5], duration: 1.0 }, // Earth Splitter
  }, { kind: "cleave", value: 0.45, radius: 100 }),
  ember_spirit: hero("ember_spirit", 106, "ember_spirit", false, { maxHp: 620, armor: 3, damage: 26, speed: 176, attackInterval: 0.85 }, {
    q: { kind: "nova", value: [0, 60, 95, 130, 165], cooldown: 9, radius: 260, duration: 2 },             // Searing Chains
    w: { kind: "spin", value: [0, 60, 90, 120, 150], cooldown: 8, radius: 220, duration: 1.5 },          // Sleight of Fist
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 6 },                        // Flame Guard
    r: { kind: "dash", value: [0, 150, 250, 350], cooldown: 40, radius: 500 },                           // Fire Remnant
  }, { kind: "fiery_soul", value: 0.3, duration: 6 }),
  grimstroke: hero("grimstroke", 121, "grimstroke", true, { maxHp: 620, armor: 3, damage: 25, speed: 164 }, {
    q: { kind: "line_burst", value: [0, 120, 175, 230, 290], cooldown: 7, radius: 64, count: [0, 4, 4, 4, 4] }, // Stroke of Fate
    w: { kind: "life_drain", value: [0, 30, 40, 50, 60], cooldown: 12, radius: 320, duration: 4 },        // Phantom's Embrace
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 5 },                        // Ink Swell
    r: { kind: "mass_freeze", value: [0, 220, 330, 440], cooldown: 60, radius: 260, duration: 2.5 },      // Soulbind
  }, { kind: "multicast", value: 0.28 }),
  gyrocopter: hero("gyrocopter", 72, "gyrocopter", true, { maxHp: 620, armor: 3, damage: 25, speed: 166 }, {
    q: { kind: "edict", value: [0, 50, 70, 90, 110], cooldown: 10, duration: 5, radius: 260 },            // Rocket Barrage
    w: { kind: "lightning_bolt", value: [0, 130, 195, 260, 320], cooldown: 10, radius: 340, duration: 1.5 }, // Homing Missile
    e: { kind: "multishot", value: [0, 45, 60, 78, 95], cooldown: 8, radius: 360, count: [0, 3, 4, 5, 6] }, // Flak Cannon
    r: { kind: "meteor", value: [0, 250, 375, 500], cooldown: 60, radius: 220, count: [0, 1, 1, 1], duration: 1.2 }, // Call Down
  }, { kind: "cleave", value: 0.4, radius: 95 }),
  keeper_of_the_light: hero("keeper_of_the_light", 90, "keeper_of_the_light", true, { maxHp: 600, armor: 3, damage: 24, speed: 168, range: 340 }, {
    q: { kind: "line_burst", value: [0, 130, 190, 250, 300], cooldown: 8, radius: 84, count: [0, 5, 5, 5, 5] }, // Illuminate
    w: { kind: "gust", value: [0, 90, 135, 180, 225], cooldown: 11, radius: 260, duration: 1.5 },         // Blinding Light
    e: { kind: "arcane_aura", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 0, passive: true },            // Chakra Magic
    r: { kind: "mass_freeze", value: [0, 220, 330, 440], cooldown: 60, radius: 320, duration: 2.5 },      // Will-O-Wisp
  }, { kind: "multicast", value: 0.3 }),
  magnus: hero("magnus", 97, "magnataur", false, { maxHp: 820, armor: 5, damage: 30, speed: 162, regen: 3 }, {
    q: { kind: "line_burst", value: [0, 100, 145, 190, 240], cooldown: 8, radius: 70, count: [0, 4, 4, 4, 4] }, // Shockwave
    w: { kind: "rage", value: [0, 0.4, 0.5, 0.6, 0.75], cooldown: 14, duration: 8 },                     // Empower
    e: { kind: "dash", value: [0, 110, 160, 210, 260], cooldown: 11, radius: 320 },                       // Skewer
    r: { kind: "ravage", value: [0, 200, 300, 400], cooldown: 70, radius: 260, duration: 2.5 },          // Reverse Polarity
  }, { kind: "cleave", value: 0.4, radius: 90 }),
  mars: hero("mars", 129, "mars", false, { maxHp: 780, armor: 5, damage: 28, speed: 160, regen: 3 }, {
    q: { kind: "lightning_bolt", value: [0, 130, 195, 260, 320], cooldown: 7, radius: 320, duration: 1.5 }, // Spear of Mars
    w: { kind: "gust", value: [0, 120, 175, 230, 290], cooldown: 10, radius: 220, duration: 1.0 },       // God's Rebuke
    e: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Bulwark
    r: { kind: "ravage", value: [0, 240, 360, 480], cooldown: 60, radius: 300, duration: 1.5 },          // Arena of Blood
  }, { kind: "tough", value: 7 }),
  // ---- Волна 9 ----
  morphling: hero("morphling", 10, "morphling", true, { maxHp: 580, armor: 3, damage: 25, speed: 168, range: 340 }, {
    q: { kind: "dash", value: [0, 100, 150, 200, 250], cooldown: 9, radius: 400 },                        // Waveform
    w: { kind: "lightning_bolt", value: [0, 100, 155, 210, 260], cooldown: 8, radius: 340, duration: 1.2 }, // Adaptive Strike
    e: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Attribute Shift
    r: { kind: "rage", value: [0, 0.6, 0.8, 1.0], cooldown: 60, duration: 10 },                          // Morph
  }, { kind: "blur", value: 0.2 }),
  naga_siren: hero("naga_siren", 89, "naga_siren", false, { maxHp: 680, armor: 4, damage: 26, speed: 170, attackInterval: 0.9 }, {
    q: { kind: "damage_ward", value: [0, 25, 35, 45, 55], cooldown: 14, duration: 12, radius: 300, summon: { art: "illusion", count: 3 } },     // Mirror Image
    w: { kind: "frostbite", value: [0, 40, 60, 80, 100], cooldown: 10, radius: 320, duration: 2.5 },      // Ensnare
    e: { kind: "nova", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 260, duration: 2 },            // Rip Tide
    r: { kind: "mass_freeze", value: [0, 0, 0, 0], cooldown: 70, radius: 400, duration: 3 },              // Song of the Siren
  }, { kind: "crit", value: 0.18, cap: 2 }),
  natures_prophet: hero("natures_prophet", 53, "furion", true, { maxHp: 560, armor: 2, damage: 25, speed: 164, range: 340 }, {
    q: { kind: "mass_freeze", value: [0, 60, 90, 120, 150], cooldown: 10, radius: 190, duration: 2 },     // Sprout
    w: { kind: "dash", value: [0, 0, 0, 0, 0], cooldown: 14, radius: 400 },                               // Teleportation
    e: { kind: "damage_ward", value: [0, 34, 48, 62, 76], cooldown: 14, duration: 15, radius: 320, summon: { art: "treant", count: 3 } },     // Nature's Call
    r: { kind: "arc_lightning", value: [0, 120, 190, 260], cooldown: 36, radius: 400, count: [0, 6, 8, 10] }, // Wrath of Nature
  }, { kind: "multicast", value: 0.28 }),
  nyx_assassin: hero("nyx_assassin", 88, "nyx_assassin", false, { maxHp: 640, armor: 4, damage: 26, speed: 174 }, {
    q: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 9, radius: 60, count: [0, 3, 3, 3, 3], duration: 1.5 }, // Impale
    w: { kind: "lightning_bolt", value: [0, 90, 135, 180, 230], cooldown: 7, radius: 320, duration: 0.2 }, // Mana Burn
    e: SIG,                                                                                              // Spiked Carapace
    r: { kind: "dash", value: [0, 200, 310, 420], cooldown: 45, radius: 500 },                           // Vendetta
  }, { kind: "quill", value: 18, radius: 160 }),
  oracle: hero("oracle", 111, "oracle", true, { maxHp: 560, armor: 2, damage: 23, speed: 162 }, {
    q: { kind: "nova", value: [0, 70, 105, 140, 180], cooldown: 8, radius: 250, duration: 1.6 },          // Fortune's End
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 12, duration: 4 },                        // Fate's Edict
    e: { kind: "ward", value: [0, 14, 20, 26, 32], cooldown: 10, duration: 6 },                            // Purifying Flames
    r: { kind: "death_pact", value: [0, 0.5, 0.7, 0.9], cooldown: 60, duration: 8 },                      // False Promise
  }, { kind: "vampiric", value: 0.09 }),
  outworld_destroyer: hero("outworld_destroyer", 76, "obsidian_destroyer", true, { maxHp: 640, armor: 3, damage: 28, speed: 162, range: 340 }, {
    q: { kind: "lightning_bolt", value: [0, 100, 150, 200, 250], cooldown: 4, radius: 340, duration: 0.3 }, // Arcane Orb (активный: с двумя пассивками бот умирал на 2-й минуте)
    w: { kind: "frostbite", value: [0, 110, 160, 210, 260], cooldown: 8, radius: 340, duration: 2.5 },    // Astral Imprisonment
    e: { kind: "arcane_aura", value: [0, 0.08, 0.12, 0.16, 0.2], cooldown: 0, passive: true },           // Essence Flux
    r: { kind: "nova", value: [0, 300, 450, 600], cooldown: 60, radius: 340, duration: 1 },              // Sanity's Eclipse
  }, { kind: "overload", value: 44, radius: 85 }),
  pangolier: hero("pangolier", 120, "pangolier", false, { maxHp: 660, armor: 4, damage: 26, speed: 172 }, {
    q: { kind: "line_burst", value: [0, 70, 105, 140, 170], cooldown: 7, radius: 60, count: [0, 3, 3, 3, 3] }, // Swashbuckle
    w: { kind: "ravage", value: [0, 80, 120, 160, 200], cooldown: 10, radius: 220, duration: 1 },         // Shield Crash
    e: { kind: "crit", value: [0, 0.12, 0.16, 0.2, 0.24], cooldown: 0, passive: true },                  // Lucky Shot
    r: { kind: "spin", value: [0, 60, 100, 150], cooldown: 50, radius: 200, duration: 4 },                // Rolling Thunder
  }, { kind: "timelock", value: 0.16, duration: 0.5 }),
  phoenix: hero("phoenix", 110, "phoenix", true, { maxHp: 620, armor: 2, damage: 24, speed: 164, regen: 3 }, {
    q: { kind: "dash", value: [0, 80, 120, 160, 200], cooldown: 10, radius: 400 },                        // Icarus Dive
    w: { kind: "multishot", value: [0, 40, 55, 70, 90], cooldown: 9, radius: 340, count: [0, 3, 4, 5, 6] }, // Fire Spirits
    e: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 10, radius: 60, count: [0, 5, 5, 5, 5] }, // Sun Ray
    r: { kind: "reincarnation", value: [0, 0.5, 0.7, 0.9], cooldown: 120, passive: true },               // Supernova
  }, { kind: "aura_burn", value: 11, radius: 140 }),
  // ---- Волна 10 ----
  puck: hero("puck", 13, "puck", true, { maxHp: 600, armor: 3, damage: 25, speed: 172 }, {
    q: { kind: "line_burst", value: [0, 110, 160, 210, 260], cooldown: 7, radius: 64, count: [0, 4, 4, 4, 4] }, // Illusory Orb
    w: { kind: "nova", value: [0, 100, 145, 190, 240], cooldown: 9, radius: 280, duration: 2 },           // Waning Rift
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 8, duration: 3 },                          // Phase Shift
    r: { kind: "ravage", value: [0, 150, 225, 300], cooldown: 60, radius: 300, duration: 2.5 },          // Dream Coil
  }, { kind: "blur", value: 0.2 }),
  pudge: hero("pudge", 14, "pudge", false, { maxHp: 880, armor: 4, damage: 31, speed: 154, regen: 4 }, {
    q: { kind: "dash", value: [0, 120, 180, 240, 300], cooldown: 10, radius: 500 },                       // Meat Hook
    w: { kind: "edict", value: [0, 40, 57, 74, 90], cooldown: 10, duration: 6, radius: 220 },             // Rot
    e: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Flesh Heap
    r: { kind: "assassinate", value: [0, 300, 460, 620], cooldown: 40, radius: 200 },                    // Dismember
  }, { kind: "growth", value: 4, cap: 420 }),
  rubick: hero("rubick", 86, "rubick", true, { maxHp: 620, armor: 3, damage: 26, speed: 166 }, {
    q: { kind: "nova", value: [0, 90, 135, 180, 225], cooldown: 9, radius: 240, duration: 2 },            // Telekinesis
    w: { kind: "arc_lightning", value: [0, 120, 175, 230, 290], cooldown: 6, radius: 340, count: [0, 3, 4, 5, 6] }, // Fade Bolt
    e: { kind: "arcane_aura", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 0, passive: true },            // Arcane Supremacy
    r: SIG,                                                                                              // Spell Steal
  }, { kind: "multicast", value: 0.3 }),
  sand_king: hero("sand_king", 16, "sand_king", false, { maxHp: 800, armor: 5, damage: 28, speed: 162, regen: 3 }, {
    q: { kind: "line_burst", value: [0, 120, 175, 230, 290], cooldown: 8, radius: 64, count: [0, 4, 4, 4, 4], duration: 1.6 }, // Burrowstrike
    w: { kind: "edict", value: [0, 60, 85, 110, 135], cooldown: 12, duration: 6, radius: 260 },           // Sand Storm
    e: { kind: "searing", value: [0, 12, 18, 24, 30], cooldown: 0, passive: true },                      // Caustic Finale
    r: { kind: "nova", value: [0, 240, 360, 480], cooldown: 70, radius: 340, duration: 3 },              // Epicenter
  }, { kind: "aftershock", value: 34, radius: 160 }),
  shadow_demon: hero("shadow_demon", 79, "shadow_demon", true, { maxHp: 560, armor: 2, damage: 24, speed: 162 }, {
    q: { kind: "line_burst", value: [0, 70, 105, 140, 170], cooldown: 6, radius: 60, count: [0, 4, 4, 4, 4] }, // Shadow Poison
    w: { kind: "corrosive", value: [0, 0.2, 0.25, 0.3, 0.35], cooldown: 12, radius: 320, duration: 8 },  // Disseminate
    e: { kind: "frostbite", value: [0, 60, 90, 120, 150], cooldown: 10, radius: 320, duration: 2.5 },     // Disruption
    r: { kind: "goo", value: [0, 200, 310, 420], cooldown: 50, radius: 340, duration: 5 },               // Demonic Purge
  }, { kind: "swipes", value: 4, cap: 12 }),
  slark: hero("slark", 93, "slark", false, { maxHp: 540, armor: 3, damage: 23, speed: 174, attackInterval: 0.9 }, {
    q: { kind: "nova", value: [0, 50, 80, 110, 140], cooldown: 10, radius: 200, duration: 1 },            // Dark Pact
    w: { kind: "dash", value: [0, 70, 105, 140, 180], cooldown: 12, radius: 320 },                        // Pounce
    e: SIG,                                                                                              // Essence Shift
    r: { kind: "death_pact", value: [0, 0.5, 0.7, 0.9], cooldown: 55, duration: 6 },                      // Shadow Dance
  }, { kind: "vampiric", value: 0.05 }),
  snapfire: hero("snapfire", 128, "snapfire", true, { maxHp: 680, armor: 4, damage: 26, speed: 162, range: 300 }, {
    q: { kind: "multishot", value: [0, 55, 72, 90, 110], cooldown: 7, radius: 300, count: [0, 4, 5, 6, 7] }, // Scatterblast
    w: { kind: "dash", value: [0, 60, 90, 120, 150], cooldown: 10, radius: 300 },                         // Firesnap Cookie
    e: { kind: "frenzy", value: [0, 0.3, 0.35, 0.4, 0.45], cooldown: 14, duration: 6 },                  // Lil' Shredder
    r: { kind: "meteor", value: [0, 200, 300, 400], cooldown: 55, radius: 130, count: [0, 3, 3, 3], duration: 1.0 }, // Mortimer Kisses
  }, { kind: "overload", value: 42, radius: 90 }),
  spirit_breaker: hero("spirit_breaker", 71, "spirit_breaker", false, { maxHp: 840, armor: 5, damage: 30, speed: 166, regen: 3 }, {
    q: { kind: "dash", value: [0, 150, 220, 290, 360], cooldown: 12, radius: 600 },                       // Charge of Darkness
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 16, duration: 6 },                        // Bulldoze
    e: SIG,                                                                                              // Greater Bash
    r: { kind: "lightning_bolt", value: [0, 250, 375, 500], cooldown: 45, radius: 400, duration: 1.5 },   // Nether Strike
  }, { kind: "timelock", value: 0.2, duration: 0.6 }),
  // ---- Волна 11 ----
  techies: hero("techies", 105, "techies", true, { maxHp: 660, armor: 3, damage: 25, speed: 160, range: 320 }, {
    q: { kind: "meteor", value: [0, 140, 200, 260, 320], cooldown: 7, radius: 150, count: [0, 1, 1, 1, 1], duration: 1.2 }, // Sticky Bomb
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 5 },                        // Reactive Tazer
    e: { kind: "dash", value: [0, 150, 210, 270, 350], cooldown: 14, radius: 320 },                       // Blast Off!
    r: { kind: "remnant", value: [0, 260, 390, 520], cooldown: 16, radius: 170, summon: { art: "mine_techies" } }, // Proximity Mines
  }, { kind: "overload", value: 44, radius: 90 }),
  terrorblade: hero("terrorblade", 109, "terrorblade", false, { maxHp: 560, armor: 3, damage: 25, speed: 168, attackInterval: 0.9 }, {
    q: { kind: "nova", value: [0, 60, 95, 130, 165], cooldown: 10, radius: 300, duration: 3 },            // Reflection
    w: { kind: "damage_ward", value: [0, 18, 25, 32, 40], cooldown: 16, duration: 12, radius: 300, summon: { art: "illusion", count: 2 } },     // Conjure Image
    e: { kind: "metamorphosis", value: [0, 0.35, 0.45, 0.55, 0.7], cooldown: 30, duration: 10, form: { ranged: true, range: 330 } }, // Metamorphosis
    r: { kind: "death_pact", value: [0, 0.5, 0.7, 0.9], cooldown: 60, duration: 4 },                      // Sunder
  }, { kind: "vampiric", value: 0.07 }),
  timbersaw: hero("timbersaw", 98, "shredder", false, { maxHp: 740, armor: 4, damage: 26, speed: 164, regen: 3 }, {
    q: { kind: "spin", value: [0, 60, 90, 120, 150], cooldown: 8, radius: 200, duration: 1.5 },          // Whirling Death
    w: { kind: "dash", value: [0, 90, 135, 180, 230], cooldown: 6, radius: 400 },                         // Timber Chain
    e: { kind: "armor_passive", value: [0, 4, 6, 8, 10], cooldown: 0, passive: true },                   // Reactive Armor
    r: { kind: "damage_ward", value: [0, 50, 75, 100], cooldown: 30, duration: 8, radius: 260 },          // Chakram
  }, { kind: "tough", value: 3 }),
  treant: hero("treant", 83, "treant", false, { maxHp: 920, armor: 4, damage: 32, speed: 156, regen: 5, attackInterval: 1.1 }, {
    q: { kind: "line_burst", value: [0, 100, 150, 200, 250], cooldown: 8, radius: 64, count: [0, 4, 4, 4, 4], duration: 1.0 }, // Nature's Grasp
    w: { kind: "life_drain", value: [0, 34, 46, 58, 70], cooldown: 9, radius: 300, duration: 4 },         // Leech Seed
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 12, duration: 6 },                        // Living Armor
    r: { kind: "mass_freeze", value: [0, 0, 0, 0], cooldown: 60, radius: 360, duration: 3 },              // Overgrowth
  }, { kind: "tough", value: 4 }),
  troll_warlord: hero("troll_warlord", 95, "troll_warlord", false, { maxHp: 680, armor: 4, damage: 27, speed: 170, attackInterval: 0.8 }, {
    q: { kind: "line_burst", value: [0, 70, 105, 140, 170], cooldown: 8, radius: 60, count: [0, 4, 4, 4, 4] }, // Whirling Axes
    w: { kind: "frenzy", value: [0, 0.25, 0.3, 0.35, 0.4], cooldown: 14, duration: 8 },                  // Berserker's Rage
    e: { kind: "crit", value: [0, 0.1, 0.14, 0.18, 0.22], cooldown: 0, passive: true },                  // Fervor
    r: { kind: "rage", value: [0, 0.6, 0.8, 1.0], cooldown: 60, duration: 8 },                           // Battle Trance
  }, { kind: "vampiric", value: 0.1 }),
  tusk: hero("tusk", 100, "tusk", false, { maxHp: 780, armor: 5, damage: 29, speed: 166, regen: 3 }, {
    q: { kind: "line_burst", value: [0, 120, 175, 230, 290], cooldown: 7, radius: 64, count: [0, 3, 3, 3, 3] }, // Ice Shards
    w: { kind: "dash", value: [0, 130, 190, 250, 320], cooldown: 11, radius: 400 },                       // Snowball
    e: { kind: "rage", value: [0, 0.5, 0.65, 0.8, 0.9], cooldown: 12, duration: 6 },                     // Tag Team
    r: { kind: "lightning_bolt", value: [0, 250, 375, 500], cooldown: 30, radius: 150, duration: 1.0 },   // Walrus Punch
  }, { kind: "crit", value: 0.15, cap: 2.6 }),
  underlord: hero("underlord", 108, "abyssal_underlord", false, { maxHp: 880, armor: 5, damage: 29, speed: 158, regen: 3 }, {
    q: { kind: "meteor", value: [0, 160, 235, 310, 380], cooldown: 9, radius: 200, count: [0, 1, 1, 1, 1], duration: 1.0 }, // Firestorm
    w: { kind: "mass_freeze", value: [0, 0, 0, 0, 0], cooldown: 14, radius: 200, duration: 2 },           // Pit of Malice
    e: { kind: "presence", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 0, radius: 300, passive: true },  // Atrophy Aura
    r: { kind: "dash", value: [0, 140, 230, 320], cooldown: 45, radius: 500 },                           // Fiend's Gate
  }, { kind: "souls", value: 1.1, cap: 30 }),
  undying: hero("undying", 85, "undying", false, { maxHp: 860, armor: 3, damage: 27, speed: 154, regen: 4 }, {
    q: { kind: "life_drain", value: [0, 34, 48, 62, 76], cooldown: 7, radius: 320, duration: 4 },         // Decay
    w: { kind: "ward", value: [0, 14, 20, 26, 32], cooldown: 10, duration: 5 },                            // Soul Rip
    e: { kind: "damage_ward", value: [0, 38, 52, 66, 80], cooldown: 18, duration: 12, radius: 320, summon: { art: "tombstone" } }, // Tombstone
    r: { kind: "rage", value: [0, 0.6, 0.8, 1.0], cooldown: 60, duration: 12 },                          // Flesh Golem
  }, { kind: "growth", value: 9, cap: 600 }),
  // ---- Волна 12 ----
  vengeful_spirit: hero("vengeful_spirit", 20, "vengefulspirit", true, { maxHp: 640, armor: 3, damage: 26, speed: 168 }, {
    q: { kind: "lightning_bolt", value: [0, 120, 175, 230, 290], cooldown: 6, radius: 320, duration: 1.5 }, // Magic Missile
    w: { kind: "line_burst", value: [0, 100, 145, 190, 240], cooldown: 7, radius: 64, count: [0, 4, 4, 4, 4] }, // Wave of Terror
    e: { kind: "presence", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 0, radius: 300, passive: true },  // Vengeance Aura
    r: { kind: "dash", value: [0, 100, 175, 250], cooldown: 40, radius: 500 },                           // Nether Swap
  }, { kind: "marksmanship", value: 0.3, radius: 220 }),
  visage: hero("visage", 92, "visage", true, { maxHp: 600, armor: 3, damage: 25, speed: 160 }, {
    q: { kind: "goo", value: [0, 60, 95, 130, 165], cooldown: 8, radius: 320, duration: 4 },              // Grave Chill
    w: { kind: "lightning_bolt", value: [0, 100, 155, 210, 260], cooldown: 6, radius: 320, duration: 0.2 }, // Soul Assumption
    e: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Gravekeeper's Cloak
    r: { kind: "damage_ward", value: [0, 30, 45, 60], cooldown: 40, duration: 15, radius: 320, summon: { art: "hawk", count: 2 } },          // Summon Familiars
  }, { kind: "tough", value: 5 }),
  void_spirit: hero("void_spirit", 126, "void_spirit", false, { maxHp: 660, armor: 4, damage: 27, speed: 172 }, {
    q: { kind: "remnant", value: [0, 100, 150, 200, 250], cooldown: 10, radius: 170, summon: { art: "illusion" } }, // Aether Remnant
    w: { kind: "nova", value: [0, 90, 135, 180, 230], cooldown: 10, radius: 240, duration: 1 },           // Dissimilate
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 12, duration: 4 },                        // Resonant Pulse
    r: { kind: "dash", value: [0, 200, 310, 420], cooldown: 20, radius: 500 },                           // Astral Step
  }, { kind: "blur", value: 0.2 }),
  weaver: hero("weaver", 63, "weaver", true, { maxHp: 620, armor: 3, damage: 28, speed: 176 }, {
    q: { kind: "damage_ward", value: [0, 35, 47, 58, 70], cooldown: 12, duration: 12, radius: 300, summon: { art: "beetle", count: 3 } }, // The Swarm
    w: { kind: "haste", value: [0, 0.15, 0.2, 0.25, 0.3], cooldown: 8, duration: 4 },                    // Shukuchi
    e: { kind: "crit", value: [0, 0.16, 0.21, 0.26, 0.3], cooldown: 0, passive: true },                  // Geminate Attack
    r: { kind: "death_pact", value: [0, 0.4, 0.6, 0.8], cooldown: 50, duration: 3 },                      // Time Lapse
  }, { kind: "swipes", value: 4, cap: 12 }),
  winter_wyvern: hero("winter_wyvern", 112, "winter_wyvern", true, { maxHp: 640, armor: 3, damage: 25, speed: 162, range: 340 }, {
    q: { kind: "line_burst", value: [0, 75, 110, 145, 180], cooldown: 7, radius: 70, count: [0, 3, 3, 4, 4] }, // Arctic Burn
    w: { kind: "arc_lightning", value: [0, 120, 175, 230, 290], cooldown: 6, radius: 340, count: [0, 3, 4, 5, 6] }, // Splinter Blast
    e: { kind: "ward", value: [0, 14, 20, 26, 32], cooldown: 12, duration: 4 },                            // Cold Embrace
    r: { kind: "mass_freeze", value: [0, 200, 300, 400], cooldown: 55, radius: 320, duration: 3 },        // Winter's Curse
  }, { kind: "vampiric", value: 0.09 }),
  arc_warden: hero("arc_warden", 113, "arc_warden", true, { maxHp: 640, armor: 3, damage: 31, speed: 166, range: 400, attackInterval: 0.8 }, {
    // Слот Q — единственное умение, которое у героя есть с первого уровня, поэтому в нём должен
    // стоять его основной инструмент зачистки. У Arc Warden там стоял Flux — точечный дот с узким
    // условием каста, и герой не успевал за волнами (уровень 12 и 617 убийств против 26 и 2525 у
    // Rubick на тех же сидах). Меняем местами: искра-цепь в Q, Flux в E.
    q: { kind: "arc_lightning", value: [0, 110, 160, 210, 260], cooldown: 6, radius: 340, count: [0, 3, 4, 5, 6] }, // Spark Wraith
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 5 },                        // Magnetic Field
    e: { kind: "goo", value: [0, 90, 135, 180, 225], cooldown: 7, radius: 340, duration: 5 },            // Flux
    r: SIG,                                                                                              // Tempest Double
  }, { kind: "multicast", value: 0.35 }),
  dawnbreaker: hero("dawnbreaker", 135, "dawnbreaker", false, { maxHp: 680, armor: 3, damage: 26, speed: 158, regen: 2 }, {
    q: { kind: "spin", value: [0, 45, 65, 85, 110], cooldown: 10, radius: 200, duration: 1.5 },          // Starbreaker
    w: { kind: "line_burst", value: [0, 60, 90, 120, 150], cooldown: 11, radius: 60, count: [0, 4, 4, 4, 4] }, // Celestial Hammer
    e: SIG,                                                                                              // Luminosity
    r: { kind: "meteor", value: [0, 250, 375, 500], cooldown: 60, radius: 220, count: [0, 1, 1, 1], duration: 1.5 }, // Solar Guardian
  }, { kind: "vampiric", value: 0.07 }),
  hoodwink: hero("hoodwink", 123, "hoodwink", true, { maxHp: 620, armor: 3, damage: 26, speed: 174 }, {
    q: { kind: "arc_lightning", value: [0, 110, 160, 210, 260], cooldown: 6, radius: 320, count: [0, 3, 4, 4, 5] }, // Acorn Shot
    w: { kind: "nova", value: [0, 80, 120, 160, 200], cooldown: 9, radius: 240, duration: 2 },            // Bushwhack
    e: { kind: "haste", value: [0, 0.12, 0.16, 0.2, 0.24], cooldown: 12, duration: 5 },                  // Scurry
    r: { kind: "line_burst", value: [0, 200, 300, 400], cooldown: 26, radius: 90, count: [0, 5, 5, 5] }, // Sharpshooter
  }, { kind: "backstab", value: 0.5 }),
  // ---- Волна 13 ----
  marci: hero("marci", 136, "marci", false, { maxHp: 680, armor: 4, damage: 27, speed: 176, attackInterval: 0.85 }, {
    q: { kind: "gust", value: [0, 80, 120, 160, 200], cooldown: 10, radius: 200, duration: 1.5 },        // Dispose
    w: { kind: "dash", value: [0, 100, 150, 200, 250], cooldown: 10, radius: 400 },                       // Rebound
    e: { kind: "rage", value: [0, 0.4, 0.55, 0.7, 0.8], cooldown: 14, duration: 6 },                     // Sidekick
    r: { kind: "frenzy", value: [0, 0.4, 0.48, 0.55], cooldown: 60, duration: 8 },                       // Unleash
  }, { kind: "vampiric", value: 0.1 }),
  muerta: hero("muerta", 138, "muerta", true, { maxHp: 780, armor: 5, damage: 30, speed: 170, range: 330, regen: 3 }, {
    q: { kind: "lightning_bolt", value: [0, 160, 235, 310, 380], cooldown: 5, radius: 330, duration: 0.8 }, // Dead Shot
    w: { kind: "nova", value: [0, 130, 190, 250, 310], cooldown: 7, radius: 320, duration: 2 },           // The Calling (духи бьют по площади: с edict бот умирал до Рошана)
    e: { kind: "crit", value: [0, 0.14, 0.18, 0.22, 0.26], cooldown: 0, passive: true },                 // Gunslinger
    r: { kind: "rage", value: [0, 0.6, 0.8, 1.0], cooldown: 60, duration: 8 },                           // Pierce the Veil
  }, { kind: "marksmanship", value: 0.32, radius: 230 }),
  primal_beast: hero("primal_beast", 137, "primal_beast", false, { maxHp: 940, armor: 5, damage: 31, speed: 158, regen: 4, attackInterval: 1.1 }, {
    q: { kind: "dash", value: [0, 160, 235, 310, 380], cooldown: 9, radius: 500 },                        // Onslaught
    w: { kind: "spin", value: [0, 70, 100, 130, 160], cooldown: 12, radius: 190, duration: 3 },          // Trample
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 6 },                        // Uproar
    r: { kind: "ravage", value: [0, 200, 300, 400], cooldown: 60, radius: 220, duration: 2 },            // Pulverize
  }, { kind: "quill", value: 7, radius: 100 }),
  kez: hero("kez", 145, "kez", false, { maxHp: 760, armor: 5, damage: 29, speed: 180, attackInterval: 0.85 }, {
    q: { kind: "line_burst", value: [0, 120, 175, 230, 290], cooldown: 5, radius: 64, count: [0, 3, 3, 3, 3] }, // Echo Slash
    w: { kind: "dash", value: [0, 120, 175, 230, 290], cooldown: 7, radius: 400 },                        // Grappling Claw
    e: { kind: "crit", value: [0, 0.12, 0.16, 0.2, 0.24], cooldown: 0, passive: true },                  // Kazurai Katana
    r: { kind: "spin", value: [0, 100, 160, 220], cooldown: 50, radius: 220, duration: 2.5 },             // Raptor Dance
  }, { kind: "crit", value: 0.14, cap: 2.2 }),
  ringmaster: hero("ringmaster", 131, "ringmaster", true, { maxHp: 580, armor: 3, damage: 24, speed: 162 }, {
    q: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 70, count: [0, 3, 3, 3, 3] }, // Tame the Beasts
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 12, duration: 4 },                        // Escape Act
    e: { kind: "lightning_bolt", value: [0, 90, 135, 180, 230], cooldown: 6, radius: 320, duration: 0.5 }, // Impalement Arts
    r: { kind: "mass_freeze", value: [0, 220, 330, 440], cooldown: 60, radius: 320, duration: 2.5 },      // Wheel
  }, { kind: "multicast", value: 0.28 }),
  meepo: hero("meepo", 82, "meepo", false, { maxHp: 640, armor: 3, damage: 25, speed: 172, attackInterval: 0.85 }, {
    q: { kind: "mass_freeze", value: [0, 0, 0, 0, 0], cooldown: 12, radius: 180, duration: 2 },           // Earthbind
    w: { kind: "dash", value: [0, 120, 180, 240, 300], cooldown: 8, radius: 400 },                        // Poof
    e: SIG,                                                                                              // Ransack
    r: { kind: "damage_ward", value: [0, 45, 65, 85], cooldown: 40, duration: 20, radius: 300, summon: { art: "illusion", count: 2 } },         // Divided We Stand
  }, { kind: "vampiric", value: 0.12 }),
  io: hero("io", 91, "wisp", true, { maxHp: 620, armor: 3, damage: 24, speed: 172, regen: 5 }, {
    q: { kind: "ward", value: [0, 14, 20, 26, 32], cooldown: 10, duration: 6 },                            // Tether
    w: { kind: "spin", value: [0, 50, 70, 90, 110], cooldown: 7, radius: 210, duration: 4 },              // Spirits
    e: { kind: "frenzy", value: [0, 0.3, 0.35, 0.4, 0.45], cooldown: 14, duration: 6 },                  // Overcharge
    r: { kind: "dash", value: [0, 0, 0, 0], cooldown: 40, radius: 600 },                                  // Relocate
  }, { kind: "vampiric", value: 0.12 }),
  // ---- Волна 15 (последние семь из датасета; Largo ждёт модель в vpk) ----
  phantom_lancer: hero("phantom_lancer", 12, "phantom_lancer", false, { maxHp: 620, armor: 4, damage: 25, speed: 174 }, {
    q: { kind: "goo", value: [0, 95, 140, 185, 230], cooldown: 5, radius: 330, duration: 2 },            // Spirit Lance
    w: { kind: "dash", value: [0, 60, 90, 120, 150], cooldown: 11, radius: 320 },                        // Doppelganger
    e: { kind: "haste", value: [0, 0.25, 0.32, 0.4, 0.48], cooldown: 12, duration: 4 },                  // Phantom Rush
    r: { kind: "damage_ward", value: [0, 44, 60, 78], cooldown: 26, duration: 14, radius: 320, summon: { art: "illusion", count: 3 } }, // Juxtapose
  }, { kind: "blur", value: 0.22 }),
  lifestealer: hero("lifestealer", 54, "life_stealer", false, { maxHp: 760, armor: 4, damage: 28, speed: 172, regen: 4 }, {
    q: { kind: "rage", value: [0, 0.45, 0.6, 0.75, 0.9], cooldown: 18, duration: 5 },                    // Rage
    w: { kind: "life_drain", value: [0, 26, 36, 46, 56], cooldown: 10, radius: 300, duration: 4 },       // Open Wounds
    e: { kind: "frenzy", value: [0, 0.25, 0.32, 0.4, 0.48], cooldown: 14, duration: 6 },                 // Ghoul Frenzy
    r: { kind: "ravage", value: [0, 160, 250, 340], cooldown: 55, radius: 260, duration: 1.2 },          // Infest
  }, { kind: "vampiric", value: 0.14 }),
  enchantress: hero("enchantress", 58, "enchantress", true, { maxHp: 600, armor: 3, damage: 26, speed: 168, range: 300 }, {
    q: { kind: "goo", value: [0, 55, 85, 115, 145], cooldown: 7, radius: 330, duration: 3 },             // Enchant
    w: { kind: "ward", value: [0, 0.03, 0.038, 0.046, 0.054], cooldown: 26, radius: 180, duration: 8 },  // Nature's Attendants
    e: { kind: "damage_ward", value: [0, 24, 34, 44, 54], cooldown: 16, duration: 14, radius: 300, summon: { art: "treant", count: 2 } }, // Enchant creep
    r: { kind: "line_burst", value: [0, 150, 230, 310], cooldown: 22, radius: 380 },                     // Impetus
  }, { kind: "marksmanship", value: 0.3, radius: 220 }),
  chen: hero("chen", 66, "chen", true, { maxHp: 620, armor: 4, damage: 24, speed: 172, range: 300, regen: 4 }, {
    q: { kind: "goo", value: [0, 90, 130, 170, 215], cooldown: 6, radius: 330, duration: 3 },            // Penitence
    w: { kind: "damage_ward", value: [0, 46, 62, 78, 95], cooldown: 14, duration: 16, radius: 340, summon: { art: "hellbear", count: 2 } }, // Holy Persuasion
    e: { kind: "haste", value: [0, 0.2, 0.26, 0.32, 0.4], cooldown: 14, duration: 5 },                   // Divine Favor
    r: { kind: "ward", value: [0, 0.16, 0.22, 0.28], cooldown: 50, radius: 900, duration: 1 },           // Hand of God
  }, { kind: "deathpact", value: 7 }),
  ancient_apparition: hero("ancient_apparition", 68, "ancient_apparition", true, { maxHp: 560, armor: 2, damage: 24, speed: 162, range: 340 }, {
    q: { kind: "nova", value: [0, 95, 140, 190, 240], cooldown: 7, radius: 260, duration: 2 },           // Cold Feet
    w: { kind: "remnant", value: [0, 40, 55, 70, 88], cooldown: 10, radius: 240, duration: 8 },          // Ice Vortex
    e: { kind: "frost_arrows", value: [0, 0.2, 0.28, 0.36, 0.44], cooldown: 0, passive: true },          // Chilling Touch
    r: { kind: "mass_freeze", value: [0, 200, 300, 400], cooldown: 65, radius: 320, duration: 2.5 },     // Ice Blast
  }, { kind: "thirst", value: 0.32, radius: 600 }),
  monkey_king: hero("monkey_king", 114, "monkey_king", false, { maxHp: 660, armor: 4, damage: 27, speed: 178, attackInterval: 0.85 }, {
    q: { kind: "line_burst", value: [0, 130, 195, 260, 325], cooldown: 8, radius: 420 },                 // Boundless Strike
    w: { kind: "dash", value: [0, 70, 105, 140, 175], cooldown: 9, radius: 340 },                        // Primal Spring
    e: { kind: "haste", value: [0, 0.22, 0.28, 0.34, 0.42], cooldown: 12, duration: 4 },                 // Tree Dance
    r: { kind: "ravage", value: [0, 150, 230, 320], cooldown: 55, radius: 280, duration: 1.4 },          // Wukong's Command
  }, { kind: "swipes", value: 5, cap: 12 }),
  dark_willow: hero("dark_willow", 119, "dark_willow", true, { maxHp: 580, armor: 3, damage: 25, speed: 168, range: 320 }, {
    q: { kind: "nova", value: [0, 70, 105, 140, 175], cooldown: 7, radius: 230, duration: 2.5 },         // Bramble Maze
    w: { kind: "dash", value: [0, 50, 75, 100, 125], cooldown: 10, radius: 300 },                        // Shadow Realm
    e: { kind: "remnant", value: [0, 40, 55, 70, 88], cooldown: 12, radius: 240, duration: 8 },          // Cursed Crown
    r: { kind: "edict", value: [0, 80, 115, 150], cooldown: 55, duration: 10, radius: 340 },             // Bedlam
  }, { kind: "blur", value: 0.2 }),
};

export const HEROES: Record<HeroId, HeroDef> = { ...UNIQUE_HEROES, ...TEMPLATE_HEROES };

/** Таланты 10/15/20/25 — общая лестница для всех героев (Dota-подобные пары). */
export const HERO_TALENTS: Record<number, readonly [string, string]> = {
  10: ["t10_dmg", "t10_ms"],
  15: ["t15_crit", "t15_hp"],
  20: ["t20_armor", "t20_cd"],
  25: ["t25_regen", "t25_ult"],
};
