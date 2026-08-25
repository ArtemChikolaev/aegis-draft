import type { MutatorId } from "../game/dynastyMutators.ts";
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
  /** Забег пройден в Cheat Mode (R2.3) — несоревновательный. Запись хранится и видна в истории,
   *  но исключается из ВСЕХ агрегатов и из счётчика забегов, по которому открывается
   *  мета-прогрессия: иначе читерский забег открыл бы редкость следующему честному. */
  cheatMode?: boolean;
  /** Stake (T6.4): правило сезона, под которым сыгран забег. Записи без метки — без Stake. */
  stake?: MutatorId;
  /** Запись сделана в Династии — добровольном продолжении ПОСЛЕ победы сезона (R6.3). Победа уже
   *  засчитана отдельной записью, поэтому эта в агрегаты и в счётчик забегов не идёт: иначе один
   *  забег считался бы дважды и Династия открывала бы мета-прогрессию сама себе. */
  dynasty?: boolean;
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
  /** Сезон выигран (R6.3). У записи Династии тоже true: поражение в ней победу не отменяет. */
  seasonWon?: boolean;
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
  /** Сезон выигран (R6.3): ставится и на записи самой победы, и на записи Династии после неё. */
  seasonWon?: boolean;
  /** Запись сделана в Династии — добровольном продолжении после победы (R6.3). */
  dynasty?: boolean;
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
      // Real Tournament (T5.6) пишет свой режим: у него отдельная история и бейдж.
      mode: input.mode === "run" ? "run" : input.mode === "tournament" ? "tournament" : undefined,
      cheatMode: input.config.cheatMode === true ? true : undefined,
      dynasty: input.dynasty === true ? true : undefined,
      stake: input.config.stake ?? undefined,
    },
    seasonWon: input.seasonWon === true ? true : undefined,
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
    mode === "run" ? "run" : mode === "tournament" ? "tournament" : "quick",
  ]));
}

/** Stable across reloads; intentionally excludes finishedAt, score and roster.
 *
 *  `dynasty` в id входит, а этап результата — нет, и это не противоречие: этап меняется у ОДНОГО
 *  забега (дедуп обязан считать такие записи одной), а Династия — отдельный отрезок ПОСЛЕ уже
 *  засчитанной победы сезона, у него свой финал и своя глубина (R6.3). Без этого поля запись
 *  Династии молча схлопнулась бы с записью победы. */
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
    configLabel.mode === "run" ? "run" : configLabel.mode === "tournament" ? "tournament" : "quick",
    configLabel.dynasty === true ? "dynasty" : "season",
  ]));
}

/**
 * История на финальном экране разделена на два самостоятельных режима. Старые записи
 * без mode относятся к Quick Draft; полная CareerScreen этот фильтр намеренно не вызывает.
 */
/** Соревновательные записи: cheat-забеги (R2.3) и продолжения в Династии (R6.3) в статистику
 *  и мета-прогрессию не идут — второй считался бы тем же забегом дважды. */
export function competitiveEntries(entries: CareerEntry[]): CareerEntry[] {
  return entries.filter((entry) => entry.configLabel.cheatMode !== true && entry.configLabel.dynasty !== true);
}

/** Stakes открыты (T6.4): хотя бы один ЧЕСТНО выигранный сезон Roguelite Run. Cheat-забеги
 *  исключены `competitiveEntries` внутри `careerEntriesForMode` — читерская победа мету не
 *  открывает (DoD R2.3). */
export function stakesUnlocked(entries: CareerEntry[]): boolean {
  return careerEntriesForMode(entries, "run").some((entry) => entry.seasonWon === true);
}

export function careerEntriesForMode(entries: CareerEntry[], mode: RunMode): CareerEntry[] {
  // Бакеты истории точные: Real Tournament (T5.6) не подмешивается в Quick Draft и наоборот.
  const bucket = (value?: RunMode) =>
    value === "run" ? "run" : value === "tournament" ? "tournament" : "quick";
  return competitiveEntries(entries).filter((entry) => bucket(entry.configLabel.mode) === bucket(mode));
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
  // Фильтр здесь, а не у вызывающих: агрегат — единственный источник career-счётчиков, и
  // забыть отфильтровать cheat в одном из мест означало бы тихо испортить статистику.
  const counted = competitiveEntries(entries);
  for (const entry of counted) {
    placements[placementBucket(entry.placement)] += 1;
    if (entry.results.undefeated) undefeated += 1;
    if (entry.results.groupClean) flawlessGroups += 1;
    gamesWon += entry.results.gamesWon;
    gamesLost += entry.results.gamesLost;
  }
  return { runs: counted.length, placements, undefeated, flawlessGroups, gamesWon, gamesLost };
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
