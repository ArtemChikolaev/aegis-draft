// Контракт между `CampScreen` и вынесенными панелями (R14.2).
//
// Панель не считает свою математику: экран остаётся единственным местом, где живут превью силы,
// разборы по слагаемым и доступ к стору. Панель получает готовые значения и функции — это тот же
// шов, что уже выбран у `campPresentation` («данные разбора, а не JSX»), только на уровень выше.
import type { CampView, Offer } from "../../game/anteEconomy.ts";
import type { Candidate } from "../../game/packs.ts";
import type { Rarity } from "../../game/rarity.ts";
import type { CampPowerEvaluation, CampPowerPreview } from "./campPresentation.ts";
import type { InspectedOffer } from "./CampCards.tsx";
import type { Snapshot } from "../../state/runStore.ts";
import type { ReactNode } from "react";

/** Раздел «Билд»: слоты тактик/предметов. Экшены приходят снаружи — панель только рисует. */
export interface CampBuildView {
  camp: CampView;
  tactics: CampPowerEvaluation["tactics"];
  itemEval: CampPowerEvaluation["items"];
  power: CampPowerEvaluation["power"];
  /** Прогресс порога Wide Pool — счётчик «N из 10» в idle-состоянии слота (плейтест 2026-08-31). */
  widePoolProgress: { distinct: number; need: number };
  onInspectCard: (cardId: string) => void;
  onTrade: (cardId: string) => void;
  onDiscard: (cardId: string) => void;
  onEnchant: (cardId: string, edition: "charged" | "tempered") => void;
  /** Улучшение тира предмета за золото (LG3-хвост): цена (null — не улучшается), прирост силы
   *  забега от следующего тира и действие. Считает экран — тем же evaluateCampPower, что вклад. */
  itemUpgradeCostOf: (cardId: string) => number | null;
  itemUpgradeDelta: (cardId: string) => number;
  onUpgradeItem: (cardId: string) => void;
}

/** Раздел «Подготовка»: слоты одноразовых Camp Actions. */
export interface CampActionsView {
  camp: CampView;
  onDiscard: (actionId: string) => void;
  onPlay: (actionId: string) => void;
}

/** Резерв (скамейка игроков + reserve pool героев) под разделом «Билд». */
export interface CampReserveView {
  snapshot: Snapshot;
  score: NonNullable<Snapshot["score"]>;
  power: CampPowerEvaluation["power"];
  heroTargets: Record<number, number>;
  onHeroTarget: (reserveHeroId: number, outgoingHeroId: number) => void;
  previewPower: CampMarketView["previewPower"];
  replaceRosterCandidate: CampMarketView["replaceRosterCandidate"];
  replaceActiveHero: CampMarketView["replaceActiveHero"];
  setInspected: (offer: InspectedOffer) => void;
  swapReservePlayer: (slotIndex: number, accountId: number) => void;
  swapReserveHero: (outgoingHeroId: number, incomingHeroId: number) => void;
}

export interface CampMarketView {
  camp: CampView;
  snapshot: Snapshot;
  score: NonNullable<Snapshot["score"]>;
  power: CampPowerEvaluation["power"];
  candidates: Candidate[];
  playerOffers: Offer[];
  heroOffers: Offer[];
  previewPower: (
    nextScore: { base: number; heroSynergy: number; chemistry: number },
    roster: Snapshot["roster"],
    assignment: Record<number, number>,
    activeHeroes: readonly number[],
    heroRarity?: Record<string, Rarity>,
  ) => CampPowerPreview;
  replaceRosterCandidate: (slotIndex: number, candidate: Candidate) => Snapshot["roster"];
  replaceActiveHero: (outgoingHeroId: number, incomingHeroId: number) => number[];
  playerOfferSummary: (
    incoming: Candidate,
    outgoing: Candidate | null | undefined,
    afterHeroId?: number,
  ) => ReactNode;
  /** Разбор замены в оверлее (R5.3): герой с pro-играми, пары сыгранности, кто уходит. */
  playerOfferDetails: (
    incoming: Candidate,
    outgoing: Candidate | null | undefined,
    afterHeroId: number | undefined,
    slotIndex: number,
  ) => ReactNode;
  heroOfferSummary: (
    offer: Offer,
    incomingRarity: Rarity,
    outgoingRarity: Rarity,
    interactiveTags?: boolean,
  ) => ReactNode;
  rarityOfferSummary: (heroId: number, rarity: Rarity, interactiveTags?: boolean) => ReactNode;
  setInspected: (offer: InspectedOffer) => void;
  buyMarket: (offerId: string) => void;
  rerollMarket: () => void;
  upgradeHeroRarity: (heroId: number) => void;
}
