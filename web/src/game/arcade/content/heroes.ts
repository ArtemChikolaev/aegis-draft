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
  | "bristleback" | "sven" | "storm_spirit" | "leshrac";
export type HeroId = UniqueHeroId | TemplateHeroId;
export type ArchetypeId = "blademaster" | "frostfire" | "marksman" | "warlord" | "stormcaller";
export const HERO_IDS: readonly HeroId[] = [
  "juggernaut", "crystal_maiden", "sniper", "axe", "zeus",
  "phantom_assassin", "anti_mage", "lina", "lich", "drow_ranger", "windranger", "bristleback", "sven", "storm_spirit", "leshrac",
];

export type AbilityKind =
  | "spin" | "ward" | "crit" | "omni"
  | "nova" | "frostbite" | "arcane_aura" | "freezing_field"
  | "shrapnel" | "headshot" | "take_aim" | "assassinate"
  | "berserker_call" | "battle_hunger" | "counter_helix" | "culling_blade"
  | "arc_lightning" | "lightning_bolt" | "static_field" | "thundergod";

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
export const ARCHETYPES: Record<ArchetypeId, { ranged: boolean; abilities: HeroDef["abilities"] }> = {
  // Мили-керри: вихрь + пожирающий голод + крит + серия ударов.
  blademaster: {
    ranged: false,
    abilities: {
      q: { kind: "spin", value: [0, 38, 60, 82, 104], cooldown: 15, radius: 100, duration: 3.5 },
      w: { kind: "battle_hunger", value: [0, 12, 18, 24, 30], cooldown: 12, radius: 300, duration: 5, count: [0, 2, 3, 4, 5] },
      e: { kind: "crit", value: [0, 0.18, 0.24, 0.3, 0.36], cooldown: 0, passive: true },
      r: { kind: "omni", value: [0, 100, 180, 260], cooldown: 70, radius: 220, duration: 1.5, count: [0, 5, 7, 9] },
    },
  },
  // Кастер огня/льда: нова + разряд + аура + ледяное поле.
  frostfire: {
    ranged: true,
    abilities: {
      q: { kind: "nova", value: [0, 100, 155, 210, 265], cooldown: 8, radius: 165, duration: 3 },
      w: { kind: "lightning_bolt", value: [0, 130, 200, 270, 340], cooldown: 7, radius: 400, duration: 0.4 },
      e: { kind: "arcane_aura", value: [0, 0.05, 0.09, 0.13, 0.17], cooldown: 0, passive: true },
      r: { kind: "freezing_field", value: [0, 65, 100, 135], cooldown: 62, radius: 260, duration: 6 },
    },
  },
  // Стрелок: зона осколков + хедшот + прицел + град молний как «залп».
  marksman: {
    ranged: true,
    abilities: {
      q: { kind: "shrapnel", value: [0, 13, 21, 29, 37], cooldown: 13, radius: 165, duration: 8 },
      w: { kind: "headshot", value: [0, 18, 36, 54, 72], cooldown: 0, passive: true },
      e: { kind: "take_aim", value: [0, 40, 70, 100, 130], cooldown: 0, passive: true },
      r: { kind: "thundergod", value: [0, 100, 170, 240], cooldown: 80, radius: 600 },
    },
  },
  // Танк: зов + тотем лечения + контр-спин + серия ударов.
  warlord: {
    ranged: false,
    abilities: {
      q: { kind: "berserker_call", value: [0, 1.3, 1.6, 1.9, 2.2], cooldown: 14, radius: 165, duration: 3 },
      w: { kind: "ward", value: [0, 0.024, 0.03, 0.036, 0.042], cooldown: 32, radius: 170, duration: 8 },
      e: { kind: "counter_helix", value: [0, 40, 60, 80, 100], cooldown: 0, radius: 130, passive: true },
      r: { kind: "omni", value: [0, 90, 160, 230], cooldown: 70, radius: 220, duration: 1.5, count: [0, 5, 7, 9] },
    },
  },
  // Нюкер: дуга + обморожение + статика + гнев.
  stormcaller: {
    ranged: true,
    abilities: {
      q: { kind: "arc_lightning", value: [0, 28, 42, 56, 70], cooldown: 2.8, radius: 320, count: [0, 3, 4, 5, 6] },
      w: { kind: "frostbite", value: [0, 110, 170, 230, 290], cooldown: 8.5, radius: 320, duration: 1.8 },
      e: { kind: "static_field", value: [0, 0.02, 0.032, 0.044, 0.056], cooldown: 0, radius: 300, passive: true },
      r: { kind: "thundergod", value: [0, 140, 220, 300], cooldown: 80, radius: 660 },
    },
  },
};

const MELEE_BASE: HeroDef["base"] = {};
const RANGED_BASE: HeroDef["base"] = { maxHp: 510, speed: 160, damage: 21, attackInterval: 1.0, range: 310, armor: 1, pickup: 230 };

function templateHero(id: TemplateHeroId, dotaId: number, picture: string, archetype: ArchetypeId, base: HeroDef["base"] = {}): HeroDef {
  const arch = ARCHETYPES[archetype];
  return { id, kit: archetype, dotaId, picture, ranged: arch.ranged, base: { ...(arch.ranged ? RANGED_BASE : MELEE_BASE), ...base }, abilities: arch.abilities };
}

export const HEROES: Record<HeroId, HeroDef> = {
  ...UNIQUE_HEROES,
  phantom_assassin: templateHero("phantom_assassin", 44, "phantom_assassin", "blademaster", { speed: 176, damage: 26, maxHp: 560 }),
  anti_mage: templateHero("anti_mage", 1, "antimage", "blademaster", { speed: 182, attackInterval: 0.8, maxHp: 580 }),
  lina: templateHero("lina", 25, "lina", "frostfire", { damage: 24, maxHp: 500 }),
  lich: templateHero("lich", 31, "lich", "frostfire", { maxHp: 580, armor: 2, speed: 156 }),
  drow_ranger: templateHero("drow_ranger", 6, "drow_ranger", "marksman", { range: 350, damage: 25 }),
  windranger: templateHero("windranger", 21, "windrunner", "marksman", { speed: 168, attackInterval: 0.85 }),
  bristleback: templateHero("bristleback", 99, "bristleback", "warlord", { maxHp: 760, armor: 6, regen: 5, damage: 18 }),
  sven: templateHero("sven", 18, "sven", "warlord", { maxHp: 700, damage: 26, armor: 4, regen: 3 }),
  storm_spirit: templateHero("storm_spirit", 17, "storm_spirit", "stormcaller", { speed: 172, maxHp: 500 }),
  leshrac: templateHero("leshrac", 52, "leshrac", "stormcaller", { damage: 24, maxHp: 520, armor: 2 }),
};

/** Таланты 10/15/20/25 — общая лестница для всех героев (Dota-подобные пары). */
export const HERO_TALENTS: Record<number, readonly [string, string]> = {
  10: ["t10_dmg", "t10_ms"],
  15: ["t15_crit", "t15_hp"],
  20: ["t20_armor", "t20_cd"],
  25: ["t25_regen", "t25_ult"],
};
