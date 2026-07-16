// Итоговый счёт команды (скилл scoring-model): Team OVR = Base + Hero Synergy + Chemistry.
// Base приходит числом из данных (event ovr). Synergy/Chemistry считаем на клиенте из
// сглаживание winrate — модель сглаживания меняется без пересборки данных (инвариант data-contract).
import type { PackPlayer, PlayerHeroStats, SquadSynergy, Teammates, GameData, Stat } from "../types/data.ts";
import type { Candidate } from "./packs.ts";
import { assignWithFixed, bestAssignment, synergyTotalForAssignment, type Assignment, type SignatureLookup } from "./assign.ts";

/** Масштабы бонусов (версионируются вместе с ratingModelVersion). Тюнинг — PRD §10-C.
 * v1.4.0 (2026-07-13): подняты масштабы — +0.1-бонусы были несерьёзными. Полная величина
 * растёт по мере наполнения данных (сглаживание душит тонкие выборки к 0.5); эти масштабы
 * калиброваны под глубокие данные (~уровень 322-0: Hero Synergy ~единицы, Chemistry ~1-3).
 * v1.5.0 (2026-07-15): (1) heroStatsForAssignment = только pro window (playerHeroStats), без
 * career/pub — career только для отображения игр в UI; (2) снят event-овerlay; Event Rating только
 * на Base; (3) Hero Synergy = СУММА по 5 героям, не среднее; (4) Chemistry = сыгранность (games),
 * не winrate. Калибровка по 322-0: пара ~500 игр → ~2, Hero Synergy ~7 = INSANE. */
export const SCORING = {
  /** Химия = сыгранность (совместные игры), насыщающая кривая max·g/(g+half), НЕ winrate.
   * Калибровка по реальным величинам 322-0: пара 498 игр → ~2.2, 588 → ~2.3, 153 (former) → ~0.6. */
  chemMaxPerPair: 4.3,
  chemHalfGames: 500,
  /** Текущий ростер (teamId+eventId) весит больше бывших тиммейтов (в Team Packs пары почти всегда former). */
  chemistryCurrentMult: 1,
  chemistryFormerMult: 0.6,
  /** Базовый вклад, если в текущем составе ещё нет squad-пары в данных. */
  chemistryCurrentBaseline: 0.15,
} as const;

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

/** Hero Synergy = СУММА отклонений сглаженного скора назначенных героев от нейтрали, в очках.
 * v1.5.0: сумма, а не среднее (как в 322-0: 5 героев складываются в ~единицы-десятки; среднее
 * давало в 5× меньше и не дотягивало до порогов great/insane). `assignment.total` = Σ сглаж.
 * winrate по назначенным героям; `assigned*0.5` — нейтральная база. Сглаживание уже учитывает
 * игры (мало игр → тянет к 0.5), поэтому «more games is better» соблюдается. */
export function heroSynergyBonus(assignment: Assignment): number {
  // total = сумма games-driven вкладов по 5 парам (см. assign.pairScore). Без игроков → 0.
  return Object.keys(assignment.byPlayer).length === 0 ? 0 : assignment.total;
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

/** Химия пары = сыгранность (совместные игры), насыщающая кривая max·g/(g+half) — «experience»
 * как в 322-0, а НЕ winrate (v1.5.0: раньше был winrate-centered → ~0.2 за 500 игр, что абсурд). */
function pairChemistryBonus(
  a: ChemistryPlayer,
  b: ChemistryPlayer,
  squadIndex: Map<string, Stat & { games: number }>,
  teammates: Teammates,
): { bonus: number; games: number } {
  const current = isCurrentRoster(a, b);
  const ever = everTeammates(a.accountId, b.accountId, squadIndex, teammates);
  if (!current && !ever) return { bonus: 0, games: 0 };

  const pair = squadIndex.get(pairKey(a.accountId, b.accountId));
  const games = pair?.games ?? 0;
  const mult = current ? SCORING.chemistryCurrentMult : SCORING.chemistryFormerMult;
  const experience = games > 0
    ? SCORING.chemMaxPerPair * games / (games + SCORING.chemHalfGames)
    : current ? SCORING.chemistryCurrentBaseline : 0;

  return {
    bonus: experience * mult,
    games,
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
): number {
  const squadIndex = new Map<string, Stat & { games: number }>();
  for (const pair of squad) squadIndex.set(pairKey(pair.ids[0], pair.ids[1]), pair);

  let sum = 0;
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      sum += pairChemistryBonus(roster[i], roster[j], squadIndex, teammates).bonus;
    }
  }
  return sum;
}

/** Парные вклады Chemistry для визуализации связей на радаре. */
export function chemistryPairEdges(
  roster: ChemistryPlayer[],
  squad: SquadSynergy,
  teammates: Teammates,
): ChemistryEdge[] {
  const squadIndex = new Map<string, Stat & { games: number }>();
  for (const pair of squad) squadIndex.set(pairKey(pair.ids[0], pair.ids[1]), pair);

  const edges: ChemistryEdge[] = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const { bonus, games } = pairChemistryBonus(roster[i], roster[j], squadIndex, teammates);
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

/** Строки Hero Synergy для UI — все игроки ростера, «no hero yet» если герой не назначен.
 * `displayPhs` — career-игры для подписи «N games»; scoring/assignment использует `phs` (pro window). */
export function heroSynergyRows(
  roster: Array<{ candidate: Candidate | null }>,
  assignment: Assignment,
  phs: PlayerHeroStats,
  displayPhs?: PlayerHeroStats,
): HeroSynergyRow[] {
  const show = displayPhs ?? phs;
  return roster.flatMap((slot) => {
    if (!slot.candidate) return [];
    const heroId = assignment.byPlayer[slot.candidate.player.accountId] ?? null;
    return [{
      accountId: slot.candidate.player.accountId,
      nickname: slot.candidate.player.nickname,
      heroId,
      games: heroId != null ? playerHeroGames(show, slot.candidate.player.accountId, heroId) : 0,
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
      const { bonus, games } = pairChemistryBonus(chem[i], chem[j], squadIndex, teammates);
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

// Player×hero для назначения героев и расчёта Hero Synergy: только pro window (playerHeroStats).
// Career (/players/{id}/heroes) включает pub-матчи — смешивание давало absurd picks (support rue →
// Terrorblade из 45 pub-игр при 0 pro). UI показывает career-игры через heroStatsForDisplay.
// v1.5.0: event-овerlay снят; Event Rating только на Base. Point-in-time — Real Tournament (§5.9.1).
export function heroStatsForAssignment(data: GameData): PlayerHeroStats {
  return data.careerPlayerHeroStats ?? data.playerHeroStats;
}

/** Pro career для «N games» в UI (то же, что assignment). */
export function heroStatsForDisplay(data: GameData): PlayerHeroStats {
  return data.careerPlayerHeroStats ?? data.playerHeroStats;
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
