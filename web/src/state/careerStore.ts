import { create } from "zustand";
import { readCached, readPersisted, writePersisted } from "./persist.ts";
import type { RosterSlot } from "../game/engine.ts";
import type { DraftStyle, RunConfig, Scoring } from "../game/packs.ts";
import type { RunMode } from "./runPersist.ts";
import type { ScoreBreakdown } from "../game/score.ts";
import type { PlacementKey, TournamentSnapshot } from "../game/tournament.ts";
import type { Format, Role } from "../types/data.ts";

export type DifficultyLabel = "hard" | "normal" | "smurfing" | "easy";
export type CareerPlacementBucket = "1" | "2" | "3" | "4" | "5-6" | "7-8" | "rest";

export interface CareerConfigLabel {
  format: Format;
  difficulty: DifficultyLabel;
  scoring: Scoring;
  draftStyle: DraftStyle;
  /** Забег пройден в хардкоре. Опционально: записи до появления режима метки не имеют. */
  hardMode?: boolean;
  /** Режим забега. "run" = Roguelite Run; classic/quick и старые записи метки не имеют. */
  mode?: RunMode;
}

export interface CareerRosterPlayer {
  role: Role;
  nickname: string;
  accountId: number;
  heroId: number;
  /** OVR на момент забега. Опционален: записи, сохранённые до его появления, его не имеют —
   *  такие карточки просто рисуются без тира, ре-симулировать историю ради этого незачем. */
  ovr?: number;
}

export interface CareerResults {
  gamesWon: number;
  gamesLost: number;
  groupClean: boolean;
  undefeated: boolean;
}

export interface CareerRogueliteStage {
  /** Индекс завершённого ante-этапа с 0 — та же семантика, что у AnteRunState. */
  index: number;
  /** Всего этапов в этом Roguelite-забеге. */
  count: number;
}

export interface CareerEntry {
  v: 1;
  finishedAt: string;
  seed: string;
  datasetSchemaVersion: number;
  ratingModelVersion: string;
  configLabel: CareerConfigLabel;
  /** Этап, на котором закончился Roguelite Run. Старые и Quick Draft записи поля не имеют. */
  rogueliteStage?: CareerRogueliteStage;
  placement: PlacementKey;
  score: Pick<ScoreBreakdown, "base" | "heroSynergy" | "chemistry" | "teamOvr">;
  roster: CareerRosterPlayer[];
  results: CareerResults;
}

export interface CareerSummary {
  runs: number;
  placements: Record<CareerPlacementBucket, number>;
  undefeated: number;
  flawlessGroups: number;
  gamesWon: number;
  gamesLost: number;
}

interface PersistedCareer {
  v: 1;
  entries: CareerEntry[];
}

interface CareerStore {
  entries: CareerEntry[];
  record: (entry: CareerEntry) => boolean;
  /** Догрузка из CloudStorage (T9.6). Вне Telegram — no-op поверх того же кэша. */
  hydrate: () => Promise<void>;
}

const CAREER_KEY = "aegis:career:v1";

export function difficultyLabel(rerolls: number): DifficultyLabel {
  if (!Number.isFinite(rerolls)) return "easy";
  if (rerolls <= 0) return "hard";
  if (rerolls === 1) return "normal";
  return "smurfing";
}

export function placementBucket(placement: PlacementKey): CareerPlacementBucket {
  if (placement === "1" || placement === "2" || placement === "3" || placement === "4" || placement === "5-6" || placement === "7-8") return placement;
  return "rest";
}

/** Карты пользователя во всём турнире; никакой зависимости от UI/persist. */
export function tournamentCareerResults(tournament: TournamentSnapshot): CareerResults {
  let groupWon = 0;
  let groupLost = 0;
  let playoffWon = 0;
  let playoffLost = 0;

  const addScore = (teamAIsUser: boolean, scoreA: number, scoreB: number) => {
    if (teamAIsUser) return [scoreA, scoreB] as const;
    return [scoreB, scoreA] as const;
  };
  for (const match of tournament.groupMatches) {
    if (!match.teamA.isUser && !match.teamB.isUser) continue;
    const [won, lost] = addScore(match.teamA.isUser, match.scoreA, match.scoreB);
    groupWon += won;
    groupLost += lost;
  }
  const series = [...tournament.playoffRounds.flatMap((round) => round.series), tournament.grandFinal];
  for (const match of series) {
    if (!match.teamA.isUser && !match.teamB.isUser) continue;
    const [won, lost] = addScore(match.teamA.isUser, match.scoreA, match.scoreB);
    playoffWon += won;
    playoffLost += lost;
  }
  const gamesWon = groupWon + playoffWon;
  const gamesLost = groupLost + playoffLost;
  return { gamesWon, gamesLost, groupClean: groupLost === 0, undefeated: gamesLost === 0 };
}

