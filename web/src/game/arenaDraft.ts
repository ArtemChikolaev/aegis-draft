// Arena MP2 — общий драфт комнаты (PRD §5.12): 18 команд, ОДИН общий пул игроков и героев,
// 5 раундов игроков + 5 раундов героев. Каждый раунд все выбирают одновременно (пик +
// необязательный запасной); резолв раунда атомарный — конфликт за одного игрока/героя выигрывает
// лучший приоритет раунда (посадка роллится по сиду комнаты, змейка инвертируется каждый раунд).
// Взятое исчезает из пула у всех: «скупить всех» невозможно по построению.
//
// Реюз по Правилу 0 — нового скоринга и пула НЕТ:
//  • пул — `poolForFormat`/`candidatesOf` (форма игрока сворачивается к лучшему снапшоту);
//  • сила пятёрки — `scoreTeam` (base = event OVR, как в Дуэли: сборная из общего пула —
//    не реальная команда, team-success ей не принадлежит);
//  • детерминизм — `Rng` (приоритет посадки) + чистые правила резолва: один и тот же лог
//    пиков ⇒ одно и то же состояние у всех клиентов (свойство, на котором стоит протокол).
// Новое здесь — только оркестрация одновременных раундов и бот-политика на общем пуле
// (порт «жадного» агента симулятора: лучший OVR в открытую роль; герой — comfort по pro-играм).
import type { Format, GameData, PlayerHeroStats, Role } from "../types/data.ts";
import { Rng } from "./rng.ts";
import {
  ROLE_SEQUENCE,
  candidatesOf,
  poolForFormat,
  type Candidate,
} from "./packs.ts";
import {
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  scoreTeam,
  signatureLookup,
  type ScoreBreakdown,
} from "./score.ts";

/** Правила общего драфта (не входят в BALANCE_CONFIG_VERSION: PvE-баланс не трогают). */
export const ARENA_DRAFT = {
  /** Полная сетка классического турнира. */
  fieldSize: 18,
  playerRounds: 5,
  heroRounds: 5,
  /** Длина раунда: UI ведёт отсчёт у всех, а закрывает раунд host (авто-close по таймеру). */
  roundSeconds: 30,
} as const;

export type ArenaRoundKind = "players" | "heroes";
export type ArenaDraftPhase = ArenaRoundKind | "done";

export interface ArenaSeat {
  /** memberId участника либо `bot-N`. */
  id: string;
  name: string;
  isBot: boolean;
}

/** Заявка сиденья на текущий раунд: пик + необязательный запасной (accountId либо heroId). */
export interface ArenaPick {
  main: number;
  backup?: number;
}

/** Итог одного сиденья в резолве раунда — «кто что получил и почему» для ленты драфта. */
export interface ArenaResolvedPick {
  seatIndex: number;
  kind: ArenaRoundKind;
  /** accountId игрока либо heroId. */
  id: number;
  /** main — заявка прошла; backup — main перехватили; auto — бот-политика (боты и молчавшие). */
  source: "main" | "backup" | "auto";
}

export interface ArenaTeamResult {
  /** memberId участника либо `bot-N`. */
  id: string;
  name: string;
  /** Сила с каноническим эпсилоном по индексу сиденья — у всех клиентов совпадает до бита. */
  strength: number;
  score: ScoreBreakdown;
}

/** Сколько игроков каждой роли нужно на одну команду (support ×2). */
const ROLE_NEED = ROLE_SEQUENCE.reduce<Map<Role, number>>(
  (need, role) => need.set(role, (need.get(role) ?? 0) + 1),
  new Map(),
);

/**
 * Хватает ли пула формата на `fieldSize` команд с глобальной уникальностью игроков и героев.
 * Возвращает null, если хватает, иначе — человекочитаемую причину (для гейта кнопки старта).
 */
