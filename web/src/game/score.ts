// Итоговый счёт команды (скилл scoring-model): Team OVR = Base + Hero Synergy + Chemistry.
// Base приходит числом из данных (event ovr). Synergy/Chemistry считаем на клиенте из
// сглаживание winrate — модель сглаживания меняется без пересборки данных (инвариант data-contract).
import type { PackPlayer, PlayerHeroStats, SquadGroup, SquadSynergy, Teammates, GameData } from "../types/data.ts";
import type { Candidate } from "./packs.ts";
import { assignWithFixed, bestAssignment, synergyTotalForAssignment, type Assignment, type SignatureLookup } from "./assign.ts";

/** Масштабы бонусов (версионируются вместе с ratingModelVersion). Тюнинг — PRD §10-C.
 * v1.4.0 (2026-07-13): подняты масштабы — +0.1-бонусы были несерьёзными. Полная величина
 * растёт по мере наполнения данных (сглаживание душит тонкие выборки к 0.5); эти масштабы
 * калиброваны под глубокие данные (~уровень 322-0: Hero Synergy ~единицы, Chemistry ~1-3).
 * v1.5.0 (2026-07-15): (1) heroStatsForAssignment = только pro window (playerHeroStats), без
 * career/pub — career только для отображения игр в UI; (2) снят event-овerlay; Event Rating только
 * на Base; (3) Hero Synergy = СУММА по 5 героям, не среднее; (4) Chemistry = сыгранность (games),
 * не winrate. Калибровка по 322-0: пара ~500 игр → ~2, Hero Synergy ~7 = INSANE.
 * v1.13.0 (2026-07-23): Chemistry снова считается по уникальным парам. Одновременный учёт
 * пар, троек и четвёрок повторял одни и те же связи и слишком рано упирался в общий cap. */
export const SCORING = {
  /** Вклад ПАРЫ = min(chemMaxPerPair, games / chemFullGames) — линейно до жёсткого потолка,
   * не гипербола. Замерено на 322-0: 350 игр → 1.5, 823 → 3.6, 267 → 1.2, 271 → 1.2; прежняя
   * гипербола 4.3·g/(g+500) мимо на всех четырёх (1.77 / 2.67 / 1.50 / 1.51). */
  chemMaxPerPair: 4,
  chemFullGames: 230,
  /** Потолок суммы десяти уникальных пар пятёрки. */
  chemTotalMax: 13,
} as const;

/** Пороговые подписи (замерено в 322-0): base(88, 94), hero synergy(4.5, 6.5), chemistry(5, 9). */
export const TIERS = {
  base: { great: 88, insane: 94 },
  heroSynergy: { great: 4.5, insane: 6.5 },
  chemistry: { great: 5, insane: 9 },
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

/** Вклад пары по числу совместных игр: линейно до жёсткого потолка.
 * Экспортируется, чтобы слои поверх формулы (Tactics в game/tactics.ts) считали свои
 * «виртуальные co-games» той же кривой, а не переизобретали её рядом. */
export function pairChemistryBonus(games: number): number {
  return Math.min(SCORING.chemMaxPerPair, games / SCORING.chemFullGames);
}

/** Вклад одной сыгравшейся пары: линейно до жёсткого потолка. */
function groupBonus(group: SquadGroup): number {
  return pairChemistryBonus(group.games);
}

/** Уникальные пары squadSynergy, целиком лежащие внутри ростера. В полном составе их до 10.
 * Датасет может содержать исторические группы 3–5 игроков, но они не добавляются поверх
 * собственных пар: иначе одна и та же сыгранность учитывается несколько раз. */
function rosterPairs(roster: ChemistryPlayer[], squad: SquadSynergy): SquadGroup[] {
  const inRoster = new Set(roster.map((p) => p.accountId));
  return squad.filter((g) => g.ids.length === 2 && g.ids.every((id) => inRoster.has(id)));
}

/** Chemistry = Σ по уникальным сыгравшимся парам ростера, с потолком.
 * Нет совместных pro-игр ⇒ 0.
 *
 * v1.13.0: только пары. Группы 3–5 дублируют уже учтённые отношения и раньше насыщали общий
 * cap до того, как замена действительно сыгранного игрока могла изменить Chemistry. */
export function chemistryBonus(
  roster: ChemistryPlayer[],
  squad: SquadSynergy,
  teammates: Teammates,
): number {
  void teammates; // сыгранность выводится из squadSynergy; teammates — справочник для UI
  const sum = rosterPairs(roster, squad).reduce((acc, g) => acc + groupBonus(g), 0);
  return Math.min(sum, SCORING.chemTotalMax);
}

/** Парные вклады Chemistry для визуализации связей на радаре. */
export function chemistryPairEdges(
  roster: ChemistryPlayer[],
  squad: SquadSynergy,
  teammates: Teammates,
): ChemistryEdge[] {
  void teammates;
  return rosterPairs(roster, squad)
    .map((g) => ({ a: g.ids[0], b: g.ids[1], games: g.games, bonus: groupBonus(g) }))
    .filter((edge) => edge.bonus >= 0.05);
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

/** Подпись по порогам (322-0: GREAT / INSANE!). Пороги — в TIERS, замерены, не на глаз. */
export function tierOf(value: number, tier: { great: number; insane: number }): "great" | "insane" | null {
  if (value >= tier.insane) return "insane";
  if (value >= tier.great) return "great";
  return null;
}

/** Пороговые подписи Hero Synergy. */
export function heroSynergyTier(value: number): "great" | "insane" | null {
  return tierOf(value, TIERS.heroSynergy);
}

/** Пороговые подписи Base и Chemistry — в 322-0 они тоже с подписями (у них «90 BASE / GREAT»). */
export function baseTier(value: number): "great" | "insane" | null {
  return tierOf(value, TIERS.base);
}

export function chemistryTier(value: number): "great" | "insane" | null {
  return tierOf(value, TIERS.chemistry);
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
  void teammates;
  // Пары одновременно являются строками UI и единственными слагаемыми Chemistry.
  const rows: SquadChemistryRow[] = rosterPairs(chem, squad)
    .map((g) => ({
      accountIdA: g.ids[0],
      accountIdB: g.ids[1],
      nicknameA: nick.get(g.ids[0]) ?? String(g.ids[0]),
      nicknameB: nick.get(g.ids[1]) ?? String(g.ids[1]),
      games: g.games,
      bonus: groupBonus(g),
    }));
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
  /** Mixed Draft: base приходит извне (успех команды за окно, см. game/teamSuccess.ts).
   *  Team Packs его не передаёт и продолжает считаться по event OVR — без изменений. */
  baseOverride?: number,
): ScoreBreakdown {
  const assignment = fixed && Object.keys(fixed).length > 0
    ? assignWithFixed(players, heroPool, phs, fixed, signatures)
    : bestAssignment(players, heroPool, phs, signatures);
  const synergyTotal = synergyTotalForAssignment(assignment.byPlayer, phs, signatures);
  const base = baseOverride ?? baseRating(players);
  const heroSynergy = heroSynergyBonus({ ...assignment, total: synergyTotal });
  const chemistry = chemistryBonus(chemistryRoster, squad, teammates);
  return { base, heroSynergy, chemistry, teamOvr: base + heroSynergy + chemistry, assignment };
}
