// Лестница сложности Arcade (T13.7, PRD §5.15): ранги Dota × 5 звёзд = 40 ступеней, как уровни
// сложности референса. Каждая ступень — числовые множители; каждый ранг сверх Herald добавляет
// именованное правило (флаг), которое меняет рисунок боя, а не только числа.
export const RANK_TIERS = ["herald", "guardian", "crusader", "archon", "legend", "ancient", "divine", "immortal"] as const;
export type RankTier = (typeof RANK_TIERS)[number];
export const STARS = 5;
export const MAX_RANK_STEP = RANK_TIERS.length * STARS - 1;

export interface RankRules {
  step: number;
  tier: RankTier;
  stars: number;
  hpMult: number;
  dmgMult: number;
  spawnMult: number;
  speedMult: number;
  /** Guardian+: элитные големы приходят вдвое чаще. */
  doubleGolems: boolean;
  /** Crusader+: крип-волны в полтора раза больше. */
  bigWaves: boolean;
  /** Archon+: каждые 45 с — стая холмовых троллей со всех сторон. */
  trollPacks: boolean;
  /** Legend+: осадный крип в каждой третьей волне (вместо пятой). */
  siegeOften: boolean;
  /** Ancient+: Рошан приходит на минуту раньше. */
  earlyRoshan: boolean;
  /** Divine+: статусы (горение/заморозка/стан) на врагах короче на 30%. */
  resistStatus: boolean;
  /** Immortal: XP-шарды дают на 20% меньше. */
  lessXp: boolean;
}

export function rankOf(step: number): RankRules {
  const s = Math.max(0, Math.min(MAX_RANK_STEP, Math.floor(step)));
  const tierIdx = Math.floor(s / STARS);
  return {
    step: s,
    tier: RANK_TIERS[tierIdx],
    stars: (s % STARS) + 1,
    hpMult: 1 + 0.06 * s,
    dmgMult: 1 + 0.05 * s,
    spawnMult: 1 + 0.035 * s,
    speedMult: 1 + 0.008 * s,
    doubleGolems: tierIdx >= 1,
    bigWaves: tierIdx >= 2,
    trollPacks: tierIdx >= 3,
    siegeOften: tierIdx >= 4,
    earlyRoshan: tierIdx >= 5,
    resistStatus: tierIdx >= 6,
    lessXp: tierIdx >= 7,
  };
}

export function rankStep(tier: RankTier, stars: number): number {
  return RANK_TIERS.indexOf(tier) * STARS + Math.max(0, Math.min(STARS - 1, stars - 1));
}
