import type { Format, GameData } from "../types/data.ts";
import { Rng } from "./rng.ts";

export type TournamentStage = "field" | "groups" | "playoffs" | "final" | "complete";
export type PlacementKey = "1" | "2" | "3" | "4" | "5-6" | "7-8" | "9-12" | "13-16" | "17" | "18";
export type ProjectionKey = "1" | "2-4" | "5-8" | "9-12" | "13-16" | "17-18";

export interface TournamentTeam {
  id: string;
  name: string;
  eventLabel: string;
  strength: number;
  isUser: boolean;
}

export interface GroupStanding {
  team: TournamentTeam;
  wins: number;
  losses: number;
  rank: number;
  route: "upper" | "lower" | "out";
}

export interface TournamentGroup {
  id: "A" | "B";
  standings: GroupStanding[];
}

/** Отдельный BO2-матч группы (для истории игр / будущей live-симуляции). */
export interface GroupMatch {
  id: string;
  group: "A" | "B";
  teamA: TournamentTeam;
  teamB: TournamentTeam;
  scoreA: number;
  scoreB: number;
  /** Пошаговый счёт BO2 для live-симуляции (включая 0-0). */
  frames: { scoreA: number; scoreB: number }[];
}

export interface SeriesResult {
  id: string;
  round: string;
  teamA: TournamentTeam;
  teamB: TournamentTeam;
  scoreA: number;
  scoreB: number;
  bestOf: 3 | 5;
  winnerId: string;
  loserId: string;
  /** Пошаговый счёт серии для live-симуляции (включая 0-0). */
  frames: { scoreA: number; scoreB: number }[];
}

export interface PlayoffRound {
  id: string;
  label: string;
  series: SeriesResult[];
}

export interface FinalStanding {
  team: TournamentTeam;
  placement: PlacementKey;
}

export interface TournamentResult {
  field: TournamentTeam[];
  projection: ProjectionKey;
  groups: TournamentGroup[];
  groupMatches: GroupMatch[];
  playoffRounds: PlayoffRound[];
  grandFinal: SeriesResult;
  standings: FinalStanding[];
  champion: TournamentTeam;
  userPlacement: PlacementKey;
}

export interface TournamentSnapshot extends TournamentResult {
  stage: TournamentStage;
  canAdvance: boolean;
}

const USER_ID = "aegis-user-team";
// Стадии: field → groups → playoffs. Playoffs — терминальный экран: сетка (вкл. Grand
// Final) + итоговая таблица + твой результат на одном экране (без отдельных final/complete).
const STAGES: TournamentStage[] = ["field", "groups", "playoffs"];

// Сила одного бота из ФИКСИРОВАННОГО распределения поля tier-1 турнира (как в 322-0),
// НЕ привязанного к силе игрока. Форма снята с рероллов 322-0: пара элитных ~93-96, основная
// масса 82-90, длинный хвост 76-81; медиана ~84. Место игрока зависит от того, куда попадает
// его OVR в этом поле (сильный драфт → 1-3, средний → середина, слабый → низ) — а не «всегда 2-3».
function sampleBotStrength(rng: Rng): number {
  const r = rng.float();
  if (r < 0.06) return 93 + rng.int(4); // 93-96 элита (редко)
  if (r < 0.2) return 89 + rng.int(4); // 89-92 сильные
  if (r < 0.48) return 84 + rng.int(5); // 84-88 верх-мид
  if (r < 0.76) return 80 + rng.int(4); // 80-83 низ-мид
  return 76 + rng.int(4); // 76-79 хвост
}

function rollBotStrengths(rng: Rng, count: number): number[] {
  // Каждый бот — независимая выборка из поля. Число ботов выше игрока варьируется само
  // (для OVR 94 — обычно 0-2 → 1-3 место; для 84 — ~7 → середина), даёт динамику как в 322-0.
  return Array.from({ length: count }, () => sampleBotStrength(rng));
}

// Соперники — фэнтезийные бот-команды (как в 322-0: «Naga Spirits», «No Techies»…),
// а не реальные ростеры: Classic собирает состав из случайных людей и играет против
// таких же ботов со случайными именами. Сила берётся из распределения OVR реальных
// паков окна, чтобы поле было правдоподобным; имена — детерминированно из seed.
const BOT_PREFIX = [
  "Eternal", "Boosted", "Throwback", "Glorious", "Rampage", "Divine", "Feeding", "Smurfing",
  "Disconnected", "Cursed", "Turbo", "Ranked", "Mega", "Ancient", "Phantom", "Aegis", "Roshan's",
];
const BOT_NOUN = [
  "Throwers", "Gankers", "Believers", "Pandas", "Penguins", "Wards", "Couriers", "Spirits",
  "Bots", "Creeps", "Rejects", "Dragons", "Goblins", "Demons", "Techies", "Smurfs", "Pugs",
];

