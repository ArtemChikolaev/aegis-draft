// Экономический слой Roguelite Run (T5.2, срезы 2–3). Чистый модуль ПОВЕРХ AnteRunEngine —
// движок ante-петли и турнир не трогаем (скилл game-state-architecture: экономика — часть
// stage-оркестрации, отдельным слоем, не вливать в RunEngine/TournamentEngine).
//
// Между этапами игрок попадает в Буткемп (Camp): за пройденный этап начисляются призовые
// (валюта = «золото»), затем Reward (выбор 1 из 3) и Market (3 рычага над слагаемыми
// Team OVR + reroll). Срез 2 хранит stat-дельты, срез 3 позволяет карточке нести payload
// конкретного player/hero swap; саму мутацию выполняет RunEngine, экономика только валидирует
// цену, списывает золото и фиксирует оффер. Сила сбрасывается с забегом.
//
// Детерминизм: `seed + campId + rerollN ⇒ те же офферы`. Числа — placeholder-конфиг ECONOMY
// в одном месте (кандидат в balanceConfigVersion, точная калибровка — §10.F, после T6.3).
// Редкость героев остаётся отдельным срезом 3b.
import { Rng } from "./rng.ts";
import { placementWorstRank } from "./anteRun.ts";
import type { PlacementKey } from "./tournament.ts";
import type { CandidateRef } from "./packs.ts";
import { TACTIC_IDS, TACTIC_SLOTS, isTacticId } from "./tactics.ts";
import { CAMP_ACTION_IDS, CAMP_ACTION_SLOTS, campActionDef, isCampActionId } from "./campActions.ts";

/** Слагаемое Team OVR, на которое действует покупка. */
export type Summand = "base" | "heroSynergy" | "chemistry";

/** Эффект покупки: прибавка к слагаемому и опциональный trade-off по другому слагаемому. */
export interface StatEffect {
  summand: Summand;
  delta: number;
  tradeoffSummand?: Summand;
  tradeoffDelta?: number;
}

export interface SummandValues {
  base: number;
  heroSynergy: number;
  chemistry: number;
}

export interface PlayerSwapEffect {
  slotIndex: number;
  outgoingAccountId: number;
  incoming: CandidateRef;
}

export interface HeroSwapEffect {
  outgoingHeroId: number;
  incomingHeroId: number;
}

export type OfferKind = "stat" | "gold" | "player" | "hero" | "tactic" | "action";

/** Оффер награды/рынка. Единый контракт для Reward и Market — задел под карточки T6.1. */
export interface Offer {
  id: string;
  kind: OfferKind;
  /** Ключ i18n для подписи. */
  labelKey: string;
  /** Цена в золоте (0 для бесплатного выбора reward). */
  cost: number;
  /** Эффект (kind "stat"). */
  effect?: StatEffect;
  /** Прибавка золота (kind "gold"). */
  goldGain?: number;
  /** Конкретная перестройка ростера (slice 3). */
  playerSwap?: PlayerSwapEffect;
  heroSwap?: HeroSwapEffect;
  /** id карточки Tactics/Camp Action (kind "tactic"/"action", срез 4). */
  cardId?: string;
  /** Реальный scoreTeam breakdown и auto-assignment до/после структурной покупки. */
  preview?: {
    before: SummandValues;
    after: SummandValues;
    beforeAssignment?: Record<number, number>;
    afterAssignment?: Record<number, number>;
  };
}

/** Суммарные модификаторы по слагаемым от всех применённых покупок забега. */
export interface SummandModifiers {
  base: number;
  heroSynergy: number;
  chemistry: number;
}

