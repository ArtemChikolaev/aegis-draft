// Мутаторы круга Династии (LG3, R12.6) — и будущие Stakes (T6.4, решение 2026-08-09: одна
// система правил сложности, Contracts отдельно не заводятся).
//
// Круг = продолжение актов за пределами сезона (5 этапов). Каждый круг играется под ОДНИМ
// правилом поверх всех его этапов, объявленным на входе — та же видимость заранее, что у боссов:
// готовиться к правилу (trade-in из LG1, re-pick, накопления) и есть работа поздних лагерей.
// Стек правил не заводим: числовую эскалацию глубины уже несёт anteThreat (perAct + ускорение).
//
// Модуль — только ОПРЕДЕЛЕНИЯ и ВЫБОР (data-driven, по образцу bossConditions): какие мутаторы
// есть и какой активен в круге N. ПРИМЕНЕНИЕ живёт у владельцев правил — цель этапа в anteRun
// (движок судит порог), баны и потолок штрафа в bossConditions, цены рынка в anteMarket/
// anteEconomy. Арифметика «какой это круг» — в anteRun (dynastyCircleOf): это свойство сезона.
//
// Детерминизм: свой Rng-поток `:dynasty:mutator:` — существующие потоки (`:boss`, `:camp-*`,
// `:trade`, `:edition`) не сдвигаются, seed-coupled e2e не пере-подбираются.
import { Rng } from "./rng.ts";

export type MutatorId = "tighterTargets" | "doubleBans" | "expensiveMarket" | "uncappedBoss";

export const MUTATOR_IDS: readonly MutatorId[] = [
  "tighterTargets",
  "doubleBans",
  "expensiveMarket",
  "uncappedBoss",
];

/** Числа мутаторов (часть BALANCE_CONFIG_VERSION — правишь, бампай версию в balance.ts).
 *  Placeholder до калибровки A/B (протокол R10). По одному правилу на рычаг, как у боссов:
 *  порог места / hero pool / золото / потолок штрафа. */
export const MUTATORS = {
  /** Пороги мест всех этапов круга жёстче на `steps` шагов легальной лестницы бакетов. */
  tighterTargets: { steps: 1 },
  /** Бан-лист героев (босс heroBan) в этом круге умножен. 2 → 3 (b1.40.0): как стартовый Stake
   *  на сезоне ×2 был неотличим от отсутствия правила (32.0% против 31.3% базы — пересадка
   *  героев переживала бан бесплатно). */
  doubleBans: { factor: 3 },
  /** Все цены рынка круга умножены (стат-карты и рулетка игроков/героев/улучшений).
   *  1.25 → 1.5 (b1.40.0): как стартовый Stake на сезоне +25% тонули в профиците золота
   *  (33.0% против 31.3% базы — правило ничего не меняло). */
  expensiveMarket: { costFactor: 1.5 },
  /** Штраф босса круга не ограничен потолком `max` — пренебрежение правилом стоит сколько стоит. */
  uncappedBoss: {},
} as const;

export function isMutatorId(value: string): value is MutatorId {
  return (MUTATOR_IDS as readonly string[]).includes(value);
}

/** Мутатор круга `circle` (с 1). Детерминизм по seed+кругу; внутри сезона (circle 0) мутаторов
 *  нет — сложность сезона несут боссы и рампа поля, второй слой правил там лишний. */
export function mutatorForCircle(seed: string, circle: number): MutatorId | null {
  if (circle < 1) return null;
  return new Rng(`${seed}:dynasty:mutator:circle-${circle}`).pick(MUTATOR_IDS);
}

/** Параметры описания мутатора для i18n — из ТЕХ ЖЕ чисел конфига, что играет правило:
 *  подпись не может разойтись с механикой. */
export function mutatorDescParams(id: MutatorId): Record<string, number> {
  switch (id) {
    case "tighterTargets": return { steps: MUTATORS.tighterTargets.steps };
    case "doubleBans": return { factor: MUTATORS.doubleBans.factor };
    case "expensiveMarket": return { pct: Math.round((MUTATORS.expensiveMarket.costFactor - 1) * 100) };
    case "uncappedBoss": return {};
  }
}
