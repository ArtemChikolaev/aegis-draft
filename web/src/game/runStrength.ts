// Композиция силы состава Roguelite Run — ОДНА на всех потребителей.
//
// Слоёв четыре и живут они в разных модулях: счёт ростера (`score.ts`), покупки экономики
// (`anteEconomy`), условные тактики (`tactics`) и редкость активных героев (`heroRarity`).
// Раньше их складывали в двух местах независимо — в `runStore` и в балансовом симуляторе, — и
// копии разъехались: симулятор не учитывал ни редкость, ни тактики, то есть мерил заведомо более
// слабый билд, чем получает игрок. По его числам при этом калибровались коэффициенты.
//
// Поэтому сумма собирается здесь, а `runStore` и `scripts/sim_run.ts` обязаны звать эту функцию.
import { addModifiers, type SummandModifiers, type SummandValues } from "./anteEconomy.ts";
import { evaluateItems, type ItemEvaluation } from "./items.ts";
import { rarityModifiers } from "./heroRarity.ts";
import type { Rarity } from "./rarity.ts";
import { evaluateTactics, tacticRarityFactor, type TacticContext, type TacticEvaluation } from "./tactics.ts";
import {
  powerBreakdown,
  powerLayers,
  tournamentPower,
  type PowerBreakdown,
  type PowerLayers,
} from "./tournamentPower.ts";

export interface RunStrengthInput {
  /** Модификаторы покупок и временных Camp Actions (`economy.modifiers()`). */
  economy: SummandModifiers;
  /** Вклад условных тактик; null — тактик нет. */
  tactics: SummandModifiers | null;
  /** Карта редкости забега и активные герои — вклад считается от них. */
  heroRarity: Record<string, Rarity>;
  activeHeroes: readonly number[];
  /** Множитель вклада редкости — trade-off Wide Pool (`tacticRarityFactor(equipped)`).
   *  Каждый сборщик input'а обязан передать его: молчаливая единица у одного потребителя
   *  разъехалась бы с полем этапа ровно как старые копии композиции. */
  rarityFactor?: number;
}

/** Суммарные модификаторы слагаемых поверх счёта ростера. */
export function runModifiers(input: RunStrengthInput): SummandModifiers {
  const withTactics = input.tactics
    ? addModifiers(input.economy, input.tactics)
    : input.economy;
  return addModifiers(withTactics, rarityModifiers(input.heroRarity, input.activeHeroes, input.rarityFactor ?? 1));
}

/** Итоговая прибавка к Team OVR (сумма всех слагаемых модификаторов). */
export function runModifierTotal(input: RunStrengthInput): number {
  const m = runModifiers(input);
  return m.base + m.heroSynergy + m.chemistry;
}

/** Карточки, реально сработавшие на этом ростере, — из ТЕХ ЖЕ sources, что боевой расчёт.
 *  Единственное определение «активности»: BuildRail, начисление зарядов (R13.5) и симулятор
 *  обязаны читать одно и то же, иначе подсветка/заряды разойдутся с силой. */
export function activeCardIds(
  tactics: TacticEvaluation | null,
  items: ItemEvaluation,
): Set<string> {
  return new Set<string>([
    ...items.sources.filter((source) => source.met).map((source) => source.itemId),
    ...(tactics?.sources ?? []).map((source) => source.tacticId as string),
  ]);
}

/** Полное состояние ростера, от которого зависят условные карточки Run. */
export interface RunPowerState {
  score: SummandValues;
  tacticContext: TacticContext;
  activeHeroes: readonly number[];
  heroRarity: Record<string, Rarity>;
}

/** Постоянная часть билда для сравнения двух вариантов ростера. */
export interface RunBuildContext {
  economy: SummandModifiers;
  equippedCards: readonly string[];
  cardRarity: Record<string, Rarity>;
  /** Заряды Charged-карт (R13.5). Обязательное поле по уроку cardRarity: опциональный контекст
   *  однажды разъехался между описанием и вкладом. `{}` — валидное «зарядов нет». */
  cardCharges: Record<string, number>;
}

export interface RunPowerEvaluation {
  values: SummandValues;
  modifiers: SummandModifiers;
  tactics: TacticEvaluation;
  items: ItemEvaluation;
  power: PowerBreakdown;
}

/**
 * Каноническая оценка Run Power одного возможного состава.
 *
 * Tactics и Items намеренно вычисляются внутри от контекста ЭТОГО состояния. Перенос их эффекта
 * из старого ростера делает превью лживым: замена может улучшить score, но выключить условие
 * карточки и ослабить итоговую силу забега.
 */
export function evaluateRunPower(
  state: RunPowerState,
  build: RunBuildContext,
): RunPowerEvaluation {
  const tactics = evaluateTactics(build.equippedCards, state.tacticContext, build.cardCharges);
  const modifiers = runModifiers({
    economy: build.economy,
    tactics: tactics.modifiers,
    heroRarity: state.heroRarity,
    activeHeroes: state.activeHeroes,
    rarityFactor: tacticRarityFactor(build.equippedCards),
  });
  const values = {
    base: state.score.base + modifiers.base,
    heroSynergy: state.score.heroSynergy + modifiers.heroSynergy,
    chemistry: state.score.chemistry + modifiers.chemistry,
  };
  const items = evaluateItems(build.equippedCards, {
    activeHeroes: state.activeHeroes,
    cardRarity: build.cardRarity,
    cardCharges: build.cardCharges,
  });
  const power = powerBreakdown(powerLayers(
    values.base + values.heroSynergy + values.chemistry,
    { flat: items.flat, additive: items.additive, xMults: items.xMults },
  ));
  return { values, modifiers, tactics, items, power };
}

/**
 * Сила, с которой состав выходит на этап: объективный счёт + модификаторы слагаемых, проведённые
 * через слои Tournament Power (R8.2), минус штраф босса.
 *
 * ШОВ ДЛЯ R8.3. Сегодня `power` пустой, поэтому итог равен прежней сумме до последнего знака —
 * правка инертна по построению. Место подключения введено заранее осознанно: когда появятся
 * предметы, им нужно будет только наполнить слои, а не переделывать композицию силы в трёх местах
 * и заодно шкалу ELO (на этой грабле уже стоял симулятор).
 */
export function stageStrength(
  teamOvr: number,
  input: RunStrengthInput,
  opts: { bossPenalty?: number; power?: Partial<Omit<PowerLayers, "teamOvr">> } = {},
): number {
  const rosterScore = teamOvr + runModifierTotal(input);
  return tournamentPower(powerLayers(rosterScore, opts.power)) - (opts.bossPenalty ?? 0);
}