/** Сериализуемое состояние экономики (persist/resume). */
export interface RunEconomyState {
  gold: number;
  /** Применённые stat-эффекты (reward + market), источник модификаторов. */
  applied: StatEffect[];
  /** id купленных market-офферов (скрыть при ре-рендере/reroll). */
  consumed: string[];
  /** id выбранной reward-карты текущего Буткемпа, иначе null. */
  chosenRewardId: string | null;
  /** camp'ы, за которые уже начислены призовые (идемпотентность). */
  awardedCamps: number[];
  /** Индекс этапа, для которого открыт текущий Буткемп (сид офферов). */
  campStageIndex: number;
  /** Игрок сейчас в Буткемпе (маршрутизация resume). */
  inCamp: boolean;
  /** Счётчик reroll рынка текущего Буткемпа (сид офферов). */
  marketRerolls: number;
  /** Контекстные офферы среза 3 фиксируются в сейве: оставшиеся карты не меняются
   *  после первой покупки и воспроизводятся в точности при resume. */
  preparedMarketOffers?: Offer[];
  /** Все карточки, уже выданные забегу. Дубликаты не вводим (PRD §5.10.5), поэтому список
   *  только растёт: сброшенная тактика не выпадет повторно. */
  ownedCards: string[];
  /** Карточный reward-оффер, зафиксированный на открытии Буткемпа. Держим отдельно, иначе после
   *  взятия карты пул ownedCards растёт и оффер бы «мутировал» в другую карту под тем же id. */
  preparedRewardCard?: Offer | null;
  /** Экипированные пассивные Tactics (срез 4). Хранятся строками: карточка, выпавшая из
   *  набора между версиями, при resume молча отбрасывается, а не роняет забег. */
  equippedTactics: string[];
  /** Одноразовые Camp Actions в слотах, ещё не разыгранные. */
  heldActions: string[];
  /** Разыгранные Camp Actions: временный эффект живёт до следующего Буткемпа. */
  temporary: Array<{ effect: StatEffect; campId: number }>;
  /** Буткемпы, в которых сыграна разведка (раскрывает следующий этап). */
  scoutedCamps: number[];
  /** Бесплатные рероллы рынка, накопленные разведкой. */
  freeMarketRerolls: number;
  /** Бесплатные замены игрока, накопленные stand-in. */
  freePlayerSwaps: number;
}

/** Placeholder-баланс. Точная калибровка — отдельный balance spec (§10.F), после симуляции T6.3.
 *  Ориентир: поле растёт ANTE_FIELD_STEP=3 очка/этап, покупка должна давать сопоставимый
 *  прирост Team OVR, чтобы усиливаться было обязательно, но одной покупки не хватало «на всё». */
export const ECONOMY = {
  rerollCost: 2,
  /** Базовые призовые первого этапа; каждый следующий пройденный этап добавляет stageStep. */
  prizeBase: 3,
  prizeStageStep: 1,
  /** Максимальный бонус за результат внутри пройденного порога (первое место). */
  prizePerformanceMax: 3,
  /** Reward-варианты золота растут вместе с этапом, но рынок сохраняет фиксированные цены. */
  rewardGold: {
    small: { base: 3, stageStep: 1 },
    large: { base: 6, stageStep: 2 },
  },
  /** Рычаги рынка по слагаемым. `step`/`costStep` — разброс качества при reroll. */
  levers: {
    base: { delta: 3, step: 1, cost: 5, costStep: 2, tradeoff: { summand: "chemistry" as Summand, delta: -1 } },
    heroSynergy: { delta: 2, step: 0.5, cost: 5, costStep: 2, tradeoff: undefined },
    chemistry: { delta: 2, step: 0.5, cost: 4, costStep: 2, tradeoff: undefined },
  },
} as const;

const MARKET_SUMMANDS: readonly Summand[] = ["base", "heroSynergy", "chemistry"];

/** Цена игрока в паке-рулетке растёт с его OVR: сильный дороже, слабый доступен рано (Balatro-
 *  ценообразование). Placeholder под balance spec (§10.F). */
export function playerCost(ovr: number): number {
  return Math.max(2, Math.round((ovr - 60) / 4));
}

/** Суммарные дельты по слагаемым от применённых stat-эффектов. Чистая — переиспользуется и в
 *  RunEconomy, и в UI (турнирный экран показывает effective OVR, совпадающий с полем). */
export function summandModifiers(applied: StatEffect[]): SummandModifiers {
  const mod: SummandModifiers = { base: 0, heroSynergy: 0, chemistry: 0 };
  for (const e of applied) {
    mod[e.summand] += e.delta;
    if (e.tradeoffSummand && e.tradeoffDelta) mod[e.tradeoffSummand] += e.tradeoffDelta;
  }
  return mod;
}

/** Сложить модификаторы разных слоёв (покупки экономики + условные Tactics). */
export function addModifiers(a: SummandModifiers, b: SummandModifiers): SummandModifiers {
  return {
    base: a.base + b.base,
    heroSynergy: a.heroSynergy + b.heroSynergy,
    chemistry: a.chemistry + b.chemistry,
  };
}

/** Индекс Camp — номер только что пройденного этапа, 1-based. Старые/битые нули трактуем как 1. */
function clearedStage(campStageIndex: number): number {
  return Math.max(1, Math.floor(campStageIndex));
}