function botNames(rng: Rng, count: number): string[] {
  const combos: string[] = [];
  for (const prefix of BOT_PREFIX) for (const noun of BOT_NOUN) combos.push(`${prefix} ${noun}`);
  return rng.shuffle(combos).slice(0, count);
}

function opponentPool(metaRng: Rng, fieldRng: Rng): TournamentTeam[] {
  const names = botNames(metaRng, 17);
  const strengths = rollBotStrengths(fieldRng, 17);
  return names.map((name, index) => ({
    id: `bot-${index + 1}`,
    name,
    eventLabel: "",
    strength: strengths[index],
    isUser: false,
  }));
}

function projectionForRank(rank: number): ProjectionKey {
  if (rank === 1) return "1";
  if (rank <= 4) return "2-4";
  if (rank <= 8) return "5-8";
  if (rank <= 12) return "9-12";
  if (rank <= 16) return "13-16";
  return "17-18";
}

function winProbability(a: TournamentTeam, b: TournamentTeam): number {
  return 1 / (1 + Math.exp((b.strength - a.strength) / 12));
}

function playSeries(
  rng: Rng,
  id: string,
  round: string,
  teamA: TournamentTeam,
  teamB: TournamentTeam,
  bestOf: 3 | 5,
): SeriesResult {
  const needed = Math.floor(bestOf / 2) + 1;
  let scoreA = 0;
  let scoreB = 0;
  const frames: { scoreA: number; scoreB: number }[] = [{ scoreA: 0, scoreB: 0 }];
  while (scoreA < needed && scoreB < needed) {
    if (rng.float() < winProbability(teamA, teamB)) scoreA += 1;
    else scoreB += 1;
    frames.push({ scoreA, scoreB });
  }
  const winnerId = scoreA > scoreB ? teamA.id : teamB.id;
  return { id, round, teamA, teamB, scoreA, scoreB, bestOf, winnerId, loserId: winnerId === teamA.id ? teamB.id : teamA.id, frames };
}

function winner(series: SeriesResult): TournamentTeam {
  return series.winnerId === series.teamA.id ? series.teamA : series.teamB;
}

function loser(series: SeriesResult): TournamentTeam {
  return series.loserId === series.teamA.id ? series.teamA : series.teamB;
}

function buildGroup(rng: Rng, id: "A" | "B", teams: TournamentTeam[]): { group: TournamentGroup; matches: GroupMatch[] } {
  const records = new Map(teams.map((team) => [team.id, { team, wins: 0, losses: 0 }]));
  const matches: GroupMatch[] = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      let scoreA = 0;
      let scoreB = 0;
      const frames: { scoreA: number; scoreB: number }[] = [{ scoreA: 0, scoreB: 0 }];
      for (let map = 0; map < 2; map += 1) {
        if (rng.float() < winProbability(teams[i], teams[j])) scoreA += 1;
        else scoreB += 1;
        frames.push({ scoreA, scoreB });
      }
      const a = records.get(teams[i].id)!;
      const b = records.get(teams[j].id)!;
      a.wins += scoreA; a.losses += scoreB;
      b.wins += scoreB; b.losses += scoreA;
      matches.push({ id: `grp-${id}-${i}-${j}`, group: id, teamA: teams[i], teamB: teams[j], scoreA, scoreB, frames });
    }
  }
  const sorted = [...records.values()].sort((a, b) => b.wins - a.wins || b.team.strength - a.team.strength || a.team.id.localeCompare(b.team.id));
  return {
    group: {
      id,
      standings: sorted.map((record, index) => ({
        ...record,
        rank: index + 1,
        route: index < 4 ? "upper" : index < 8 ? "lower" : "out",
      })),
    },
    matches,
  };
}

function round(rng: Rng, id: string, label: string, pairs: [TournamentTeam, TournamentTeam][]): PlayoffRound {
  return { id, label, series: pairs.map(([a, b], index) => playSeries(rng, `${id}-${index + 1}`, label, a, b, 3)) };
}

