// Иконки предметов Dota 2 (R14.5). Каталог `items.ts` — это НАСТОЯЩИЕ предметы Dota, но их
// внутренние имена не выводятся из наших camelCase-id механически: `shadowBlade` — это
// `invis_sword`, `scytheOfVyse` — `sheepstick`, `eulsScepter` — `cyclone`, `aghanimsScepter` —
// `ultimate_scepter`. Наивное преобразование дало бы молча битые картинки у трети каталога,
// поэтому таблица явная и проверяется тестом против списка `ITEM_IDS`.
//
// Слаги сверены загрузкой всех 34 иконок с CDN (2026-08-03): 34/34 отдаются.
export const ITEM_ART: Record<string, string> = {
  necronomicon: "necronomicon",
  mantaStyle: "manta",
  scytheOfVyse: "sheepstick",
  bootsOfTravel: "travel_boots",
  guardianGreaves: "guardian_greaves",
  forceStaff: "force_staff",
  shadowBlade: "invis_sword",
  assaultCuirass: "assault",
  octarineCore: "octarine_core",
  battleFury: "bfury",
  pipeOfInsight: "pipe",
  silverEdge: "silver_edge",
  maskOfMadness: "mask_of_madness",
  eulsScepter: "cyclone",
  dagon: "dagon",
  holyLocket: "holy_locket",
  heartOfTarrasque: "heart",
  butterfly: "butterfly",
  aghanimsScepter: "ultimate_scepter",
  aghanimsShard: "aghanims_shard",
  bloodstone: "bloodstone",
  vladmirsOffering: "vladmir",
  desolator: "desolator",
  refresherOrb: "refresher",
  handOfMidas: "hand_of_midas",
  bottle: "bottle",
  magicWand: "magic_wand",
  observerWard: "ward_observer",
  blackKingBar: "black_king_bar",
  linkensSphere: "sphere",
  divineRapier: "rapier",
  radiance: "radiance",
  smokeOfDeceit: "smoke_of_deceit",
  helmOfTheDominator: "helm_of_the_dominator",
};

/** Слаг иконки предмета либо null, если карточка не предмет (тактика, Camp Action). */
export function itemArtSlug(cardId: string | undefined): string | null {
  if (!cardId) return null;
  return ITEM_ART[cardId] ?? null;
}
