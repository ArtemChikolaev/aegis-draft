// Движок забега (скилл scoring-model / game-state-architecture; логика независима от UI).
// Драфт в стиле 322-0: пак = ростер команды (5 игроков) + сигнатурные герои.
// Забег = 5 пиков игроков (по ролям) + 5 пиков героев (крепятся к игрокам). Всего 10.
// Герой привязывается авто-оптимально (matching) или вручную (allocation="manual").
import type { GameData, PackPlayer, Role } from "../types/data.ts";
import { Rng } from "./rng.ts";
import {
  ROLE_SEQUENCE,
  generatePack,
  poolForFormat,
  type Candidate,
  type DraftPack,
  type RunConfig,
} from "./packs.ts";
import { scoreTeam, type ScoreBreakdown } from "./score.ts";

/** Сколько героев драфтится (по одному на игрока, как в 322-0). */
export const HERO_TARGET = ROLE_SEQUENCE.length;

export interface RosterSlot {
  role: Role;
  candidate: Candidate | null;
}

export class RunEngine {
  readonly config: RunConfig;
  readonly rng: Rng;
  private readonly pool;
  private readonly data: GameData;

  roster: (Candidate | null)[] = ROLE_SEQUENCE.map(() => null);
  heroes: number[] = []; // драфтованные герои (≤ HERO_TARGET)
  currentPack!: DraftPack;
  rerollsLeft: number;
  private usedPlayers = new Set<number>();
  private manual: Record<number, number> = {}; // accountId -> heroId (ручной режим)

  constructor(data: GameData, config: RunConfig, seed: string) {
    this.data = data;
    this.config = config;
    this.rng = new Rng(seed);
    this.rerollsLeft = config.rerolls;
    this.pool = poolForFormat(data.packs, data.events, config.format);
    if (this.pool.length === 0) throw new Error(`Пустой пул паков для формата ${config.format}`);
    this.currentPack = this.draw();
  }

  /** Первый незаполненный слот роли (в Mixed — текущая роль строгого 1→5). */
  get currentSlotIndex(): number {
    return this.roster.findIndex((c) => c === null);
  }

  get rosterFilled(): number {
    return this.roster.filter((c) => c !== null).length;
  }

  /** Забег завершён, когда собраны и 5 игроков, и 5 героев. */
  get isComplete(): boolean {
    return this.rosterFilled === ROLE_SEQUENCE.length && this.heroes.length === HERO_TARGET;
  }

  get rosterView(): RosterSlot[] {
    return ROLE_SEQUENCE.map((role, i) => ({ role, candidate: this.roster[i] }));
  }

  get players(): PackPlayer[] {
    return this.roster.filter((c): c is Candidate => c !== null).map((c) => c.player);
  }

  get heroesLeft(): number {
    return HERO_TARGET - this.heroes.length;
  }

  /** Драфтуемые герои текущего пака (сигнатурные, минус уже взятые). */
  get packHeroes(): number[] {
    return [...new Set(this.currentPack.signatureHeroes)].filter((h) => !this.heroes.includes(h));
  }

  /** Можно ли взять игрока под этим индексом из текущего пака. */
  canPickPlayer(candidateIndex: number): boolean {
    if (this.rosterFilled >= ROLE_SEQUENCE.length) return false;
    const c = this.currentPack.candidates[candidateIndex];
    if (!c || this.usedPlayers.has(c.player.accountId)) return false;
    if (this.config.draftStyle === "mixed") return candidateIndex === this.currentSlotIndex;
    return this.slotForRole(c.player.role) !== -1; // team: любая ещё открытая роль
  }

  /** Взять игрока в ростер; выдать следующий пак. */
  pickPlayer(candidateIndex: number): void {
    if (!this.canPickPlayer(candidateIndex)) throw new Error(`Нельзя взять игрока ${candidateIndex}`);
    const c = this.currentPack.candidates[candidateIndex];
    const slot = this.config.draftStyle === "mixed" ? this.currentSlotIndex : this.slotForRole(c.player.role);
    this.roster[slot] = c;
    this.usedPlayers.add(c.player.accountId);
    if (!this.isComplete) this.currentPack = this.draw();
  }

  /** Можно ли взять героя из текущего пака (пул не заполнен и герой ещё не взят). */
  canPickHero(heroId: number): boolean {
    return this.heroes.length < HERO_TARGET && this.packHeroes.includes(heroId);
  }

  /** Взять героя в состав; выдать следующий пак. */
  pickHero(heroId: number): void {
    if (!this.canPickHero(heroId)) throw new Error(`Нельзя взять героя ${heroId}`);
    this.heroes.push(heroId);
    if (!this.isComplete) this.currentPack = this.draw();
  }

  /** Ручная привязка героя к игроку (allocation="manual"). Герой должен быть в составе. */
  assign(accountId: number, heroId: number): void {
    if (!this.players.some((player) => player.accountId === accountId)) {
      throw new Error(`Игрок ${accountId} не в ростере`);
    }
    if (!this.heroes.includes(heroId)) throw new Error(`Герой ${heroId} не в составе`);
    // Один герой — одному игроку: снять его с прежнего владельца.
    for (const [acc, hero] of Object.entries(this.manual)) {
      if (hero === heroId) delete this.manual[Number(acc)];
    }
    this.manual[accountId] = heroId;
  }

  get manualAssignment(): Record<number, number> {
    return { ...this.manual };
  }

  /** Реролл текущего пака. false, если рерроллы исчерпаны. */
  reroll(): boolean {
    if (this.isComplete) return false;
    if (this.rerollsLeft <= 0) return false;
    if (this.rerollsLeft !== Infinity) this.rerollsLeft -= 1;
    this.currentPack = this.draw();
    return true;
  }

  /** Текущий счёт (null, пока никто не выбран). */
  score(): ScoreBreakdown | null {
    const players = this.players;
    if (players.length === 0) return null;
    const fixed = this.config.allocation === "manual" ? this.manual : undefined;
    return scoreTeam(players, this.heroes, this.data.playerHeroStats, this.data.squadSynergy, fixed);
  }

  // Мягкий анти-повтор: следующий пак — не та же команда, что сейчас (но команда
  // возвращается позже — чтобы можно было собрать бывших тиммейтов). Вечного
  // исключения команды нет (иначе Chemistry структурно невозможна).
  private draw(): DraftPack {
    const avoid = new Set<number>();
    const currentTeam = this.currentPack?.candidates[0]?.teamId;
    if (this.config.draftStyle === "team" && currentTeam != null) avoid.add(currentTeam);
    return generatePack(this.pool, this.config, this.rng, { excludeTeamIds: avoid, excludePlayerIds: this.usedPlayers });
  }

  private slotForRole(role: Role): number {
    if (role === "safelane") return this.roster[0] === null ? 0 : -1;
    if (role === "mid") return this.roster[1] === null ? 1 : -1;
    if (role === "offlane") return this.roster[2] === null ? 2 : -1;
    if (this.roster[3] === null) return 3;
    if (this.roster[4] === null) return 4;
    return -1;
  }
}
