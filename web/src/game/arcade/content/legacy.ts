// «Наследие Aegis» (T13.44, этап 2 аудита 2026-09-08; переделка T13.88, владелец 2026-09-13: «прокачки такие же, как
// XP-радиус, скорость бега — не прямые бафы урона и HP»): небольшая постоянная прокачка УДОБСТВА для всего ростера
// за победы в полных актах. Печать за победу в full/dire/river (+1 за первую полную победу героем), один пункт = одна
// печать, сброс бесплатный. Ни одна ветка не трогает урон, HP и броню: сила между забегами — только экипировка.
// Бонусы применяются один раз (см. sim: speed/pickup в recomputeStats, лавка в shopPriceMult, рероллы в
// levelRerollPrice, стартовое золото в конструкторе).
export type LegacyBranch = "reach" | "swift" | "thrift" | "insight" | "provisions";
export const LEGACY_BRANCHES: readonly LegacyBranch[] = ["reach", "swift", "thrift", "insight", "provisions"];
export const LEGACY_MAX_RANK = 4;
/** Прибавка за пункт: +3% радиуса сбора опыта, +1% скорости бега, −2% к ценам лавки, +1 бесплатный реролл
 *  уровня за забег, +10 золота на старте. */
export const LEGACY_PER_RANK: Record<LegacyBranch, number> = { reach: 0.03, swift: 0.01, thrift: 0.02, insight: 1, provisions: 10 };
/** Как показывать ветку: проценты или штуки. */
export const LEGACY_KIND: Record<LegacyBranch, "pct" | "count"> = { reach: "pct", swift: "pct", thrift: "pct", insight: "count", provisions: "count" };

export type LegacySpent = Record<LegacyBranch, number>;
/** Снимок для сима: множители ≥ 1 (pickup, speed), множитель цен лавки ≤ 1, штуки — бесплатные рероллы и золото. */
export interface LegacyBonus { pickup: number; speed: number; shop: number; rerolls: number; gold: number }

export const LEGACY_NONE: LegacyBonus = Object.freeze({ pickup: 1, speed: 1, shop: 1, rerolls: 0, gold: 0 });
export const LEGACY_ZERO: LegacySpent = Object.freeze({ reach: 0, swift: 0, thrift: 0, insight: 0, provisions: 0 }) as LegacySpent;

/** Обрезка сейва/реплея: чужие ветки (старые `vitality`/`might` — до T13.88) отбрасываются, печати возвращаются в свободные. */
export function clampLegacy(spent: Partial<Record<string, number>> | null | undefined): LegacySpent {
  const out = { ...LEGACY_ZERO };
  for (const b of LEGACY_BRANCHES) {
    const v = spent?.[b];
    out[b] = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(LEGACY_MAX_RANK, Math.floor(v))) : 0;
  }
  return out;
}

export function legacyBonus(spent: Partial<Record<string, number>> | null | undefined): LegacyBonus {
  const s = clampLegacy(spent);
  return {
    pickup: 1 + LEGACY_PER_RANK.reach * s.reach,
    speed: 1 + LEGACY_PER_RANK.swift * s.swift,
    shop: 1 - LEGACY_PER_RANK.thrift * s.thrift,
    rerolls: LEGACY_PER_RANK.insight * s.insight,
    gold: LEGACY_PER_RANK.provisions * s.provisions,
  };
}

export function legacySpentTotal(spent: LegacySpent): number {
  return LEGACY_BRANCHES.reduce((n, b) => n + spent[b], 0);
}
