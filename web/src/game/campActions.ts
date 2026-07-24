// Camp Actions — одноразовые карточки Буткемпа (T6.2, срез 4). В отличие от Tactics они не
// условные и не пересчитываются: разыгрываются между этапами и дают ВРЕМЕННУЮ подготовку на один
// следующий этап (PRD §5.10.2). Поэтому здесь нет своего вычислителя — эффект укладывается в уже
// существующий StatEffect, а срок жизни держит RunEconomy (`temporary`, чистится на openCamp).
//
// Активных кликов во время симуляции турнира не вводим (PRD §5.10.2): карточка разыгрывается
// только в Буткемпе.
import type { StatEffect, Summand } from "./anteEconomy.ts";

export type CampActionId = "scrim" | "bootcamp" | "heroPractice" | "scouting" | "standIn";

/** Сколько одноразовых действий можно держать одновременно (PRD §5.10.1). */
export const CAMP_ACTION_SLOTS = 2;

export const CAMP_ACTION_IDS: readonly CampActionId[] = [
  "scrim",
  "bootcamp",
  "heroPractice",
  "scouting",
  "standIn",
];

export function isCampActionId(value: string): value is CampActionId {
  return (CAMP_ACTION_IDS as readonly string[]).includes(value);
}

/** Утилита карточки, которая меняет не счёт, а доступную информацию/цены Буткемпа.
 *  `scouting` — разведка следующего этапа + бесплатный реролл рынка (срез 5 добавит сюда
 *  boss condition, менять контракт не придётся). `freePlayerSwap` — одна замена игрока даром. */
export type CampActionUtility = "scouting" | "freePlayerSwap";

export interface CampActionDef {
  id: CampActionId;
  /** Временный эффект на один следующий этап. У каждой статовой карточки есть явная цена. */
  effect?: StatEffect;
  utility?: CampActionUtility;
  /** Слагаемое, вокруг которого карточка построена — для группировки в UI. */
  summand?: Summand;
}

/** Placeholder-баланс, как ECONOMY и TACTICS: калибровка — balance spec (§10.F) после T6.3.
 *  Величины намеренно выше тактик (одноразово и только на один этап), но каждая с trade-off,
 *  чтобы разыгрывать карточку было решением, а не бесплатным «+N ко всему». */
export const CAMP_ACTIONS: Record<CampActionId, CampActionDef> = {
  // Гоняли слаженность, а не индивидуальные пулы.
  scrim: {
    id: "scrim",
    summand: "chemistry",
    effect: { summand: "chemistry", delta: 2, tradeoffSummand: "heroSynergy", tradeoffDelta: -0.5 },
  },
  // Жёсткий сбор поднимает форму, но выматывает и бьёт по слаженности.
  bootcamp: {
    id: "bootcamp",
    summand: "base",
    effect: { summand: "base", delta: 2, tradeoffSummand: "chemistry", tradeoffDelta: -1 },
  },
  // Разбирали пул героев вместо общей формы.
  heroPractice: {
    id: "heroPractice",
    summand: "heroSynergy",
    effect: { summand: "heroSynergy", delta: 1.5, tradeoffSummand: "base", tradeoffDelta: -0.5 },
  },
  scouting: { id: "scouting", utility: "scouting" },
  standIn: { id: "standIn", utility: "freePlayerSwap" },
};

export function campActionDef(id: string): CampActionDef | null {
  return isCampActionId(id) ? CAMP_ACTIONS[id] : null;
}