function buildResult(data: GameData, format: Format, seed: string, userStrength: number, userName: string, fieldReroll = 0): TournamentResult {
  void data;
  void format;
  const metaRng = new Rng(`${seed}:tournament:meta`);
  const fieldRng = new Rng(`${seed}:tournament:field-${fieldReroll}`);
  const simRng = new Rng(`${seed}:tournament:sim-${fieldReroll}`);
  const user: TournamentTeam = { id: USER_ID, name: userName.trim() || "Aegis Five", eventLabel: "Fantasy roster", strength: userStrength, isUser: true };
  const field = [...opponentPool(metaRng, fieldRng), user]
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  const projection = projectionForRank(field.findIndex((team) => team.isUser) + 1);
  const draw = simRng.shuffle(field);
  const groupA = buildGroup(simRng, "A", draw.slice(0, 9));
  const groupB = buildGroup(simRng, "B", draw.slice(9));
  const groups = [groupA.group, groupB.group];
  const groupMatches = [...groupA.matches, ...groupB.matches];
  const a = groups[0].standings;
  const b = groups[1].standings;

  const ubQf = round(simRng, "ub-qf", "Upper Bracket R1", [[a[0].team, b[3].team], [b[1].team, a[2].team], [b[0].team, a[3].team], [a[1].team, b[2].team]]);
  const lbR1 = round(simRng, "lb-r1", "Lower Bracket R1", [[a[4].team, b[7].team], [b[5].team, a[6].team], [b[4].team, a[7].team], [a[5].team, b[6].team]]);
  const lbR2 = round(simRng, "lb-r2", "Lower Bracket R2", lbR1.series.map((series, index) => [winner(series), loser(ubQf.series[index])]));
  const ubSf = round(simRng, "ub-sf", "Upper Bracket Semifinal", [[winner(ubQf.series[0]), winner(ubQf.series[1])], [winner(ubQf.series[2]), winner(ubQf.series[3])]]);
  const lbR3 = round(simRng, "lb-r3", "Lower Bracket R3", [[winner(lbR2.series[0]), winner(lbR2.series[1])], [winner(lbR2.series[2]), winner(lbR2.series[3])]]);
  const lbR4 = round(simRng, "lb-r4", "Lower Bracket R4", [[winner(lbR3.series[0]), loser(ubSf.series[0])], [winner(lbR3.series[1]), loser(ubSf.series[1])]]);
  const ubFinal = round(simRng, "ub-final", "Upper Bracket Final", [[winner(ubSf.series[0]), winner(ubSf.series[1])]]);
  const lbR5 = round(simRng, "lb-r5", "Lower Bracket R5", [[winner(lbR4.series[0]), winner(lbR4.series[1])]]);
  const lbFinal = round(simRng, "lb-final", "Lower Bracket Final", [[winner(lbR5.series[0]), loser(ubFinal.series[0])]]);
  const grandFinal = playSeries(simRng, "grand-final", "Grand Final", winner(ubFinal.series[0]), winner(lbFinal.series[0]), 5);
  const playoffRounds = [ubQf, lbR1, lbR2, ubSf, lbR3, lbR4, ubFinal, lbR5, lbFinal];

  const groupOuts = [a[8], b[8]]
    .sort((left, right) => right.wins - left.wins || right.team.strength - left.team.strength)
    .map((row) => row.team);
  const buckets: [PlacementKey, TournamentTeam[]][] = [
    ["1", [winner(grandFinal)]], ["2", [loser(grandFinal)]], ["3", [loser(lbFinal.series[0])]],
    ["4", [loser(lbR5.series[0])]], ["5-6", lbR4.series.map(loser)], ["7-8", lbR3.series.map(loser)],
    ["9-12", lbR2.series.map(loser)], ["13-16", lbR1.series.map(loser)], ["17", [groupOuts[0]]], ["18", [groupOuts[1]]],
  ];
  const standings = buckets.flatMap(([placement, teams]) => teams
    .sort((left, right) => right.strength - left.strength)
    .map((team) => ({ team, placement })));
  const userPlacement = standings.find((entry) => entry.team.isUser)?.placement;
  if (!userPlacement || standings.length !== 18 || new Set(standings.map((entry) => entry.team.id)).size !== 18) {
    throw new Error("Tournament simulation produced an invalid final table");
  }
  return { field, projection, groups, groupMatches, playoffRounds, grandFinal, standings, champion: winner(grandFinal), userPlacement };
}

export function fieldRerollCount(actions: readonly { t: string }[]): number {
  return actions.filter((action) => action.t === "fieldReroll").length;
}

/** Pure deterministic tournament orchestration. Draft engine remains independent. */
export class TournamentEngine {
  private stageIndex = 0;
  private readonly result: TournamentResult;

  constructor(data: GameData, format: Format, seed: string, userStrength: number, userName: string, fieldReroll = 0) {
    this.result = buildResult(data, format, seed, userStrength, userName, fieldReroll);
  }

  get snapshot(): TournamentSnapshot {
    return { ...this.result, stage: STAGES[this.stageIndex], canAdvance: this.stageIndex < STAGES.length - 1 };
  }

  advance(): boolean {
    if (this.stageIndex >= STAGES.length - 1) return false;
    this.stageIndex += 1;
    return true;
  }
}
