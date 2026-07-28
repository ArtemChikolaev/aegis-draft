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
import { powerLayers, tournamentPower, type PowerLayers } from "./tournamentPower.ts";

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
