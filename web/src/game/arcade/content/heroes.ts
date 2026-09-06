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
  | "omniknight" | "abaddon" | "beastmaster" | "brewmaster" | "centaur" | "dark_seer" | "death_prophet" | "disruptor";
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
  | "reincarnation" | "rupture" | "corrosive" | "berserk_blood";

export interface AbilityDef {
  kind: AbilityKind;
  /** Главная величина по уровню способности (index = уровень; 0 — не изучена). */
  value: number[];
  cooldown: number;
  radius?: number;
  duration?: number;
  /** Вторичное число по уровню (число целей/ударов, длительность стана и т.п.). */
  count?: number[];
  passive?: boolean;
}

/** Фирменная пассивка героя поверх кита архетипа (BACKLOG T13.15): то, что делает Shadow Fiend Shadow Fiend'ом. */
export type SignatureKind = "souls" | "swipes" | "cleave" | "timelock" | "deathpact" | "fiery_soul" | "overload" | "marksmanship" | "quill" | "blur" | "vampiric"
  | "aftershock" | "multicast" | "backstab" | "thirst";
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
      w: { kind: "ward", value: [0, 0.028, 0.034, 0.04, 0.046], cooldown: 32, radius: 170, duration: 8 },
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
      q: { kind: "arc_lightning", value: [0, 40, 60, 80, 100], cooldown: 2.2, radius: 320, count: [0, 4, 6, 8, 10] },
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
  }),
  lina: hero("lina", 25, "lina", true, { damage: 24, maxHp: 500 }, {
    q: { kind: "line_burst", value: [0, 70, 105, 140, 175], cooldown: 7, radius: 60, count: [0, 3, 3, 3, 3] },          // Dragon Slave
    w: { kind: "line_burst", value: [0, 90, 135, 180, 225], cooldown: 10, radius: 95, count: [0, 1, 1, 1, 1], duration: 0.9 }, // Light Strike Array
    e: SIG,                                                                                              // Fiery Soul
    r: { kind: "assassinate", value: [0, 350, 600, 850], cooldown: 55, radius: 340 },                    // Laguna Blade
  }, { kind: "fiery_soul", value: 0.3, duration: 6 }),
  lich: hero("lich", 31, "lich", true, { maxHp: 580, armor: 2, speed: 156 }, {
    q: { kind: "nova", value: [0, 90, 140, 190, 240], cooldown: 8, radius: 160, duration: 3 },           // Frost Blast
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 14, duration: 5 },                        // Frost Shield
    e: { kind: "frostbite", value: [0, 60, 100, 140, 180], cooldown: 12, radius: 320, duration: 1.6 },   // Sinister Gaze
    r: { kind: "arc_lightning", value: [0, 120, 190, 260], cooldown: 50, radius: 340, count: [0, 7, 9, 11] }, // Chain Frost
  }),
  drow_ranger: hero("drow_ranger", 6, "drow_ranger", true, { range: 350, damage: 25 }, {
    q: { kind: "frost_arrows", value: [0, 0.2, 0.3, 0.4, 0.5], cooldown: 0, passive: true },             // Frost Arrows
    w: { kind: "gust", value: [0, 40, 70, 100, 130], cooldown: 12, radius: 220, duration: 2 },           // Gust
    e: { kind: "multishot", value: [0, 34, 50, 66, 82], cooldown: 9, radius: 380, count: [0, 5, 6, 7, 8] }, // Multishot
    r: SIG,                                                                                              // Marksmanship
  }, { kind: "marksmanship", value: 0.35, radius: 220 }),
  windranger: hero("windranger", 21, "windrunner", true, { speed: 168, attackInterval: 0.85 }, {
    q: { kind: "lightning_bolt", value: [0, 70, 110, 150, 190], cooldown: 9, radius: 340, duration: 1.3 }, // Shackleshot
    w: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 55, count: [0, 4, 4, 4, 4] }, // Powershot
    e: { kind: "haste", value: [0, 0.4, 0.5, 0.6, 0.7], cooldown: 14, duration: 4 },                     // Windrun
    r: { kind: "frenzy", value: [0, 0.55, 0.65, 0.75], cooldown: 45, duration: 6 },                      // Focus Fire
  }),
  bristleback: hero("bristleback", 99, "bristleback", false, { maxHp: 680, armor: 5, regen: 3, damage: 18 }, {
    q: { kind: "goo", value: [0, 40, 60, 80, 100], cooldown: 7, radius: 300, duration: 3 },             // Viscous Nasal Goo
    w: { kind: "nova", value: [0, 30, 45, 60, 75], cooldown: 5, radius: 150, duration: 1 },              // Quill Spray
    e: { kind: "armor_passive", value: [0, 3, 4, 6, 7], cooldown: 0, passive: true },                    // Bristleback
    r: { kind: "rage", value: [0, 0.4, 0.6, 0.8], cooldown: 50, duration: 9 },                           // Warpath
  }, { kind: "quill", value: 18, radius: 110 }),
  sven: hero("sven", 18, "sven", false, { maxHp: 700, damage: 26, armor: 4, regen: 3 }, {
    q: { kind: "lightning_bolt", value: [0, 90, 140, 190, 240], cooldown: 9, radius: 320, duration: 1.2 }, // Storm Hammer
    w: SIG,                                                                                              // Great Cleave
    e: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 16, duration: 6 },                        // Warcry
    r: { kind: "rage", value: [0, 1.0, 1.5, 2.0], cooldown: 60, duration: 10 },                          // God's Strength
  }, { kind: "cleave", value: 0.5, radius: 85 }),
  storm_spirit: hero("storm_spirit", 17, "storm_spirit", true, { speed: 168, maxHp: 470 }, {
    q: { kind: "remnant", value: [0, 60, 95, 130, 165], cooldown: 6, radius: 130 },                     // Static Remnant
    w: { kind: "frostbite", value: [0, 50, 80, 110, 140], cooldown: 11, radius: 300, duration: 1.2 },    // Electric Vortex
    e: SIG,                                                                                              // Overload
    r: { kind: "dash", value: [0, 110, 170, 240], cooldown: 26, radius: 460 },                           // Ball Lightning
  }, { kind: "overload", value: 45, radius: 80 }),
  leshrac: hero("leshrac", 52, "leshrac", true, { damage: 24, maxHp: 520, armor: 2 }, {
    q: { kind: "line_burst", value: [0, 90, 135, 180, 225], cooldown: 8, radius: 100, count: [0, 1, 1, 1, 1], duration: 1.0 }, // Split Earth
    w: { kind: "edict", value: [0, 18, 26, 34, 42], cooldown: 14, radius: 260, duration: 7 },            // Diabolic Edict
    e: { kind: "arc_lightning", value: [0, 60, 90, 120, 150], cooldown: 5, radius: 320, count: [0, 3, 4, 5, 6] }, // Lightning Storm
    r: { kind: "freezing_field", value: [0, 50, 80, 110], cooldown: 55, radius: 240, duration: 7 },      // Pulse Nova
  }),
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
    q: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 60, count: [0, 3, 3, 3, 3], duration: 1.0 }, // Earth Spike
    w: { kind: "frostbite", value: [0, 20, 30, 40, 50], cooldown: 12, radius: 320, duration: 2.2 },      // Hex
    e: { kind: "life_drain", value: [0, 20, 30, 40, 50], cooldown: 12, radius: 300, duration: 4 },       // Mana Drain
    r: { kind: "assassinate", value: [0, 400, 650, 900], cooldown: 60, radius: 340 },                    // Finger of Death
  }),
  shadow_fiend: hero("shadow_fiend", 11, "nevermore", true, { damage: 30, maxHp: 470, attackInterval: 0.9 }, {
    q: { kind: "line_burst", value: [0, 75, 110, 145, 180], cooldown: 6, radius: 70, count: [0, 3, 3, 3, 3] }, // Shadowraze ×3
    w: SIG,                                                                                              // Necromastery
    e: { kind: "presence", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 0, radius: 300, passive: true },  // Presence of the Dark Lord
    r: { kind: "requiem", value: [0, 120, 200, 280], cooldown: 70, radius: 260, count: [0, 6, 9, 12] },   // Requiem of Souls
  }, { kind: "souls", value: 1.2, cap: 36 }),
  pugna: hero("pugna", 45, "pugna", true, { speed: 166, maxHp: 470, damage: 20 }, {
    q: { kind: "nova", value: [0, 90, 135, 180, 225], cooldown: 6, radius: 150, duration: 1 },           // Nether Blast
    w: { kind: "goo", value: [0, 30, 45, 60, 75], cooldown: 8, radius: 320, duration: 3 },               // Decrepify
    e: { kind: "damage_ward", value: [0, 18, 26, 34, 42], cooldown: 16, radius: 200, duration: 10 },     // Nether Ward
    r: { kind: "life_drain", value: [0, 60, 90, 120], cooldown: 40, radius: 340, duration: 5 },          // Life Drain
  }),
  invoker: hero("invoker", 74, "invoker", true, { maxHp: 530, damage: 23, armor: 2 }, {
    q: { kind: "frostbite", value: [0, 50, 80, 110, 140], cooldown: 9, radius: 320, duration: 1.5 },     // Cold Snap
    w: { kind: "assassinate", value: [0, 160, 240, 320, 400], cooldown: 12, radius: 360 },               // Sun Strike
    e: { kind: "meteor", value: [0, 70, 105, 140, 175], cooldown: 12, radius: 90, count: [0, 2, 2, 2, 2] }, // Chaos Meteor
    r: { kind: "ravage", value: [0, 150, 240, 330], cooldown: 60, radius: 240, duration: 1.2 },          // Deafening Blast
  }),
  tidehunter: hero("tidehunter", 29, "tidehunter", false, { maxHp: 820, armor: 7, regen: 4, speed: 158, damage: 16 }, {
    q: { kind: "goo", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 300, duration: 3 },            // Gush
    w: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Kraken Shell
    e: { kind: "nova", value: [0, 60, 90, 120, 150], cooldown: 5, radius: 140, duration: 1.5 },          // Anchor Smash
    r: { kind: "ravage", value: [0, 150, 230, 310], cooldown: 70, radius: 300, duration: 1.8 },          // Ravage
  }),
  mirana: hero("mirana", 9, "mirana", true, { speed: 172, range: 330 }, {
    q: { kind: "nova", value: [0, 50, 75, 100, 125], cooldown: 8, radius: 200, duration: 0.5 },          // Starstorm
    w: { kind: "lightning_bolt", value: [0, 110, 170, 230, 290], cooldown: 12, radius: 380, duration: 2.0 }, // Sacred Arrow
    e: { kind: "dash", value: [0, 0, 0, 0, 0], cooldown: 9, radius: 300 },                               // Leap
    r: { kind: "haste", value: [0, 0.6, 0.7, 0.8], cooldown: 60, duration: 8 },                          // Moonlight Shadow
  }),
  clinkz: hero("clinkz", 56, "clinkz", true, { attackInterval: 0.85, damage: 20, maxHp: 470 }, {
    q: { kind: "frenzy", value: [0, 0.5, 0.6, 0.68, 0.75], cooldown: 12, duration: 5 },                  // Strafe
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
    r: { kind: "rage", value: [0, 0.6, 0.9, 1.2], cooldown: 60, duration: 12 },                          // Elder Dragon Form
  }, { kind: "cleave", value: 0.35, radius: 80 }),
  kunkka: hero("kunkka", 23, "kunkka", false, { maxHp: 700, armor: 4, damage: 28, regen: 2 }, {
    q: { kind: "meteor", value: [0, 120, 180, 240, 300], cooldown: 12, radius: 130, count: [0, 1, 1, 1, 1], duration: 1.6 }, // Torrent
    w: SIG,                                                                                              // Tidebringer
    e: { kind: "dash", value: [0, 50, 75, 100, 125], cooldown: 12, radius: 240 },                         // X Marks the Spot
    r: { kind: "line_burst", value: [0, 260, 390, 520], cooldown: 60, radius: 120, count: [0, 5, 5, 5], duration: 1.4 }, // Ghostship
  }, { kind: "cleave", value: 0.45, radius: 100 }),
  necrophos: hero("necrophos", 36, "necrolyte", true, { maxHp: 560, armor: 2, regen: 4, damage: 21, speed: 158 }, {
    q: { kind: "nova", value: [0, 70, 110, 150, 190], cooldown: 7, radius: 300, duration: 1.5 },          // Death Pulse
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 18, duration: 5 },                        // Ghost Shroud
    e: { kind: "presence", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 0, radius: 260, passive: true },  // Heartstopper Aura
    r: { kind: "assassinate", value: [0, 450, 700, 950], cooldown: 55, radius: 340 },                    // Reaper's Scythe
  }),
  razor: hero("razor", 15, "razor", true, { maxHp: 560, armor: 3, damage: 22, speed: 170, attackInterval: 0.9 }, {
    q: { kind: "nova", value: [0, 80, 120, 160, 200], cooldown: 9, radius: 340, duration: 1.0 },          // Plasma Field
    w: { kind: "life_drain", value: [0, 18, 26, 34, 42], cooldown: 14, radius: 320, duration: 5 },        // Static Link
    e: { kind: "haste", value: [0, 0.1, 0.15, 0.2, 0.25], cooldown: 20, duration: 8 },                   // Storm Surge
    r: { kind: "edict", value: [0, 60, 90, 120], cooldown: 50, duration: 12, radius: 320 },              // Eye of the Storm
  }),
  venomancer: hero("venomancer", 40, "venomancer", true, { maxHp: 520, armor: 2, damage: 20, speed: 160 }, {
    q: { kind: "line_burst", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 64, count: [0, 4, 4, 4, 4] }, // Venomous Gale
    w: { kind: "searing", value: [0, 8, 12, 16, 20], cooldown: 0, passive: true },                       // Poison Sting
    e: { kind: "damage_ward", value: [0, 24, 34, 44, 54], cooldown: 12, duration: 10, radius: 300 },     // Plague Ward
    r: { kind: "nova", value: [0, 220, 340, 460], cooldown: 55, radius: 380, duration: 3 },              // Poison Nova
  }),
  witch_doctor: hero("witch_doctor", 30, "witch_doctor", true, { maxHp: 560, armor: 2, damage: 24, speed: 162 }, {
    q: { kind: "lightning_bolt", value: [0, 90, 135, 180, 225], cooldown: 6, radius: 320, duration: 1.2 }, // Paralyzing Cask
    w: { kind: "ward", value: [0, 12, 18, 24, 30], cooldown: 16, duration: 8 },                           // Voodoo Restoration
    e: { kind: "goo", value: [0, 80, 120, 160, 200], cooldown: 7, radius: 300, duration: 3 },             // Maledict
    r: { kind: "damage_ward", value: [0, 80, 120, 160], cooldown: 55, duration: 9, radius: 350 },         // Death Ward
  }),
  luna: hero("luna", 48, "luna", true, { maxHp: 520, armor: 2, damage: 23, speed: 174, attackInterval: 0.85 }, {
    q: { kind: "lightning_bolt", value: [0, 80, 125, 170, 215], cooldown: 6, radius: 330, duration: 0.6 }, // Lucent Beam
    w: { kind: "multishot", value: [0, 30, 45, 60, 75], cooldown: 8, radius: 360, count: [0, 3, 4, 5, 6] }, // Moon Glaives
    e: { kind: "armor_passive", value: [0, 2, 3, 4, 5], cooldown: 0, passive: true },                    // Lunar Blessing
    r: { kind: "thundergod", value: [0, 120, 180, 240], cooldown: 60, radius: 420, count: [0, 6, 8, 10] }, // Eclipse
  }),
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
  }),
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
  }),
  slardar: hero("slardar", 28, "slardar", false, { maxHp: 720, armor: 5, damage: 26, regen: 2, speed: 162 }, {
    q: { kind: "haste", value: [0, 0.05, 0.08, 0.11, 0.14], cooldown: 14, duration: 7 },                 // Guardian Sprint
    w: { kind: "ravage", value: [0, 80, 125, 170, 215], cooldown: 11, radius: 200, duration: 1.2 },      // Slithereen Crush
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
    q: { kind: "lightning_bolt", value: [0, 80, 130, 180, 230], cooldown: 9, radius: 320, duration: 2.0 }, // Chaos Bolt
    w: { kind: "dash", value: [0, 60, 90, 120, 150], cooldown: 9, radius: 300 },                          // Reality Rift
    e: { kind: "crit", value: [0, 0.12, 0.16, 0.2, 0.24], cooldown: 0, passive: true },                  // Chaos Strike
    r: { kind: "rage", value: [0, 0.8, 1.1, 1.4], cooldown: 60, duration: 10 },                          // Phantasm
  }),
  night_stalker: hero("night_stalker", 60, "night_stalker", false, { maxHp: 800, armor: 5, damage: 29, speed: 178, regen: 3 }, {
    q: { kind: "goo", value: [0, 110, 160, 210, 260], cooldown: 7, radius: 320, duration: 3 },            // Void
    w: { kind: "nova", value: [0, 90, 135, 180, 225], cooldown: 8, radius: 320, duration: 3 },            // Crippling Fear
    e: { kind: "haste", value: [0, 0.08, 0.12, 0.16, 0.2], cooldown: 18, duration: 8 },                  // Hunter in the Night
    r: { kind: "frenzy", value: [0, 0.35, 0.42, 0.5], cooldown: 60, duration: 12 },                      // Dark Ascension
  }),
  doom: hero("doom", 69, "doom_bringer", false, { maxHp: 780, armor: 4, damage: 28, speed: 156, regen: 3 }, {
    q: { kind: "life_drain", value: [0, 20, 28, 36, 44], cooldown: 14, radius: 300, duration: 5 },        // Devour
    w: { kind: "remnant", value: [0, 90, 140, 190, 240], cooldown: 16, radius: 170 },                    // Scorched Earth
    e: { kind: "searing", value: [0, 12, 18, 24, 30], cooldown: 0, passive: true },                      // Infernal Blade
    r: { kind: "assassinate", value: [0, 420, 660, 900], cooldown: 60, radius: 340 },                    // Doom
  }),
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
    r: { kind: "damage_ward", value: [0, 60, 90, 120], cooldown: 45, duration: 10, radius: 320 },         // Psionic Trap
  }, { kind: "cleave", value: 0.5, radius: 120 }),
  medusa: hero("medusa", 94, "medusa", true, { maxHp: 560, armor: 3, damage: 22, speed: 158, range: 330 }, {
    q: { kind: "multishot", value: [0, 25, 35, 45, 55], cooldown: 7, radius: 360, count: [0, 3, 4, 5, 6] }, // Split Shot
    w: { kind: "arc_lightning", value: [0, 70, 105, 140, 175], cooldown: 8, radius: 320, count: [0, 3, 4, 5, 6] }, // Mystic Snake
    e: { kind: "armor_passive", value: [0, 3, 5, 7, 9], cooldown: 0, passive: true },                    // Mana Shield
    r: { kind: "mass_freeze", value: [0, 0, 0, 0], cooldown: 60, radius: 400, duration: 2.5 },            // Stone Gaze
  }),
  // ---- Волна 5 ----
  silencer: hero("silencer", 75, "silencer", true, { maxHp: 540, armor: 2, damage: 24, speed: 162 }, {
    q: { kind: "nova", value: [0, 70, 110, 150, 190], cooldown: 8, radius: 320, duration: 3 },            // Arcane Curse
    w: { kind: "searing", value: [0, 10, 15, 20, 25], cooldown: 0, passive: true },                      // Glaives of Wisdom
    e: { kind: "lightning_bolt", value: [0, 90, 140, 190, 240], cooldown: 9, radius: 320, duration: 1.0 }, // Last Word
    r: { kind: "mass_freeze", value: [0, 0, 0, 0], cooldown: 60, radius: 600, duration: 2 },              // Global Silence
  }),
  skywrath_mage: hero("skywrath_mage", 101, "skywrath_mage", true, { maxHp: 540, armor: 2, damage: 25, speed: 166, range: 340 }, {
    q: { kind: "lightning_bolt", value: [0, 110, 165, 220, 280], cooldown: 3, radius: 340, duration: 0.3 }, // Arcane Bolt
    w: { kind: "goo", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 340, duration: 3 },             // Concussive Shot
    e: { kind: "corrosive", value: [0, 0.2, 0.25, 0.3, 0.35], cooldown: 12, radius: 340, duration: 6 },  // Ancient Seal
    r: { kind: "line_burst", value: [0, 360, 540, 720], cooldown: 40, radius: 140, count: [0, 1, 1, 1], duration: 0.5 }, // Mystic Flare
  }),
  dazzle: hero("dazzle", 50, "dazzle", true, { maxHp: 640, armor: 4, damage: 27, speed: 164, regen: 3 }, {
    q: { kind: "goo", value: [0, 100, 150, 200, 250], cooldown: 5, radius: 320, duration: 4 },            // Poison Touch
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 20, duration: 4 },                        // Shallow Grave
    e: { kind: "ward", value: [0, 12, 18, 24, 30], cooldown: 12, duration: 6 },                           // Shadow Wave
    r: { kind: "arcane_aura", value: [0, 0.1, 0.18, 0.25], cooldown: 0, passive: true },                 // Bad Juju
  }),
  jakiro: hero("jakiro", 64, "jakiro", true, { maxHp: 660, armor: 3, damage: 24, speed: 158 }, {
    q: { kind: "line_burst", value: [0, 130, 190, 250, 300], cooldown: 6, radius: 78, count: [0, 3, 3, 3, 3] }, // Dual Breath
    w: { kind: "line_burst", value: [0, 70, 105, 140, 180], cooldown: 10, radius: 56, count: [0, 4, 4, 4, 4], duration: 1.5 }, // Ice Path
    e: { kind: "searing", value: [0, 10, 15, 20, 25], cooldown: 0, passive: true },                      // Liquid Fire
    r: { kind: "damage_ward", value: [0, 90, 135, 180], cooldown: 60, duration: 10, radius: 320 },        // Macropyre
  }),
  shadow_shaman: hero("shadow_shaman", 27, "shadow_shaman", true, { maxHp: 540, armor: 2, damage: 24, speed: 160 }, {
    q: { kind: "line_burst", value: [0, 100, 145, 190, 240], cooldown: 7, radius: 70, count: [0, 3, 3, 3, 3] }, // Ether Shock
    w: { kind: "frostbite", value: [0, 40, 60, 80, 100], cooldown: 12, radius: 320, duration: 2.5 },       // Hex
    e: { kind: "life_drain", value: [0, 20, 28, 36, 44], cooldown: 12, radius: 300, duration: 4 },        // Shackles
    r: { kind: "damage_ward", value: [0, 70, 105, 140], cooldown: 60, duration: 10, radius: 340 },        // Mass Serpent Ward
  }),
  warlock: hero("warlock", 37, "warlock", true, { maxHp: 640, armor: 3, damage: 25, speed: 160, regen: 2 }, {
    q: { kind: "nova", value: [0, 80, 120, 160, 200], cooldown: 8, radius: 340, duration: 1 },            // Fatal Bonds
    w: { kind: "ward", value: [0, 10, 15, 20, 24], cooldown: 14, duration: 8 },                           // Shadow Word
    e: { kind: "nova", value: [0, 70, 105, 140, 170], cooldown: 12, radius: 300, duration: 4 },            // Upheaval
    r: { kind: "meteor", value: [0, 280, 420, 560], cooldown: 60, radius: 200, count: [0, 1, 1, 1], duration: 1.5 }, // Rain of Chaos
  }),
  enigma: hero("enigma", 33, "enigma", true, { maxHp: 620, armor: 3, damage: 25, speed: 160 }, {
    q: { kind: "lightning_bolt", value: [0, 110, 160, 210, 260], cooldown: 7, radius: 320, duration: 1.6 }, // Malefice
    w: { kind: "multishot", value: [0, 45, 58, 72, 85], cooldown: 7, radius: 360, count: [0, 3, 4, 5, 6] }, // Demonic Conversion
    e: { kind: "remnant", value: [0, 140, 200, 260, 320], cooldown: 12, radius: 200 },                   // Midnight Pulse
    r: { kind: "ravage", value: [0, 240, 360, 480], cooldown: 70, radius: 320, duration: 3 },            // Black Hole
  }),
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
  }),
  abaddon: hero("abaddon", 102, "abaddon", false, { maxHp: 820, armor: 5, damage: 28, speed: 162, regen: 3 }, {
    q: { kind: "lightning_bolt", value: [0, 110, 165, 220, 270], cooldown: 5, radius: 300, duration: 0.3 }, // Mist Coil
    w: { kind: "armor_buff", value: [0, 0, 0, 0, 0], cooldown: 12, duration: 5 },                        // Aphotic Shield
    e: { kind: "frost_arrows", value: [0, 0.1, 0.14, 0.18, 0.22], cooldown: 0, passive: true },          // Curse of Avernus
    r: { kind: "reincarnation", value: [0, 0.5, 0.7, 0.9], cooldown: 120, passive: true },               // Borrowed Time
  }),
  beastmaster: hero("beastmaster", 38, "beastmaster", false, { maxHp: 700, armor: 4, damage: 28, speed: 164, regen: 2 }, {
    q: { kind: "line_burst", value: [0, 80, 125, 170, 215], cooldown: 8, radius: 64, count: [0, 3, 3, 3, 3] }, // Wild Axes
    w: { kind: "damage_ward", value: [0, 20, 28, 36, 44], cooldown: 14, duration: 12, radius: 300 },     // Call of the Wild Boar
    e: { kind: "frenzy", value: [0, 0.2, 0.25, 0.3, 0.35], cooldown: 14, duration: 8 },                  // Inner Beast
    r: { kind: "ravage", value: [0, 200, 300, 400], cooldown: 60, radius: 260, duration: 2 },            // Primal Roar
  }),
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
  }),
  death_prophet: hero("death_prophet", 43, "death_prophet", true, { maxHp: 560, armor: 2, damage: 24, speed: 164 }, {
    q: { kind: "line_burst", value: [0, 90, 135, 180, 230], cooldown: 7, radius: 70, count: [0, 3, 3, 3, 3] }, // Crypt Swarm
    w: { kind: "nova", value: [0, 40, 65, 90, 115], cooldown: 12, radius: 320, duration: 3 },             // Silence
    e: { kind: "life_drain", value: [0, 20, 28, 36, 44], cooldown: 12, radius: 320, duration: 5 },        // Spirit Siphon
    r: { kind: "edict", value: [0, 60, 90, 120], cooldown: 70, duration: 12, radius: 380 },              // Exorcism
  }),
  disruptor: hero("disruptor", 87, "disruptor", true, { maxHp: 600, armor: 3, damage: 24, speed: 162 }, {
    q: { kind: "lightning_bolt", value: [0, 100, 150, 200, 250], cooldown: 5, radius: 320, duration: 0.5 }, // Thunder Strike
    w: { kind: "goo", value: [0, 60, 95, 130, 165], cooldown: 9, radius: 340, duration: 3 },              // Glimpse
    e: { kind: "mass_freeze", value: [0, 0, 0, 0, 0], cooldown: 16, radius: 200, duration: 2 },           // Kinetic Field
    r: { kind: "nova", value: [0, 260, 390, 520], cooldown: 60, radius: 320, duration: 3 },              // Static Storm
  }),
};

export const HEROES: Record<HeroId, HeroDef> = { ...UNIQUE_HEROES, ...TEMPLATE_HEROES };

/** Таланты 10/15/20/25 — общая лестница для всех героев (Dota-подобные пары). */
export const HERO_TALENTS: Record<number, readonly [string, string]> = {
  10: ["t10_dmg", "t10_ms"],
  15: ["t15_crit", "t15_hp"],
  20: ["t20_armor", "t20_cd"],
  25: ["t25_regen", "t25_ult"],
};
