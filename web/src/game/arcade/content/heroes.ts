// Герои Arcade (T13.9): кит героя — контент, а не код. Каждая способность — один из типовых
// «видов» (AbilityKind) с параметрами по уровню; механика видов живёт в sim.ts. Новый герой =
// запись здесь + тексты в i18n; новый вид способности = ветка в sim. Портреты — по `picture`
// из heroes.json (dotaId — чтобы брать имя из датасета).
import type { PlayerStats } from "../types.ts";

export type HeroId = "juggernaut" | "crystal_maiden" | "sniper" | "axe" | "zeus";
export const HERO_IDS: readonly HeroId[] = ["juggernaut", "crystal_maiden", "sniper", "axe", "zeus"];

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
  base: Partial<Pick<PlayerStats, "maxHp" | "regen" | "armor" | "speed" | "damage" | "attackInterval" | "range">>;
  abilities: { q: AbilityDef; w: AbilityDef; e: AbilityDef; r: AbilityDef };
}

export const HEROES: Record<HeroId, HeroDef> = {
  juggernaut: {
    id: "juggernaut", dotaId: 8, picture: "juggernaut", ranged: false,
    base: {},
    abilities: {
      q: { kind: "spin", value: [0, 38, 60, 82, 104], cooldown: 16, radius: 104, duration: 4 },
      w: { kind: "ward", value: [0, 0.028, 0.034, 0.04, 0.046], cooldown: 32, radius: 170, duration: 8 },
      e: { kind: "crit", value: [0, 0.2, 0.25, 0.3, 0.35], cooldown: 0, passive: true },
      r: { kind: "omni", value: [0, 110, 200, 290], cooldown: 70, radius: 230, duration: 1.5, count: [0, 5, 7, 9] },
    },
  },
  crystal_maiden: {
    id: "crystal_maiden", dotaId: 5, picture: "crystal_maiden", ranged: true,
    base: { maxHp: 560, speed: 162, damage: 22, attackInterval: 1.0, range: 300, armor: 1 },
    abilities: {
      q: { kind: "nova", value: [0, 110, 170, 230, 290], cooldown: 8, radius: 170, duration: 3 },
      w: { kind: "frostbite", value: [0, 140, 220, 300, 380], cooldown: 7, radius: 320, duration: 2 },
      e: { kind: "arcane_aura", value: [0, 0.06, 0.1, 0.14, 0.18], cooldown: 0, passive: true },
      r: { kind: "freezing_field", value: [0, 70, 105, 140], cooldown: 60, radius: 270, duration: 6 },
    },
  },
  sniper: {
    id: "sniper", dotaId: 35, picture: "sniper", ranged: true,
    base: { maxHp: 540, speed: 158, damage: 26, attackInterval: 0.9, range: 340, armor: 1 },
    abilities: {
      q: { kind: "shrapnel", value: [0, 18, 28, 38, 48], cooldown: 12, radius: 180, duration: 8 },
      w: { kind: "headshot", value: [0, 20, 40, 60, 80], cooldown: 0, passive: true },
      e: { kind: "take_aim", value: [0, 60, 100, 140, 180], cooldown: 0, passive: true },
      r: { kind: "assassinate", value: [0, 450, 800, 1200], cooldown: 28, radius: 640 },
    },
  },
  axe: {
    id: "axe", dotaId: 2, picture: "axe", ranged: false,
    base: { maxHp: 680, speed: 166, damage: 18, attackInterval: 0.95, range: 84, armor: 4, regen: 4 },
    abilities: {
      q: { kind: "berserker_call", value: [0, 1.4, 1.7, 2.0, 2.3], cooldown: 14, radius: 170, duration: 3 },
      w: { kind: "battle_hunger", value: [0, 14, 20, 26, 32], cooldown: 11, radius: 320, duration: 5, count: [0, 3, 4, 5, 6] },
      e: { kind: "counter_helix", value: [0, 45, 65, 85, 105], cooldown: 0, radius: 130, passive: true },
      r: { kind: "culling_blade", value: [0, 180, 300, 420], cooldown: 30, radius: 130, duration: 3 },
    },
  },
  zeus: {
    id: "zeus", dotaId: 22, picture: "zeus", ranged: true,
    base: { maxHp: 500, speed: 160, damage: 22, attackInterval: 1.0, range: 300, armor: 1 },
    abilities: {
      q: { kind: "arc_lightning", value: [0, 36, 54, 72, 90], cooldown: 2.2, radius: 320, count: [0, 4, 6, 8, 10] },
      w: { kind: "lightning_bolt", value: [0, 140, 220, 300, 380], cooldown: 7, radius: 420, duration: 0.5 },
      e: { kind: "static_field", value: [0, 0.03, 0.045, 0.06, 0.075], cooldown: 0, radius: 320, passive: true },
      r: { kind: "thundergod", value: [0, 220, 340, 460], cooldown: 70, radius: 760 },
    },
  },
};

/** Таланты 10/15/20/25 — общая лестница для всех героев (Dota-подобные пары). */
export const HERO_TALENTS: Record<number, readonly [string, string]> = {
  10: ["t10_dmg", "t10_ms"],
  15: ["t15_crit", "t15_hp"],
  20: ["t20_armor", "t20_cd"],
  25: ["t25_regen", "t25_ult"],
};
