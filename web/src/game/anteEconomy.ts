// Экономический слой Roguelite Run (T5.2, срез 2). Чистый модуль ПОВЕРХ AnteRunEngine —
// движок ante-петли и турнир не трогаем (скилл game-state-architecture: экономика — часть
// stage-оркестрации, отдельным слоем, не вливать в RunEngine/TournamentEngine).
//
// Между этапами игрок попадает в Буткемп (Camp): за пройденный этап начисляются призовые
// (валюта = «золото»), затем Reward (выбор 1 из 3) и Market (3 рычага над слагаемыми
// Team OVR + reroll). Покупки — это ДЕЛЬТЫ слагаемых `Base + Hero Synergy + Chemistry`, а не
// мутация игроков: слой полностью развязан со scoreTeam (PRD §5.9.2/§5.10 — «Tactics
// модифицируют понятные слагаемые; UI показывает источник каждого изменения»). Сила
// сбрасывается вместе с забегом (fresh RunEconomy на новый забег).
//
// Детерминизм: `seed + campId + rerollN ⇒ те же офферы`. Числа — placeholder-конфиг ECONOMY
// в одном месте (кандидат в balanceConfigVersion, точная калибровка — §10.F, после T6.3).
// Резерв игрока / hero pool / редкость героев — поздние срезы (срез 3 / 3b), здесь их нет.
import { Rng } from "./rng.ts";
import { placementWorstRank } from "./anteRun.ts";
import type { PlacementKey } from "./tournament.ts";

/** Слагаемое Team OVR, на которое действует покупка. */
export type Summand = "base" | "heroSynergy" | "chemistry";

/** Эффект покупки: прибавка к слагаемому и опциональный trade-off по другому слагаемому. */
export interface StatEffect {
  summand: Summand;
  delta: number;
  tradeoffSummand?: Summand;
  tradeoffDelta?: number;
}

export type OfferKind = "stat" | "gold";

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
}

/** Placeholder-баланс. Точная калибровка — отдельный balance spec (§10.F), после симуляции T6.3.
 *  Ориентир: поле растёт ANTE_FIELD_STEP=3 очка/этап, покупка должна давать сопоставимый
 *  прирост Team OVR, чтобы усиливаться было обязательно, но одной покупки не хватало «на всё». */
export const ECONOMY = {
  rerollCost: 2,
  /** Базовые призовые за пройденный этап. */
  prizeBase: 3,
  /** Бонус за каждое место выше порога этапа (overperformance). */
  prizeSurplusPerRank: 1,
  /** Reward-варианты золота (мелкий/крупный). */
  rewardGold: { small: 3, large: 6 },
  /** Рычаги рынка по слагаемым. `step`/`costStep` — разброс качества при reroll. */
  levers: {
    base: { delta: 3, step: 1, cost: 5, costStep: 2, tradeoff: { summand: "chemistry" as Summand, delta: -1 } },
    heroSynergy: { delta: 2, step: 0.5, cost: 5, costStep: 2, tradeoff: undefined },
    chemistry: { delta: 2, step: 0.5, cost: 4, costStep: 2, tradeoff: undefined },
  },
} as const;

const MARKET_SUMMANDS: readonly Summand[] = ["base", "heroSynergy", "chemistry"];

/** Призовые за пройденный этап: база + бонус за место лучше порога. Без RNG — детерминизм тривиален. */
export function prizeForStage(placement: PlacementKey | null, target: number): number {
  const surplus = placement == null ? 0 : Math.max(0, target - placementWorstRank(placement));
  return ECONOMY.prizeBase + surplus * ECONOMY.prizeSurplusPerRank;
}

/** Три reward-оффера Буткемпа (детерминированы по seed+campId): мелкое золото, крупное золото,
 *  бесплатный stat-рычаг случайной категории. Выбор 1 из 3 (решение 2026-07-23). */
export function rewardOffers(seed: string, campStageIndex: number): Offer[] {
  const rng = new Rng(`${seed}:camp-${campStageIndex}:reward`);
  const summand = rng.pick(MARKET_SUMMANDS);
  const cfg = ECONOMY.levers[summand];
  return [
    { id: `rwd-${campStageIndex}-0`, kind: "gold", labelKey: "reward.goldSmall", cost: 0, goldGain: ECONOMY.rewardGold.small },
    { id: `rwd-${campStageIndex}-1`, kind: "gold", labelKey: "reward.goldLarge", cost: 0, goldGain: ECONOMY.rewardGold.large },
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
    };
  }

  get gold(): number {
    return this.state.gold;
  }

  /** Суммарные дельты по слагаемым от всех применённых покупок. */
  modifiers(): SummandModifiers {
    const mod: SummandModifiers = { base: 0, heroSynergy: 0, chemistry: 0 };
    for (const e of this.state.applied) {
      mod[e.summand] += e.delta;
      if (e.tradeoffSummand && e.tradeoffDelta) mod[e.tradeoffSummand] += e.tradeoffDelta;
    }
    return mod;
  }

  /** Итоговая прибавка к Team OVR (сумма всех модификаторов слагаемых). */
  totalModifier(): number {
    const m = this.modifiers();
    return m.base + m.heroSynergy + m.chemistry;
  }

  /** Начислить призовые за пройденный этап. Идемпотентно на camp (защита от двойного эффекта). */
  awardStageClear(campStageIndex: number, placement: PlacementKey | null, target: number): void {
    if (this.state.awardedCamps.includes(campStageIndex)) return;
    this.state.gold += prizeForStage(placement, target);
    this.state.awardedCamps.push(campStageIndex);
  }

  /** Открыть Буткемп для этапа `campStageIndex` (офферы деривуются от него). */
  openCamp(campStageIndex: number): void {
    this.state.campStageIndex = campStageIndex;
    this.state.inCamp = true;
    this.state.chosenRewardId = null;
    this.state.marketRerolls = 0;
  }

  /** Выйти из Буткемпа (переход к следующему этапу). */
  leaveCamp(): void {
    this.state.inCamp = false;
  }

  private currentRewardOffers(): Offer[] {
    return rewardOffers(this.seed, this.state.campStageIndex);
  }

  private currentMarketOffers(): Offer[] {
    return marketOffers(this.seed, this.state.campStageIndex, this.state.marketRerolls)
      .filter((o) => !this.state.consumed.includes(o.id));
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
    const offer = this.currentMarketOffers().find((o) => o.id === offerId);
    if (!offer || offer.kind !== "stat" || !offer.effect) return false;
    if (offer.cost > this.state.gold) return false;
    this.state.gold -= offer.cost;
    this.apply(offer.effect);
    this.state.consumed.push(offerId);
    return true;
  }

  /** Реролл рынка: списать фиксированную цену (без минуса), сгенерировать новый набор офферов. */
  rerollMarket(): boolean {
    if (ECONOMY.rerollCost > this.state.gold) return false;
    this.state.gold -= ECONOMY.rerollCost;
    this.state.marketRerolls += 1;
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
