// Композиция силы состава Roguelite Run — ОДНА на всех потребителей.
//
// Слоёв четыре и живут они в разных модулях: счёт ростера (`score.ts`), покупки экономики
// (`anteEconomy`), условные тактики (`tactics`) и редкость активных героев (`heroRarity`); поверх
// них — слои Tournament Power от предметов (R8.3) и штраф босса этапа. Раньше их складывали в
// нескольких местах независимо, и копии разъезжались: симулятор мерил билд без редкости и тактик,
// resume терял предметы и защиту от босса, а игровое поле — ослабление Wide Pool (ревизия
// 2026-09-13: после перезагрузки посреди этапа поле пересобиралось другой силы).
//
// Поэтому сила этапа собирается здесь (`evaluateStage`), а `runStore` (игра и resume),
// `scripts/sim_run.ts`, `scripts/sweep_seeds_both.ts` и экран турнира обязаны звать эти функции.
import { addModifiers, type SummandModifiers, type SummandValues } from "./anteEconomy.ts";
import { bannedHeroesForStage, bossForStage, evaluateBoss, type BossEvaluation } from "./bossConditions.ts";
import type { MutatorId } from "./dynastyMutators.ts";
import type { CardEdition } from "./editions.ts";
import type { RosterSlot } from "./engine.ts";
import { evaluateItems, protectedBossPenalty, type ItemEvaluation } from "./items.ts";
import { rarityModifiers } from "./heroRarity.ts";
import type { Rarity } from "./rarity.ts";
import type { ScoreBreakdown } from "./score.ts";
import { buildTacticContext, evaluateTactics, tacticRarityFactor, type TacticContext, type TacticEvaluation } from "./tactics.ts";
import { powerBreakdown, powerLayers, type PowerBreakdown } from "./tournamentPower.ts";
import type { GameData } from "../types/data.ts";

export interface RunStrengthInput {
  /** Модификаторы покупок и временных Camp Actions (`economy.modifiers()`). */
  economy: SummandModifiers;
  /** Вклад условных тактик; null — тактик нет. */
  tactics: SummandModifiers | null;
  /** Карта редкости забега и активные герои — вклад считается от них. */
  heroRarity: Record<string, Rarity>;
  activeHeroes: readonly number[];
  /** Множитель вклада редкости — trade-off Wide Pool (`tacticRarityFactor(equipped)`). Обязателен:
   *  пока поле было необязательным, игровая сборка поля молча брала единицу и расходилась с экраном
   *  и симулятором. */
  rarityFactor: number;
}

