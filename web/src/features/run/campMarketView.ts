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
