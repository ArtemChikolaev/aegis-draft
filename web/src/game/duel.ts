// Дуэль (M-DUEL, срез 1 — hotseat): два капитана за одним устройством собирают пятёрки из
// ОБЩЕГО пула, затем на каждую игру серии дуэлятся капитанским драфтом героев (баны + пики),
// и игра решается той же ELO-кривой, что все турниры проекта.
//
// Реюз по Правилу 0 — нового скоринга и матч-модели НЕТ:
//  • пул и паки — `poolForFormat`/`generatePack` (mixed-пак: пять кандидатов по ролям);
//  • сила пятёрки — `scoreTeam` (event-base, Hungarian-назначение героев, та же Chemistry);
//  • исход игры — `eloWinProbability` + `eloDivisorForScale` (tournament.ts / tournamentPower.ts).
// Новое здесь — только оркестрация двух сторон: змейка пиков, общий used-набор (личность ушла к
// одному — второму не предлагается), сетка банов/пиков героев и счёт серии.
//
// Детерминизм: seed решает паки и исходы игр; последовательность человеческих решений — вход.
// Поток паков (`:duel:draft`) продвигается только генерацией пака, исход игры N — свой ключ
// (`:duel:game-N`), поэтому длина хиро-драфта не сдвигает результаты.
import type { Format, GameData, PackPlayer, PlayerHeroStats } from "../types/data.ts";
import { Rng } from "./rng.ts";
import {
  ROLE_SEQUENCE,
  generatePack,
  poolForFormat,
  type Candidate,
  type DraftPack,
  type RunConfig,
} from "./packs.ts";
import {
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  scoreTeam,
  signatureLookup,
  type ScoreBreakdown,
} from "./score.ts";
import { eloWinProbability, QUICK_DRAFT_FIELD } from "./tournament.ts";
import { eloDivisorForScale } from "./tournamentPower.ts";

export type DuelSide = 0 | 1;

export interface DuelConfig {
  format: Format;
  /** Длина серии. bo1 — одна игра; в bo3/bo5 КАЖДАЯ игра начинается свежим хиро-драфтом. */
  bestOf: 1 | 3 | 5;
}

/** Правила дуэли (не входят в BALANCE_CONFIG_VERSION: PvE-баланс забегов не трогают). */
export const DUEL = {
  /** Рероллов пака на капитана за драфт игроков (как фикс roguelite). */
  rerollsPerSide: 2,
  /** Банов на сторону в каждом хиро-драфте (упрощённый CM: Б-Б-Б-Б, потом пики змейкой). */
  bansPerSide: 2,
  /** Сколько top-героев игрока (по pro-играм) попадает в общий пул хиро-драфта. */
  repertoireSize: 8,
  /** Порог pro-игр, ниже которого герой не считается частью репертуара. */
  repertoireMinGames: 10,
} as const;

/** Змейка пиков игроков: первый пик уравновешен двойным пиком второго. */
const PLAYER_SNAKE: readonly DuelSide[] = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];

export type DuelPhase = "players" | "heroes" | "resolved" | "done";

export interface HeroDraftStep {
  side: DuelSide;
  kind: "ban" | "pick";
}

/** Клетка общего пула героев: чей это comfort-герой и что с ним стало в текущем драфте. */
export interface DuelHeroCell {
  heroId: number;
  /** Суммарные pro-игры игроков каждой стороны на герое — «чей» герой, видно обоим. */
  games: [number, number];
  state: "open" | "banned" | "picked0" | "picked1";
}

export interface DuelGameResult {
  index: number;
  score: [ScoreBreakdown, ScoreBreakdown];
  /** Вероятность победы стороны 0 — показывается ДО резолва (прозрачность как у поля этапа). */
  pSideA: number;
  winner: DuelSide;
}

/** Сетка хиро-драфта игры: баны чередуются, пики — змейкой; приоритет первой стороны чередуется
 *  по играм серии (game 1 начинает сторона 0, game 2 — сторона 1, …). */
export function heroDraftScript(firstSide: DuelSide): HeroDraftStep[] {
  const other = (side: DuelSide): DuelSide => (side === 0 ? 1 : 0);
  const steps: HeroDraftStep[] = [];
  for (let i = 0; i < DUEL.bansPerSide * 2; i += 1) {
    steps.push({ side: i % 2 === 0 ? firstSide : other(firstSide), kind: "ban" });
  }
  const snake: DuelSide[] = PLAYER_SNAKE.map((side) => (side === 0 ? firstSide : other(firstSide)));
  for (const side of snake) steps.push({ side, kind: "pick" });
  return steps;
}

