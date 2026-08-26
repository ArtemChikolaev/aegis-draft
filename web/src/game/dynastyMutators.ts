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
 *  По одному правилу на рычаг, как у боссов: порог места / hero pool / золото / давление боссов.
 *
 *  Ид-имена `doubleBans`/`uncappedBoss` — ИСТОРИЧЕСКИЕ (b1.41.0 сменил семантику, не имя):
 *  id живёт в ссылках (RunLink `k`) и карьерных метках, переименование ломало бы старые записи
 *  ради косметики. Отображаемое имя — i18n `mutator.<id>`, оно правды и держится. */
export const MUTATORS = {
  /** Пороги мест всех этапов круга жёстче на `steps` шагов легальной лестницы бакетов. */
  tighterTargets: { steps: 1 },
  /** «Баны повсюду» (b1.41.0): вне финалов актов КАЖДЫЙ турнир судится правилом heroBan с
   *  бан-листом из `banCount` героев, ротация каждый этап — одноразовой адаптацией (re-pick)
   *  не обходится, реролл правила пересматривает список, не снимает его. Три прежние формы
   *  отвергнуты замерами (база 31.3%): бан-лист босса ×factor (32.0% — штраф на 1/5 финалов
   *  переживается бесплатно), удаление случайных героев из снабжения (32.7% — поглощается
   *  пересборкой) и удаление топа меты (42.0% (!) — сим-агент не оптимизирует драфт героев,
   *  supply-правила этим инструментом не измеряются; см. BACKLOG T6.4). */
  doubleBans: { banCount: 36 },
  /** Все цены рынка круга умножены (стат-карты и рулетка игроков/героев/улучшений).
   *  1.25 → 1.5 (b1.40.0): как стартовый Stake на сезоне +25% тонули в профиците золота
   *  (33.0% против 31.3% базы — правило ничего не меняло). */
  expensiveMarket: { costFactor: 1.5 },
  /** «Босс без пощады» (b1.41.0): правила боссов судят и ЭЛИТНЫЕ турниры (второй боссовый этап
   *  в каждом акте), а штраф не ограничен потолком `max`. Один снятый потолок в сезоне не
   *  работал (31.0%, boss-death не сдвинулся): кламп редко достигается адаптирующимся игроком —
   *  правило добавляет ЧАСТОТУ давления, а не только его хвост. */
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
    case "doubleBans": return { n: MUTATORS.doubleBans.banCount };
    case "expensiveMarket": return { pct: Math.round((MUTATORS.expensiveMarket.costFactor - 1) * 100) };
    case "uncappedBoss": return {};
  }
}