function stageGold(base: number, stageStep: number, campStageIndex: number): number {
  return base + (clearedStage(campStageIndex) - 1) * stageStep;
}

/** Призовые = растущая база этапа + нормализованный бонус за overperformance.
 *  Нормализация важна: первое место даёт одинаковый максимум +3 и при top-10, и при top-3,
 *  поэтому широкий ранний порог не печатает в несколько раз больше золота, чем поздний. */
export function prizeForStage(
  placement: PlacementKey | null,
  target: number,
  campStageIndex: number,
): number {
  const base = stageGold(ECONOMY.prizeBase, ECONOMY.prizeStageStep, campStageIndex);
  if (placement == null || target <= 1) return base;
  const rank = placementWorstRank(placement);
  if (rank >= target) return base;
  const progressToFirst = (target - rank) / (target - 1);
  return base + Math.round(progressToFirst * ECONOMY.prizePerformanceMax);
}

/** Ещё не полученная карточка Tactics/Camp Action, детерминированная по seed+campId.
 *  Возвращает null, когда игрок уже собрал весь набор — тогда третьим оффером остаётся
 *  прежний бесплатный stat-рычаг (срез 2), и Буткемп не выдаёт пустую карту. */
function cardOffer(seed: string, campStageIndex: number, owned: readonly string[]): Offer | null {
  const pool = [
    ...TACTIC_IDS.filter((id) => !owned.includes(id)).map((id) => ({ kind: "tactic" as const, id })),
    ...CAMP_ACTION_IDS.filter((id) => !owned.includes(id)).map((id) => ({ kind: "action" as const, id })),
  ];
  if (pool.length === 0) return null;
  const rng = new Rng(`${seed}:camp-${campStageIndex}:card`);
  const card = rng.pick(pool);
  return {
    id: `rwd-${campStageIndex}-2`,
    kind: card.kind,
    labelKey: `${card.kind}.${card.id}`,
    cost: 0,
    cardId: card.id,
  };
}

/** Три reward-оффера Буткемпа (детерминированы по seed+campId): мелкое золото, крупное золото
 *  и карточка билда. Выбор 1 из 3 (решение 2026-07-23): деньги сейчас против силы билда.
 *  `preparedCard` (если задан) — зафиксированная на openCamp карточка; иначе выводится из `owned`. */
export function rewardOffers(
  seed: string,
  campStageIndex: number,
  owned: readonly string[] = [],
  preparedCard?: Offer | null,
): Offer[] {
  const rng = new Rng(`${seed}:camp-${campStageIndex}:reward`);
  const summand = rng.pick(MARKET_SUMMANDS);
  const cfg = ECONOMY.levers[summand];
  const card = preparedCard !== undefined ? preparedCard : cardOffer(seed, campStageIndex, owned);
  const smallGold = stageGold(
    ECONOMY.rewardGold.small.base,
    ECONOMY.rewardGold.small.stageStep,
    campStageIndex,
  );
  const largeGold = stageGold(
    ECONOMY.rewardGold.large.base,
    ECONOMY.rewardGold.large.stageStep,
    campStageIndex,
  );
  return [
    { id: `rwd-${campStageIndex}-0`, kind: "gold", labelKey: "reward.goldSmall", cost: 0, goldGain: smallGold },
    { id: `rwd-${campStageIndex}-1`, kind: "gold", labelKey: "reward.goldLarge", cost: 0, goldGain: largeGold },
    card
      ?? { id: `rwd-${campStageIndex}-2`, kind: "stat", labelKey: `reward.stat.${summand}`, cost: 0, effect: { summand, delta: cfg.delta } },
  ];
}

/** Три market-оффера (по одному на слагаемое), качество/цена варьируются по rerollN — reroll
 *  осмыслен (гэмбл на лучшие офферы). Детерминизм по seed+campId+rerollN. */
export function marketOffers(seed: string, campStageIndex: number, rerollN: number): Offer[] {
  const rng = new Rng(`${seed}:camp-${campStageIndex}:market-${rerollN}`);
  return MARKET_SUMMANDS.map((summand) => {
    const cfg = ECONOMY.levers[summand];
    const bonus = rng.int(3); // 0..2 ступени качества
    const delta = cfg.delta + bonus * cfg.step;
    const cost = cfg.cost + bonus * cfg.costStep;
    const effect: StatEffect = cfg.tradeoff
      ? { summand, delta, tradeoffSummand: cfg.tradeoff.summand, tradeoffDelta: cfg.tradeoff.delta }
      : { summand, delta };
    return { id: `mkt-${campStageIndex}-${rerollN}-${summand}`, kind: "stat", labelKey: `market.${summand}`, cost, effect };
  });
}

