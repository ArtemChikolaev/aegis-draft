// Итоговый счёт команды (скилл scoring-model): Team OVR = Base + Hero Synergy + Chemistry.
// Base приходит числом из данных (event ovr). Synergy/Chemistry считаем на клиенте из
// сглаживание winrate — модель сглаживания меняется без пересборки данных (инвариант data-contract).
import type { PackPlayer, PlayerHeroStats, SquadSynergy, Teammates, GameData, Stat } from "../types/data.ts";
import type { Candidate } from "./packs.ts";
import type { Scoring } from "./packs.ts";
import { assignWithFixed, bestAssignment, synergyTotalForAssignment, type Assignment, type SignatureLookup } from "./assign.ts";
import { smoothedWinrate } from "./smoothing.ts";

/** Масштабы бонусов (версионируются вместе с ratingModelVersion). Тюнинг — PRD §10-C. */
export const SCORING = {
  synergyScale: 20,
  chemistryScale: 16,
  /** Текущий ростер (teamId+eventId) vs бывшие тиммейты. */
  chemistryCurrentMult: 1,
  chemistryFormerMult: 0.35,
  /** Базовый вклад, если в текущем составе ещё нет squad-пары в данных. */
  chemistryCurrentBaseline: 0.12,
} as const;
const FULL_ROSTER_PAIR_COUNT = 10; // C(5, 2)

export interface ChemistryPlayer {
  accountId: number;
  teamId: number;
  eventId: string;
}

export interface ChemistryEdge {
  a: number;
  b: number;
  games: number;
  bonus: number;
}

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
  return Math.max(0, (assignment.total / assigned - 0.5) * scale);
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function isCurrentRoster(a: ChemistryPlayer, b: ChemistryPlayer): boolean {
  return a.teamId === b.teamId && a.eventId === b.eventId;
}

function everTeammates(
  a: number,
  b: number,
  squadIndex: Map<string, Stat & { games: number }>,
  teammates: Teammates,
): boolean {
  const pair = squadIndex.get(pairKey(a, b));
  if (pair && pair.games > 0) return true;
  return teammates[String(a)]?.includes(b) ?? false;
}

/** Положительный centered-вклад пары: только выше нейтрали, без отрицательных значений. */
function pairCenteredPositive(pair: Stat | undefined, current: boolean): number {
  if (pair && pair.games > 0) return Math.max(0, smoothedWinrate(pair) - 0.5);
  if (current) return SCORING.chemistryCurrentBaseline;
  return 0;
}

function pairChemistryBonus(
  a: ChemistryPlayer,
  b: ChemistryPlayer,
  squadIndex: Map<string, Stat & { games: number }>,
  teammates: Teammates,
  scale: number,
): { bonus: number; games: number } {
  const current = isCurrentRoster(a, b);
  const ever = everTeammates(a.accountId, b.accountId, squadIndex, teammates);
  if (!current && !ever) return { bonus: 0, games: 0 };

  const pair = squadIndex.get(pairKey(a.accountId, b.accountId));
  const centered = pairCenteredPositive(pair, current);
  const mult = current ? SCORING.chemistryCurrentMult : SCORING.chemistryFormerMult;
  if (centered <= 0) return { bonus: 0, games: pair?.games ?? 0 };

  return {
    bonus: (centered * mult / FULL_ROSTER_PAIR_COUNT) * scale,
    games: pair?.games ?? 0,
  };
}

/**
 * Chemistry: текущий состав (teamId+eventId) — полный вес; бывшие тиммейты — ×0.35;
 * никогда не играли вместе — 0. Отрицательных значений нет.
 */
export function chemistryBonus(
  roster: ChemistryPlayer[],
  squad: SquadSynergy,
  teammates: Teammates,
  scale = SCORING.chemistryScale,
): number {
  const squadIndex = new Map<string, Stat & { games: number }>();
  for (const pair of squad) squadIndex.set(pairKey(pair.ids[0], pair.ids[1]), pair);

  let sum = 0;
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      sum += pairChemistryBonus(roster[i], roster[j], squadIndex, teammates, scale).bonus;
    }
  }
  return sum;
}

/** Парные вклады Chemistry для визуализации связей на радаре. */
export function chemistryPairEdges(
  roster: ChemistryPlayer[],
  squad: SquadSynergy,
  teammates: Teammates,
  scale = SCORING.chemistryScale,
): ChemistryEdge[] {
  const squadIndex = new Map<string, Stat & { games: number }>();
  for (const pair of squad) squadIndex.set(pairKey(pair.ids[0], pair.ids[1]), pair);

  const edges: ChemistryEdge[] = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const { bonus, games } = pairChemistryBonus(roster[i], roster[j], squadIndex, teammates, scale);
      if (bonus < 0.05) continue;
      edges.push({ a: roster[i].accountId, b: roster[j].accountId, games, bonus });
    }
  }
  return edges;
}

export interface HeroSynergyRow {
  accountId: number;
  nickname: string;
  heroId: number | null;
  games: number;
}

export interface SquadChemistryRow {
  accountIdA: number;
  accountIdB: number;
  nicknameA: string;
  nicknameB: string;
  games: number;
  bonus: number;
}

