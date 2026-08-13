// ManagerEngine — чистая логика Esports Manager (T5.5, срез 1). Никакого UI и стора:
// экраны дергают методы, состояние сериализуется целиком (long-save по снапшоту, не по
// реплею — в отличие от Classic здесь нет одного короткого лога действий).
//
// Детерминизм: каждый ролл берёт СВОЙ поток Rng `${seed}:<назначение>` (паттерн anteRun
// `:card`) — вставка нового ролла не сдвигает чужие последовательности.
//
// Референс поведения — живой проход 322-0 (docs/audits/2026-08-11-322-0-em-live-walkthrough.md):
// tryouts со скрытыми зарплатами → пул героев → контракты → отбор под доход → сезон из
// 5 циклов с гейтом квалификаций → финал → оффсезон (дрифт + пересмотр контрактов).
import type { Format, GameData, Role } from "../../types/data.ts";
import { ROLE_SEQUENCE, type Candidate } from "../packs.ts";
import { Rng } from "../rng.ts";
import {
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  scoreTeam,
  type ScoreBreakdown,
} from "../score.ts";
import {
  ELO_BOT_MAX,
  ELO_BOT_MIN,
  ELO_K,
  ELO_START,
  FAME,
  FIELD_OFFSET,
  FIELD_SIZE,
  FINALE_QUAL_ADVANCE,
  HAPPINESS,
  LIFECYCLE,
  MANAGER_INCOME,
  PRIZES,
  QUALIFIER_ADVANCE,
  RANDOM_EVENTS,
  RANDOM_EVENT_CHANCE,
  RIVAL_BONUS_K,
  offseasonDrift,
  renegotiatedSalary,
  salaryBand,
  salaryFor,
  type ManagerDifficulty,
  type ManagerEventKind,
  type ManagerRandomEventKind,
  type ManagerRegion,
} from "./economy.ts";

export type ManagerPhase = "tryouts" | "heroPool" | "contracts" | "season" | "offseason" | "review";

export interface OrgCandidate {
  candidate: Candidate;
  salary: number; // $k/мес
  band: 1 | 2 | 3 | 4;
  filler: boolean;
  /** Настроение 0..100 (срез 2): двигается результатами и событиями, решает уходы. */
  happiness: number;
  /** Слава в звёздах 0..10 (срез 2): растёт от титулов, дорожает контракт. */
  fame: number;
  /** Полных сезонов в организации (срез 2): 3+ — ветеран, выше шанс ретайра. */
  seasonsOnTeam: number;
}

export interface CalendarSlot {
  id: string;
  cycle: number; // 0..4; финальная пара — cycle 5
  kind: ManagerEventKind;
  name: string;
  /** Гейт: событие играется только если пройден qualifier своего цикла (или finaleQual). */
  gated: boolean;
  result?: { placement: number; prizeK: number; eloDelta: number };
  /** Не прошли гейт — событие сгорело. */
  dnq?: boolean;
}

export interface WorldOrg {
  name: string;
  elo: number;
}

export interface EventResult {
  slotId: string;
  kind: ManagerEventKind;
  name: string;
  placement: number;
  fieldSize: number;
  prizeK: number;
  eloDelta: number;
  advanced: boolean | null; // для гейтящих: прошли ли дальше; null — не гейтящее
  /** Rival играл это событие и мы встали выше — бонус спонсора (срез 2). */
  rivalBonusK: number;
  standings: Array<{ name: string; placement: number; isUser: boolean; isRival?: boolean }>;
  /** Раунды KO-сетки: [четвертьфиналы, полуфиналы, финал] (срез 3). */
  bracket: BracketRound[];
}

/** Случайное событие между турнирами (срез 2): плоский эффект уже применён, поле — что
 *  показать. Событие-выбор (срез 3) несёт `choice` и ждёт resolveRandomEvent(accept). */
export interface RandomEventResult {
  kind: ManagerRandomEventKind;
  cashK: number;
  happiness: number;
  choice?: { costK: number; happiness: number };
}

/** Сетка KO-этапа для панели результата (срез 3): пары по раундам, победитель отмечен. */
export type BracketRound = Array<{ a: string; b: string; winner: string }>;

export interface FeedItem {
  slotId: string;
  name: string;
  placement: number;
  prizeK: number;
  dnq?: boolean;
}

export interface ManagerConfig {
  orgName: string;
  region: ManagerRegion;
  difficulty: ManagerDifficulty;
  format: Format;
}