export function buildCareerEntry(input: {
  finishedAt?: string;
  seed: string;
  datasetSchemaVersion: number;
  ratingModelVersion: string;
  config: RunConfig;
  mode?: RunMode;
  rogueliteStage?: CareerRogueliteStage;
  score: ScoreBreakdown;
  roster: RosterSlot[];
  tournament: TournamentSnapshot;
}): CareerEntry {
  const roster = input.roster.map((slot) => {
    if (!slot.candidate) throw new Error("Career entry requires a complete roster");
    const accountId = slot.candidate.player.accountId;
    const heroId = input.score.assignment.byPlayer[accountId];
    if (heroId == null) throw new Error("Career entry requires a hero for every player");
    return { role: slot.role, nickname: slot.candidate.player.nickname, accountId, heroId, ovr: slot.candidate.player.ovr };
  });
  if (roster.length !== 5) throw new Error("Career entry requires exactly five players");
  return {
    v: 1,
    finishedAt: input.finishedAt ?? new Date().toISOString(),
    seed: input.seed,
    datasetSchemaVersion: input.datasetSchemaVersion,
    ratingModelVersion: input.ratingModelVersion,
    configLabel: {
      format: input.config.format,
      difficulty: difficultyLabel(input.config.rerolls),
      scoring: input.config.scoring,
      draftStyle: input.config.draftStyle,
      hardMode: input.config.hardMode === true ? true : undefined,
      mode: input.mode === "run" ? "run" : undefined,
    },
    rogueliteStage: input.mode === "run" && input.rogueliteStage
      ? { index: input.rogueliteStage.index, count: input.rogueliteStage.count }
      : undefined,
    placement: input.tournament.userPlacement,
    score: {
      base: input.score.base,
      heroSynergy: input.score.heroSynergy,
      chemistry: input.score.chemistry,
      teamOvr: input.score.teamOvr,
    },
    roster,
    results: tournamentCareerResults(input.tournament),
  };
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

/** Stable id забега для career-дедупа и «уже завершён — не resume». */
export function careerRunIdFromRun(
  seed: string,
  datasetSchemaVersion: number,
  ratingModelVersion: string,
  config: RunConfig,
  mode?: RunMode,
): string {
  return hash(JSON.stringify([
    seed,
    datasetSchemaVersion,
    ratingModelVersion,
    config.format,
    difficultyLabel(config.rerolls),
    config.scoring,
    config.draftStyle,
    mode === "run" ? "run" : "quick",
  ]));
}

/** Stable across reloads; intentionally excludes finishedAt, score and roster. */
export function careerRunId(entry: CareerEntry): string {
  const { seed, datasetSchemaVersion, ratingModelVersion, configLabel } = entry;
  return hash(JSON.stringify([
    seed,
    datasetSchemaVersion,
    ratingModelVersion,
    configLabel.format,
    configLabel.difficulty,
    configLabel.scoring,
    configLabel.draftStyle,
    configLabel.mode === "run" ? "run" : "quick",
  ]));
}

/**
 * История на финальном экране разделена на два самостоятельных режима. Старые записи
 * без mode относятся к Quick Draft; полная CareerScreen этот фильтр намеренно не вызывает.
 */
export function careerEntriesForMode(entries: CareerEntry[], mode: RunMode): CareerEntry[] {
  const roguelite = mode === "run";
  return entries.filter((entry) => (entry.configLabel.mode === "run") === roguelite);
}

export function appendCareerEntry(entries: CareerEntry[], entry: CareerEntry): CareerEntry[] {
  const runId = careerRunId(entry);
  return entries.some((existing) => careerRunId(existing) === runId) ? entries : [...entries, entry];
}

export function summarizeCareer(entries: CareerEntry[]): CareerSummary {
  const placements: Record<CareerPlacementBucket, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5-6": 0, "7-8": 0, rest: 0 };
  let undefeated = 0;
  let flawlessGroups = 0;
  let gamesWon = 0;
  let gamesLost = 0;
  for (const entry of entries) {
    placements[placementBucket(entry.placement)] += 1;
    if (entry.results.undefeated) undefeated += 1;
    if (entry.results.groupClean) flawlessGroups += 1;
    gamesWon += entry.results.gamesWon;
    gamesLost += entry.results.gamesLost;
  }
  return { runs: entries.length, placements, undefeated, flawlessGroups, gamesWon, gamesLost };
}

function parseCareer(raw: string | null): CareerEntry[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedCareer;
    return parsed?.v === 1 && Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

function saveCareer(entries: CareerEntry[]): void {
  const persisted: PersistedCareer = { v: 1, entries };
  // Карьера — единственное, что не влезает в одно значение CloudStorage (873 байта на забег
  // против лимита 4096), поэтому persist режет её на чанки. См. state/persist.ts.
  void writePersisted(CAREER_KEY, JSON.stringify(persisted));
}

export const useCareer = create<CareerStore>((set, get) => ({
  // Первый кадр — из синхронного кэша; облако догружается hydrate() из App.
  entries: parseCareer(readCached(CAREER_KEY)),
  record(entry) {
    const current = get().entries;
    const next = appendCareerEntry(current, entry);
    if (next === current) return false;
    saveCareer(next);
    set({ entries: next });
    return true;
  },

  async hydrate() {
    const remote = parseCareer(await readPersisted(CAREER_KEY));
    if (!remote.length) return;
    // ОБЪЕДИНЯЕМ, а не заменяем: забег, дописанный в кэш, пока облако ещё отвечало, иначе
    // потерялся бы. Дедуп по runId живёт в appendCareerEntry — второго правила не заводим.
    const merged = remote.reduce(appendCareerEntry, get().entries);
    if (merged.length !== get().entries.length) set({ entries: merged });
  },
}));
