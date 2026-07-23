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

export type OfferKind = "stat" | "gold" | "player" | "hero";

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

/** Три reward-оффера Буткемпа (детерминированы по seed+campId): мелкое золото, крупное золото,
 *  бесплатный stat-рычаг случайной категории. Выбор 1 из 3 (решение 2026-07-23). */
export function rewardOffers(seed: string, campStageIndex: number): Offer[] {
  const rng = new Rng(`${seed}:camp-${campStageIndex}:reward`);
  const summand = rng.pick(MARKET_SUMMANDS);
  const cfg = ECONOMY.levers[summand];
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
    { id: `rwd-${campStageIndex}-2`, kind: "stat", labelKey: `reward.stat.${summand}`, cost: 0, effect: { summand, delta: cfg.delta } },
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
  modifiers: SummandModifiers;
  rerollCost: number;
  canReroll: boolean;
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
    };
  }

  get gold(): number {
    return this.state.gold;
  }

  /** Суммарные дельты по слагаемым от всех применённых покупок. */
  modifiers(): SummandModifiers {
    return summandModifiers(this.state.applied);
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

  /** Открыть Буткемп для этапа `campStageIndex` (офферы деривуются от него). */
  openCamp(campStageIndex: number): void {
    this.state.campStageIndex = campStageIndex;
    this.state.inCamp = true;
    this.state.chosenRewardId = null;
    this.state.marketRerolls = 0;
    this.state.preparedMarketOffers = undefined;
  }

  /** Выйти из Буткемпа (переход к следующему этапу). */
  leaveCamp(): void {
    this.state.inCamp = false;
  }

  private currentRewardOffers(): Offer[] {
    return rewardOffers(this.seed, this.state.campStageIndex);
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

  private apply(effect: StatEffect): void {
    this.state.applied.push({ ...effect });
  }

  /** Выбрать одну reward-карту (бесплатно, один раз за Буткемп). Возвращает успех. */
  chooseReward(offerId: string): boolean {
    if (this.state.chosenRewardId != null) return false;
    const offer = this.currentRewardOffers().find((o) => o.id === offerId);
    if (!offer) return false;
    if (offer.kind === "gold" && offer.goldGain) this.state.gold += offer.goldGain;
    else if (offer.kind === "stat" && offer.effect) this.apply(offer.effect);
    this.state.chosenRewardId = offerId;
    return true;
  }

  /** Купить market-оффер: списать золото (без ухода в минус), применить эффект. */
  buyMarket(offerId: string): boolean {
    return this.purchaseMarket(offerId) != null;
  }

  /** Купить оффер и вернуть его payload оркестратору, который применит roster/hero swap. */
  purchaseMarket(offerId: string): Offer | null {
    const offer = this.currentMarketOffers().find((o) => o.id === offerId);
    if (!offer || offer.kind === "gold") return null;
    if (offer.kind === "stat" && !offer.effect) return null;
    if (offer.kind === "player" && !offer.playerSwap) return null;
    if (offer.kind === "hero" && !offer.heroSwap) return null;
    if (offer.cost > this.state.gold) return null;
    this.state.gold -= offer.cost;
    if (offer.kind === "stat" && offer.effect) this.apply(offer.effect);
    this.state.consumed.push(offerId);
    return cloneOffer(offer);
  }

  /** Реролл рынка: списать фиксированную цену (без минуса), сгенерировать новый набор офферов. */
  rerollMarket(): boolean {
    if (ECONOMY.rerollCost > this.state.gold) return false;
    this.state.gold -= ECONOMY.rerollCost;
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
      canReroll: this.state.gold >= ECONOMY.rerollCost,
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
