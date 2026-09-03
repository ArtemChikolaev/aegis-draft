// Чистая cost-математика Буткемпа — выделена из anteEconomy.ts (T12.5, 2026-09-02): цены
// рероллов/синков/игроков, модификаторы слагаемых, призовые и проценты. Ни одна функция не
// читает состояние — UI и движок обязаны считать одно и то же, поэтому считают одной функцией.
import { placementWorstRank } from "./anteRun.ts";
import type { PlacementKey } from "./tournament.ts";

/** Слагаемое Team OVR, на которое действует покупка. */
import { ECONOMY, type StatEffect, type SummandModifiers } from "./anteEconomyTypes.ts";

/** Цена очередного реролла в ТЕКУЩЕМ Буткемпе. Чистая: UI и движок обязаны считать одинаково. */
export function rerollCostFor(rerollsInCamp: number): number {
  return ECONOMY.rerollCostBase + Math.max(0, Math.floor(rerollsInCamp)) * ECONOMY.rerollCostStep;
}

/** Цена n-й покупки повторяемого синка. Чистая: UI и движок обязаны считать одинаково — тот же
 *  контракт, что у `rerollCostFor`. Геометрия обрывает конвертацию накоплений в силу (см. ECONOMY.prep). */
function sinkCostFor(base: number, growth: number, purchases: number): number {
  return Math.round(base * growth ** Math.max(0, Math.floor(purchases)));
}

/** Цена очередной усиленной подготовки в ТЕКУЩЕМ Буткемпе. */
export function prepCostFor(purchases: number): number {
  return sinkCostFor(ECONOMY.prep.costBase, ECONOMY.prep.costGrowth, purchases);
}

/** Цена очередной смены правила этапа. Считается по реролам ЭТОГО этапа: правило одно на этап,
 *  и его перебор не должен дешеветь от того, что предыдущий босс был перекуплен пять этапов назад. */
export function bossRerollCostFor(rerolls: number): number {
  return sinkCostFor(ECONOMY.bossReroll.costBase, ECONOMY.bossReroll.costGrowth, rerolls);
}

/** Цена игрока в паке-рулетке растёт с его OVR: сильный дороже, слабый доступен рано (Balatro-
 *  ценообразование). Placeholder под balance spec (§10.F). */
export function playerCost(ovr: number): number {
  return Math.max(2, Math.round((ovr - 60) / 4));
}

/** Цена апгрейда ФОРМЫ той же личности (R5.3): за человека уже заплачено, поэтому старая форма
 *  идёт в зачёт. Без trade-in игрок платил бы полную цену второй раз за того же игрока, и апгрейд
 *  формы был бы всегда хуже покупки нового человека той же силы.
 *  Нижняя граница не даёт сделать сильный сайдгрейд бесплатным. */
export function formUpgradeCost(incomingOvr: number, currentOvr: number): number {
  const incoming = playerCost(incomingOvr);
  const credit = Math.floor(playerCost(currentOvr) * ECONOMY.formTradeInRate);
  return Math.max(ECONOMY.formUpgradeMinCost, incoming - credit);
}

/** Доступна ли покупка игрока: stand-in делает ОДНУ замену бесплатной, поэтому при наличии
 *  бесплатного свапа карта доступна независимо от цены. UI обязан считать так же, как движок
 *  (purchaseMarket), иначе дорогая карта остаётся заблокированной при живом бесплатном свапе. */
export function playerOfferAffordable(
  cost: number,
  gold: number,
  freePlayerSwaps: number,
  unlimitedGold = false,
): boolean {
  return unlimitedGold || freePlayerSwaps > 0 || cost <= gold;
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

export function stageGold(base: number, stageStep: number, campStageIndex: number): number {
  return base + (clearedStage(campStageIndex) - 1) * stageStep;
}

/** Призовые = растущая база этапа + нормализованный бонус за overperformance.
 *  Нормализация важна: первое место даёт одинаковый максимум +3 и при top-10, и при top-3,
 *  поэтому широкий ранний порог не печатает в несколько раз больше золота, чем поздний.
 *
 *  Раздельно, а не одним числом: с R6.4 премия за место несёт продуктовую нагрузку — на финале
 *  4-го акта чемпионство перестало быть условием прохода и стало ровно этой премией. Награда,
 *  слитая с базой в одно «+7», игроком не читается, то есть её как будто нет. */
export function prizeBreakdown(
  placement: PlacementKey | null,
  target: number,
  campStageIndex: number,
): { base: number; performance: number } {
  const base = stageGold(ECONOMY.prizeBase, ECONOMY.prizeStageStep, campStageIndex);
  if (placement == null || target <= 1) return { base, performance: 0 };
  const rank = placementWorstRank(placement);
  if (rank >= target) return { base, performance: 0 };
  const progressToFirst = (target - rank) / (target - 1);
  return { base, performance: Math.round(progressToFirst * ECONOMY.prizePerformanceMax) };
}

/** Итоговые призовые этапа — сумма разбора. */
export function prizeForStage(
  placement: PlacementKey | null,
  target: number,
  campStageIndex: number,
): number {
  const { base, performance } = prizeBreakdown(placement, target, campStageIndex);
  return base + performance;
}

/** Проценты за удержанное золото. Чистая: UI показывает ровно то, что начислит движок. */
export function interestFor(gold: number, capBonus = 0): number {
  if (gold <= 0) return 0;
  return Math.min(ECONOMY.interestCap + capBonus, Math.floor(gold / ECONOMY.interestPerGold));
}