export function arenaPoolShortage(data: GameData, format: Format, fieldSize: number = ARENA_DRAFT.fieldSize): string | null {
  const byRole = new Map<Role, number>();
  const seen = new Set<number>();
  for (const pack of poolForFormat(data.packs, data.events, format)) {
    for (const candidate of candidatesOf(pack)) {
      if (seen.has(candidate.player.accountId)) continue;
      seen.add(candidate.player.accountId);
      const role = candidate.player.role;
      byRole.set(role, (byRole.get(role) ?? 0) + 1);
    }
  }
  for (const [role, need] of ROLE_NEED) {
    const have = byRole.get(role) ?? 0;
    if (have < need * fieldSize) return `${role}: ${have} < ${need * fieldSize}`;
  }
  if (data.heroes.length < ROLE_SEQUENCE.length * fieldSize) {
    return `heroes: ${data.heroes.length} < ${ROLE_SEQUENCE.length * fieldSize}`;
  }
  return null;
}

export class ArenaDraftEngine {
  readonly seed: string;
  readonly format: Format;
  readonly fieldSize: number;
  readonly seats: ArenaSeat[];
  /** Приоритет посадки: индексы сидений, ролл по сиду комнаты — виден заранее и одинаков у всех. */
  readonly priority: number[];

  /** Сквозной раунд 0..9 (5 игроков + 5 героев); змейка инвертируется каждый раунд. */
  round = 0;
  /** Ростеры по слотам ROLE_SEQUENCE — та же форма, что RunEngine/Дуэль (UI и скоринг общие). */
  rosters: (Candidate | null)[][];
  heroPicks: number[][];
  /** Заявки ТЕКУЩЕГО раунда: seatIndex → пик. Первая заявка финальна (резолв может быть мгновенным). */
  readonly pending = new Map<number, ArenaPick>();
  /** Лента резолвов по раундам — источник строк «кто кого взял / перехвачен» в UI. */
  readonly history: ArenaResolvedPick[][] = [];

  private readonly data: GameData;
  private readonly phs: PlayerHeroStats;
  /** Общий пул: одна лучшая форма на личность (accountId → снапшот с максимальным OVR). */
  private readonly availablePlayers = new Map<number, Candidate>();
  private readonly availableHeroes = new Set<number>();
  private readonly seatByMember = new Map<string, number>();
  private resultsCache: ArenaTeamResult[] | null = null;

  constructor(
    data: GameData,
    format: Format,
    seed: string,
    humans: { id: string; name: string }[],
    fieldSize: number = ARENA_DRAFT.fieldSize,
  ) {
    this.data = data;
    this.format = format;
    this.seed = seed;
    this.fieldSize = fieldSize;
    this.phs = heroStatsForAssignment(data);

    const shortage = arenaPoolShortage(data, format, fieldSize);
    if (shortage) throw new Error(`Пул формата ${format} не тянет ${fieldSize} команд (${shortage})`);

    // Личность сворачивается к лучшей форме детерминированно: OVR ↓, затем eventId/teamId —
    // рулетка форм (R5.2) — это про рынок роглайта, общий драфт продаёт игрока один раз.
    for (const pack of poolForFormat(data.packs, data.events, format)) {
      for (const candidate of candidatesOf(pack)) {
        const current = this.availablePlayers.get(candidate.player.accountId);
        if (!current || betterSnapshot(candidate, current)) {
          this.availablePlayers.set(candidate.player.accountId, candidate);
        }
      }
    }
    for (const hero of data.heroes) this.availableHeroes.add(hero.id);

    const seated = humans.slice(0, fieldSize);
    this.seats = seated.map(({ id, name }) => ({ id, name, isBot: false }));
    for (let index = 0; this.seats.length < fieldSize; index += 1) {
      this.seats.push({ id: `bot-${index}`, name: `Bot ${index + 1}`, isBot: true });
    }
    this.seats.forEach((seat, index) => {
      if (!seat.isBot) this.seatByMember.set(seat.id, index);
    });
    this.priority = new Rng(`${seed}:arena:priority`).shuffle(this.seats.map((_, index) => index));
    this.rosters = this.seats.map(() => ROLE_SEQUENCE.map(() => null));
    this.heroPicks = this.seats.map(() => []);
  }

