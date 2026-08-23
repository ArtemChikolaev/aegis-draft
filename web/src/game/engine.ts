// Движок забега (скилл scoring-model / game-state-architecture; логика независима от UI).
// Драфт в стиле 322-0: пак = ростер команды (5 игроков) + сигнатурные герои.
// Забег = 5 пиков игроков (по ролям) + 5 пиков героев (крепятся к игрокам). Всего 10.
// Герой привязывается авто-оптимально (matching) или вручную (allocation="manual").
import type { GameData, PackPlayer, Role } from "../types/data.ts";
import { Rng } from "./rng.ts";
import {
  ROLE_SEQUENCE,
  candidateMatchesRef,
  candidatesOf,
  generatePack,
  poolForFormat,
  type Candidate,
  type CandidateRef,
  type DraftPack,
  type RunConfig,
} from "./packs.ts";
import { hasTeamSuccess, mixedBaseRating } from "./teamSuccess.ts";
import { scoreTeam, type ScoreBreakdown, heroStatsForAssignment, playerHeroGames, signatureLookup, chemistryPlayersFromRoster } from "./score.ts";
import { EMPTY_PREP, prepOverlay, prepPointsLeft, type PrepAction, type PrepPlan, type ScoreOverlay } from "./prep.ts";

/** Сколько героев драфтится (по одному на игрока, как в 322-0). */
export const HERO_TARGET = ROLE_SEQUENCE.length;

export interface RosterSlot {
  role: Role;
  candidate: Candidate | null;
}

/** Стабильный ключ конкретной ФОРМЫ игрока (личность + команда + событие). Совпадает по смыслу с
 *  `CandidateRef`: accountId одного мало — у человека несколько event/team-снимков. */