/** Готовый снимок Буткемпа для рендера (UI не держит движок — читает этот вид). */
export interface CampView {
  gold: number;
  rewardChosen: boolean;
  chosenRewardId: string | null;
  rewardOffers: Offer[];
  marketOffers: Offer[];
  /** Модификаторы ЭКОНОМИКИ (покупки + временные действия). Вклад условных Tactics считается
   *  отдельно в game/tactics.ts и складывается вызывающим — он зависит от текущего ростера. */
  modifiers: SummandModifiers;
  rerollCost: number;
  canReroll: boolean;
  /** Экипированные пассивные Tactics и одноразовые Camp Actions в слотах (срез 4). */
  equippedTactics: string[];
  heldActions: string[];
  tacticSlots: number;
  actionSlots: number;
  /** Временные эффекты, действующие на следующий этап (разыгранные Camp Actions). */
  temporary: StatEffect[];
  /** В этом Буткемпе сыграна разведка — следующий этап раскрыт. */
  scouted: boolean;
  freeMarketRerolls: number;
  freePlayerSwaps: number;
}

function emptyState(): RunEconomyState {
  return {
    gold: 0,
    applied: [],
    consumed: [],
    chosenRewardId: null,
    awardedCamps: [],
    campStageIndex: 0,
    inCamp: false,
    marketRerolls: 0,
    preparedMarketOffers: undefined,
    ownedCards: [],
    equippedTactics: [],
    heldActions: [],
    temporary: [],
    scoutedCamps: [],
    freeMarketRerolls: 0,
    freePlayerSwaps: 0,
  };
}

/** Чистое состояние экономики забега. Без UI, без импортов из ui/state. */
export class RunEconomy {
  private state: RunEconomyState;

  constructor(private readonly seed: string, initial?: RunEconomyState) {
    this.state = initial ? { ...emptyState(), ...initial } : emptyState();
  }

  /** Клон состояния для persist/рендера. */
  get snapshot(): RunEconomyState {
    return {
      ...this.state,
      applied: this.state.applied.map((e) => ({ ...e })),
      consumed: [...this.state.consumed],
      awardedCamps: [...this.state.awardedCamps],
      preparedMarketOffers: this.state.preparedMarketOffers?.map(cloneOffer),
      ownedCards: [...this.state.ownedCards],
      preparedRewardCard: this.state.preparedRewardCard ? cloneOffer(this.state.preparedRewardCard) : this.state.preparedRewardCard,
      equippedTactics: [...this.state.equippedTactics],
      heldActions: [...this.state.heldActions],
      temporary: this.state.temporary.map((t) => ({ effect: { ...t.effect }, campId: t.campId })),
      scoutedCamps: [...this.state.scoutedCamps],
    };
  }

  get gold(): number {
    return this.state.gold;
  }

  /** Экипированные пассивные Tactics — вход для evaluateTactics/tacticMarketEffects. */
  get equippedTactics(): string[] {
    return [...this.state.equippedTactics];
  }

  /** Временные эффекты разыгранных Camp Actions: действуют на один следующий этап. */
  private temporaryEffects(): StatEffect[] {
    return this.state.temporary.map((t) => t.effect);
  }

  /** Суммарные дельты по слагаемым от покупок забега и временных Camp Actions.
   *  Условные Tactics сюда НЕ входят: они зависят от ростера и считаются в game/tactics.ts. */
  modifiers(): SummandModifiers {
    return summandModifiers([...this.state.applied, ...this.temporaryEffects()]);
  }

  /** Итоговая прибавка к Team OVR (сумма всех модификаторов слагаемых). */
  totalModifier(): number {
    const m = this.modifiers();
    return m.base + m.heroSynergy + m.chemistry;
  }

  /** Начислить призовые за пройденный этап. Идемпотентно на camp (защита от двойного эффекта). */
  awardStageClear(campStageIndex: number, placement: PlacementKey | null, target: number): void {
    if (this.state.awardedCamps.includes(campStageIndex)) return;
    this.state.gold += prizeForStage(placement, target, campStageIndex);
    this.state.awardedCamps.push(campStageIndex);
  }