  get totalRounds(): number {
    return ARENA_DRAFT.playerRounds + ARENA_DRAFT.heroRounds;
  }

  get phase(): ArenaDraftPhase {
    if (this.round >= this.totalRounds) return "done";
    return this.round < ARENA_DRAFT.playerRounds ? "players" : "heroes";
  }

  seatOf(memberId: string): number | null {
    return this.seatByMember.get(memberId) ?? null;
  }

  /** Порядок резолва раунда: приоритет посадки, инвертируемый каждый раунд (змейка). */
  roundOrder(round: number = this.round): number[] {
    return round % 2 === 0 ? [...this.priority] : [...this.priority].reverse();
  }

  /** Открытые кандидаты раунда игроков (для UI): лучшая форма каждой свободной личности. */
  openPlayers(): Candidate[] {
    return [...this.availablePlayers.values()];
  }

  openHeroes(): number[] {
    return [...this.availableHeroes];
  }

  isPlayerOpen(accountId: number): boolean {
    return this.availablePlayers.has(accountId);
  }

  isHeroOpen(heroId: number): boolean {
    return this.availableHeroes.has(heroId);
  }

  /** Валиден ли пик для сиденья ПРЯМО СЕЙЧАС (у заявок проверяется ещё раз в резолве). */
  canPick(seatIndex: number, id: number): boolean {
    if (this.phase === "players") {
      const candidate = this.availablePlayers.get(id);
      return candidate !== undefined && this.openSlot(seatIndex, candidate.player.role) !== -1;
    }
    if (this.phase === "heroes") return this.availableHeroes.has(id);
    return false;
  }

  /**
   * Заявка участника на текущий раунд. Возвращает true, если принята (false — не участник,
   * не тот раунд, повторная заявка или мусор). Валидность цели здесь НЕ проверяется:
   * заявка может протухнуть, когда цель заберёт лучший приоритет — тогда сработает
   * запасной либо авто-пик.
   */
  submitPick(memberId: string, round: number, pick: ArenaPick): boolean {
    if (this.phase === "done" || round !== this.round) return false;
    const seatIndex = this.seatOf(memberId);
    if (seatIndex === null || this.pending.has(seatIndex)) return false;
    if (!Number.isFinite(pick.main)) return false;
    if (pick.backup !== undefined && !Number.isFinite(pick.backup)) return false;
    this.pending.set(seatIndex, pick);
    return true;
  }

  /** Все ли люди сдали заявку — сигнал мгновенного резолва (боты не ждут таймера). */
  get allHumansSubmitted(): boolean {
    return this.seats.every((seat, index) => seat.isBot || this.pending.has(index));
  }

  /**
   * Атомарный резолв текущего раунда: сиденья в порядке приоритета получают main → backup →
   * авто-пик. За раунд каждый получает ровно один пик — гарантия «скупить всех нельзя».
   */
  resolveRound(): ArenaResolvedPick[] {
    if (this.phase === "done") throw new Error("Драфт уже завершён");
    const kind = this.phase;
    const resolved: ArenaResolvedPick[] = [];
    for (const seatIndex of this.roundOrder()) {
      const pick = this.seats[seatIndex].isBot ? undefined : this.pending.get(seatIndex);
      let source: ArenaResolvedPick["source"] = "auto";
      let id: number;
      if (pick && this.canPick(seatIndex, pick.main)) {
        source = "main";
        id = pick.main;
      } else if (pick?.backup !== undefined && this.canPick(seatIndex, pick.backup)) {
        source = "backup";
        id = pick.backup;
      } else {
        id = kind === "players" ? this.autoPlayerPick(seatIndex) : this.autoHeroPick(seatIndex);
      }
      if (kind === "players") this.applyPlayer(seatIndex, id);
      else this.applyHero(seatIndex, id);
      resolved.push({ seatIndex, kind, id, source });
    }
    this.history.push(resolved);
    this.pending.clear();
    this.round += 1;
    return resolved;
  }