export interface ManagerState {
  v: 1;
  seed: string;
  config: ManagerConfig;
  phase: ManagerPhase;
  season: number; // 1-based
  bankK: number;
  // Драфт орга
  tryoutPick: number; // 0..TRYOUT_PICKS
  tryoutRerollsLeft: number;
  tryoutOffer: OrgCandidate[];
  tryoutPicked: OrgCandidate[];
  heroRound: number; // 0..HERO_ROUNDS
  heroOffer: number[];
  heroPool: number[];
  candidates: OrgCandidate[]; // после трайаутов: пики + филлеры
  roster: OrgCandidate[]; // подписанная пятёрка (в порядке ROLE_SEQUENCE)
  // Сезон
  calendar: CalendarSlot[];
  world: WorldOrg[];
  elo: number;
  feed: FeedItem[];
  lastResult: EventResult | null;
  seasonGames: number;
  seasonWins: number;
  /** Rival сезона — имя орга из world (срез 2). */
  rival: string;
  /** Случайное событие, ожидающее показа (эффект уже применён). */
  pendingRandomEvent: RandomEventResult | null;
  // Оффсезон
  offseasonDrifts: Record<number, number>; // accountId → ΔOVR
  offseasonSalaries: Record<number, number>; // accountId → новая зарплата
  released: number[];
  /** Уходящие сами (ретайр/несчастье) — release принудительный, не тогглится. */
  departures: number[];
  /** Ручные назначения героев accountId → heroId (срез 3): pins поверх авто-matching. */
  manualAssignment: Record<number, number>;
}

export const TRYOUT_PICKS = 8;
export const TRYOUT_REROLLS = 1;
export const HERO_ROUNDS = 4;
export const HERO_OFFER_SIZE = 6;
export const HERO_PICKS_PER_ROUND = 3;
const SEASON_CYCLES = 5;
const MONTHS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

/** Месяц слота — для подписи в календаре (2 события ≈ месяц, как у референса). */
export function slotMonth(slot: CalendarSlot): string {
  if (slot.kind === "finaleQual") return MONTHS[10];
  if (slot.kind === "finale") return MONTHS[11];
  const base = slot.cycle * 2;
  const shift = slot.kind === "tier2" && slot.id.endsWith("a") ? 0 : slot.kind === "tier2" ? 1 : slot.kind === "qualifier" ? 0 : 1;
  return MONTHS[Math.min(9, base + shift)];
}

/** Имена ботов-организаций и событий — свои, в духе генератора tournament.ts (не копия 322-0). */
const ORG_PREFIX = ["Smoke", "Glorious", "Eternal", "Tilted", "Roshan's", "Courier", "Naga", "Brood", "Rampage", "Divine", "Salty", "Megacreep", "Tinker", "Last Hit", "Disconnected", "Aegis", "Boosted"];
const ORG_NOUN = ["Demons", "Rejects", "Throwers", "Rats", "Creeps", "Gankers", "Penguins", "Stacks", "Snipers", "Wisps", "Pandas", "Spirits", "Couriers", "Dragons", "Wards", "Bots", "Roamers"];
const EVENT_SERIES = ["Pug League", "Pro Series", "Invitational", "Masters", "Clash", "Circuit", "Cup", "Open"];

function eventName(rng: Rng, kind: ManagerEventKind, season: number, cycle: number): string {
  if (kind === "finale") return `Aegis Championship S${season}`;
  if (kind === "finaleQual") return `Aegis Championship S${season} — Qualifier`;
  const series = rng.pick(EVENT_SERIES);
  const brand = rng.pick(ORG_NOUN);
  const n = cycle + 1 + (season - 1) * SEASON_CYCLES;
  if (kind === "qualifier") return `${brand} ${series} ${n} — Open Qualifier`;
  if (kind === "lan") return `${brand} ${series} ${n} — LAN Finals`;
  return `${brand} ${series} ${n}`;
}

