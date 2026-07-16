// Типы данных aegis-draft. Отражают schema/*.schema.json 1:1 (см. скилл data-contract).
// Источник правды — schema/. При расхождении правь схему, потом эти типы.

export type Role = "safelane" | "mid" | "offlane" | "support";
export type Format = "last_1y" | "last_2y" | "last_5y" | "valve_legacy";

export interface Hero {
  id: number;
  name: string;
  picture: string;
}

export interface EventInfo {
  id: string;
  name: string;
  short?: string;
  type: "ti" | "major" | "tier1" | "tier2" | "other";
  year?: number;
  startDate: string;
  endDate?: string;
  patch?: string;
  prizePool?: number;
  formats: Format[];
}

export interface PackPlayer {
  accountId: number;
  nickname: string;
  role: Role;
  ovr: number;
  impact: number;
  economy: number;
  reliability: number;
  games: number;
}

export interface Pack {
  id: string;
  eventId: string;
  teamId: number;
  teamName: string;
  tag?: string;
  logoId?: string;
  placement?: number;
  players: PackPlayer[];
  signatureHeroes: number[];
}

export interface Stat {
  games: number;
  winrate: number;
}

/** accountId -> heroId -> Stat */
export type PlayerHeroStats = Record<string, Record<string, Stat>>;
/** accountId -> [accountId] */
export type Teammates = Record<string, number[]>;

/** Сыгранность ГРУППЫ из 2–5 игроков (совместные pro-игры за одну команду), не только пар:
 * Chemistry весит крупную сыгравшуюся группу выше (пара ×1, пятёрка ×3). ids отсортированы. */
export interface SquadGroup {
  ids: number[];
  games: number;
  winrate: number;
}
export type SquadSynergy = SquadGroup[];

/** eventId -> accountId -> heroId -> Stat */
export type EventHeroStats = Record<string, Record<string, Record<string, Stat>>>;

export interface PlayerProfile {
  accountId: number;
  nickname: string;
  primaryRole: Role;
  rolesPlayed?: Role[];
  teams?: { teamId: number; teamName?: string; games: number; from?: string; to?: string }[];
  peak?: Partial<Record<Role, { ovr: number; windowStart?: string; windowEnd?: string; games?: number }>>;
}
export type Players = Record<string, PlayerProfile>;

export interface TeamWindowSuccess {
  successScore: number;
  titles?: number;
  topFinishes?: number;
  prizeUsd?: number;
  games?: number;
  winrate?: number;
  tiPlacement?: number;
}
/** teamId -> window -> metrics */
export type TeamSuccess = Record<string, Partial<Record<Format, TeamWindowSuccess>>>;

export interface Manifest {
  schemaVersion: number;
  ratingModelVersion: string;
  builtAt: string;
  source?: { opendota?: string; liquipedia?: string };
  formats: Format[];
  counts?: Record<string, number>;
}

/** Полный набор игровых данных. */
export interface GameData {
  manifest: Manifest;
  events: EventInfo[];
  heroes: Hero[];
  packs: Pack[];
  players: Players;
  playerHeroStats: PlayerHeroStats;
  careerPlayerHeroStats: PlayerHeroStats;
  teammates: Teammates;
  squadSynergy: SquadSynergy;
  eventHeroStats: EventHeroStats;
  teamSuccess: TeamSuccess;
}
