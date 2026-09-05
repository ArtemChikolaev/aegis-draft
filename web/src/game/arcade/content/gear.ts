// Экипировка Аркады (T13.14, «инвентарь как в Death Must Die»): предметы падают с элиты, боссов
// и сундуков, имеют слот, редкость, тир и 1–3 аффикса из пула слота (один гарантированный +
// опциональные, как у референса). Экипированное живёт между забегами (стор) и применяется к
// статам героя на старте. Иконки — настоящие предметы Dota (`art/items`, зеркалятся gen:art).
import { Rng } from "../../rng.ts";
import type { ArcadeItemDef } from "./items.ts";
import type { Rarity } from "../types.ts";

export type GearSlot = "weapon" | "helm" | "armor" | "boots" | "amulet" | "ring";
export const GEAR_SLOTS: readonly GearSlot[] = ["weapon", "helm", "armor", "boots", "amulet", "ring"];

export type AffixStat = keyof Pick<ArcadeItemDef["effect"], "damage" | "attackSpeed" | "crit" | "lifesteal" | "maxHp" | "armor" | "regen" | "cooldown" | "moveSpeed" | "goldPerKill" | "xpMult">;

export interface GearBase {
  id: string;
  slot: GearSlot;
  /** Внутреннее имя предмета Dota для иконки. */
  art: string;
  /** Минимальный тир, с которого выпадает (1–3). */
  minTier: 1 | 2 | 3;
}

export const GEAR_BASES: readonly GearBase[] = [
  { id: "quelling_blade", slot: "weapon", art: "quelling_blade", minTier: 1 },
  { id: "broadsword", slot: "weapon", art: "broadsword", minTier: 1 },
  { id: "claymore", slot: "weapon", art: "claymore", minTier: 2 },
  { id: "demon_edge", slot: "weapon", art: "demon_edge", minTier: 3 },
  { id: "helm_of_iron_will", slot: "helm", art: "helm_of_iron_will", minTier: 1 },
  { id: "hood_of_defiance", slot: "helm", art: "hood_of_defiance", minTier: 2 },
  { id: "helm_of_the_dominator", slot: "helm", art: "helm_of_the_dominator", minTier: 3 },
  { id: "chainmail", slot: "armor", art: "chainmail", minTier: 1 },
  { id: "platemail", slot: "armor", art: "platemail", minTier: 2 },
  { id: "vanguard", slot: "armor", art: "vanguard", minTier: 2 },
  { id: "assault_cuirass", slot: "armor", art: "assault", minTier: 3 },
  { id: "boots_of_speed", slot: "boots", art: "boots", minTier: 1 },
  { id: "power_treads", slot: "boots", art: "power_treads", minTier: 2 },
  { id: "phase_boots", slot: "boots", art: "phase_boots", minTier: 2 },
  { id: "boots_of_travel", slot: "boots", art: "travel_boots", minTier: 3 },
  { id: "talisman_of_evasion", slot: "amulet", art: "talisman_of_evasion", minTier: 1 },
  { id: "magic_wand", slot: "amulet", art: "magic_wand", minTier: 1 },
  { id: "holy_locket", slot: "amulet", art: "holy_locket", minTier: 3 },
  { id: "ring_of_regen", slot: "ring", art: "ring_of_regen", minTier: 1 },
  { id: "ring_of_health", slot: "ring", art: "ring_of_health", minTier: 2 },
  { id: "sages_mask", slot: "ring", art: "sobi_mask", minTier: 1 },
  { id: "ring_of_basilius", slot: "ring", art: "ring_of_basilius", minTier: 2 },
];
export const GEAR_BASE_BY_ID: Record<string, GearBase> = Object.fromEntries(GEAR_BASES.map((b) => [b.id, b]));

/** Пулы аффиксов по слоту: первый — гарантированный, остальные — опциональные. */
const AFFIX_POOL: Record<GearSlot, { guaranteed: AffixStat[]; optional: AffixStat[] }> = {
  weapon: { guaranteed: ["damage"], optional: ["attackSpeed", "crit", "lifesteal"] },
  helm: { guaranteed: ["armor"], optional: ["maxHp", "cooldown", "regen"] },
  armor: { guaranteed: ["maxHp"], optional: ["armor", "regen", "lifesteal"] },
  boots: { guaranteed: ["moveSpeed"], optional: ["armor", "attackSpeed", "maxHp"] },
  amulet: { guaranteed: ["regen"], optional: ["xpMult", "cooldown", "crit"] },
  ring: { guaranteed: ["goldPerKill"], optional: ["crit", "lifesteal", "maxHp", "cooldown"] },
};

