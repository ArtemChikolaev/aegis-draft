// Движок забега (скилл scoring-model, discovery: логика независима от UI/фреймворка).
// Владеет состоянием: конфиг, ростер по слотам, пул героев, рерроллы, текущий пак, счёт.
// Zustand-обёртка (T3.6) — тонкий адаптер поверх этого класса.
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
  heroPool: number[] = [];
  currentPack: DraftPack;
  rerollsLeft: number;
  private usedTeamIds = new Set<number>();

  constructor(data: GameData, config: RunConfig, seed: string) {
    this.data = data;
    this.config = config;
    this.rng = new Rng(seed);
    this.rerollsLeft = config.rerolls;
    this.pool = poolForFormat(data.packs, data.events, config.format);
    if (this.pool.length === 0) throw new Error(`Пустой пул паков для формата ${config.format}`);
    this.currentPack = this.draw();
  }

  /** Первый незаполненный слот (в Mixed-режиме он же — текущая роль строгого 1→5). */
  get currentSlotIndex(): number {
    const i = this.roster.findIndex((c) => c === null);
    return i;
  }

  get isComplete(): boolean {
    return this.currentSlotIndex === -1;
  }

  get rosterView(): RosterSlot[] {
    return ROLE_SEQUENCE.map((role, i) => ({ role, candidate: this.roster[i] }));
  }

  get players(): PackPlayer[] {
    return this.roster.filter((c): c is Candidate => c !== null).map((c) => c.player);
  }

  /** Можно ли взять кандидата под этим индексом из текущего пака. */
  canPick(candidateIndex: number): boolean {
    if (this.isComplete) return false;
    const c = this.currentPack.candidates[candidateIndex];
    if (!c) return false;
    if (this.config.draftStyle === "mixed") return candidateIndex === this.currentSlotIndex;
    return this.slotForRole(c.player.role) !== -1; // team: любая ещё открытая роль
  }

  /** Взять кандидата в ростер; аккумулировать героев; выдать следующий пак. */
  pick(candidateIndex: number): void {
    if (!this.canPick(candidateIndex)) throw new Error(`Нельзя взять кандидата ${candidateIndex}`);
    const c = this.currentPack.candidates[candidateIndex];
    const slot = this.config.draftStyle === "mixed" ? this.currentSlotIndex : this.slotForRole(c.player.role);
    this.roster[slot] = c;
    this.heroPool = [...new Set([...this.heroPool, ...c.signatureHeroes])];
    this.usedTeamIds.add(c.teamId);
    if (!this.isComplete) this.currentPack = this.draw();
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
    return scoreTeam(players, this.heroPool, this.data.playerHeroStats, this.data.squadSynergy);
  }

  private draw(): DraftPack {
    return generatePack(this.pool, this.config, this.rng, { excludeTeamIds: this.usedTeamIds });
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