/** Сколько игр у игрока на герое в текущем scope stats. */
export function playerHeroGames(
  phs: PlayerHeroStats,
  accountId: number,
  heroId: number,
): number {
  return phs[String(accountId)]?.[String(heroId)]?.games ?? 0;
}

/** Строки Hero Synergy для UI — все игроки ростера, «no hero yet» если герой не назначен. */
export function heroSynergyRows(
  roster: Array<{ candidate: Candidate | null }>,
  assignment: Assignment,
  phs: PlayerHeroStats,
): HeroSynergyRow[] {
  return roster.flatMap((slot) => {
    if (!slot.candidate) return [];
    const heroId = assignment.byPlayer[slot.candidate.player.accountId] ?? null;
    return [{
      accountId: slot.candidate.player.accountId,
      nickname: slot.candidate.player.nickname,
      heroId,
      games: heroId != null ? playerHeroGames(phs, slot.candidate.player.accountId, heroId) : 0,
    }];
  });
}

/** Пороговые подписи Hero Synergy (322-0: GREAT / INSANE!). */
export function heroSynergyTier(value: number): "great" | "insane" | null {
  if (value >= 7) return "insane";
  if (value >= 4) return "great";
  return null;
}

/** Строки Squad Chemistry для UI, по убыванию бонуса. */
export function squadChemistryRows(
  roster: Array<{ candidate: Candidate | null }>,
  squad: SquadSynergy,
  teammates: Teammates,
  scale = SCORING.chemistryScale,
): SquadChemistryRow[] {
  const chem = chemistryPlayersFromRoster(roster);
  const nick = new Map<number, string>();
  for (const slot of roster) {
    if (slot.candidate) nick.set(slot.candidate.player.accountId, slot.candidate.player.nickname);
  }
  const squadIndex = new Map<string, Stat & { games: number }>();
  for (const pair of squad) squadIndex.set(pairKey(pair.ids[0], pair.ids[1]), pair);

  const rows: SquadChemistryRow[] = [];
  for (let i = 0; i < chem.length; i++) {
    for (let j = i + 1; j < chem.length; j++) {
      const current = isCurrentRoster(chem[i], chem[j]);
      const ever = everTeammates(chem[i].accountId, chem[j].accountId, squadIndex, teammates);
      if (!current && !ever) continue;
      const { bonus, games } = pairChemistryBonus(chem[i], chem[j], squadIndex, teammates, scale);
      rows.push({
        accountIdA: chem[i].accountId,
        accountIdB: chem[j].accountId,
        nicknameA: nick.get(chem[i].accountId) ?? String(chem[i].accountId),
        nicknameB: nick.get(chem[j].accountId) ?? String(chem[j].accountId),
        games,
        bonus,
      });
    }
  }
  return rows.sort((a, b) => b.bonus - a.bonus || b.games - a.games);
}

/** Event Rating: player×hero из eventHeroStats (override career для того же героя). */
export function heroStatsForAssignment(
  data: GameData,
  scoring: Scoring,
  roster: (Candidate | null)[],
): PlayerHeroStats {
  if (scoring !== "event") return data.playerHeroStats;
  const merged: PlayerHeroStats = { ...data.playerHeroStats };
  for (const candidate of roster) {
    if (!candidate) continue;
    const accountKey = String(candidate.player.accountId);
    const eventStats = data.eventHeroStats[candidate.eventId]?.[accountKey];
    if (!eventStats) continue;
    merged[accountKey] = { ...(merged[accountKey] ?? {}), ...eventStats };
  }
  return merged;
}

export function signatureLookup(roster: (Candidate | null)[]): SignatureLookup {
  const out: SignatureLookup = {};
  for (const candidate of roster) {
    if (!candidate) continue;
    out[candidate.player.accountId] = candidate.signatureHeroes;
  }
  return out;
}

/** Собрать ChemistryPlayer[] из ростера драфта. */
export function chemistryPlayersFromRoster(
  roster: Array<{ candidate: Candidate | null }>,
): ChemistryPlayer[] {
  return roster.flatMap((slot) => slot.candidate
    ? [{
      accountId: slot.candidate.player.accountId,
      teamId: slot.candidate.teamId,
      eventId: slot.candidate.eventId,
    }]
    : []);
}

/** Полный подсчёт для выбранной пятёрки + драфтованных героев. */
export function scoreTeam(
  players: PackPlayer[],
  heroPool: number[],
  phs: PlayerHeroStats,
  squad: SquadSynergy,
  teammates: Teammates,
  chemistryRoster: ChemistryPlayer[],
  signatures: SignatureLookup = {},
  fixed?: Record<number, number>,
): ScoreBreakdown {
  const assignment = fixed && Object.keys(fixed).length > 0
    ? assignWithFixed(players, heroPool, phs, fixed, signatures)
    : bestAssignment(players, heroPool, phs, signatures);
  const synergyTotal = synergyTotalForAssignment(assignment.byPlayer, phs, signatures);
  const base = baseRating(players);
  const heroSynergy = heroSynergyBonus({ ...assignment, total: synergyTotal });
  const chemistry = chemistryBonus(chemistryRoster, squad, teammates);
  return { base, heroSynergy, chemistry, teamOvr: base + heroSynergy + chemistry, assignment };
}