  /** Открыть Буткемп для этапа `campStageIndex` (офферы деривуются от него).
   *  Здесь же сгорают временные Camp Actions: они куплены под ОДИН прошедший этап. */
  openCamp(campStageIndex: number): void {
    this.state.campStageIndex = campStageIndex;
    this.state.inCamp = true;
    this.state.chosenRewardId = null;
    this.state.marketRerolls = 0;
    this.state.preparedMarketOffers = undefined;
    this.state.temporary = this.state.temporary.filter((t) => t.campId >= campStageIndex);
    // Фиксируем карточный оффер по составу владения на момент открытия — до любых взятий этого
    // Буткемпа, чтобы карта не переезжала на другую после выбора.
    this.state.preparedRewardCard = cardOffer(this.seed, campStageIndex, this.state.ownedCards);
  }

  /** Выйти из Буткемпа (переход к следующему этапу). */
  leaveCamp(): void {
    this.state.inCamp = false;
  }

  private currentRewardOffers(): Offer[] {
    // preparedRewardCard зафиксирован на openCamp; legacy-сейв без него выводит карту из ownedCards.
    const prepared = "preparedRewardCard" in this.state ? this.state.preparedRewardCard : undefined;
    return rewardOffers(this.seed, this.state.campStageIndex, this.state.ownedCards, prepared);
  }

  private currentMarketOffers(): Offer[] {
    return (this.state.preparedMarketOffers
      ?? marketOffers(this.seed, this.state.campStageIndex, this.state.marketRerolls))
      .filter((o) => !this.state.consumed.includes(o.id));
  }

  /** Зафиксировать контекстные офферы, рассчитанные от текущего реального ростера. */
  prepareMarketOffers(offers: Offer[]): void {
    if (this.state.preparedMarketOffers) return;
    this.state.preparedMarketOffers = offers.map(cloneOffer);
  }

  /** Сохранить те же структурные карты, но обновить их breakdown после другого swap. */
  replacePreparedMarketOffers(offers: Offer[]): void {
    this.state.preparedMarketOffers = offers.map(cloneOffer);
  }

  /** Сбросить зафиксированные офферы, чтобы рынок пересобрался (цена/размер паков зависят от
   *  тактик). Не тратит реролл: набор тот же по seed, меняются только их trade-off'ы. */
  invalidateMarketOffers(): void {
    this.state.preparedMarketOffers = undefined;
  }

  private apply(effect: StatEffect): void {
    this.state.applied.push({ ...effect });
  }

  /** Есть ли свободный слот под карточку этого типа. UI объясняет отказ до клика. */
  canTakeCard(kind: OfferKind): boolean {
    if (kind === "tactic") return this.state.equippedTactics.length < TACTIC_SLOTS;
    if (kind === "action") return this.state.heldActions.length < CAMP_ACTION_SLOTS;
    return true;
  }

  /** Выбрать одну reward-карту (бесплатно, один раз за Буткемп). Возвращает успех.
   *  Карточка без свободного слота не берётся: сначала сбрось лишнюю (золотые офферы остаются
   *  доступны, поэтому запереть выбор нечем). */
  chooseReward(offerId: string): boolean {
    if (this.state.chosenRewardId != null) return false;
    const offer = this.currentRewardOffers().find((o) => o.id === offerId);
    if (!offer) return false;
    if (offer.kind === "gold" && offer.goldGain) this.state.gold += offer.goldGain;
    else if (offer.kind === "stat" && offer.effect) this.apply(offer.effect);
    else if (offer.kind === "tactic" || offer.kind === "action") {
      const cardId = offer.cardId;
      if (!cardId || !this.canTakeCard(offer.kind)) return false;
      if (offer.kind === "tactic" ? !isTacticId(cardId) : !isCampActionId(cardId)) return false;
      this.state.ownedCards.push(cardId);
      if (offer.kind === "tactic") this.state.equippedTactics.push(cardId);
      else this.state.heldActions.push(cardId);
    }
    this.state.chosenRewardId = offerId;
    return true;
  }

  /** Снять пассивную тактику, освободив слот. Бесплатно и обратимо только новой картой:
   *  повторно она не выпадет (ownedCards), поэтому сброс — осознанное решение. */
  discardTactic(tacticId: string): boolean {
    const at = this.state.equippedTactics.indexOf(tacticId);
    if (at === -1) return false;
    this.state.equippedTactics.splice(at, 1);
    return true;
  }

  /** Выбросить неразыгранное действие, освободив слот. */
  discardAction(actionId: string): boolean {
    const at = this.state.heldActions.indexOf(actionId);
    if (at === -1) return false;
    this.state.heldActions.splice(at, 1);
    return true;
  }

