// Итоговый счёт команды (скилл scoring-model): Team OVR = Base + Hero Synergy + Chemistry.
// Base приходит числом из данных (event ovr). Synergy/Chemistry считаем на клиенте из
// сглаженных winrate — модель сглаживания меняется без пересборки данных (инвариант data-contract).
import type { PackPlayer, PlayerHeroStats, SquadSynergy } from "../types/data.ts";
import { assignWithFixed, bestAssignment, type Assignment } from "./assign.ts";
import { smoothedWinrate } from "./smoothing.ts";

/** Масштабы бонусов (версионируются вместе с ratingModelVersion). Тюнинг — PRD §10-C. */
export const SCORING = { synergyScale: 20, chemistryScale: 16 } as const;

export interface ScoreBreakdown {
  base: number;
  heroSynergy: number;
  chemistry: number;
  teamOvr: number;
  assignment: Assignment;
}

/** Base = средний event-OVR выбранной пятёрки (Event Rating scoring). */
export function baseRating(players: PackPlayer[]): number {
  if (players.length === 0) return 0;
  return players.reduce((s, p) => s + p.ovr, 0) / players.length;
}

/** Hero Synergy = отклонение среднего сглаженного скора назначения от нейтрали, в очках. */
export function heroSynergyBonus(assignment: Assignment, scale = SCORING.synergyScale): number {
  return (assignment.avg - 0.5) * scale;
}

/** Chemistry = отклонение среднего сглаженного скора пар выбранной пятёрки от нейтрали. */
export function chemistryBonus(players: PackPlayer[], squad: SquadSynergy, scale = SCORING.chemistryScale): number {
  const ids = players.map((p) => p.accountId);
  const index = new Map<string, { games: number; winrate: number }>();
  for (const pair of squad) index.set(pairKey(pair.ids[0], pair.ids[1]), pair);

  let sum = 0;
  let count = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const pair = index.get(pairKey(ids[i], ids[j]));
      sum += smoothedWinrate(pair); // нет пары → нейтральное 0.5 (не сыграны)
      count++;
    }
  }
  const avg = count > 0 ? sum / count : 0.5;
  return (avg - 0.5) * scale;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Полный подсчёт для выбранной пятёрки + драфтованных героев.
 *  fixed (ручной режим) фиксирует part player→hero, остальное матчится авто. */
export function scoreTeam(
  players: PackPlayer[],
  heroPool: number[],
  phs: PlayerHeroStats,
  squad: SquadSynergy,
  fixed?: Record<number, number>,
): ScoreBreakdown {
  const assignment = fixed && Object.keys(fixed).length > 0
    ? assignWithFixed(players, heroPool, phs, fixed)
    : bestAssignment(players, heroPool, phs);
  const base = baseRating(players);
  const heroSynergy = heroSynergyBonus(assignment);
  const chemistry = chemistryBonus(players, squad);
  return { base, heroSynergy, chemistry, teamOvr: base + heroSynergy + chemistry, assignment };
}