function buildCalendar(seed: string, season: number): CalendarSlot[] {
  const rng = new Rng(`${seed}:calendar:${season}`);
  const slots: CalendarSlot[] = [];
  for (let cycle = 0; cycle < SEASON_CYCLES; cycle += 1) {
    slots.push({ id: `s${season}c${cycle}t2a`, cycle, kind: "tier2", name: eventName(rng, "tier2", season, cycle), gated: false });
    slots.push({ id: `s${season}c${cycle}t2b`, cycle, kind: "tier2", name: eventName(rng, "tier2", season, cycle), gated: false });
    slots.push({ id: `s${season}c${cycle}q`, cycle, kind: "qualifier", name: eventName(rng, "qualifier", season, cycle), gated: false });
    slots.push({ id: `s${season}c${cycle}o`, cycle, kind: "online", name: eventName(rng, "online", season, cycle), gated: true });
    slots.push({ id: `s${season}c${cycle}l`, cycle, kind: "lan", name: eventName(rng, "lan", season, cycle), gated: true });
  }
  slots.push({ id: `s${season}fq`, cycle: SEASON_CYCLES, kind: "finaleQual", name: eventName(rng, "finaleQual", season, SEASON_CYCLES), gated: false });
  slots.push({ id: `s${season}f`, cycle: SEASON_CYCLES, kind: "finale", name: eventName(rng, "finale", season, SEASON_CYCLES), gated: true });
  return slots;
}

function buildWorld(seed: string, region: ManagerRegion): WorldOrg[] {
  const rng = new Rng(`${seed}:world:${region}`);
  const names = new Set<string>();
  while (names.size < 17) names.add(`${rng.pick(ORG_PREFIX)} ${rng.pick(ORG_NOUN)}`);
  return [...names].map((name) => ({
    name,
    elo: ELO_BOT_MIN + rng.int(ELO_BOT_MAX - ELO_BOT_MIN + 1),
  }));
}

/** Свежайший pack-снапшот на игрока в окне формата: кандидат Manager — текущая форма,
 *  а не лучшая в истории (у одного человека несколько форм — Manager берёт последнюю). */
export function managerCandidatePool(data: GameData, format: Format): Candidate[] {
  const eventYear = new Map(data.events.map((e) => [e.id, e.year]));
  const best = new Map<number, Candidate>();
  const freshness = (c: Candidate) => (eventYear.get(c.eventId) ?? 0);
  for (const pack of data.packs) {
    if (!pack.formats.includes(format)) continue;
    for (const candidate of pack.players.map((player) => ({
      player,
      teamId: pack.teamId,
      teamName: pack.teamName,
      logoUrl: pack.logoUrl,
      eventId: pack.eventId,
      signatureHeroes: pack.signatureHeroes,
    }))) {
      const prev = best.get(candidate.player.accountId);
      if (!prev || freshness(candidate) > freshness(prev) || (freshness(candidate) === freshness(prev) && candidate.eventId > prev.eventId)) {
        best.set(candidate.player.accountId, candidate);
      }
    }
  }
  return [...best.values()].sort((a, b) => a.player.accountId - b.player.accountId);
}

export class ManagerEngine {
  readonly state: ManagerState;
  private readonly data: GameData;
  private pool: Candidate[];

  constructor(data: GameData, state: ManagerState) {
    this.data = data;
    this.state = state;
    this.pool = managerCandidatePool(data, state.config.format);
  }

  static create(data: GameData, seed: string, config: ManagerConfig): ManagerEngine {
    const state: ManagerState = {
      v: 1,
      seed,
      config,
      phase: "tryouts",
      season: 1,
      bankK: 0,
      tryoutPick: 0,
      tryoutRerollsLeft: TRYOUT_REROLLS,
      tryoutOffer: [],
      tryoutPicked: [],
      heroRound: 0,
      heroOffer: [],
      heroPool: [],
      candidates: [],
      roster: [],
      calendar: buildCalendar(seed, 1),
      world: buildWorld(seed, config.region),
      elo: ELO_START,
      feed: [],
      lastResult: null,
      seasonGames: 0,
      seasonWins: 0,
      rival: "",
      pendingRandomEvent: null,
      offseasonDrifts: {},
      offseasonSalaries: {},
      released: [],
      departures: [],
      manualAssignment: {},
    };
    const engine = new ManagerEngine(data, state);
    engine.state.rival = engine.pickRival();
    engine.rollTryoutOffer();
    engine.rollHeroOffer();
    return engine;
  }

  /** Rival сезона — ближайший к нам по ELO орг: обгонять его и осмысленно, и реально. */
  private pickRival(): string {
    const s = this.state;
    return [...s.world].sort(
      (a, b) => Math.abs(a.elo - s.elo) - Math.abs(b.elo - s.elo) || a.name.localeCompare(b.name),
    )[0]?.name ?? "";
  }

  // ── Трайауты ────────────────────────────────────────────────────────────────

  private orgCandidate(candidate: Candidate, rng: Rng, filler: boolean): OrgCandidate {
    const salary = filler
      ? Math.max(4, Math.min(12, salaryFor(candidate.player.ovr, rng)))
      : salaryFor(candidate.player.ovr, rng);
    return {
      candidate,
      salary,
      band: salaryBand(salary),
      filler,
      happiness: HAPPINESS.start,
      fame: 0,
      seasonsOnTeam: 0,
    };
  }

