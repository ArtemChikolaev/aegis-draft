import type { RunConfig } from "../game/packs.ts";
import type { ScoreBreakdown } from "../game/score.ts";
import type { GameData } from "../types/data.ts";
import type { RosterSlot } from "../game/engine.ts";
import type { DraftPack } from "../game/packs.ts";
import type { TournamentSnapshot } from "../game/tournament.ts";
import { gameLog } from "./gameLog.ts";
import {
  formatDataLoaded,
  formatDraftSnap,
  formatRunStart,
  formatTournamentStage,
} from "./formatGameLog.ts";

const devLog = import.meta.env.DEV;

export interface DraftSnapLog {
  action: string;
  seed: string;
  config: RunConfig;
  data: GameData;
  snapshot: {
    currentPack: DraftPack;
    packHeroes: number[];
    heroes: number[];
    roster: RosterSlot[];
    rosterFilled: number;
    isComplete: boolean;
    score: ScoreBreakdown | null;
  };
  detail?: Record<string, unknown>;
}

/** Лог после pick/reroll/start — pack + текущий score (уже посчитан движком). */
export function logDraftSnap(input: DraftSnapLog): void {
  if (!devLog) return;
  const { headline, body } = formatDraftSnap(input);
  gameLog("draft", headline, body);
}

export function logDataLoaded(data: GameData): void {
  if (!devLog) return;
  gameLog("data", "dataset loaded", formatDataLoaded(data));
}

export function logRunStart(config: RunConfig, seed: string, data: GameData): void {
  if (!devLog) return;
  gameLog("draft", "run started", formatRunStart(config, seed, data));
}

export function logScreen(screen: string, detail?: string): void {
  if (!devLog) return;
  gameLog("nav", `screen · ${screen}`, detail);
}

export function logTournament(
  t: TournamentSnapshot,
  meta: { teamName: string; teamOvr: number; fieldReroll?: boolean },
): void {
  if (!devLog) return;
  const { headline, body } = formatTournamentStage(t, meta);
  gameLog("tournament", headline, body);
}