/** Суммарные модификаторы слагаемых поверх счёта ростера. */
export function runModifiers(input: RunStrengthInput): SummandModifiers {
  const withTactics = input.tactics
    ? addModifiers(input.economy, input.tactics)
    : input.economy;
  return addModifiers(withTactics, rarityModifiers(input.heroRarity, input.activeHeroes, input.rarityFactor));
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

// ───────────────────────────────────── сила этапа ─────────────────────────────────────

/** Сила выхода на этап и её разложение (радар и таблица поля читают одно и то же). */
export interface StagePower {
  /** Модификаторы слагаемых: экономика + тактики + редкость. */
  modifiers: SummandModifiers;
  /** Счёт состава с модификаторами — вход слоёв Tournament Power, до штрафа босса. */
  rosterScore: number;
  /** Слои Tournament Power (R8.2): что именно дают предметы. */
  power: PowerBreakdown;
  /** Сила, с которой состав выходит в поле этапа. */
  total: number;
}

/**
 * Сила этапа: объективный счёт + модификаторы слагаемых, проведённые через слои Tournament Power,
 * минус штраф босса. Порядок фиксирован: штраф вычитается ПОСЛЕ слоёв, иначе радар и поле
 * показали бы разные числа.
 */
export function stagePowerOf(
  teamOvr: number,
  strength: RunStrengthInput,
  items: ItemEvaluation,
  bossPenalty: number,
): StagePower {
  const modifiers = runModifiers(strength);
  const rosterScore = teamOvr + (modifiers.base + modifiers.heroSynergy + modifiers.chemistry);
  const power = powerBreakdown(powerLayers(rosterScore, { flat: items.flat, additive: items.additive, xMults: items.xMults }));
  return { modifiers, rosterScore, power, total: power.total - bossPenalty };
}

/** Состав, от которого считается сила этапа. `RunEngine` подходит как есть. */
export interface StageRoster {
  score(): ScoreBreakdown | null;
  readonly rosterView: RosterSlot[];
  readonly heroes: number[];
  readonly players: readonly { readonly ovr: number }[];
  readonly allFormatHeroes: number[];
}

/** Экономика забега в той части, от которой зависит сила этапа. `RunEconomy` подходит как есть. */
export interface StageEconomy {
  modifiers(): SummandModifiers;
  readonly equippedTactics: string[];
  readonly heroRarity: Record<string, Rarity>;
  readonly cardRarity: Record<string, Rarity>;
  readonly cardEditions: Record<string, CardEdition>;
  readonly cardCharges: Record<string, number>;
  readonly snapshot: { readonly campStageIndex: number };
  bossRerollsFor(stageIndex: number): number;
}

/** Правила забега, от которых зависит этап: датасет, сид и стартовые Stakes. */
export interface StageRules {
  data: GameData;
  seed: string;
  stakes: readonly MutatorId[];
}

/** A/B-переключатели балансового симулятора (NOEDITIONS / NOBOSS). Игра зовёт без них. */
export interface StageOptions {
  /** Учитывать заряды Charged-карт (R13.5). По умолчанию — да. */
  charges?: boolean;
  /** Применять правило босса этапа. По умолчанию — да. */
  boss?: boolean;
}

/** Билд на текущем составе — всё, что не зависит от номера этапа. */
export interface StageBuild {
  score: ScoreBreakdown;
  tacticContext: TacticContext;
  tactics: TacticEvaluation;
  items: ItemEvaluation;
  strength: RunStrengthInput;
  modifiers: SummandModifiers;
}

/** Билд состава. Тактики и предметы считаются от ЭТОГО ростера: их условия зависят от него, поэтому
 *  пересчёт нужен на каждый swap — этим они и отличаются от покупок. */
export function stageBuild(
  roster: StageRoster,
  economy: StageEconomy,
  data: GameData,
  options: StageOptions = {},
): StageBuild | null {
  const score = roster.score();
  if (!score) return null;
  const tacticContext = buildTacticContext(
    roster.rosterView,
    score.assignment.byPlayer,
    data,
    economy.snapshot.campStageIndex,
  );
  const cardCharges = options.charges === false ? {} : economy.cardCharges;
  const tactics = evaluateTactics(economy.equippedTactics, tacticContext, cardCharges);
  const items = evaluateItems(economy.equippedTactics, {
    activeHeroes: roster.heroes,
    cardRarity: economy.cardRarity,
    cardCharges,
  });
  const strength: RunStrengthInput = {
    economy: economy.modifiers(),
    tactics: tactics.modifiers,
    heroRarity: economy.heroRarity,
    activeHeroes: roster.heroes,
    rarityFactor: tacticRarityFactor(economy.equippedTactics),
  };
  return { score, tacticContext, tactics, items, strength, modifiers: runModifiers(strength) };
}

/**
 * Правило босса этапа `stageIndex` против билда; null — на этапе нет правила. Штраф уже смягчён
 * предметами-защитой (R8.3) и активными Tempered-картами (LG4). Индекс — именно оцениваемого этапа:
 * разведка (R9.4) считает условие БУДУЩЕГО боссового турнира, и рампа планки берётся от него.
 */
export function stageBoss(
  build: StageBuild,
  roster: StageRoster,
  economy: StageEconomy,
  rules: StageRules,
  stageIndex: number,
  options: StageOptions = {},
): BossEvaluation | null {
  if (options.boss === false) return null;
  // Правило могло быть перекуплено в Буткемпе (T5.9): счётчик живёт в экономике, сам босс — чистая
  // функция от seed+stage+n. Stakes обязательны: под uncappedBoss правило стоит и на элитных этапах.
  const rerolls = economy.bossRerollsFor(stageIndex);
  const bossId = bossForStage(rules.seed, stageIndex, rerolls, rules.stakes);
  if (!bossId) return null;
  const { score, modifiers, tacticContext } = build;
  const raw = evaluateBoss(bossId, {
    seed: rules.seed,
    absoluteStageIndex: stageIndex,
    base: score.base + modifiers.base,
    heroSynergy: score.heroSynergy + modifiers.heroSynergy,
    chemistry: score.chemistry + modifiers.chemistry,
    playerOvrs: roster.players.map((player) => player.ovr),
    activeHeroes: roster.heroes,
    bannedHeroes: bannedHeroesForStage(rules.seed, stageIndex, roster.allFormatHeroes, rerolls, rules.stakes),
    stakes: rules.stakes,
    // «Pro-игры на назначенном герое» и co-games пар определены в buildTacticContext ровно один раз.
    assignedHeroGames: tacticContext.players.map((player) => player.assignedHeroGames),
    pairCoGames: tacticContext.pairs.map((pair) => pair.games),
  });
  const editions = economy.cardEditions;
  const activeTempered = [...activeCardIds(build.tactics, build.items)]
    .filter((id) => editions[id] === "tempered").length;
  return { ...raw, penalty: protectedBossPenalty(raw.penalty, build.items, activeTempered) };
}

/** Полная оценка этапа: билд, босс и сила выхода в поле. */
export interface StageEvaluation extends StageBuild {
  boss: BossEvaluation | null;
  power: StagePower;
}

export function evaluateStage(
  roster: StageRoster,
  economy: StageEconomy,
  rules: StageRules,
  stageIndex: number,
  options: StageOptions = {},
): StageEvaluation | null {
  const build = stageBuild(roster, economy, rules.data, options);
  if (!build) return null;
  const boss = stageBoss(build, roster, economy, rules, stageIndex, options);
  return { ...build, boss, power: stagePowerOf(build.score.teamOvr, build.strength, build.items, boss?.penalty ?? 0) };
}