export class DuelEngine {
  readonly config: DuelConfig;
  readonly names: [string, string];
  phase: DuelPhase = "players";

  /** Ростеры по слотам ROLE_SEQUENCE — как в RunEngine, чтобы UI и скоринг читали одну форму. */
  rosters: [(Candidate | null)[], (Candidate | null)[]] = [
    ROLE_SEQUENCE.map(() => null),
    ROLE_SEQUENCE.map(() => null),
  ];
  currentPack!: DraftPack;
  pickIndex = 0;
  rerollsLeft: [number, number] = [DUEL.rerollsPerSide, DUEL.rerollsPerSide];

  /** Текущий хиро-драфт: сетка шагов и накопленный выбор. Сбрасывается на каждую игру. */
  private script: HeroDraftStep[] = [];
  private stepIndex = 0;
  heroPicks: [number[], number[]] = [[], []];
  bannedHeroes: number[] = [];

  games: DuelGameResult[] = [];

  private readonly data: GameData;
  private readonly seed: string;
  private readonly pool;
  private readonly phs: PlayerHeroStats;
  private readonly draftRng: Rng;
  private readonly used = new Set<number>();
  /** Конфиг для generatePack: дуэль всегда драфтит из mixed-паков (пять ролей на выбор). */
  private readonly packConfig: RunConfig;

  constructor(data: GameData, config: DuelConfig, seed: string, names: [string, string]) {
    this.data = data;
    this.config = config;
    this.seed = seed;
    this.names = names;
    this.pool = poolForFormat(data.packs, data.events, config.format);
    if (this.pool.length === 0) throw new Error(`Пустой пул паков для формата ${config.format}`);
    this.phs = heroStatsForAssignment(data);
    this.draftRng = new Rng(`${seed}:duel:draft`);
    this.packConfig = {
      draftStyle: "mixed", format: config.format, rerolls: 0, scoring: "event", allocation: "auto",
    };
    this.currentPack = this.drawPack();
  }

  private drawPack(): DraftPack {
    return generatePack(this.pool, this.packConfig, this.draftRng, { excludePlayerIds: this.used });
  }

  // ── Фаза 1: драфт игроков ─────────────────────────────────────────────────────

  get currentPicker(): DuelSide {
    return PLAYER_SNAKE[this.pickIndex] ?? 0;
  }

  private slotForRole(side: DuelSide, role: string): number {
    return ROLE_SEQUENCE.findIndex((r, index) => r === role && this.rosters[side][index] === null);
  }

  canPickPlayer(candidateIndex: number): boolean {
    if (this.phase !== "players") return false;
    const candidate = this.currentPack.candidates[candidateIndex];
    if (!candidate || this.used.has(candidate.player.accountId)) return false;
    return this.slotForRole(this.currentPicker, candidate.player.role) !== -1;
  }

  pickPlayer(candidateIndex: number): void {
    if (!this.canPickPlayer(candidateIndex)) throw new Error(`Нельзя взять игрока ${candidateIndex}`);
    const candidate = this.currentPack.candidates[candidateIndex];
    const side = this.currentPicker;
    this.rosters[side][this.slotForRole(side, candidate.player.role)] = candidate;
    this.used.add(candidate.player.accountId);
    this.pickIndex += 1;
    if (this.pickIndex >= PLAYER_SNAKE.length) {
      this.startHeroDraft();
    } else {
      this.currentPack = this.drawPack();
    }
  }

  reroll(): void {
    if (this.phase !== "players") throw new Error("Реролл доступен только в драфте игроков");
    const side = this.currentPicker;
    if (this.rerollsLeft[side] <= 0) throw new Error("Рероллы кончились");
    this.rerollsLeft[side] -= 1;
    this.currentPack = this.drawPack();
  }

  // ── Фаза 2: капитанский драфт героев (на каждую игру серии) ───────────────────

  private startHeroDraft(): void {
    this.phase = "heroes";
    this.script = heroDraftScript((this.games.length % 2) as DuelSide);
    this.stepIndex = 0;
    this.heroPicks = [[], []];
    this.bannedHeroes = [];
    // Страховка от софтлока: если comfort-пул мельче сетки драфта (экзотический датасет —
    // 4 бана + 10 пиков некуда класть), порог репертуара снимается: top-N без минимума игр.
    this.relaxedPool = false;
    if (this.heroPool().length < this.script.length) this.relaxedPool = true;
  }

  private relaxedPool = false;

  private sidePlayers(side: DuelSide): PackPlayer[] {
    return this.rosters[side].flatMap((slot) => (slot ? [slot.player] : []));
  }

