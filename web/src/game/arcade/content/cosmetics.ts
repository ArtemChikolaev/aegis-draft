// Косметика Аркады (T13.12, идея владельца: «сеты как в Dota — выбивать и надевать»). В 2D без арта
// сетов косметика = рамка медальона, трейл, эффект смерти врагов и оттенок эффектов героя.
// Правило PRD §5.10: косметика не меняет ни одного числа и не входит в сид/лог.
import { Rng } from "../../rng.ts";
import type { ArcadeOutcome, Rarity } from "../types.ts";

export type CosmeticSlot = "frame" | "trail" | "death" | "tint";

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  rarity: Rarity;
  /** Параметр для рендера: цвет-ключ палитры (`--arcade-*`) или вариант эффекта. */
  variant: string;
}

export const COSMETICS: readonly CosmeticDef[] = [
  { id: "frame_bronze", slot: "frame", rarity: "standard", variant: "bronze" },
  { id: "frame_silver", slot: "frame", rarity: "refined", variant: "silver" },
  { id: "frame_gold", slot: "frame", rarity: "exotic", variant: "gold" },
  { id: "frame_immortal", slot: "frame", rarity: "arcana", variant: "immortal" },
  { id: "trail_ember", slot: "trail", rarity: "standard", variant: "fire" },
  { id: "trail_frost", slot: "trail", rarity: "refined", variant: "frost" },
  { id: "trail_arc", slot: "trail", rarity: "exotic", variant: "lightning" },
  { id: "trail_aegis", slot: "trail", rarity: "arcana", variant: "aegis" },
  { id: "death_ring", slot: "death", rarity: "standard", variant: "ring" },
  { id: "death_shatter", slot: "death", rarity: "refined", variant: "shatter" },
  { id: "death_nova", slot: "death", rarity: "exotic", variant: "nova" },
  { id: "tint_radiance", slot: "tint", rarity: "standard", variant: "fire" },
  { id: "tint_skadi", slot: "tint", rarity: "refined", variant: "frost" },
  { id: "tint_arcane", slot: "tint", rarity: "exotic", variant: "lightning" },
];

export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = ["frame", "trail", "death", "tint"];

/** Осколки Aegis за дубликат — по редкости. */
export const DUPLICATE_SHARDS: Record<Rarity, number> = { standard: 5, refined: 12, exotic: 30, arcana: 80 };

export interface CosmeticDrop {
  id: string;
  duplicate: boolean;
  shards: number;
}

/** Дроп по итогу забега: детерминирован сидом и исходом (не золотом и не временем суток), чтобы
 *  перезапуск того же сида не был «слот-машиной». Число бросков: 1 за забег + 1 за Рошана + 1 за
 *  победу; редкость растёт с рангом. Реплеи дропа не дают (решает вызывающий). */
export function rollCosmeticDrops(seed: string, outcome: ArcadeOutcome, owned: readonly string[]): CosmeticDrop[] {
  const rng = new Rng(`cosmetics:${seed}:${outcome.outcome}:${outcome.tick}`);
  let rolls = 1 + (outcome.roshanKilled ? 1 : 0) + (outcome.outcome === "victory" ? 1 : 0);
  if (outcome.tick < 60 * 60) rolls = 0; // меньше минуты — не забег
  const t = Math.min(1, outcome.rank / 20);
  const weights: Record<Rarity, number> = { standard: 70 - 40 * t, refined: 24 + 16 * t, exotic: 5 + 16 * t, arcana: 1 + 8 * t };
  const drops: CosmeticDrop[] = [];
  const have = new Set(owned);
  for (let i = 0; i < rolls; i++) {
    let roll = rng.float() * (weights.standard + weights.refined + weights.exotic + weights.arcana);
    let rarity: Rarity = "standard";
    for (const r of ["standard", "refined", "exotic", "arcana"] as const) { roll -= weights[r]; if (roll <= 0) { rarity = r; break; } }
    const pool = COSMETICS.filter((c) => c.rarity === rarity);
    const def = pool[rng.int(pool.length)];
    const duplicate = have.has(def.id);
    have.add(def.id);
    drops.push({ id: def.id, duplicate, shards: duplicate ? DUPLICATE_SHARDS[rarity] : 0 });
  }
  return drops;
}