  /** Сдвиг настроения всему ростеру с клампом (события, результаты, оффсезон). */
  private bumpHappiness(delta: number): void {
    for (const player of this.state.roster) {
      player.happiness = Math.max(HAPPINESS.min, Math.min(HAPPINESS.max, player.happiness + delta));
    }
  }

  private bumpFame(delta: number): void {
    for (const player of this.state.roster) {
      player.fame = Math.max(0, Math.min(FAME.max, Math.round((player.fame + delta) * 4) / 4));
    }
  }

  private rollTryoutOffer(): void {
    const s = this.state;
    const rng = new Rng(`${s.seed}:tryout:${s.season}:${s.tryoutPick}:${TRYOUT_REROLLS - s.tryoutRerollsLeft}`);
    const taken = new Set(s.tryoutPicked.map((p) => p.candidate.player.accountId));
    const available = this.pool.filter((c) => !taken.has(c.player.accountId));
    s.tryoutOffer = rng.shuffle(available).slice(0, 5).map((c) => this.orgCandidate(c, rng, false));
  }

  rerollTryouts(): boolean {
    const s = this.state;
    if (s.phase !== "tryouts" || s.tryoutRerollsLeft <= 0) return false;
    s.tryoutRerollsLeft -= 1;
    this.rollTryoutOffer();
    return true;
  }

  pickTryout(accountId: number): boolean {
    const s = this.state;
    if (s.phase !== "tryouts") return false;
    const pick = s.tryoutOffer.find((o) => o.candidate.player.accountId === accountId);
    if (!pick) return false;
    s.tryoutPicked.push(pick);
    s.tryoutPick += 1;
    if (s.tryoutPick >= TRYOUT_PICKS) {
      s.phase = "heroPool";
      s.tryoutOffer = [];
    } else {
      this.rollTryoutOffer();
    }
    return true;
  }

  // ── Пул героев ──────────────────────────────────────────────────────────────

  private rollHeroOffer(): void {
    const s = this.state;
    const rng = new Rng(`${s.seed}:heroes:${s.season}:${s.heroRound}`);
    const taken = new Set(s.heroPool);
    const ids = this.data.heroes.map((h) => h.id).filter((id) => !taken.has(id));
    s.heroOffer = rng.shuffle(ids).slice(0, HERO_OFFER_SIZE);
  }

  pickHeroes(ids: number[]): boolean {
    const s = this.state;
    if (s.phase !== "heroPool" || ids.length !== HERO_PICKS_PER_ROUND) return false;
    if (!ids.every((id) => s.heroOffer.includes(id)) || new Set(ids).size !== ids.length) return false;
    s.heroPool.push(...ids);
    s.heroRound += 1;
    if (s.heroRound >= HERO_ROUNDS) {
      this.finishOrgDraft();
    } else {
      this.rollHeroOffer();
    }
    return true;
  }

  /** Контракты: раскрываем зарплаты (они уже зафиксированы роллом пика) и добавляем
   *  дешёвых филлеров по ролям — гарантия, что валидная пятёрка собирается всегда. */
  private finishOrgDraft(): void {
    const s = this.state;
    const rng = new Rng(`${s.seed}:fillers:${s.season}`);
    const picked = new Set(s.tryoutPicked.map((p) => p.candidate.player.accountId));
    const byOvr = [...this.pool].sort((a, b) => a.player.ovr - b.player.ovr);
    const fillers: OrgCandidate[] = [];
    for (const role of ["safelane", "mid", "offlane", "support", "support"] as Role[]) {
      const pick = byOvr.find(
        (c) => c.player.role === role && !picked.has(c.player.accountId) && !fillers.some((f) => f.candidate.player.accountId === c.player.accountId),
      );
      if (pick) fillers.push(this.orgCandidate(pick, rng, true));
    }
    s.candidates = [...s.tryoutPicked, ...fillers];
    s.phase = "contracts";
    s.heroOffer = [];
  }

  // ── Контракты и отбор пятёрки ───────────────────────────────────────────────

  get incomeK(): number {
    return MANAGER_INCOME[this.state.config.difficulty];
  }

  get wagesK(): number {
    return this.state.roster.reduce((sum, p) => sum + p.salary, 0);
  }