/** База значения аффикса на тир 1 (тир умножает ×1 / ×1.6 / ×2.4). */
const AFFIX_BASE: Record<AffixStat, [min: number, max: number]> = {
  damage: [4, 10], attackSpeed: [0.04, 0.1], crit: [0.03, 0.07], lifesteal: [0.02, 0.05], maxHp: [40, 90], armor: [1, 3],
  regen: [0.6, 1.6], cooldown: [0.02, 0.05], moveSpeed: [0.02, 0.05], goldPerKill: [1, 1], xpMult: [0.03, 0.07],
};
const TIER_MULT = [0, 1, 1.6, 2.4];
const RARITY_AFFIXES: Record<Rarity, number> = { standard: 1, refined: 2, exotic: 3, arcana: 3 };
const RARITY_VALUE_MULT: Record<Rarity, number> = { standard: 1, refined: 1.1, exotic: 1.2, arcana: 1.45 };

export interface GearAffix {
  stat: AffixStat;
  value: number;
}

export interface GearItem {
  uid: string;
  base: string;
  slot: GearSlot;
  rarity: Rarity;
  tier: 1 | 2 | 3;
  affixes: GearAffix[];
  /** Уникальный предмет босса (фиксированные аффиксы + особое свойство). */
  unique?: "aegis_of_the_immortal" | "tormentors_shard" | "heart_of_the_ancient";
}

export const UNIQUES: Record<NonNullable<GearItem["unique"]>, { base: string; art: string; slot: GearSlot; affixes: GearAffix[] }> = {
  aegis_of_the_immortal: { base: "aegis", art: "aegis", slot: "amulet", affixes: [{ stat: "regen", value: 3 }, { stat: "maxHp", value: 150 }] },
  tormentors_shard: { base: "tormentors_shard", art: "aghanims_shard", slot: "ring", affixes: [{ stat: "goldPerKill", value: 2 }, { stat: "crit", value: 0.1 }] },
  heart_of_the_ancient: { base: "heart_of_the_ancient", art: "heart", slot: "armor", affixes: [{ stat: "maxHp", value: 400 }, { stat: "regen", value: 6 }, { stat: "armor", value: 5 }] },
};

function round(stat: AffixStat, v: number): number {
  return stat === "damage" || stat === "maxHp" || stat === "armor" || stat === "goldPerKill" ? Math.round(v) : Math.round(v * 1000) / 1000;
}

/** Бросок предмета: слот случайный (или заданный), база по тиру, аффиксы по редкости. */
export function rollGear(rng: Rng, tier: 1 | 2 | 3, rarity: Rarity, uid: string, slot?: GearSlot): GearItem {
  const s = slot ?? GEAR_SLOTS[rng.int(GEAR_SLOTS.length)];
  const bases = GEAR_BASES.filter((b) => b.slot === s && b.minTier <= tier);
  const base = bases[rng.int(bases.length)];
  const pool = AFFIX_POOL[s];
  const affixes: GearAffix[] = [];
  const roll = (stat: AffixStat) => {
    const [lo, hi] = AFFIX_BASE[stat];
    const v = (lo + rng.float() * (hi - lo)) * TIER_MULT[tier] * RARITY_VALUE_MULT[rarity];
    affixes.push({ stat, value: round(stat, v) });
  };
  roll(pool.guaranteed[rng.int(pool.guaranteed.length)]);
  const optional = [...pool.optional];
  for (let i = 1; i < RARITY_AFFIXES[rarity] && optional.length > 0; i++) roll(optional.splice(rng.int(optional.length), 1)[0]);
  return { uid, base: base.id, slot: s, rarity, tier, affixes };
}

export function uniqueGear(kind: NonNullable<GearItem["unique"]>, uid: string, tier: 1 | 2 | 3): GearItem {
  const u = UNIQUES[kind];
  return { uid, base: u.base, slot: u.slot, rarity: "arcana", tier, affixes: u.affixes.map((a) => ({ ...a })), unique: kind };
}

/** Эффект предмета в терминах статов лавки — одна точка применения в recomputeStats. */
export function gearEffect(item: GearItem): ArcadeItemDef["effect"] {
  const e: ArcadeItemDef["effect"] = {};
  for (const a of item.affixes) (e as Record<string, number>)[a.stat] = ((e as Record<string, number>)[a.stat] ?? 0) + a.value;
  return e;
}

/** Грубая «сила» предмета для сравнения и авто-подсказки: сумма аффиксов в долях базового диапазона тира 3. */
export function gearScore(item: GearItem): number {
  let score = 0;
  for (const a of item.affixes) {
    const [, hi] = AFFIX_BASE[a.stat];
    score += a.value / (hi * TIER_MULT[3]);
  }
  return Math.round(score * 100) / 100;
}

export function gearArt(item: GearItem): string {
  return item.unique ? UNIQUES[item.unique].art : GEAR_BASE_BY_ID[item.base]?.art ?? item.base;
}

/** Осколки Aegis за разбор. */
export const GEAR_SALVAGE: Record<Rarity, number> = { standard: 3, refined: 8, exotic: 20, arcana: 50 };
