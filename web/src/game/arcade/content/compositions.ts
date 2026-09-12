// Композиции акта (T13.70, аудит 2026-09-12 §1): «новый seed» раньше лишь переставлял знакомые цели —
// на каждой карте стояли все места сразу. Теперь полный Radiant-акт собирается из двух явно разных
// наборов мест; состав объявляется на подготовке и в HUD. Обязательное в любой композиции: пруд
// (лечение/очищение), аванпост (обзор) и не меньше двух чемпионов — иначе контракт не предложить.
import type { ActId } from "../types.ts";

export type CompositionId = "all" | "wilds" | "trade" | "siege";
export type PlaceId = "camp" | "outpost" | "pond" | "grove" | "barrow" | "forge" | "rift" | "caravan" | "lair";

/** Свойство акта (T13.73): одно объявленное взаимодействие мест на композицию.
 *  `tainted_pond` — пруд заражён, пока стоит лагерь: лечит вдвое слабее и не снимает порчу; очистил лагерь — пруд чист и снова готов.
 *  `caravan_forge` — караван везёт материалы: после его прибытия цены кузни вдвое ниже.
 *  `siege` — «Осада леса»: патрули со знаменосцем ходят по тропам между местами; убил знаменосца — местная волна слабеет. */
export type ActProperty = "tainted_pond" | "caravan_forge" | "siege";

export interface CompositionDef {
  id: CompositionId;
  places: readonly PlaceId[];
  property?: ActProperty;
}

const ALL: readonly PlaceId[] = ["camp", "outpost", "pond", "grove", "barrow", "forge", "rift", "caravan", "lair"];

export const COMPOSITIONS: Record<CompositionId, CompositionDef> = {
  /** Как было: все места сразу — разминка, Dire и River, а также явный выбор для тестов и бота. */
  all: { id: "all", places: ALL },
  /** Дикие угодья: лагерь, роща, курган, логово — маршрут через чемпионов, без торговли и разлома. */
  wilds: { id: "wilds", places: ["camp", "outpost", "pond", "grove", "barrow", "lair"], property: "tainted_pond" },
  /** Торговый путь: караван, кузня, разлом — золото и снаряжение; из чемпионов только Кентавр и Гром-голем. */
  trade: { id: "trade", places: ["outpost", "pond", "grove", "forge", "rift", "caravan", "lair"], property: "caravan_forge" },
  /** Осада леса: лагерь, роща, логово, кузня — и патрули со знаменосцами между ними; без каравана, разлома и кургана. */
  siege: { id: "siege", places: ["camp", "outpost", "pond", "grove", "lair", "forge"], property: "siege" },
};

/** Композиции, между которыми выбирает seed в полном Radiant-акте. */
export const ROLLED_COMPOSITIONS: readonly CompositionId[] = ["wilds", "trade", "siege"];

export function isCompositionId(id: unknown): id is CompositionId {
  return typeof id === "string" && id in COMPOSITIONS;
}

/** Состав по seed и акту: чистая функция, та же и на подготовке (объявление), и в симе (размещение). */
export function compositionFor(seed: string, act: ActId): CompositionId {
  if (act !== "full") return "all";
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ROLLED_COMPOSITIONS[(h >>> 0) % ROLLED_COMPOSITIONS.length];
}

export function hasPlace(id: CompositionId, place: PlaceId): boolean {
  return COMPOSITIONS[id].places.includes(place);
}