  /** Валидная пятёрка: 1 carry / 1 mid / 1 offlane / 2 support и зарплаты ≤ дохода. */
  validateRoster(accountIds: number[]): { ok: boolean; reason?: "size" | "roles" | "budget" } {
    if (accountIds.length !== 5 || new Set(accountIds).size !== 5) return { ok: false, reason: "size" };
    const chosen = this.state.candidates.filter((c) => accountIds.includes(c.candidate.player.accountId));
    if (chosen.length !== 5) return { ok: false, reason: "size" };
    const need: Role[] = [...ROLE_SEQUENCE];
    for (const c of chosen) {
      const idx = need.indexOf(c.candidate.player.role);
      if (idx === -1) return { ok: false, reason: "roles" };
      need.splice(idx, 1);
    }
    if (need.length > 0) return { ok: false, reason: "roles" };
    const wages = chosen.reduce((sum, c) => sum + c.salary, 0);
    if (wages > this.incomeK) return { ok: false, reason: "budget" };
    return { ok: true };
  }

  signRoster(accountIds: number[]): boolean {
    const s = this.state;
    if (s.phase !== "contracts" || !this.validateRoster(accountIds).ok) return false;
    // Порядок слотов — канонический ROLE_SEQUENCE (два саппорта в порядке выбора).
    const chosen = s.candidates.filter((c) => accountIds.includes(c.candidate.player.accountId));
    const roster: OrgCandidate[] = [];
    const remaining = [...chosen];
    for (const role of ROLE_SEQUENCE) {
      const idx = remaining.findIndex((c) => c.candidate.player.role === role);
      roster.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
    s.roster = roster;
    s.phase = "season";
    return true;
  }

  // ── Счёт состава (тот же scoreTeam, что Classic/Roguelite) ─────────────────

  score(): ScoreBreakdown | null {
    const s = this.state;
    if (s.roster.length !== 5) return null;
    const rosterSlots = s.roster.map((p) => ({ candidate: p.candidate }));
    return scoreTeam(
      s.roster.map((p) => p.candidate.player),
      s.heroPool,
      heroStatsForAssignment(this.data),
      this.data.squadSynergy,
      this.data.teammates,
      chemistryPlayersFromRoster(rosterSlots),
      {},
      s.manualAssignment,
    );
  }

  /** Закрепить героя за игроком (Manual, срез 3). null — снять pin (авто). Герой принадлежит
   *  одному игроку: pin отбирает его у прежнего владельца-pin'а, авто-matching дораздаёт рест. */
  setHeroAssignment(accountId: number, heroId: number | null): boolean {
    const s = this.state;
    if (!s.roster.some((p) => p.candidate.player.accountId === accountId)) return false;
    if (heroId === null) {
      delete s.manualAssignment[accountId];
      return true;
    }
    if (!s.heroPool.includes(heroId)) return false;
    for (const [acc, hero] of Object.entries(s.manualAssignment)) {
      if (hero === heroId) delete s.manualAssignment[Number(acc)];
    }
    s.manualAssignment[accountId] = heroId;
    return true;
  }

  resetAssignment(): void {
    this.state.manualAssignment = {};
  }

  // ── Сезон: события ──────────────────────────────────────────────────────────

  get nextSlot(): CalendarSlot | null {
    return this.state.calendar.find((slot) => !slot.result && !slot.dnq) ?? null;
  }

  private cycleQualified(cycle: number): boolean {
    const q = this.state.calendar.find((slot) => slot.cycle === cycle && (slot.kind === "qualifier" || slot.kind === "finaleQual"));
    if (!q?.result) return false;
    const advance = q.kind === "qualifier" ? QUALIFIER_ADVANCE : FINALE_QUAL_ADVANCE;
    return q.result.placement <= advance;
  }

  /** Сыграть следующее событие (мгновенный розыгрыш). Гейт решается здесь же:
   *  негейтнутое событие сгорает как dnq и очередь идёт дальше. */
  playNextEvent(): EventResult | null {
    const s = this.state;
    if (s.phase !== "season") return null;
    let slot = this.nextSlot;
    while (slot && slot.gated && !this.cycleQualified(slot.cycle)) {
      slot.dnq = true;
      s.feed.unshift({ slotId: slot.id, name: slot.name, placement: 0, prizeK: 0, dnq: true });
      slot = this.nextSlot;
    }
    if (!slot) {
      // Тупик плейтеста 2026-08-12: последний слот сезона сгорел как DNQ прямо здесь —
      // панели результата не будет, и continueSeason никто не позовёт. Переходим сами.
      if (this.seasonFinished()) this.beginOffseason();
      return null;
    }

    const score = this.score();
    const strength = score ? score.teamOvr : 70;
    const rng = new Rng(`${s.seed}:event:${slot.id}`);
    const size = FIELD_SIZE[slot.kind];
    const offset = FIELD_OFFSET[slot.kind];
    // Поле: сила ботов вокруг силы игрока со сдвигом тира (гейт — в самом сдвиге).
    // Rival всегда в поле: гонка с ним — постоянная сюжетная линия сезона (322-0-парити).
    const rivalOrg = this.state.world.find((org) => org.name === s.rival);
    const others = rng.shuffle(this.state.world.filter((org) => org.name !== s.rival)).slice(0, size - 1 - (rivalOrg ? 1 : 0));
    const world = rivalOrg ? [rivalOrg, ...others] : others;
    const bots = world.map((org) => ({
      name: org.name,
      strength: Math.round(Math.min(105, Math.max(60, rng.normal(strength + offset.mean, offset.sd)))),
      isUser: false,
    }));
    const field = [...bots, { name: s.config.orgName, strength, isUser: true }];

    const { placements, bracket } = simKnockout(field, rng);
    const user = placements.find((p) => p.isUser)!;
    const rival = placements.find((p) => p.name === s.rival);
    const rivalBonusK = rival && user.placement < rival.placement ? RIVAL_BONUS_K : 0;
    const prizes = PRIZES[slot.kind];
    const prizeK = prizes[Math.min(user.placement, prizes.length) - 1] ?? 0;

    // ELO: сравнение с ожиданием от середины поля (лёгкая модель, версией не фиксируем).
    const expected = (size + 1) / 2;
    const eloDelta = Math.round((ELO_K * (expected - user.placement)) / (size / 2));
    s.elo += eloDelta;
    s.bankK += prizeK + rivalBonusK;
    s.seasonGames += Math.ceil(Math.log2(size));
    s.seasonWins += Math.max(0, Math.ceil(Math.log2(size)) - Math.ceil(Math.log2(Math.max(2, user.placement))));

    // Настроение и слава по результату (константы 322-0): титул поднимает обе,
    // топ-3 греет, дно LAN бьёт. Прочие места нейтральны.
    if (user.placement === 1) {
      this.bumpHappiness(HAPPINESS.title);
      const fameByKind: Partial<Record<ManagerEventKind, number>> = {
        finale: FAME.finaleTitle,
        lan: FAME.lanTitle,
        online: FAME.onlineTitle,
        tier2: FAME.tier2Title,
      };
      this.bumpFame(fameByKind[slot.kind] ?? 0);
    } else if (user.placement <= 3) {
      this.bumpHappiness(HAPPINESS.eventTop3);
      if (slot.kind === "finale" && user.placement <= 4) this.bumpFame(FAME.finaleTop4);
    } else if (slot.kind === "lan" && user.placement >= size - 3) {
      this.bumpHappiness(HAPPINESS.lanBottom);
    }

    const advance = slot.kind === "qualifier" ? QUALIFIER_ADVANCE : slot.kind === "finaleQual" ? FINALE_QUAL_ADVANCE : null;
    slot.result = { placement: user.placement, prizeK, eloDelta };
    const result: EventResult = {
      slotId: slot.id,
      kind: slot.kind,
      name: slot.name,
      placement: user.placement,
      fieldSize: size,
      prizeK,
      eloDelta,
      advanced: advance === null ? null : user.placement <= advance,
      rivalBonusK,
      standings: placements.map((p) => ({ name: p.name, placement: p.placement, isUser: p.isUser, ...(p.name === s.rival ? { isRival: true } : {}) })),
      bracket,
    };
    s.lastResult = result;
    s.feed.unshift({ slotId: slot.id, name: slot.name, placement: user.placement, prizeK });
    // Мировой рейтинг дышит: детерминированный шум ботам после каждого события.
    for (const org of s.world) org.elo += rng.int(13) - 6;
    return result;
  }

  /** Закрыть панель результата; сезон кончился — оффсезон, иначе шанс случайного события. */
  continueSeason(): void {
    const s = this.state;
    const closedSlotId = s.lastResult?.slotId ?? null;
    s.lastResult = null;
    if (s.phase === "season" && this.seasonFinished()) {
      this.beginOffseason();
      return;
    }
    // Случайное событие — по сиду от закрытого слота: эффект применяется сразу,
    // pendingRandomEvent держит данные для модалки (dismiss просто чистит).
    if (closedSlotId && s.phase === "season") {
      const rng = new Rng(`${s.seed}:re:${closedSlotId}`);
      if (rng.float() < RANDOM_EVENT_CHANCE) {
        const kinds = Object.keys(RANDOM_EVENTS) as ManagerRandomEventKind[];
        const kind = kinds[rng.int(kinds.length)];
        const effect = RANDOM_EVENTS[kind];
        if (effect.choice) {
          // Событие-выбор: ничего не применяем, ждём resolveRandomEvent.
          s.pendingRandomEvent = { kind, cashK: 0, happiness: 0, choice: effect.choice };
        } else {
          const cashK = effect.cashK ?? 0;
          const happiness = effect.happiness ?? 0;
          s.bankK += cashK;
          if (happiness !== 0) this.bumpHappiness(happiness);
          s.pendingRandomEvent = { kind, cashK, happiness };
        }
      }
    }
  }

  dismissRandomEvent(): void {
    this.resolveRandomEvent(false);
  }

  /** Закрыть событие; для события-выбора accept=true платит и применяет эффект.
   *  Не хватает денег — принять нельзя (возвращает false, событие остаётся открытым). */
  resolveRandomEvent(accept: boolean): boolean {
    const s = this.state;
    const pending = s.pendingRandomEvent;
    if (!pending) return false;
    if (accept && pending.choice) {
      if (s.bankK < pending.choice.costK) return false;
      s.bankK -= pending.choice.costK;
      this.bumpHappiness(pending.choice.happiness);
    }
    s.pendingRandomEvent = null;
    return true;
  }

  seasonFinished(): boolean {
    return this.state.calendar.every((slot) => slot.result || slot.dnq);
  }

  /** Место в мировом рейтинге (1-based). */
  worldRank(): number {
    return this.state.world.filter((org) => org.elo > this.state.elo).length + 1;
  }

  // ── Оффсезон ────────────────────────────────────────────────────────────────

  private beginOffseason(): void {
    const s = this.state;
    s.phase = "offseason";
    s.pendingRandomEvent = null;
    const rng = new Rng(`${s.seed}:offseason:${s.season}`);
    // Мимо финала сезона — удар по настроению всем (322-0: missTi −6) — ДО дрифта,
    // чтобы несчастье уже смещало форму и решало уходы.
    const finale = s.calendar.find((slot) => slot.kind === "finale");
    if (!finale?.result) this.bumpHappiness(HAPPINESS.missFinale);
    this.bumpFame(FAME.seasonDecay);

    s.offseasonDrifts = {};
    s.offseasonSalaries = {};
    s.released = [];
    s.departures = [];
    for (const player of s.roster) {
      const id = player.candidate.player.accountId;
      s.offseasonDrifts[id] = offseasonDrift(rng, player.happiness);
      const newOvr = player.candidate.player.ovr + s.offseasonDrifts[id];
      s.offseasonSalaries[id] = renegotiatedSalary(player.salary, newOvr, rng, player.fame);
      // Жизненный цикл: ретайр (база + ветеран + несчастье), несчастный может уйти сам.
      const unhappy = player.happiness < HAPPINESS.unhappyThreshold;
      const retireChance =
        LIFECYCLE.retireBase +
        (player.seasonsOnTeam >= LIFECYCLE.veteranSeasons ? LIFECYCLE.retireVeteranBonus : 0) +
        (unhappy ? LIFECYCLE.retireUnhappyBonus : 0);
      const leaves = rng.float() < retireChance || (unhappy && rng.float() < LIFECYCLE.leaveChance);
      if (leaves) s.departures.push(id);
    }
  }

  toggleRelease(accountId: number): void {
    const s = this.state;
    if (s.phase !== "offseason") return;
    s.released = s.released.includes(accountId) ? s.released.filter((id) => id !== accountId) : [...s.released, accountId];
  }

  /** Подтвердить контракты: применить дрифт и новые зарплаты, заменить ушедших филлерами.
   *  Уходящие сами (departures) равносильны released — но их не вернуть тогглом. */
  confirmOffseason(): boolean {
    const s = this.state;
    if (s.phase !== "offseason") return false;
    const rng = new Rng(`${s.seed}:offseason-fill:${s.season}`);
    const leaving = new Set([...s.released, ...s.departures]);
    const kept = new Set(s.roster.map((p) => p.candidate.player.accountId));
    s.roster = s.roster.map((player) => {
      const id = player.candidate.player.accountId;
      if (leaving.has(id)) {
        kept.delete(id);
        return player; // заменится ниже
      }
      const drift = s.offseasonDrifts[id] ?? 0;
      return {
        ...player,
        salary: s.offseasonSalaries[id] ?? player.salary,
        seasonsOnTeam: player.seasonsOnTeam + 1,
        candidate: {
          ...player.candidate,
          player: { ...player.candidate.player, ovr: Math.min(99, Math.max(55, player.candidate.player.ovr + drift)) },
        },
      };
    });
    // Ушедшие → дешёвый филлер той же роли из пула (не из уже занятых).
    for (let i = 0; i < s.roster.length; i += 1) {
      const player = s.roster[i];
      const id = player.candidate.player.accountId;
      if (!leaving.has(id)) continue;
      const role = player.candidate.player.role;
      // Ушедший исключается явно: дешёвейший кандидат роли может оказаться им же.
      const replacement = [...this.pool]
        .sort((a, b) => a.player.ovr - b.player.ovr)
        .find((c) => c.player.role === role && !kept.has(c.player.accountId) && !leaving.has(c.player.accountId));
      if (!replacement) return false; // теоретический случай: некем заменить — не подтверждаем
      kept.add(replacement.player.accountId);
      s.roster[i] = this.orgCandidate(replacement, rng, true);
    }
    s.phase = "review";
    return true;
  }

  startNextSeason(): void {
    const s = this.state;
    if (s.phase !== "review") return;
    s.season += 1;
    s.phase = "season";
    s.calendar = buildCalendar(s.seed, s.season);
    s.feed = [];
    s.lastResult = null;
    s.pendingRandomEvent = null;
    s.seasonGames = 0;
    s.seasonWins = 0;
    s.offseasonDrifts = {};
    s.offseasonSalaries = {};
    s.released = [];
    s.departures = [];
    // Rival переназначается: за сезон ELO разъехались, гонка снова с равным.
    s.rival = this.pickRival();
  }

  /** Назначение героев текущего счёта: accountId → heroId (для показа в ростере). */
  assignmentByPlayer(): Record<number, number> {
    return this.score()?.assignment.byPlayer ?? {};
  }
}

/** Мгновенный сеточный розыгрыш: сильные сеются врозь, серия — одна «карта» по ELO-формуле
 *  322-0 (`1/(1+10^(−Δ/22))`). Поле >8 режется play-in'ом до восьми (позиции 9+ без сетки).
 *  Возвращает и раунды сетки — панель результата рисует их вместо плоского списка. */
function simKnockout(
  field: Array<{ name: string; strength: number; isUser: boolean }>,
  rng: Rng,
): {
  placements: Array<{ name: string; strength: number; isUser: boolean; placement: number }>;
  bracket: BracketRound[];
} {
  const winProb = (a: number, b: number) => 1 / (1 + Math.pow(10, -(a - b) / 22));
  const rated = field.map((team) => ({ ...team, seedScore: team.strength + rng.normal(0, 3) }));
  rated.sort((a, b) => b.seedScore - a.seedScore);
  const cut = rated.slice(8);
  const bracket = rated.slice(0, 8);
  // Змейка 1-8 2-7 3-6 4-5.
  const pairs = [
    [bracket[0], bracket[7]],
    [bracket[3], bracket[4]],
    [bracket[1], bracket[6]],
    [bracket[2], bracket[5]],
  ];
  const results: Array<{ name: string; strength: number; isUser: boolean; placement: number }> = [];
  const rounds: BracketRound[] = [[], [], []];
  const playMatch = (a: (typeof rated)[number], b: (typeof rated)[number], round: number) => {
    const outcome = rng.float() < winProb(a.strength, b.strength) ? { winner: a, loser: b } : { winner: b, loser: a };
    rounds[round].push({ a: a.name, b: b.name, winner: outcome.winner.name });
    return outcome;
  };
  const semis: (typeof rated)[number][] = [];
  for (const [a, b] of pairs) {
    const { winner, loser } = playMatch(a, b, 0);
    semis.push(winner);
    results.push({ ...loser, placement: 5 });
  }
  const finalists: (typeof rated)[number][] = [];
  for (const [a, b] of [[semis[0], semis[1]], [semis[2], semis[3]]]) {
    const { winner, loser } = playMatch(a, b, 1);
    finalists.push(winner);
    results.push({ ...loser, placement: 3 });
  }
  const { winner, loser } = playMatch(finalists[0], finalists[1], 2);
  results.push({ ...loser, placement: 2 });
  results.push({ ...winner, placement: 1 });
  cut.forEach((team, index) => results.push({ ...team, placement: 9 + index }));
  return { placements: results.sort((a, b) => a.placement - b.placement), bracket: rounds };
}