  /** Итог драфта: сила каждой команды тем же `scoreTeam`, что у одиночных режимов. */
  results(): ArenaTeamResult[] {
    if (this.phase !== "done") throw new Error("Драфт ещё идёт");
    if (this.resultsCache) return this.resultsCache;
    this.resultsCache = this.seats.map((seat, seatIndex) => {
      const roster = this.rosters[seatIndex];
      const players = roster.flatMap((slot) => (slot ? [slot.player] : []));
      const score = scoreTeam(
        players,
        this.heroPicks[seatIndex],
        this.phs,
        this.data.squadSynergy,
        this.data.teammates,
        chemistryPlayersFromRoster(roster.map((candidate) => ({ candidate }))),
        signatureLookup(roster),
      );
      // Эпсилон по индексу сиденья исключает точные ничьи сил: canonical-рассадка buildResult
      // сортирует по силе, а tie-break по id у «своей» команды у каждого клиента свой.
      return { id: seat.id, name: seat.name, strength: score.teamOvr + seatIndex * 1e-6, score };
    });
    return this.resultsCache;
  }

  // ── Внутренности резолва ─────────────────────────────────────────────────────

  private openSlot(seatIndex: number, role: Role): number {
    return ROLE_SEQUENCE.findIndex((r, index) => r === role && this.rosters[seatIndex][index] === null);
  }

  private applyPlayer(seatIndex: number, accountId: number): void {
    const candidate = this.availablePlayers.get(accountId);
    if (!candidate) throw new Error(`Игрок ${accountId} уже разобран`);
    const slot = this.openSlot(seatIndex, candidate.player.role);
    if (slot === -1) throw new Error(`Нет слота ${candidate.player.role} у сиденья ${seatIndex}`);
    this.rosters[seatIndex][slot] = candidate;
    this.availablePlayers.delete(accountId);
  }

  private applyHero(seatIndex: number, heroId: number): void {
    if (!this.availableHeroes.has(heroId)) throw new Error(`Герой ${heroId} уже разобран`);
    this.heroPicks[seatIndex].push(heroId);
    this.availableHeroes.delete(heroId);
  }

  /** Бот-политика игроков: лучший OVR в открытую роль (порт жадного агента симулятора).
   *  Валидная цель существует всегда: суммарный спрос ролей равен проверенному запасу пула. */
  private autoPlayerPick(seatIndex: number): number {
    let best: Candidate | null = null;
    for (const candidate of this.availablePlayers.values()) {
      if (this.openSlot(seatIndex, candidate.player.role) === -1) continue;
      if (!best
        || candidate.player.ovr > best.player.ovr
        || (candidate.player.ovr === best.player.ovr && candidate.player.accountId < best.player.accountId)) {
        best = candidate;
      }
    }
    if (!best) throw new Error(`Пул пуст для сиденья ${seatIndex} (нарушен инвариант ёмкости)`);
    return best.player.accountId;
  }

  /** Бот-политика героев: comfort — суммарные pro-игры пятёрки сиденья на герое. */
  private autoHeroPick(seatIndex: number): number {
    const players = this.rosters[seatIndex].flatMap((slot) => (slot ? [slot.player] : []));
    let bestHero = -1;
    let bestGames = -1;
    for (const heroId of this.availableHeroes) {
      let games = 0;
      for (const player of players) {
        games += this.phs[String(player.accountId)]?.[String(heroId)]?.games ?? 0;
      }
      if (games > bestGames || (games === bestGames && heroId < bestHero)) {
        bestHero = heroId;
        bestGames = games;
      }
    }
    if (bestHero === -1) throw new Error(`Пул героев пуст (нарушен инвариант ёмкости)`);
    return bestHero;
  }
}

/** Детерминированный выбор лучшей формы личности: OVR ↓, затем стабильный tie-break. */
function betterSnapshot(next: Candidate, current: Candidate): boolean {
  if (next.player.ovr !== current.player.ovr) return next.player.ovr > current.player.ovr;
  if (next.eventId !== current.eventId) return next.eventId < current.eventId;
  return next.teamId < current.teamId;
}