  /** Разыграть одноразовое Camp Action. Статовые дают ВРЕМЕННЫЙ эффект (сгорит на следующем
   *  Буткемпе), утилитарные — разведку или бесплатную замену. Только внутри Буткемпа. */
  playCampAction(actionId: string): boolean {
    if (!this.state.inCamp) return false;
    const at = this.state.heldActions.indexOf(actionId);
    if (at === -1) return false;
    const def = campActionDef(actionId);
    if (!def) return false;
    this.state.heldActions.splice(at, 1);
    if (def.effect) {
      this.state.temporary.push({ effect: { ...def.effect }, campId: this.state.campStageIndex });
    }
    if (def.utility === "scouting") {
      this.state.scoutedCamps.push(this.state.campStageIndex);
      this.state.freeMarketRerolls += 1;
    }
    if (def.utility === "freePlayerSwap") this.state.freePlayerSwaps += 1;
    return true;
  }

  /** Купить market-оффер: списать золото (без ухода в минус), применить эффект. */
  buyMarket(offerId: string): boolean {
    return this.purchaseMarket(offerId) != null;
  }

  /** Купить оффер и вернуть его payload оркестратору, который применит roster/hero swap.
   *  Накопленный stand-in делает одну замену игрока бесплатной. */
  purchaseMarket(offerId: string): Offer | null {
    const offer = this.currentMarketOffers().find((o) => o.id === offerId);
    if (!offer || offer.kind === "gold") return null;
    if (offer.kind === "stat" && !offer.effect) return null;
    if (offer.kind === "player" && !offer.playerSwap) return null;
    if (offer.kind === "hero" && !offer.heroSwap) return null;
    const free = offer.kind === "player" && this.state.freePlayerSwaps > 0;
    const price = free ? 0 : offer.cost;
    if (price > this.state.gold) return null;
    if (free) this.state.freePlayerSwaps -= 1;
    this.state.gold -= price;
    if (offer.kind === "stat" && offer.effect) this.apply(offer.effect);
    this.state.consumed.push(offerId);
    return cloneOffer(offer);
  }

  /** Реролл рынка: сначала тратим бесплатный от разведки, иначе списываем цену (без минуса). */
  rerollMarket(): boolean {
    const free = this.state.freeMarketRerolls > 0;
    if (!free && ECONOMY.rerollCost > this.state.gold) return false;
    if (free) this.state.freeMarketRerolls -= 1;
    else this.state.gold -= ECONOMY.rerollCost;
    this.state.marketRerolls += 1;
    this.state.preparedMarketOffers = undefined;
    return true;
  }

  /** Снимок Буткемпа для UI. */
  campView(): CampView {
    return {
      gold: this.state.gold,
      rewardChosen: this.state.chosenRewardId != null,
      chosenRewardId: this.state.chosenRewardId,
      rewardOffers: this.currentRewardOffers(),
      marketOffers: this.currentMarketOffers(),
      modifiers: this.modifiers(),
      rerollCost: ECONOMY.rerollCost,
      canReroll: this.state.freeMarketRerolls > 0 || this.state.gold >= ECONOMY.rerollCost,
      equippedTactics: [...this.state.equippedTactics],
      heldActions: [...this.state.heldActions],
      tacticSlots: TACTIC_SLOTS,
      actionSlots: CAMP_ACTION_SLOTS,
      temporary: this.temporaryEffects().map((effect) => ({ ...effect })),
      scouted: this.state.scoutedCamps.includes(this.state.campStageIndex),
      freeMarketRerolls: this.state.freeMarketRerolls,
      freePlayerSwaps: this.state.freePlayerSwaps,
    };
  }
}

function cloneOffer(offer: Offer): Offer {
  return {
    ...offer,
    effect: offer.effect ? { ...offer.effect } : undefined,
    playerSwap: offer.playerSwap
      ? { ...offer.playerSwap, incoming: { ...offer.playerSwap.incoming } }
      : undefined,
    heroSwap: offer.heroSwap ? { ...offer.heroSwap } : undefined,
    cardId: offer.cardId,
    preview: offer.preview
      ? {
        before: { ...offer.preview.before },
        after: { ...offer.preview.after },
        beforeAssignment: offer.preview.beforeAssignment
          ? { ...offer.preview.beforeAssignment }
          : undefined,
        afterAssignment: offer.preview.afterAssignment
          ? { ...offer.preview.afterAssignment }
          : undefined,
      }
      : undefined,
  };
}
