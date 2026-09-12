// Стартовые особенности героя (T13.62): по аудиту 2026-09-08 — «альтернативная стартовая особенность с преимуществом
// и недостатком» после первых отметок мастерства. Общий набор для всего ростера (не 126 деревьев): каждая особенность —
// множители базовых статов с плюсом и минусом, применяются в recomputeStats поверх `hero.base` до апгрейдов и экипировки.
// Открываются числом отметок мастерства героя (`unlockMarks`); дейлик — всегда без особенности. Числа стартовые.
import type { PlayerStats } from "../types.ts";

export type TraitId = "berserk" | "bulwark" | "swift" | "scavenger";
export type TraitStat = keyof Pick<PlayerStats, "maxHp" | "regen" | "armor" | "speed" | "damage" | "attackInterval" | "pickup">;

export interface TraitDef {
  id: TraitId;
  /** Множители базовых статов (>1 — плюс, <1 — минус; для attackInterval наоборот). */
  mult: Partial<Record<TraitStat, number>>;
  /** Плоские прибавки (броня). */
  add?: Partial<Record<TraitStat, number>>;
  /** Сколько отметок мастерства героя нужно, чтобы выбрать. */
  unlockMarks: number;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  berserk: { id: "berserk", mult: { damage: 1.2, attackInterval: 0.92, maxHp: 0.9 }, unlockMarks: 1 },
  bulwark: { id: "bulwark", mult: { maxHp: 1.2, speed: 0.9 }, add: { armor: 3 }, unlockMarks: 1 },
  swift: { id: "swift", mult: { speed: 1.12, pickup: 1.15, damage: 0.9 }, unlockMarks: 2 },
  scavenger: { id: "scavenger", mult: { pickup: 1.2, regen: 1.4, maxHp: 0.9 }, unlockMarks: 2 },
};

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export function isTraitId(id: unknown): id is TraitId {
  return typeof id === "string" && id in TRAITS;
}

/** Особенность доступна герою с таким числом отметок мастерства. */
export function traitUnlocked(id: TraitId, marks: number): boolean {
  return marks >= TRAITS[id].unlockMarks;
}

/** Применить особенность к базовым статам (мутирует `s`). */
export function applyTrait(s: PlayerStats, trait: TraitDef | null): void {
  if (!trait) return;
  for (const [k, v] of Object.entries(trait.mult) as [TraitStat, number][]) s[k] *= v;
  for (const [k, v] of Object.entries(trait.add ?? {}) as [TraitStat, number][]) s[k] += v;
}
