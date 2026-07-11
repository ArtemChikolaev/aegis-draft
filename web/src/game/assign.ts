// Оптимальное назначение героев игрокам (скилл scoring-model: matching, НЕ жадность).
// Точное решение задачи о назначениях: игроков всегда 5, героев в пуле немного (~5–10),
// поэтому DP по битовой маске использованных героев — точно и быстро.
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

  // DP: dp(i, mask) — максимум для игроков [i..n) при уже занятых героях mask.
  const memo = new Map<string, { val: number; pick: number[] }>();
  const solve = (i: number, mask: number): { val: number; pick: number[] } => {
    if (i === n) return { val: 0, pick: [] };
    const key = i + ":" + mask;
    const cached = memo.get(key);
    if (cached) return cached;
    let best = { val: -Infinity, pick: [] as number[] };
    for (let j = 0; j < H; j++) {
      if (mask & (1 << j)) continue;
      const rest = solve(i + 1, mask | (1 << j));
      const val = score[i][j] + rest.val;
      if (val > best.val) best = { val, pick: [j, ...rest.pick] };
    }
    // если героев не хватает — игрок остаётся без назначения (скор 0)
    if (best.val === -Infinity) {
      const rest = solve(i + 1, mask);
      best = { val: rest.val, pick: [-1, ...rest.pick] };
    }
    memo.set(key, best);
    return best;
  };

  const { val, pick } = solve(0, 0);
  const byPlayer: Record<number, number> = {};
  pick.forEach((j, i) => {
    if (j >= 0) byPlayer[players[i].accountId] = pool[j];
  });
  return { byPlayer, total: val, avg: n > 0 ? val / n : 0 };
}
