// Оптимальное назначение героев игрокам (скилл scoring-model: matching, НЕ жадность).
import type { PackPlayer, PlayerHeroStats, Stat } from "../types/data.ts";
import { smoothedWinrate } from "./smoothing.ts";

/** Синтетический prior для сигнатурного героя без player×hero stats в данных. */
export const SIGNATURE_PRIOR: Stat = { games: 8, winrate: 0.58 };

export type SignatureLookup = Record<number, number[]>;

export interface Assignment {
  byPlayer: Record<number, number>;
  total: number;
  avg: number;
}

/** Скор пары (игрок, герой) — сглаженный winrate; сигнатурный герой → умеренный prior. */
export function pairScore(
  accountId: number,
  heroId: number,
  phs: PlayerHeroStats,
  signatures: SignatureLookup = {},
): number {
  const stat = phs[String(accountId)]?.[String(heroId)];
  if (stat) return smoothedWinrate(stat);
  if (signatures[accountId]?.includes(heroId)) return smoothedWinrate(SIGNATURE_PRIOR);
  return smoothedWinrate(undefined);
}

/**
 * Скор для венгерского matching: приоритет — больше игр на герое, затем winrate.
 * Любой опыт на герое beats отсутствие данных / чужую сигнатуру.
 */
export function assignmentPairScore(
  accountId: number,
  heroId: number,
  phs: PlayerHeroStats,
  signatures: SignatureLookup = {},
): number {
  const stat = phs[String(accountId)]?.[String(heroId)];
  if (stat && stat.games > 0) {
    return stat.games * 1000 + smoothedWinrate(stat);
  }
  if (signatures[accountId]?.includes(heroId)) {
    return SIGNATURE_PRIOR.games * 100 + smoothedWinrate(SIGNATURE_PRIOR);
  }
  return 0;
}

/** Сумма synergyPairScore для финального назначения (OVR Hero Synergy). */
export function synergyTotalForAssignment(
  byPlayer: Record<number, number>,
  phs: PlayerHeroStats,
  signatures: SignatureLookup = {},
): number {
  return Object.entries(byPlayer).reduce(
    (sum, [accountId, heroId]) => sum + pairScore(Number(accountId), heroId, phs, signatures),
    0,
  );
}

export function bestAssignment(
  players: PackPlayer[],
  heroPool: number[],
  phs: PlayerHeroStats,
  signatures: SignatureLookup = {},
): Assignment {
  const n = players.length;
  const pool = [...new Set(heroPool)];
  const H = pool.length;
  const score = players.map((p) => pool.map((h) => assignmentPairScore(p.accountId, h, phs, signatures)));

  interface State { val: number; pick: number[] }

  const states = 1 << n;
  let dp: (State | undefined)[] = Array(states);
  dp[0] = { val: 0, pick: Array(n).fill(-1) };
  for (let j = 0; j < H; j++) {
    const next = [...dp];
    for (let mask = 0; mask < states; mask++) {
      const state = dp[mask];
      if (!state) continue;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) continue;
        const nextMask = mask | (1 << i);
        const val = state.val + score[i][j];
        if (!next[nextMask] || val > next[nextMask]!.val) {
          const pick = [...state.pick];
          pick[i] = j;
          next[nextMask] = { val, pick };
        }
      }
    }
    dp = next;
  }

  let bestMask = 0;
  for (let mask = 1; mask < states; mask++) {
    const candidate = dp[mask];
    const best = dp[bestMask];
    if (!candidate) continue;
    const assigned = popcount(mask);
    const bestAssigned = popcount(bestMask);
    if (assigned > bestAssigned || (assigned === bestAssigned && (!best || candidate.val > best.val))) {
      bestMask = mask;
    }
  }
  const { pick } = dp[bestMask] ?? { val: 0, pick: Array(n).fill(-1) };
  const byPlayer: Record<number, number> = {};
  pick.forEach((j, i) => {
    if (j >= 0) byPlayer[players[i].accountId] = pool[j];
  });
  const total = synergyTotalForAssignment(byPlayer, phs, signatures);
  return { byPlayer, total, avg: n > 0 ? total / n : 0 };
}

export function assignWithFixed(
  players: PackPlayer[],
  heroPool: number[],
  phs: PlayerHeroStats,
  fixed: Record<number, number>,
  signatures: SignatureLookup = {},
): Assignment {
  const pool = new Set(heroPool);
  const pinnedHero = new Map<number, number>();
  const usedHeroes = new Set<number>();
  for (const player of players) {
    const heroId = fixed[player.accountId];
    if (heroId != null && pool.has(heroId) && !usedHeroes.has(heroId)) {
      pinnedHero.set(player.accountId, heroId);
      usedHeroes.add(heroId);
    }
  }
  const freePlayers = players.filter((p) => !pinnedHero.has(p.accountId));
  const freeHeroes = heroPool.filter((h) => !usedHeroes.has(h));
  const auto = bestAssignment(freePlayers, freeHeroes, phs, signatures);

  const byPlayer: Record<number, number> = { ...auto.byPlayer };
  for (const [accountId, heroId] of pinnedHero) {
    byPlayer[accountId] = heroId;
  }
  const total = synergyTotalForAssignment(byPlayer, phs, signatures);
  return { byPlayer, total, avg: players.length > 0 ? total / players.length : 0 };
}

function popcount(value: number): number {
  let count = 0;
  for (let n = value; n !== 0; n &= n - 1) count++;
  return count;
}
