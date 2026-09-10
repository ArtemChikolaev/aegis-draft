// «Наследие Aegis» (T13.44, этап 2 аудита 2026-09-08): небольшая постоянная прокачка ВСЕГО ростера за победы в полных
// актах. Печать за победу в full/dire/river (+1 за первую полную победу героем), один пункт = одна печать, сброс
// бесплатный. Потолок мал намеренно: экипировка остаётся главным источником силы между забегами; после потолка
// победы дают только трофеи. Бонусы применяются один раз (см. sim: maxHp/pickup в recomputeStats, урон в damageEnemy).
export type LegacyBranch = "vitality" | "might" | "reach";
export const LEGACY_BRANCHES: readonly LegacyBranch[] = ["vitality", "might", "reach"];
export const LEGACY_MAX_RANK = 4;
/** Прибавка за пункт: +2% HP, +1.5% всего исходящего урона, +3% радиуса сбора опыта. */
export const LEGACY_PER_RANK: Record<LegacyBranch, number> = { vitality: 0.02, might: 0.015, reach: 0.03 };

export type LegacySpent = Record<LegacyBranch, number>;
/** Множители к базе: ≥ 1, ровно один раз каждый. */
export interface LegacyBonus { hp: number; damage: number; pickup: number }

export const LEGACY_NONE: LegacyBonus = Object.freeze({ hp: 1, damage: 1, pickup: 1 });
export const LEGACY_ZERO: LegacySpent = Object.freeze({ vitality: 0, might: 0, reach: 0 }) as LegacySpent;

export function clampLegacy(spent: Partial<LegacySpent> | null | undefined): LegacySpent {
  const out = { ...LEGACY_ZERO };
  for (const b of LEGACY_BRANCHES) {
    const v = spent?.[b];
    out[b] = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(LEGACY_MAX_RANK, Math.floor(v))) : 0;
  }
  return out;
}

export function legacyBonus(spent: Partial<LegacySpent> | null | undefined): LegacyBonus {
  const s = clampLegacy(spent);
  return { hp: 1 + LEGACY_PER_RANK.vitality * s.vitality, damage: 1 + LEGACY_PER_RANK.might * s.might, pickup: 1 + LEGACY_PER_RANK.reach * s.reach };
}

export function legacySpentTotal(spent: LegacySpent): number {
  return spent.vitality + spent.might + spent.reach;
}
