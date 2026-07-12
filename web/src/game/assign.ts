// Оптимальное назначение героев игрокам (скилл scoring-model: matching, НЕ жадность).
// Точное решение задачи о назначениях: игроков всегда не больше 5, а героев может быть
// до 50. Поэтому маска строится по игрокам (2^5), не по героям: O(H * 2^5 * 5).
import type { PackPlayer, PlayerHeroStats } from "../types/data.ts";
import { smoothedWinrate } from "./smoothing.ts";

export interface Assignment {
  /** accountId -> heroId */
  byPlayer: Record<number, number>;
  /** сумма сглаженных скоров назначенных пар */
  total: number;
  /** средний сглаженный скор (total / players) */
  avg: number;
}

/** Скор пары (игрок, герой) — сглаженный winrate игрока на герое. */
export function pairScore(accountId: number, heroId: number, phs: PlayerHeroStats): number {
  const stat = phs[String(accountId)]?.[String(heroId)];
  return smoothedWinrate(stat);
}

/**
 * Максимизируем сумму скоров при назначении каждому игроку уникального героя из пула.
 * heroPool.length >= players.length не требуется строго: если героев меньше — часть игроков без героя.
 */
export function bestAssignment(
  players: PackPlayer[],
  heroPool: number[],
  phs: PlayerHeroStats,
): Assignment {
  const n = players.length;
  const pool = [...new Set(heroPool)];
  const H = pool.length;

  // score[i][j] = скор игрока i на герое pool[j]
  const score = players.map((p) => pool.map((h) => pairScore(p.accountId, h, phs)));

  interface State {
    val: number;
    /** hero index in pool for each player; -1 means unassigned. */
    pick: number[];
  }

  // Перебираем героев, состояние — множество уже назначенных игроков.
  // Это exact max-weight matching для маленькой фиксированной стороны (players).
  const states = 1 << n;
  let dp: (State | undefined)[] = Array(states);
  dp[0] = { val: 0, pick: Array(n).fill(-1) };
  for (let j = 0; j < H; j++) {
    const next = [...dp]; // героя можно пропустить
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

  // При недостатке героев сначала максимизируем число назначений, затем score.
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
  const { val, pick } = dp[bestMask] ?? { val: 0, pick: Array(n).fill(-1) };
  const byPlayer: Record<number, number> = {};
  pick.forEach((j, i) => {
    if (j >= 0) byPlayer[players[i].accountId] = pool[j];
  });
  return { byPlayer, total: val, avg: n > 0 ? val / n : 0 };
}

/**
 * Назначение с фиксированными парами (ручной режим): зафиксированные player→hero
 * уважаются, остальные игроки/герои матчатся авто-оптимально (bestAssignment).
 * fixed: accountId -> heroId; учитываются только валидные (герой в пуле, игрок в составе).
 */
export function assignWithFixed(
  players: PackPlayer[],
  heroPool: number[],
  phs: PlayerHeroStats,
  fixed: Record<number, number>,
): Assignment {
  const pool = new Set(heroPool);
  const pinnedHero = new Map<number, number>(); // accountId -> heroId
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
  const auto = bestAssignment(freePlayers, freeHeroes, phs);

  const byPlayer: Record<number, number> = { ...auto.byPlayer };
  let total = auto.total;
  for (const [accountId, heroId] of pinnedHero) {
    byPlayer[accountId] = heroId;
    total += pairScore(accountId, heroId, phs);
  }
  return { byPlayer, total, avg: players.length > 0 ? total / players.length : 0 };
}

function popcount(value: number): number {
  let count = 0;
  for (let n = value; n !== 0; n &= n - 1) count++;
  return count;
}
