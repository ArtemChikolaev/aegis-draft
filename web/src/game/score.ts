// Итоговый счёт команды (скилл scoring-model): Team OVR = Base + Hero Synergy + Chemistry.
// Base приходит числом из данных (event ovr). Synergy/Chemistry считаем на клиенте из
// сглаженных winrate — модель сглаживания меняется без пересборки данных (инвариант data-contract).
import type { PackPlayer, PlayerHeroStats, SquadSynergy } from "../types/data.ts";
import { assignWithFixed, bestAssignment, type Assignment } from "./assign.ts";
import { smoothedWinrate } from "./smoothing.ts";

/** Масштабы бонусов (версионируются вместе с ratingModelVersion). Тюнинг — PRD §10-C. */
export const SCORING = { synergyScale: 20, chemistryScale: 16 } as const;
const FULL_ROSTER_PAIR_COUNT = 10; // C(5, 2)

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
  const assigned = Object.keys(assignment.byPlayer).length;
  if (assigned === 0) return 0;
  return (assignment.total / assigned - 0.5) * scale;
}

/**
 * Chemistry накапливается по мере появления сыгранных пар. Деление всегда на десять
 * пар полной пятёрки: промежуточный бонус растёт вместе с ростером, а финальный
 * масштаб для пяти игроков остаётся прежним.
 */
export function chemistryBonus(players: PackPlayer[], squad: SquadSynergy, scale = SCORING.chemistryScale): number {
  const ids = players.map((p) => p.accountId);
  const index = new Map<string, { games: number; winrate: number }>();
  for (const pair of squad) index.set(pairKey(pair.ids[0], pair.ids[1]), pair);

  let centeredSum = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const pair = index.get(pairKey(ids[i], ids[j]));
      centeredSum += smoothedWinrate(pair) - 0.5; // нет пары → нейтральный вклад 0
    }
  }
  return (centeredSum / FULL_ROSTER_PAIR_COUNT) * scale;
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
