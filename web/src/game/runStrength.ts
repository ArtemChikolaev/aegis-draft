// Композиция силы состава Roguelite Run — ОДНА на всех потребителей.
//
// Слоёв четыре и живут они в разных модулях: счёт ростера (`score.ts`), покупки экономики
// (`anteEconomy`), условные тактики (`tactics`) и редкость активных героев (`heroRarity`).
// Раньше их складывали в двух местах независимо — в `runStore` и в балансовом симуляторе, — и
// копии разъехались: симулятор не учитывал ни редкость, ни тактики, то есть мерил заведомо более
// слабый билд, чем получает игрок. По его числам при этом калибровались коэффициенты.
//
// Поэтому сумма собирается здесь, а `runStore` и `scripts/sim_run.ts` обязаны звать эту функцию.
import { addModifiers, type SummandModifiers } from "./anteEconomy.ts";
import { rarityModifiers, type Rarity } from "./heroRarity.ts";

export interface RunStrengthInput {
  /** Модификаторы покупок и временных Camp Actions (`economy.modifiers()`). */
  economy: SummandModifiers;
  /** Вклад условных тактик; null — тактик нет. */
  tactics: SummandModifiers | null;
  /** Карта редкости забега и активные герои — вклад считается от них. */
  heroRarity: Record<string, Rarity>;
  activeHeroes: readonly number[];
}

/** Суммарные модификаторы слагаемых поверх счёта ростера. */
export function runModifiers(input: RunStrengthInput): SummandModifiers {
  const withTactics = input.tactics
    ? addModifiers(input.economy, input.tactics)
    : input.economy;
  return addModifiers(withTactics, rarityModifiers(input.heroRarity, input.activeHeroes));
}

/** Итоговая прибавка к Team OVR (сумма всех слагаемых модификаторов). */
export function runModifierTotal(input: RunStrengthInput): number {
  const m = runModifiers(input);
  return m.base + m.heroSynergy + m.chemistry;
}
