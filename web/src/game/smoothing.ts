// Байесовское сглаживание winrate (скилл scoring-model, инвариант «малые выборки сглаживаем»).
// score = (winrate*games + m*mu) / (games + m).
// Сырой winrate при малом games не используем: games:1 wr:1.0 не даёт +∞.
import type { Stat } from "../types/data.ts";

/** Параметры модели сглаживания (версионируются вместе с ratingModelVersion). */
export const SMOOTHING = { mu: 0.5, m: 10 } as const;

/** Сглаженный winrate в [0,1]. Отсутствующая статистика → нейтральное mu. */
export function smoothedWinrate(stat: Stat | undefined, p = SMOOTHING): number {
  if (!stat || stat.games <= 0) return p.mu;
  return (stat.winrate * stat.games + p.m * p.mu) / (stat.games + p.m);
}