  /** Репертуар игрока: top-N героев по pro-играм над порогом. Comfort-зона, по которой и баны. */
  private repertoire(accountId: number): { heroId: number; games: number }[] {
    const stats = this.phs[String(accountId)] ?? {};
    return Object.entries(stats)
      .map(([heroId, entry]) => ({ heroId: Number(heroId), games: (entry as { games: number }).games }))
      .filter((entry) => this.relaxedPool || entry.games >= DUEL.repertoireMinGames)
      .sort((a, b) => b.games - a.games || a.heroId - b.heroId)
      .slice(0, DUEL.repertoireSize);
  }

  /** Общий пул хиро-драфта: объединение репертуаров всех десяти игроков. Стабильный порядок —
   *  по суммарным играм (интересные баны сверху), тай-брейк по id. */
  heroPool(): DuelHeroCell[] {
    const cells = new Map<number, DuelHeroCell>();
    ([0, 1] as DuelSide[]).forEach((side) => {
      for (const player of this.sidePlayers(side)) {
        for (const { heroId, games } of this.repertoire(player.accountId)) {
          const cell = cells.get(heroId)
            ?? { heroId, games: [0, 0] as [number, number], state: "open" as const };
          cell.games[side] += games;
          cells.set(heroId, cell);
        }
      }
    });
    for (const heroId of this.bannedHeroes) {
      const cell = cells.get(heroId);
      if (cell) cell.state = "banned";
    }
    ([0, 1] as DuelSide[]).forEach((side) => {
      for (const heroId of this.heroPicks[side]) {
        const cell = cells.get(heroId);
        if (cell) cell.state = side === 0 ? "picked0" : "picked1";
      }
    });
    return [...cells.values()].sort((a, b) =>
      (b.games[0] + b.games[1]) - (a.games[0] + a.games[1]) || a.heroId - b.heroId);
  }

  get currentStep(): HeroDraftStep | null {
    return this.phase === "heroes" ? this.script[this.stepIndex] ?? null : null;
  }

  canActHero(heroId: number): boolean {
    if (!this.currentStep) return false;
    const cell = this.heroPool().find((entry) => entry.heroId === heroId);
    return cell !== undefined && cell.state === "open";
  }

  actHero(heroId: number): void {
    const step = this.currentStep;
    if (!step || !this.canActHero(heroId)) throw new Error(`Нельзя выбрать героя ${heroId}`);
    if (step.kind === "ban") this.bannedHeroes.push(heroId);
    else this.heroPicks[step.side].push(heroId);
    this.stepIndex += 1;
    if (this.stepIndex >= this.script.length) this.resolveGame();
  }

  // ── Резолв игры и серия ───────────────────────────────────────────────────────

  scoreSide(side: DuelSide): ScoreBreakdown {
    const roster = this.rosters[side].map((candidate) => ({ candidate }));
    return scoreTeam(
      this.sidePlayers(side),
      this.heroPicks[side],
      this.phs,
      this.data.squadSynergy,
      this.data.teammates,
      chemistryPlayersFromRoster(roster),
      signatureLookup(this.rosters[side]),
    );
  }

  private resolveGame(): void {
    const scoreA = this.scoreSide(0);
    const scoreB = this.scoreSide(1);
    // Делитель масштабируется от средней силы игры — та же страховка от «матча-сравнения чисел»,
    // что у этапов (R8.2); на шкале Quick Draft это ровно базовые 22.
    const divisor = eloDivisorForScale(22, Math.max(QUICK_DRAFT_FIELD.mean, (scoreA.teamOvr + scoreB.teamOvr) / 2));
    const pSideA = eloWinProbability(scoreA.teamOvr, scoreB.teamOvr, divisor);
    const roll = new Rng(`${this.seed}:duel:game-${this.games.length}`).float();
    this.games.push({
      index: this.games.length,
      score: [scoreA, scoreB],
      pSideA,
      winner: roll < pSideA ? 0 : 1,
    });
    this.phase = "resolved";
  }

  get seriesScore(): [number, number] {
    const wins: [number, number] = [0, 0];
    for (const game of this.games) wins[game.winner] += 1;
    return wins;
  }

  get gamesNeeded(): number {
    return Math.floor(this.config.bestOf / 2) + 1;
  }

  get seriesWinner(): DuelSide | null {
    const [a, b] = this.seriesScore;
    if (a >= this.gamesNeeded) return 0;
    if (b >= this.gamesNeeded) return 1;
    return null;
  }

  /** Дальше: следующая игра серии (свежий хиро-драфт) либо конец дуэли. */
  next(): void {
    if (this.phase !== "resolved") throw new Error("Игра ещё не сыграна");
    if (this.seriesWinner !== null) this.phase = "done";
    else this.startHeroDraft();
  }
}