function snapshotKey(candidate: Candidate): string {
  return `${candidate.player.accountId}:${candidate.teamId}:${candidate.eventId}`;
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
  /** Личности (accountId), уже прошедшие через забег. Правит ДРАФТОМ: один и тот же человек не
   *  предлагается в паках повторно. */
  private usedPlayers = new Set<number>();
  /** Конкретные ФОРМЫ (accountId+team+event), уже прошедшие через забег: активные и на скамейке.
   *  Правит РЫНКОМ (R5.1/R5.2).
   *
   *  Раньше рынок исключал всю личность (`usedPlayers`) и вдобавок сворачивал все snapshot'ы
   *  игрока до максимального по OVR (`bestByPlayer`). Отсюда были сразу две проблемы: своего
   *  игрока нельзя было улучшить до более сильной турнирной формы, а чужого рынок сразу показывал
   *  на максимуме вместо честной рулетки форм. Личность ограничивает только активный состав —
   *  один человек не занимает два слота; другая его форма приходит как Form Upgrade. */
  private seenSnapshots = new Set<string>();
  private manual: Record<number, number> = {}; // accountId -> heroId (ручной режим)
  private benchPlayers: Candidate[] = [];
  private benchHeroes: number[] = [];

  /** Roster lock Real Tournament (T5.6): аккаунты поля исключены из драфта и рынка. Сажается в
   *  существующий usedPlayers — ровно тот механизм, которым mixed-пак и рынок уже исключают
   *  задрафтованных, поэтому «locked не появляется нигде» держится одним правилом, а не тремя.
   *  Дополнительно переключает счёт на event-base (RT-B: форма своей эпохи, не team-success). */
  private readonly lockedAccounts: ReadonlySet<number>;

  /** Подготовка к событию (RT-E, game/prep.ts): недели сборов, потраченные на пары/героев.
   *  Живёт в движке, как ручная аллокация: score() включает её сам, replay действий
   *  восстанавливает, превью «до → после» считается тем же scoreFor. */
  private prep: PrepPlan = EMPTY_PREP;
  private prepOverlayCache: ScoreOverlay = prepOverlay(EMPTY_PREP);

  constructor(
    data: GameData,
    config: RunConfig,
    seed: string,
    realField?: { lockedAccounts: ReadonlySet<number> },
  ) {
    this.data = data;
    this.config = config;
    this.rng = new Rng(seed);
    this.rerollsLeft = config.rerolls;
    this.lockedAccounts = realField?.lockedAccounts ?? new Set();
    for (const accountId of this.lockedAccounts) this.usedPlayers.add(accountId);
    this.pool = poolForFormat(data.packs, data.events, config.format);
    if (this.pool.length === 0) throw new Error(`Пустой пул паков для формата ${config.format}`);
    this.currentPack = this.draw();
  }

  /** Real Tournament активен: лочит счёт на event-base и снимает team-success-гейт Mixed. */
  private get isRealTournament(): boolean {
    return this.lockedAccounts.size > 0;
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

  /** Скамейка: каждая покупка на рынке отправляет снятого игрока сюда (Balatro-стиль —
   *  можно купить несколько, все снятые остаются доступны для бесплатного swap-back). */
  get reservePlayers(): Candidate[] {
    return [...this.benchPlayers];
  }

  /** Резерв hero pool. Снятый при re-pick герой кладётся сюда; лимита нет — см. replaceHero. */
  get reserveHeroes(): number[] {
    return [...this.benchHeroes];
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
    this.seenSnapshots.add(snapshotKey(c));
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

  /**
   * Кандидаты рынка: ВСЕ формы format-pool, кроме тех, что уже проходили через забег (активные и
   * на скамейке) — иначе одна и та же карта возвращалась бы бесконечно.
   *
   * Личность здесь НЕ фильтруется: другая форма уже стоящего в составе человека — это и есть
   * `Form Upgrade`, главный товар R5.2. Ограничение «один человек не в двух слотах» живёт там,
   * где ему место, — в проверке самой замены (`canReplacePlayer`).
   *
   * Snapshot'ы НЕ сворачиваются до максимального по OVR: разные формы одного человека — разные
   * товары, и выбор между ними делает взвешенная по этапу рулетка тиров (`anteMarket`), а не
   * «всегда лучший». Свёртка + бан личности как раз и давали баг «того же игрока в лучшей форме
   * получить нельзя».
   */
  get marketPlayerCandidates(): Candidate[] {
    const slotsByAccount = new Map<number, number[]>();
    this.roster.forEach((candidate, index) => {
      if (!candidate) return;
      const key = candidate.player.accountId;
      slotsByAccount.set(key, [...(slotsByAccount.get(key) ?? []), index]);
    });
    return this.pool.flatMap(candidatesOf).filter((candidate) => {
      if (this.seenSnapshots.has(snapshotKey(candidate))) return false;
      // Личность может уже стоять в составе, но в ДРУГОЙ роли (в одном событии человек играл mid,
      // в другом — offlane). Тогда его mid-форму девать некуда: занять второй слот он не может, а
      // свой offlane-слот не той роли. Такие карты в пул не пускаем — иначе рынок собрал бы оффер,
      // который невозможно применить.
      const occupied = slotsByAccount.get(candidate.player.accountId);
      if (occupied && !occupied.some((index) => ROLE_SEQUENCE[index] === candidate.player.role)) return false;
      return this.config.draftStyle !== "mixed"
        || hasTeamSuccess(this.data.teamSuccess, candidate.teamId, this.config.format);
    });
  }

  /** Можно ли поставить эту форму в этот слот. Рынку нужен предикат, а не исключение: у входящего
   *  игрока перебираются все слоты его роли, и часть из них законно недоступна (например второй
   *  support-слот, когда та же личность уже стоит в первом). */
  canReplacePlayer(slotIndex: number, incoming: Candidate): boolean {
    try {
      this.assertPlayerReplacement(slotIndex, incoming);
      return true;
    } catch {
      return false;
    }
  }

  /** Можно ли вернуть запасного в этот слот. Нужен UI/снимку: после Form Upgrade на скамейке
   *  лежит старая форма человека, чья личность уже активна, и второй слот той же роли для неё
   *  законно закрыт — спрашивать об этом исключением нельзя (см. `snap` в runStore). */
  canSwapReservePlayer(slotIndex: number, benchAccountId: number): boolean {
    try {
      this.assertPlayerReplacement(slotIndex, this.benchPlayerOf(benchAccountId), true);
      return true;
    } catch {
      return false;
    }
  }

  /** Стабильный универсум героев формата (все сигнатурные из пула, отсортированы). В отличие от
   *  marketHeroCandidates не зависит от текущего ростера — нужен для детерминированных boss-банов. */
  get allFormatHeroes(): number[] {
    return [...new Set(this.pool.flatMap((source) => source.signatureHeroes))].sort((a, b) => a - b);
  }

  /** Герои рынка из текущего format-pool, кроме активных и уже лежащих в резерве. */
  get marketHeroCandidates(): number[] {
    const unavailable = new Set([...this.heroes, ...this.benchHeroes]);
    return [...new Set(this.pool.flatMap((source) => source.signatureHeroes))]
      .filter((heroId) => !unavailable.has(heroId));
  }

  /**
   * Герои рынка с ВЕСОМ для рулетки: сумма реальных pro-игр текущей пятёрки на этом герое.
   *
   * Раньше здесь был `marketHeroCandidatesShortlist` — `slice(0, 20)` по этому же числу игр. Это
   * был не приоритет, а **eligibility**: за весь забег игрок физически не мог встретить больше 20
   * героев из 127, причём набор был детерминированным (рулетки в нём не было вовсе). Собрать состав
   * под теги (`R8.1`) было нельзя — ось отбора «много игр у моих игроков» ортогональна оси, по
   * которой игрок строит билд. Замер: узкие теги отсутствовали в пуле в 8–9 забегах из 30 при том,
   * что карточки просят их по `cap 3`.
   *
   * Поэтому пул отдаётся ЦЕЛИКОМ, а career-игры влияют на ВЕС карты (`anteMarket.HERO_POOL`). Ровно
   * это же лечение `R5.1` уже применил к формам игроков: взвешенная рулетка вместо жёсткого фильтра.
   *
   * Порядок стабилен по `heroId` — RNG рынка обязан получать один и тот же вход при том же сиде.
   */
  get marketHeroCandidatePool(): { heroId: number; games: number }[] {
    const stats = heroStatsForAssignment(this.data);
    // Свои герои из пула НЕ вычитаются (R14.8): выпавший активный герой становится картой
    // улучшения, если качество строго выше текущего, и не показывается вовсе, если не выше.
    // Так пул честно вычерпывается к концу забега — герой уходит из него, только достигнув
    // потолка качества, а не в момент покупки. Кто из выпавших окажется заменой, а кто
    // улучшением, решает `anteMarket.heroOptions`: это его правило, не движка.
    return [...new Set([...this.marketHeroCandidates, ...this.heroes])]
      .sort((a, b) => a - b)
      .map((heroId) => ({
        heroId,
        games: this.players.reduce(
          (sum, player) => sum + playerHeroGames(stats, player.accountId, heroId),
          0,
        ),
      }))
      .sort((a, b) => a.heroId - b.heroId);
  }

  /** Разрешить persisted CandidateRef обратно в объект текущего совместимого датасета. */
  candidateByRef(ref: CandidateRef): Candidate | null {
    return this.pool.flatMap(candidatesOf).find((candidate) => candidateMatchesRef(candidate, ref)) ?? null;
  }

  /** Реальный breakdown после замены игрока без мутации забега. */
  previewPlayerReplacement(slotIndex: number, incoming: Candidate): ScoreBreakdown {
    this.assertPlayerReplacement(slotIndex, incoming);
    const roster = [...this.roster];
    const outgoing = roster[slotIndex]!;
    roster[slotIndex] = incoming;
    return this.scoreFor(roster, this.heroes, this.manualAfterSwap(outgoing, incoming));
  }

  /** Купить/применить замену: снятый игрок уходит на скамейку (в конец списка).
   *
   *  Исключение — апгрейд формы ТОГО ЖЕ человека: старая форма не уезжает в резерв, а исчезает
   *  совсем. Рынок выставляет свою форму, только если она сильнее текущей (`stockedForms`), поэтому
   *  вернуться к слабой версии того же человека — не выбор, а мусор в инвентаре: у Chemistry и Hero
   *  Synergy тот же accountId, отличается лишь Base, и слабая форма доказуемо хуже во всём
   *  (плейтест 2026-08-05). Прежнее правило клало её на скамейку — резерв копил бесполезные карточки
   *  одних и тех же людей. */
  replacePlayer(slotIndex: number, incoming: Candidate): void {
    this.assertPlayerReplacement(slotIndex, incoming);
    const outgoing = this.roster[slotIndex]!;
    const formUpgrade = outgoing.player.accountId === incoming.player.accountId;
    this.roster[slotIndex] = incoming;
    // Скамейка держит не больше ОДНОЙ формы на человека: резерв адресуется по accountId (в т.ч. в
    // логе действий), и выбор «какую именно» иначе стал бы недетерминированным. Апгрейд формы
    // просто ничего не кладёт обратно.
    // Слабая форма ВХОДЯЩЕГО человека выметается тоже (плейтест 2026-08-10): она могла попасть в
    // резерв раньше — заменой на другого человека, — и тогда резерв предлагал даунгрейд
    // «Satanic 95 → Satanic 88» как выбор. По правилу R14.9 слабая форма активного человека —
    // мусор, а не опция. Более сильная форма на скамейке (теоретический случай) не трогается.
    this.benchPlayers = this.benchPlayers
      .filter((c) => c.player.accountId !== outgoing.player.accountId
        && !(c.player.accountId === incoming.player.accountId && c.player.ovr <= incoming.player.ovr))
      .concat(formUpgrade ? [] : [outgoing]);
    this.usedPlayers.add(incoming.player.accountId);
    this.seenSnapshots.add(snapshotKey(incoming));
    this.manual = this.manualAfterSwap(outgoing, incoming);
  }

  /** Найти запасного по accountId (или бросить). */
  private benchPlayerOf(accountId: number): Candidate {
    const bench = this.benchPlayers.find((c) => c.player.accountId === accountId);
    if (!bench) throw new Error("Нет такого запасного игрока");
    return bench;
  }

  /** Бесплатно вернуть конкретного запасного в активный состав; снятый активный игрок занимает скамейку. */
  previewReservePlayerSwap(slotIndex: number, benchAccountId: number): ScoreBreakdown {
    const bench = this.benchPlayerOf(benchAccountId);
    this.assertPlayerReplacement(slotIndex, bench, true);
    const roster = [...this.roster];
    const outgoing = roster[slotIndex]!;
    roster[slotIndex] = bench;
    return this.scoreFor(roster, this.heroes, this.manualAfterSwap(outgoing, bench));
  }

  /** Бесплатно вернуть конкретного запасного в активный состав; снятый активный игрок занимает скамейку. */
  swapReservePlayer(slotIndex: number, benchAccountId: number): void {
    const incoming = this.benchPlayerOf(benchAccountId);
    this.assertPlayerReplacement(slotIndex, incoming, true);
    const outgoing = this.roster[slotIndex]!;
    this.roster[slotIndex] = incoming;
    this.benchPlayers = this.benchPlayers
      .filter((c) => c.player.accountId !== benchAccountId && c.player.accountId !== outgoing.player.accountId)
      .concat(outgoing);
    this.manual = this.manualAfterSwap(outgoing, incoming);
  }

  /** Реальный breakdown после re-pick героя без мутации забега. */
  previewHeroReplacement(outgoingHeroId: number, incomingHeroId: number): ScoreBreakdown {
    this.assertHeroReplacement(outgoingHeroId, incomingHeroId);
    const heroes = this.heroes.map((heroId) => heroId === outgoingHeroId ? incomingHeroId : heroId);
    return this.scoreFor(this.roster, heroes, this.manualWithoutHero(outgoingHeroId));
  }

  /** Re-pick: новый герой активен, снятый уходит в резерв hero pool.
   *
   *  Резерв НЕ ограничен, как и скамейка игроков. Раньше он резался до трёх, и покупка четвёртого
   *  героя молча выбрасывала самого старого — оплаченного золотом. Игрок этого не видел и был
   *  вынужден покупать одних и тех же героев по кругу (плейтест 2026-08-05). Правило теперь одно
   *  на обе скамейки: всё снятое остаётся доступным для бесплатного swap-back. */
  replaceHero(outgoingHeroId: number, incomingHeroId: number): void {
    this.assertHeroReplacement(outgoingHeroId, incomingHeroId);
    this.heroes = this.heroes.map((heroId) => heroId === outgoingHeroId ? incomingHeroId : heroId);
    this.benchHeroes = [
      outgoingHeroId,
      ...this.benchHeroes.filter((heroId) => heroId !== incomingHeroId && heroId !== outgoingHeroId),
    ];
    this.manual = this.manualWithoutHero(outgoingHeroId);
  }

  /** Бесплатный swap активного героя с одним из уже купленных резервных. */
  swapReserveHero(outgoingHeroId: number, reserveHeroId: number): void {
    if (!this.benchHeroes.includes(reserveHeroId)) throw new Error("Герой не в резерве");
    this.replaceHero(outgoingHeroId, reserveHeroId);
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
    return this.scoreFor(this.roster, this.heroes, this.manual);
  }

  // ─── Подготовка к событию (RT-E) ───

  get prepPlan(): PrepPlan {
    return this.prep;
  }

  get prepPointsLeft(): number {
    return prepPointsLeft(this.prep);
  }

  /** Действие легально: драфт завершён, бюджет не исчерпан, участники — из активного состава
   *  (пара — два РАЗНЫХ игрока; герой тренировки — из активного пула героев). */
  canPrep(action: PrepAction): boolean {
    if (!this.isComplete || this.prepPointsLeft <= 0) return false;
    const ids = new Set(this.players.map((player) => player.accountId));
    if (action.kind === "scrim") return action.a !== action.b && ids.has(action.a) && ids.has(action.b);
    return ids.has(action.accountId) && this.heroes.includes(action.heroId);
  }

  addPrep(action: PrepAction): boolean {
    if (!this.canPrep(action)) return false;
    this.setPrep({ actions: [...this.prep.actions, action] });
    return true;
  }

  /** Откатить последнюю неделю сборов (только порядок записи — решения игрок отменяет стеком). */
  undoPrep(): PrepAction | null {
    const last = this.prep.actions.at(-1) ?? null;
    if (!last) return null;
    this.setPrep({ actions: this.prep.actions.slice(0, -1) });
    return last;
  }

  /** Счёт «если потратить неделю на это» — тот же scoreFor, что и боевой счёт. */
  previewPrep(action: PrepAction): ScoreBreakdown | null {
    if (!this.canPrep(action)) return null;
    return this.scoreFor(this.roster, this.heroes, this.manual, prepOverlay({ actions: [...this.prep.actions, action] }));
  }

  /** Счёт без подготовки — «было» для разложения до → после на экране сборов. */
  previewWithoutPrep(): ScoreBreakdown | null {
    if (this.players.length === 0) return null;
    return this.scoreFor(this.roster, this.heroes, this.manual, prepOverlay(EMPTY_PREP));
  }

  private setPrep(plan: PrepPlan): void {
    this.prep = plan;
    this.prepOverlayCache = prepOverlay(plan);
  }

  /** Наложение подготовки для UI (рёбра химии на радаре, строки пар) — то же, что в счёте. */
  get scoreOverlay(): ScoreOverlay {
    return this.prepOverlayCache;
  }

  private scoreFor(
    roster: (Candidate | null)[],
    heroes: number[],
    manual: Record<number, number>,
    overlay: ScoreOverlay = this.prepOverlayCache,
  ): ScoreBreakdown {
    const players = roster.filter((candidate): candidate is Candidate => candidate !== null)
      .map((candidate) => candidate.player);
    const fixed = Object.keys(manual).length > 0 ? manual : undefined;
    const phs = heroStatsForAssignment(this.data);
    const signatures = signatureLookup(roster);
    const chemistryRoster = chemistryPlayersFromRoster(
      ROLE_SEQUENCE.map((role, i) => ({ role, candidate: roster[i] })),
    );
    // Mixed: base = успех команд за окно вместо формы на событии (PRD §5.4.3).
    // teamId берём из того же chemistryRoster — он уже несёт привязку игрок→команда.
    // Real Tournament (RT-B) — исключение: challenger-пак mixed по МЕХАНИКЕ, но оценивается
    // event-снапшотами («форма своей эпохи»), поэтому override не применяется.
    const mixedBase = this.config.draftStyle === "mixed" && !this.isRealTournament
      ? mixedBaseRating(
        players,
        new Map(chemistryRoster.map((p) => [p.accountId, p.teamId])),
        this.data.teamSuccess,
        this.config.format,
      )
      : undefined;
    return scoreTeam(
      players,
      heroes,
      phs,
      this.data.squadSynergy,
      this.data.teammates,
      chemistryRoster,
      signatures,
      fixed,
      mixedBase,
      overlay,
    );
  }

  /** `fromReserve` — возврат со скамейки: эта форма заведомо «видена», её и возвращаем. */
  private assertPlayerReplacement(slotIndex: number, incoming: Candidate, fromReserve = false): void {
    if (!this.isComplete) throw new Error("Замена доступна только после завершения драфта");
    const outgoing = this.roster[slotIndex];
    const role = ROLE_SEQUENCE[slotIndex];
    if (!outgoing || !role) throw new Error(`Нет активного игрока в слоте ${slotIndex}`);
    if (incoming.player.role !== role) throw new Error("Запасной должен закрывать ту же роль");
    // Личность: один человек не может занимать ДРУГОЙ активный слот. Проверка именно «другой» —
    // без неё Form Upgrade невозможен в принципе: входящая форма имеет тот же accountId, что и
    // заменяемая, и апгрейд в свой же слот падал бы как «игрок уже в составе».
    if (this.roster.some((candidate, index) => (
      index !== slotIndex && candidate?.player.accountId === incoming.player.accountId
    ))) {
      throw new Error("Игрок уже в активном составе");
    }
    // Форма: ровно этот snapshot уже проходил через забег — повторно он не продаётся.
    if (!fromReserve && this.seenSnapshots.has(snapshotKey(incoming))) {
      throw new Error("Эта форма игрока уже использована в забеге");
    }
  }

  /** Manual-назначения после замены: героя теряет только УШЕДШАЯ личность. При апгрейде формы того
   *  же accountId назначение сохраняется — иначе Hungarian переназначил бы героя заново, и апгрейд
   *  «в лучшую форму» мог молча испортить hero synergy. */
  private manualAfterSwap(outgoing: Candidate, incoming: Candidate): Record<number, number> {
    return outgoing.player.accountId === incoming.player.accountId
      ? { ...this.manual }
      : this.manualWithoutPlayer(outgoing.player.accountId);
  }

  private assertHeroReplacement(outgoingHeroId: number, incomingHeroId: number): void {
    if (!this.isComplete) throw new Error("Re-pick доступен только после завершения драфта");
    if (!this.heroes.includes(outgoingHeroId)) throw new Error("Снимаемый герой не в составе");
    if (this.heroes.includes(incomingHeroId)) throw new Error("Новый герой уже в составе");
  }

  private manualWithoutPlayer(accountId: number): Record<number, number> {
    const next = { ...this.manual };
    delete next[accountId];
    return next;
  }

  private manualWithoutHero(heroId: number): Record<number, number> {
    return Object.fromEntries(
      Object.entries(this.manual).filter(([, assignedHero]) => assignedHero !== heroId),
    ) as Record<number, number>;
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
      // Team-success-гейт принадлежит Mixed-СКОРИНГУ; в Real Tournament base — event-снапшот
      // (RT-B), и гейт лишь сузил бы пул легенд без причины.
      teamAllowed: (teamId) =>
        this.isRealTournament || hasTeamSuccess(this.data.teamSuccess, teamId, this.config.format),
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
