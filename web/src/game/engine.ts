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
import { hasTeamSuccess, mixedBaseRating } from "./teamSuccess.ts";
import { scoreTeam, type ScoreBreakdown, heroStatsForAssignment, signatureLookup, chemistryPlayersFromRoster } from "./score.ts";

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

  /** Первый незаполненный слот ростера. */
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
    return this.slotForRole(c.player.role) !== -1;
  }

  /** Взять игрока в ростер; выдать следующий пак. */
  pickPlayer(candidateIndex: number): void {
    if (!this.canPickPlayer(candidateIndex)) throw new Error(`Нельзя взять игрока ${candidateIndex}`);
    const c = this.currentPack.candidates[candidateIndex];
    const slot = this.slotForRole(c.player.role);
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

  /** Ручная привязка / свап героев после драфта. */
  assign(accountId: number, heroId: number): void {
    if (!this.players.some((player) => player.accountId === accountId)) {
      throw new Error(`Игрок ${accountId} не в ростере`);
    }
    if (!this.heroes.includes(heroId)) throw new Error(`Герой ${heroId} не в составе`);
    for (const [acc, hero] of Object.entries(this.manual)) {
      if (hero === heroId) delete this.manual[Number(acc)];
    }
    this.manual[accountId] = heroId;
  }

  /** Свап героев двух игроков — только Manual allocation (322-0). */
  swapHeroes(accountIdA: number, accountIdB: number): void {
    if (this.config.allocation !== "manual") {
      throw new Error("Свап героев доступен только в режиме Manual");
    }
    if (!this.isComplete) throw new Error("Свап доступен только после завершения драфта");
    const current = this.effectiveAssignment();
    const heroA = current[accountIdA];
    const heroB = current[accountIdB];
    if (heroA == null || heroB == null) throw new Error("Оба игрока должны иметь героя");
    this.manual = { ...current, [accountIdA]: heroB, [accountIdB]: heroA };
  }

  get manualAssignment(): Record<number, number> {
    return { ...this.manual };
  }

  /** Текущее назначение героев с учётом manual overrides. */
  effectiveAssignment(): Record<number, number> {
    return this.score()?.assignment.byPlayer ?? {};
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
    const fixed = Object.keys(this.manual).length > 0 ? this.manual : undefined;
    const phs = heroStatsForAssignment(this.data);
    const signatures = signatureLookup(this.roster);
    const chemistryRoster = chemistryPlayersFromRoster(
      ROLE_SEQUENCE.map((role, i) => ({ role, candidate: this.roster[i] })),
    );
    // Mixed: base = успех команд за окно вместо формы на событии (PRD §5.4.3).
    // teamId берём из того же chemistryRoster — он уже несёт привязку игрок→команда.
    const mixedBase = this.config.draftStyle === "mixed"
      ? mixedBaseRating(
        players,
        new Map(chemistryRoster.map((p) => [p.accountId, p.teamId])),
        this.data.teamSuccess,
        this.config.format,
      )
      : undefined;
    return scoreTeam(
      players,
      this.heroes,
      phs,
      this.data.squadSynergy,
      this.data.teammates,
      chemistryRoster,
      signatures,
      fixed,
      mixedBase,
    );
  }

  // Мягкий анти-повтор: следующий пак — не та же команда, что сейчас (но команда
  // возвращается позже — чтобы можно было собрать бывших тиммейтов). Вечного
  // исключения команды нет (иначе Chemistry структурно невозможна).
  /** Монотонный номер пака: растёт на каждый draw(). Единственный честный признак «пак
   *  сменился» для UI. Считать по rerollsLeft нельзя — на Easy он равен Infinity, и реролл
   *  ключ не менял: раздача молча не переигрывалась. По содержимому пака тоже нельзя —
   *  реролл может выдать тот же первый игрок. */
  packSerial = 0;

  private draw(): DraftPack {
    this.packSerial += 1;
    const avoid = new Set<number>();
    const currentTeam = this.currentPack?.candidates[0]?.teamId;
    if (this.config.draftStyle === "team" && currentTeam != null) avoid.add(currentTeam);
    const pack = generatePack(this.pool, this.config, this.rng, {
      excludeTeamIds: avoid,
      excludePlayerIds: this.usedPlayers,
      teamAllowed: (teamId) => hasTeamSuccess(this.data.teamSuccess, teamId, this.config.format),
    });
    return this.withFullHeroOffer(pack);
  }

  /**
   * Каждый новый пак предлагает ровно пять ещё не взятых героев: СЛУЧАЙНЫЕ пять из
   * сигнатурного пула пака (в данных их 10), затем добор из того же format-pool, если
   * своих не хватило. Не требует runtime API и не предлагает дубль.
   *
   * Шаффл обязателен: пайплайн отдаёт signatureHeroes отсортированными по heroId, и без
   * него `slice(0, 5)` всегда показывал бы пятёрку с наименьшими id — пул сузился бы вдвое
   * и стал предсказуемым. Так же делает 322-0: `shuffle(signatureHeroes).slice(0, 5)`.
   * Детерминизм сохраняется: this.rng сеян seed'ом забега.
   */
  private withFullHeroOffer(pack: DraftPack): DraftPack {
    const drafted = new Set(this.heroes);
    const preferred = this.rng.shuffle(
      [...new Set(pack.signatureHeroes)].filter((heroId) => !drafted.has(heroId)),
    );
    const preferredSet = new Set(preferred);
    const fallback = this.rng.shuffle(
      [...new Set(this.pool.flatMap((source) => source.signatureHeroes))]
        .filter((heroId) => !drafted.has(heroId) && !preferredSet.has(heroId)),
    );
    const signatureHeroes = [...preferred, ...fallback].slice(0, HERO_TARGET);
    if (signatureHeroes.length !== HERO_TARGET) {
      throw new Error(`Недостаточно уникальных героев для пака: ${signatureHeroes.length}/${HERO_TARGET}`);
    }
    return { ...pack, signatureHeroes };
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
