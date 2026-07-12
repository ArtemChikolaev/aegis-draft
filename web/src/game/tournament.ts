import type { Format, GameData, Pack } from "../types/data.ts";
import { poolForFormat } from "./packs.ts";
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

function packStrength(pack: Pack): number {
  const five = pack.players.slice(0, 5);
  return five.reduce((sum, player) => sum + player.ovr, 0) / Math.max(1, five.length);
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

function opponentPool(data: GameData, format: Format, rng: Rng): TournamentTeam[] {
  const preferredIds = new Set(poolForFormat(data.packs, data.events, format).map((pack) => pack.id));
  const preferred = rng.shuffle(data.packs.filter((pack) => preferredIds.has(pack.id)));
  const fallback = rng.shuffle(data.packs.filter((pack) => !preferredIds.has(pack.id)));
  const packs = [...preferred, ...fallback];
  if (packs.length < 17) throw new Error("Tournament requires at least 17 opponent packs");
  const names = botNames(rng, 17);
  return packs.slice(0, 17).map((pack, index) => ({
    id: `bot-${index + 1}`,
    name: names[index],
    eventLabel: "",
    strength: packStrength(pack),
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
  while (scoreA < needed && scoreB < needed) {
    if (rng.float() < winProbability(teamA, teamB)) scoreA += 1;
    else scoreB += 1;
  }
  const winnerId = scoreA > scoreB ? teamA.id : teamB.id;
  return { id, round, teamA, teamB, scoreA, scoreB, bestOf, winnerId, loserId: winnerId === teamA.id ? teamB.id : teamA.id };
}

function winner(series: SeriesResult): TournamentTeam {
  return series.winnerId === series.teamA.id ? series.teamA : series.teamB;
}

function loser(series: SeriesResult): TournamentTeam {
  return series.loserId === series.teamA.id ? series.teamA : series.teamB;
}

function buildGroup(rng: Rng, id: "A" | "B", teams: TournamentTeam[]): TournamentGroup {
  const records = new Map(teams.map((team) => [team.id, { team, wins: 0, losses: 0 }]));
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      for (let map = 0; map < 2; map += 1) {
        const aWins = rng.float() < winProbability(teams[i], teams[j]);
        const a = records.get(teams[i].id)!;
        const b = records.get(teams[j].id)!;
        if (aWins) { a.wins += 1; b.losses += 1; }
        else { b.wins += 1; a.losses += 1; }
      }
    }
  }
  const sorted = [...records.values()].sort((a, b) => b.wins - a.wins || b.team.strength - a.team.strength || a.team.id.localeCompare(b.team.id));
  return {
    id,
    standings: sorted.map((record, index) => ({
      ...record,
      rank: index + 1,
      route: index < 4 ? "upper" : index < 8 ? "lower" : "out",
    })),
  };
}

function round(rng: Rng, id: string, label: string, pairs: [TournamentTeam, TournamentTeam][]): PlayoffRound {
  return { id, label, series: pairs.map(([a, b], index) => playSeries(rng, `${id}-${index + 1}`, label, a, b, 3)) };
}

function buildResult(data: GameData, format: Format, seed: string, userStrength: number, userName: string): TournamentResult {
  const rng = new Rng(`${seed}:tournament`);
  const user: TournamentTeam = { id: USER_ID, name: userName.trim() || "Aegis Five", eventLabel: "Fantasy roster", strength: userStrength, isUser: true };
  const field = [...opponentPool(data, format, rng), user]
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  const projection = projectionForRank(field.findIndex((team) => team.isUser) + 1);
  const draw = rng.shuffle(field);
  const groups = [buildGroup(rng, "A", draw.slice(0, 9)), buildGroup(rng, "B", draw.slice(9))];
  const a = groups[0].standings;
  const b = groups[1].standings;

  const ubQf = round(rng, "ub-qf", "Upper Bracket R1", [[a[0].team, b[3].team], [b[1].team, a[2].team], [b[0].team, a[3].team], [a[1].team, b[2].team]]);
  const lbR1 = round(rng, "lb-r1", "Lower Bracket R1", [[a[4].team, b[7].team], [b[5].team, a[6].team], [b[4].team, a[7].team], [a[5].team, b[6].team]]);
  const lbR2 = round(rng, "lb-r2", "Lower Bracket R2", lbR1.series.map((series, index) => [winner(series), loser(ubQf.series[index])]));
  const ubSf = round(rng, "ub-sf", "Upper Bracket Semifinal", [[winner(ubQf.series[0]), winner(ubQf.series[1])], [winner(ubQf.series[2]), winner(ubQf.series[3])]]);
  const lbR3 = round(rng, "lb-r3", "Lower Bracket R3", [[winner(lbR2.series[0]), winner(lbR2.series[1])], [winner(lbR2.series[2]), winner(lbR2.series[3])]]);
  const lbR4 = round(rng, "lb-r4", "Lower Bracket R4", [[winner(lbR3.series[0]), loser(ubSf.series[0])], [winner(lbR3.series[1]), loser(ubSf.series[1])]]);
  const ubFinal = round(rng, "ub-final", "Upper Bracket Final", [[winner(ubSf.series[0]), winner(ubSf.series[1])]]);
  const lbR5 = round(rng, "lb-r5", "Lower Bracket R5", [[winner(lbR4.series[0]), winner(lbR4.series[1])]]);
  const lbFinal = round(rng, "lb-final", "Lower Bracket Final", [[winner(lbR5.series[0]), loser(ubFinal.series[0])]]);
  const grandFinal = playSeries(rng, "grand-final", "Grand Final", winner(ubFinal.series[0]), winner(lbFinal.series[0]), 5);
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
  return { field, projection, groups, playoffRounds, grandFinal, standings, champion: winner(grandFinal), userPlacement };
}

/** Pure deterministic tournament orchestration. Draft engine remains independent. */
export class TournamentEngine {
  private stageIndex = 0;
  private readonly result: TournamentResult;

  constructor(data: GameData, format: Format, seed: string, userStrength: number, userName: string) {
    this.result = buildResult(data, format, seed, userStrength, userName);
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
