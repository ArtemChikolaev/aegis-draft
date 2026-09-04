// Балансовый симулятор Roguelite Run (R10, dev-инструмент, НЕ CI-тест: числа зависят от реального
// датасета). Играет N сидов несколькими агентами и печатает профиль выживаемости, распределение
// мест, разброс силы/золота и насыщение билда.
//
// Главное требование R10: симулятор обязан играть ЛЕГАЛЬНЫЙ ПОЛНЫЙ забег — тот же, в который
// играет человек. Прошлая версия этого не делала и потому мерила не ту игру: сила считалась без
// редкости героев и без тактик, награды всегда брались золотом, рероллы/улучшения качества/
// Camp Actions не разыгрывались вовсе. Композиция силы здесь ОБЯЗАНА совпадать с runStore
// (`economy.modifiers + tactics.modifiers + rarityModifiers`, минус штраф босса) — расхождение
// означает, что все откалиброванные по симулятору числа неверны.
//
// Запуск:
//   npm run sim -- 500                 прогон на текущей лестнице
//   npm run sim -- 300 --seasons       сравнение сезонов 20 / 25 / 30 этапов (вход для R6.1/R6.4)
//   npm run sim -- 200 --finales       сравнение кривых финалов актов (R6.4, PRD §10.I)
//   npm run sim -- 100 --dynasty       забег продолжается в Династию (R6.3): глубина продолжения
//   npm run sim -- 150 --dynasty --no-sinks   то же без поздних синков (T5.9), для A/B на общих сидах
//   NOBOSS=1 npm run sim -- 500        без боссов, для сравнения
//   NOEDITIONS=1 npm run sim -- 400    без зарядов Editions (эквивалент b1.26) — для A/B
import { isMutatorId, type MutatorId } from "../src/game/dynastyMutators.ts";
import { normalizePlaybook } from "../src/game/playbook.ts";
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { ACT_LENGTH, AnteRunEngine, buildSeason, effectiveStageTarget, grantsDynastyTitle, marketCostFactor, SEASON, type SeasonModel } from "../src/game/anteRun.ts";
import {
  ECONOMY,
  RunEconomy,
  tradeInRarity,
  type Offer,
  type OfferKind,
  type SummandModifiers,
} from "../src/game/anteEconomy.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../src/game/anteMarket.ts";
import { buildTacticContext, evaluateTactics, tacticRarityFactor, type TacticEvaluation } from "../src/game/tactics.ts";
import { rarityModifiers, upgradeCost } from "../src/game/heroRarity.ts";
import { pairScore } from "../src/game/assign.ts";
import { heroStatsForAssignment, signatureLookup } from "../src/game/score.ts";
import type { Rarity } from "../src/game/rarity.ts";
import { activeCardIds, evaluateRunPower, runModifiers, stageStrength as runStageStrength } from "../src/game/runStrength.ts";
import { evaluateItems, protectedBossPenalty } from "../src/game/items.ts";
import { bannedHeroesForStage, bossForStage, evaluateBoss, type BossId } from "../src/game/bossConditions.ts";
import { BALANCE_CONFIG_VERSION } from "../src/game/balance.ts";
import { Rng } from "../src/game/rng.ts";
import type { RunConfig } from "../src/game/packs.ts";
import type { PlacementKey } from "../src/game/tournament.ts";

const data = loadGameData();
/** Stakes (T6.4/T6.4-2) для замера: STAKE=tighterTargets или STAKE=uncappedBoss,doubleBans
 *  npm run sim -- 400. Пустой env — без Stakes; неизвестный id — ошибка, а не молчаливый базовый
 *  прогон под видом замера. */
const simStakes: MutatorId[] = (process.env.STAKE ?? "").split(/[.,]/).filter(Boolean).map((raw) => {
  if (!isMutatorId(raw)) throw new Error(`Неизвестный Stake: ${raw}`);
  return raw;
});
/** Playbook (T6.4-2) для A/B: PLAYBOOK=widePool.blackKingBar.… (6–10 карт). Неверный набор —
 *  ошибка, а не молчаливый прогон с полным пулом. */
const simPlaybook = process.env.PLAYBOOK
  ? normalizePlaybook(process.env.PLAYBOOK.split(/[.,]/).filter(Boolean))
  : undefined;
if (process.env.PLAYBOOK && !simPlaybook) throw new Error(`Неверный Playbook: ${process.env.PLAYBOOK}`);
const config: RunConfig = {
  draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto", hardMode: false,
  ...(simStakes.length ? { stakes: simStakes } : {}),
  ...(simPlaybook ? { playbook: simPlaybook } : {}),
};
const useBoss = !process.env.NOBOSS;
// A/B-переключатель Editions (R13.5): NOEDITIONS=1 выключает НАЧИСЛЕНИЕ и УЧЁТ зарядов — это
// поведенческий эквивалент b1.26 на тех же сидах (дроп-ролл идёт отдельным потоком и карточные
// награды не сдвигает, поэтому выключать сам дроп не нужно).
const useEditions = !process.env.NOEDITIONS;
/** Тир предмета за золото (LG3-хвост): NOITEMUP=1 выключает рычаг — A/B на общих сидах. */
const useItemUpgrades = !process.env.NOITEMUP;
/** Поздние синки (T5.9). Выключаются флагом, чтобы их эффект мерился НА ТЕХ ЖЕ сидах и агентах:
 *  разница профиля тогда принадлежит синкам, а не выборке (методика R6.4). */
const useSinks = !process.argv.includes("--no-sinks");
/** Насколько глубоко симулятор играет Династию (R6.3). Бесконечная фаза не должна означать
 *  бесконечный прогон, поэтому у измерения есть потолок — он же читается как «дальше не мерили». */
const DYNASTY_DEPTH_CAP = 25;

// ─────────────────────────────── сила билда (зеркало runStore) ───────────────────────────────

function tacticsOf(engine: RunEngine, economy: RunEconomy): TacticEvaluation | null {
  const score = engine.score();
  if (!score) return null;
  const ctx = buildTacticContext(
    engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex,
  );
  // Заряды Charged-карт (R13.5) — как в игре, иначе симулятор мерил бы незаряженный билд.
  return evaluateTactics(economy.equippedTactics, ctx, useEditions ? economy.cardCharges : {});
}

/** Композиция слоёв — общая с игрой (game/runStrength.ts). Складывать их здесь «своей» суммой
 *  нельзя: именно так эта копия однажды разъехалась и симулятор мерил билд без редкости и тактик. */
function strengthInput(engine: RunEngine, economy: RunEconomy, tactics: TacticEvaluation | null) {
  return {
    economy: economy.modifiers(),
    tactics: tactics?.modifiers ?? null,
    heroRarity: economy.heroRarity,
    activeHeroes: engine.heroes,
    rarityFactor: tacticRarityFactor(economy.equippedTactics),
  };
}

function effectiveMods(
  engine: RunEngine, economy: RunEconomy, tactics: TacticEvaluation | null,
): SummandModifiers {
  return runModifiers(strengthInput(engine, economy, tactics));
}

function bossPenalty(
  engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number,
  mods: SummandModifiers, bossId: BossId | null,
): number {
  const score = engine.score();
  if (!score || !bossId) return 0;
  const raw = evaluateBoss(bossId, {
    seed,
    absoluteStageIndex: stageIndex,
    base: score.base + mods.base,
    heroSynergy: score.heroSynergy + mods.heroSynergy,
    chemistry: score.chemistry + mods.chemistry,
    playerOvrs: engine.players.map((p) => p.ovr),
    activeHeroes: engine.heroes,
    bannedHeroes: bannedHeroesForStage(seed, stageIndex, engine.allFormatHeroes, economy.bossRerollsFor(stageIndex), simStakes),
    stakes: simStakes,
    // Через тот же `buildTacticContext`, что и игра: иначе симулятор мерил бы другое условие.
    ...(() => {
      const ctx = buildTacticContext(
        engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex,
      );
      return {
        assignedHeroGames: ctx.players.map((player) => player.assignedHeroGames),
        pairCoGames: ctx.pairs.map((pair) => pair.games),
      };
    })(),
  }).penalty;
  // Защита предметами — как в игре (R8.3), иначе симулятор мерил бы более тяжёлых боссов.
  // Tempered (LG4): активность — те же activeCardIds, что заряды; сим обязан судить как store.
  const items = itemsOf(engine, economy);
  const editions = economy.cardEditions;
  const activeTempered = [...activeCardIds(tacticsOf(engine, economy), items)]
    .filter((id) => editions[id] === "tempered").length;
  return protectedBossPenalty(raw, items, activeTempered);
}

/** Вклад экипированных предметов при текущем ростере. Тир карточек обязателен: без него симулятор
 *  мерил бы более слабый билд, чем играет игрок, — ровно тот дефект трёх копий, который R10 уже
 *  чинил для редкости героев и тактик. */
function itemsOf(engine: RunEngine, economy: RunEconomy) {
  return evaluateItems(economy.equippedTactics, {
    activeHeroes: engine.heroes,
    cardRarity: economy.cardRarity,
    cardCharges: useEditions ? economy.cardCharges : {},
  });
}

/** Итоговая сила состава на этапе — то, что уезжает в поле турнира. Через тот же слой, что игра
 *  (включая слои Tournament Power, R8.2): второй копии этой формулы здесь быть не должно. */
function stageStrength(engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number): number {
  const score = engine.score();
  if (!score) return 0;
  const tactics = tacticsOf(engine, economy);
  const mods = effectiveMods(engine, economy, tactics);
  const bossId = useBoss ? bossForStage(seed, stageIndex, economy.bossRerollsFor(stageIndex), simStakes) : null;
  const items = itemsOf(engine, economy);
  return runStageStrength(score.teamOvr, strengthInput(engine, economy, tactics), {
    bossPenalty: bossPenalty(engine, economy, seed, stageIndex, mods, bossId),
    power: { flat: items.flat, additive: items.additive, xMults: items.xMults },
  });
}

// ─────────────────────────────────────── агенты ───────────────────────────────────────

interface Decision {
  boss: BossId | null;
  gold: number;
  /** Этапов осталось до конца сезона — экономические агенты решают, когда прекращать копить. */
  stagesLeft: number;
  rng: Rng;
}

interface Agent {
  name: string;
  /** Веса слагаемых при оценке покупки. */
  weights: { base: number; hero: number; chem: number };
  /** Порядок предпочтения наград; первый доступный и берётся. */
  rewardPref: readonly OfferKind[];
  /** Сколько золота агент держит «в резерве» ради процентов (economy-first). */
  holdGold: number;
  /** Максимум реролов рынка за Буткемп. */
  maxRerolls: number;
  /** Улучшать ли качество активных героев за золото. */
  buysQuality: boolean;
  /** Учитывать ли правило босса при оценке покупки. */
  bossAware: boolean;
  /** Оценивать оффер по ИТОГОВОЙ силе (с редкостью/тактиками), а не по сырой дельте счёта. */
  powerAware?: boolean;
  /** Случайный агент: берёт что попало из доступного. */
  random?: boolean;
  /** Контроль: не покупает ничего. */
  passive?: boolean;
  /** Оптимизирующий драфт героев (T6.4-остаток): pairScore-маргинал вместо packHeroes[0]. */
  optDraft?: boolean;
  /** Отбор карточных наград по приросту силы (A/B Playbook, 2026-09-02): карта без прироста
   *  СЕЙЧАС (условие не выполнено, только цена) пропускается в пользу следующего предпочтения.
   *  Без этого агент — «слепой коллекционер», и фиксированный набор карт мерит его слепоту. */
  selectCards?: boolean;
}

const AGENTS: Agent[] = [
  // Контрольный «пол» PRD: статичный состав должен жить до середины и почти не выигрывать.
  {
    name: "static", weights: { base: 0, hero: 0, chem: 0 }, rewardPref: ["gold"],
    holdGold: 0, maxRerolls: 0, buysQuality: false, bossAware: false, passive: true,
  },
  // Нижняя граница: покупает что попало из того, что по карману.
  {
    name: "random", weights: { base: 1, hero: 1, chem: 1 }, rewardPref: ["gold", "item", "tactic", "action", "reroll", "quality"],
    holdGold: 0, maxRerolls: 1, buysQuality: false, bossAware: false, random: true,
  },
  // Жадность по сырому Team OVR — не видит ни редкости, ни условий тактик.
  {
    name: "naive-ovr", weights: { base: 1, hero: 1, chem: 1 }, rewardPref: ["gold"],
    holdGold: 0, maxRerolls: 0, buysQuality: false, bossAware: false,
  },
  // Жадность по ИТОГОВОЙ силе: покупка оценивается с учётом редкости входящего героя и пересчёта
  // условных тактик. Слои Tournament Power (R8.2) уже в контракте, но источников у них нет до R8.3,
  // поэтому «greedy Tournament Power» из плана R10 пока совпадает с этим агентом.
  {
    name: "greedy-power", weights: { base: 1, hero: 1, chem: 1 }, rewardPref: ["gold"],
    holdGold: 0, maxRerolls: 1, buysQuality: true, bossAware: false, powerAware: true,
  },
  // Экономика: копит ради процентов, тратит ближе к финалу, охотно берёт токены.
  {
    name: "economy-first", weights: { base: 1, hero: 1, chem: 1 }, rewardPref: ["gold", "reroll", "quality"],
    holdGold: 12, maxRerolls: 0, buysQuality: false, bossAware: false, powerAware: true,
  },
  // Билд: приоритет карточкам и связкам, адаптируется к боссу.
  {
    // "slot" стоит ПОСЛЕ карточных наград: пока слоты не полны, карты берутся сами; при полных
    // слотах карточные chooseReward отказывают, и агент падает на оффер шестого слота (LG2).
    name: "synergy-build", weights: { base: 1, hero: 1.3, chem: 1.6 }, rewardPref: ["item", "tactic", "action", "slot", "quality", "gold"],
    holdGold: 0, maxRerolls: 1, buysQuality: true, bossAware: true, powerAware: true,
  },
  // Тот же билд-агент, но с оптимизирующим драфтом героев (T6.4-остаток): появился ради правил,
  // которые жадный packHeroes[0] не отыгрывает (Wide Pool, supply-оси). Разница с synergy-build —
  // ровно одна ось, сравнение этих двух строк и есть цена осознанного хиро-драфта.
  {
    name: "synergy-opt", weights: { base: 1, hero: 1.3, chem: 1.6 }, rewardPref: ["item", "tactic", "action", "slot", "quality", "gold"],
    holdGold: 0, maxRerolls: 1, buysQuality: true, bossAware: true, powerAware: true, optDraft: true,
  },
  // Верхняя граница ЖАДНОЙ игры (не истинный оптимум): лучшая по замеру политика наград плюс все
  // рычаги — качество, рероллы, адаптация к боссу. Политика наград здесь ВЫБРАНА ИЗМЕРЕНИЕМ:
  // приоритет карточек лишает агента золота и роняет win-rate почти вдвое (см. synergy-build).
  // Билд с отбором: synergy-opt, но карту берёт только если она усиливает состав прямо сейчас.
  // Нижняя граница осмысленного выбора карт человеком — для честного A/B Playbook.
  {
    name: "select-build", weights: { base: 1, hero: 1.3, chem: 1.6 }, rewardPref: ["item", "tactic", "action", "slot", "quality", "gold"],
    holdGold: 0, maxRerolls: 1, buysQuality: true, bossAware: true, powerAware: true, optDraft: true, selectCards: true,
  },
  {
    name: "greedy-oracle", weights: { base: 1, hero: 1, chem: 1 }, rewardPref: ["gold"],
    holdGold: 0, maxRerolls: 2, buysQuality: true, bossAware: true, powerAware: true,
  },
];

function offerDelta(offer: Offer) {
  const a = offer.preview!.after;
  const b = offer.preview!.before;
  return { base: a.base - b.base, hero: a.heroSynergy - b.heroSynergy, chem: a.chemistry - b.chemistry };
}

/** Ценность оффера для агента. `powerAware` добавляет вклад редкости входящего героя — сырой
 *  preview движка её не содержит, и без этого агент систематически недооценивал hero-карты. */
function valueOf(agent: Agent, offer: Offer, decision: Decision): number {
  if (agent.passive) return -1;
  if (agent.random) return decision.rng.float();
  const d = offerDelta(offer);
  const boss = agent.bossAware ? decision.boss : null;
  const chemW = boss === "chemistryBlackout" ? 0 : agent.weights.chem;
  const baseW = boss === "baseFloor" || boss === "unbalancedRoster" ? agent.weights.base * 1.5 : agent.weights.base;
  const heroW = boss === "heroSynergyDemand" || boss === "heroBan" ? agent.weights.hero * 1.5 : agent.weights.hero;
  let value = d.base * baseW + d.hero * heroW + d.chem * chemW;
  if (agent.powerAware && offer.kind === "hero" && offer.heroSwap) {
    const incoming: Rarity = offer.heroSwap.incomingRarity ?? "common";
    value += rarityModifiers({ x: incoming }, [Number.NaN]).heroSynergy;
  }
  return value;
}

// ───────────────────────────────────── прогон забега ─────────────────────────────────────

/** Состояние лагеря НА ВХОДЕ, до покупок (T5.9). Обычные метрики отвечают «сколько купили», а
 *  нужен был ответ на «почему не купили»: гипотеза «рынок на глубине тонкий» оказалась неверной —
 *  он НАСЫЩЕН (карты есть, плюса нет, качество и слоты на максимуме). Копится по всем агентам
 *  прогона: это профиль лагеря, а не агента. */
interface CampDiagnostic {
  dynasty: boolean;
  /** Индекс этапа лагеря — для разбивки по актам (LG5): среднее по сезону прятало позднюю игру. */
  campStageIndex: number;
  gold: number;
  offers: number;
  /** Карт с положительной ценностью для агента и из них — по карману. */
  positive: number;
  affordable: number;
  /** Лучшая дельта Team OVR на рынке: потолок того, что вообще можно купить. */
  bestDelta: number;
  rarityMaxed: boolean;
  slotsFull: boolean;
  /** Есть улучшение качества по карману (включая бесплатные токены). */
  qualityUpAffordable: boolean;
  /** Есть trade-in с положительной дельтой по карману (LG1). Считается ЛЕНИВО — только когда
   *  других осмысленных действий нет: полный перебор в каждом лагере удорожал бы прогон вдвое,
   *  а интересен он ровно там, где иначе лагерь «пуст». */
  tradePositive: boolean;
}

/** «Осмысленное действие» лагеря (метрика приёмки R12.6): покупка с плюсом по карману, доступное
 *  улучшение качества или trade-in с плюсом. */
function meaningful(r: CampDiagnostic): boolean {
  return r.affordable > 0 || r.qualityUpAffordable || r.tradePositive;
}

const campDiag: CampDiagnostic[] = [];

function recordCampDiagnostic(
  engine: RunEngine, economy: RunEconomy, agent: Agent, decision: Decision, stageCount: number,
): void {
  const view = economy.campView();
  const cards = view.marketOffers.filter((o) => (o.kind === "player" || o.kind === "hero") && o.preview);
  const deltas = cards.map((o) => {
    const d = offerDelta(o);
    return d.base + d.hero + d.chem;
  });
  const positive = cards.filter((o) => valueOf(agent, o, decision) > 0);
  const affordableCount = positive.filter((o) => o.cost <= economy.gold).length;
  const qualityUp = engine.heroes.some((h) => {
    const cost = upgradeCost(economy.rarityOf(h));
    return cost != null && (view.freeRarityUpgrades > 0 || cost <= economy.gold);
  });
  // Лениво: trade-in проверяется только у «пустых» лагерей (см. CampDiagnostic.tradePositive).
  let tradePositive = false;
  if (!affordableCount && !qualityUp && ECONOMY.tradeInCost <= economy.gold) {
    outer: for (const outId of economy.equippedTactics) {
      for (const inId of economy.currentTradeOffers()) {
        const delta = tradePowerDelta(engine, economy, outId, inId);
        if (delta != null && delta > 0) { tradePositive = true; break outer; }
      }
    }
  }
  campDiag.push({
    dynasty: view.campStageIndex > stageCount,
    campStageIndex: view.campStageIndex,
    gold: economy.gold,
    offers: cards.length,
    positive: positive.length,
    affordable: affordableCount,
    bestDelta: deltas.length ? Math.max(...deltas) : 0,
    rarityMaxed: engine.heroes.every((h) => upgradeCost(economy.rarityOf(h)) == null),
    slotsFull: view.equippedTactics.length >= view.tacticSlots,
    // Токен бесплатного улучшения без улучшаемого героя — не действие: в Династии токены титулов
    // копятся при героях на максимуме, и без проверки cost != null метрика давала ложные 95%.
    qualityUpAffordable: qualityUp,
    tradePositive,
  });
}

interface CampStat {
  /** Лагерь ЗА пределами сезона (Династия, R6.3) — рынок там упирается в потолок ростера. */
  dynasty: boolean;
  goldAfter: number;
  buys: number;
  rerolls: number;
  qualityUpgrades: number;
  /** Trade-in обменов (LG1). */
  trades: number;
  /** Поздние синки (T5.9): куплено сборов и смен правила в этом лагере. */
  preps: number;
  bossRerolls: number;
  /** Куплено игроков с OVR ≥ 90 (R5.3, цена звёзд) — по умолчанию 0 у лагерей без покупок. */
  starBuys?: number;
  /** Куплено тиров предметов (LG3-хвост). */
  itemUpgrades?: number;
}

interface RunResult {
  outcome: "won" | "lost";
  /** Сезон выигран (R6.3). Отдельно от outcome: в Династии забег заканчивается поражением,
   *  но победа сезона при этом остаётся засчитанной. */
  seasonWon: boolean;
  /** Этап, на котором забег закончился (0-based). */
  stage: number;
  placements: PlacementKey[];
  draftOvr: number;
  finalStrength: number;
  /** Штраф босса на последнем сыгранном этапе — признак «умер под правилом». */
  lostUnderBoss: boolean;
  tacticsEquipped: number;
  upgradedHeroes: number;
  camps: CampStat[];
  /** Editions (LG5): сколько Charged-карт стоит в билде к концу, сумма зарядов и число
   *  пройденных этапов, где хотя бы одна Charged была АКТИВНА (копила заряд). */
  chargedTaken: number;
  chargesEnd: number;
  chargedActiveStages: number;
  /** Tempered (LG4): сколько защитных карт стоит в билде к концу забега. */
  temperedTaken: number;
}

function greedyDraft(engine: RunEngine): void {
  let guard = 0;
  while (!engine.isComplete && guard++ < 40) {
    if (engine.rosterFilled < 5) {
      let bestIdx = -1;
      let bestOvr = -1;
      engine.currentPack.candidates.forEach((c, i) => {
        if (engine.canPickPlayer(i) && c.player.ovr > bestOvr) { bestOvr = c.player.ovr; bestIdx = i; }
      });
      if (bestIdx >= 0) { engine.pickPlayer(bestIdx); continue; }
      if (engine.rerollsLeft > 0) { engine.reroll(); continue; }
      break;
    }
    const hero = engine.packHeroes[0];
    if (hero != null) { engine.pickHero(hero); continue; }
    break;
  }
}

/** Оптимизирующий драфт героев (T6.4-остаток). Игроки — как у жадного (лучший OVR в открытую
 *  роль), но герой берётся не первым из пака, а по лучшему МАРГИНАЛЬНОМУ вкладу той же кривой
 *  `pairScore`, что боевой Hungarian: кандидат оценивается лучшим улучшением поверх уже покрытых
 *  взятыми героями игроков. Жадный `packHeroes[0]` не отыгрывает никакое условие на героев —
 *  из-за этого supply-правила и Wide Pool сим-агентом не измерялись (структурный вывод T6.4). */
function optimizingDraft(engine: RunEngine): void {
  const phs = heroStatsForAssignment(data);
  let guard = 0;
  while (!engine.isComplete && guard++ < 40) {
    if (engine.rosterFilled < 5) {
      let bestIdx = -1;
      let bestOvr = -1;
      engine.currentPack.candidates.forEach((c, i) => {
        if (engine.canPickPlayer(i) && c.player.ovr > bestOvr) { bestOvr = c.player.ovr; bestIdx = i; }
      });
      if (bestIdx >= 0) { engine.pickPlayer(bestIdx); continue; }
      if (engine.rerollsLeft > 0) { engine.reroll(); continue; }
      break;
    }
    const roster = engine.rosterView.flatMap((slot) => (slot.candidate ? [slot.candidate] : []));
    const signatures = signatureLookup(engine.rosterView.map((slot) => slot.candidate ?? null));
    // Лучшее покрытие каждого игрока уже взятыми героями: новый герой ценен тем, насколько он
    // поднимает ЧЬЁ-ТО покрытие, а не суммой игр (второй герой того же игрока почти бесполезен).
    const covered = new Map<number, number>();
    for (const candidate of roster) {
      const accountId = candidate.player.accountId;
      covered.set(accountId, Math.max(0, ...engine.heroes.map(
        (heroId) => pairScore(accountId, heroId, phs, signatures),
      )));
    }
    let best: number | null = null;
    let bestGain = -Infinity;
    for (const heroId of engine.packHeroes) {
      let gain = 0;
      for (const candidate of roster) {
        const accountId = candidate.player.accountId;
        gain = Math.max(gain, pairScore(accountId, heroId, phs, signatures) - (covered.get(accountId) ?? 0));
      }
      if (gain > bestGain) { bestGain = gain; best = heroId; }
    }
    if (best == null) break;
    engine.pickHero(best);
  }
}

function prepareMarket(engine: RunEngine, economy: RunEconomy, seed: string, stageCount: number): void {
  const st = economy.snapshot;
  economy.prepareMarketOffers(buildAnteMarketRoulette(
    engine, seed, st.campStageIndex, st.marketRerolls, economy.equippedTactics,
    { rarityDrops: economy.rarityDropsEnabled, stageCount, heroRarity: economy.heroRarity, stakes: simStakes },
  ));
}

/** Взять награду по предпочтению агента. Карточка занимает слот, поэтому при полном наборе
 *  падаем на следующий вид — иначе агент «выбирал» бы недоступное и терял награду вовсе. */
/** Прирост силы от карточной награды ПРЯМО СЕЙЧАС — тем же evaluateRunPower, что у trade-in.
 *  Улучшение тира своей карты считается за прирост всегда. */
function rewardPowerDelta(engine: RunEngine, economy: RunEconomy, offer: Offer): number | null {
  if (!offer.cardId || (offer.kind !== "item" && offer.kind !== "tactic")) return null;
  if (offer.cardUpgrade) return 1;
  const score = engine.score();
  if (!score) return null;
  const state = {
    score: { base: score.base, heroSynergy: score.heroSynergy, chemistry: score.chemistry },
    tacticContext: buildTacticContext(engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex),
    activeHeroes: engine.heroes,
    heroRarity: economy.heroRarity,
  };
  const buildOf = (equipped: readonly string[], rarity: Record<string, Rarity>) => ({
    economy: economy.modifiers(), equippedCards: [...equipped], cardRarity: rarity, cardCharges: economy.cardCharges,
  });
  const now = evaluateRunPower(state, buildOf(economy.equippedTactics, economy.cardRarity)).power.total;
  const rarityAfter = { ...economy.cardRarity, ...(offer.cardRarity ? { [offer.cardId]: offer.cardRarity } : {}) };
  const after = evaluateRunPower(state, buildOf([...economy.equippedTactics, offer.cardId], rarityAfter)).power.total;
  return after - now;
}

/** Прирост силы от следующего тира предмета в слоте — тем же evaluateRunPower, что игра. */
function itemUpgradePowerDelta(engine: RunEngine, economy: RunEconomy, cardId: string): number | null {
  const current = economy.cardRarity[cardId] ?? "common";
  const next = nextTier(current);
  const score = engine.score();
  if (!score || next === current) return null;
  const state = {
    score: { base: score.base, heroSynergy: score.heroSynergy, chemistry: score.chemistry },
    tacticContext: buildTacticContext(engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex),
    activeHeroes: engine.heroes,
    heroRarity: economy.heroRarity,
  };
  const buildOf = (rarity: Record<string, Rarity>) => ({
    economy: economy.modifiers(), equippedCards: [...economy.equippedTactics], cardRarity: rarity, cardCharges: economy.cardCharges,
  });
  const now = evaluateRunPower(state, buildOf(economy.cardRarity)).power.total;
  const after = evaluateRunPower(state, buildOf({ ...economy.cardRarity, [cardId]: next })).power.total;
  return after - now;
}

function takeReward(engine: RunEngine, economy: RunEconomy, agent: Agent, decision: Decision): void {
  const offers = economy.campView().rewardOffers;
  const order = agent.random
    ? decision.rng.shuffle([...offers]).map((o) => o.kind)
    : agent.rewardPref;
  for (const kind of order) {
    const offer = offers.find((o) => o.kind === kind);
    if (!offer) continue;
    if (!economy.canTakeCard(offer.kind)) continue;
    if (agent.selectCards) {
      const delta = rewardPowerDelta(engine, economy, offer);
      if (delta !== null && delta <= 0.01) continue;
    }
    if (economy.chooseReward(offer.id)) return;
  }
  for (const offer of offers) if (economy.chooseReward(offer.id)) return;
}

type Action =
  | { kind: "market"; offer: Offer; value: number; cost: number }
  | { kind: "quality"; heroId: number; value: number; cost: number }
  | { kind: "trade"; outId: string; inId: string; value: number; cost: number }
  | { kind: "itemUpgrade"; cardId: string; value: number; cost: number };

/** Run power билда с подменённой картой (LG1) — тем же runStrength-слоем, что играет игра.
 *  null — состава ещё нет. */
function tradePowerDelta(
  engine: RunEngine, economy: RunEconomy, outId: string, inId: string,
): number | null {
  const score = engine.score();
  if (!score) return null;
  const state = {
    score: { base: score.base, heroSynergy: score.heroSynergy, chemistry: score.chemistry },
    tacticContext: buildTacticContext(
      engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex,
    ),
    activeHeroes: engine.heroes,
    heroRarity: economy.heroRarity,
  };
  const buildOf = (equipped: readonly string[], rarity: Record<string, Rarity>, charges: Record<string, number>) => ({
    economy: economy.modifiers(), equippedCards: [...equipped], cardRarity: rarity, cardCharges: charges,
  });
  const now = evaluateRunPower(state, buildOf(economy.equippedTactics, economy.cardRarity, economy.cardCharges)).power.total;
  const equippedAfter = economy.equippedTactics.map((c) => (c === outId ? inId : c));
  const rarityAfter = { ...economy.cardRarity };
  const outgoingRarity = rarityAfter[outId] ?? "common";
  delete rarityAfter[outId];
  const incomingRarity = tradeInRarity(outgoingRarity);
  if (incomingRarity !== "common") rarityAfter[inId] = incomingRarity;
  const chargesAfter = { ...economy.cardCharges };
  delete chargesAfter[outId];
  const after = evaluateRunPower(state, buildOf(equippedAfter, rarityAfter, chargesAfter)).power.total;
  return after - now;
}

/** Все покупки Буткемпа, сведённые к одной шкале.
 *
 *  Раньше рынок и улучшение качества жили в двух независимых проходах, и «оракул» стабильно
 *  проигрывал наивному агенту: он спускал золото на дешёвые улучшения (+0.6 Hero Synergy) вместо
 *  замены игрока на несколько очков Team OVR. Это была не находка про игру, а дефект агента.
 *  Теперь действия конкурируют между собой; жадный выбор идёт по отдаче на золото (классическая
 *  аппроксимация рюкзака — поэтому «верхняя граница ЖАДНОЙ игры», а не истинный оптимум). */
function availableActions(
  engine: RunEngine, economy: RunEconomy, agent: Agent, decision: Decision, budget: number,
): Action[] {
  const actions: Action[] = [];
  for (const offer of economy.campView().marketOffers) {
    if ((offer.kind !== "player" && offer.kind !== "hero") || !offer.preview) continue;
    const free = offer.kind === "player" && economy.snapshot.freePlayerSwaps > 0;
    const cost = free ? 0 : offer.cost;
    if (cost > budget) continue;
    const value = valueOf(agent, offer, decision);
    if (value <= 0) continue;
    actions.push({ kind: "market", offer, value, cost });
  }
  if (agent.buysQuality) {
    const freeUpgrade = economy.campView().freeRarityUpgrades > 0;
    for (const heroId of engine.heroes) {
      const current = economy.rarityOf(heroId);
      const cost = upgradeCost(current);
      if (cost == null) continue;
      if (!freeUpgrade && cost > budget) continue;
      const next = rarityModifiers({ x: nextTier(current) }, [Number.NaN]).heroSynergy;
      const now = rarityModifiers({ x: current }, [Number.NaN]).heroSynergy;
      actions.push({ kind: "quality", heroId, value: (next - now) * agent.weights.hero, cost: freeUpgrade ? 0 : cost });
    }
  }
  // Тир предмета за золото (LG3-хвост): та же шкала, что у остальных покупок — прирост силы
  // забега от следующего тира. NOITEMUP=1 выключает рычаг для A/B на общих сидах.
  if (useItemUpgrades && agent.powerAware) {
    for (const cardId of economy.equippedTactics) {
      const cost = economy.itemUpgradeCost(cardId);
      if (cost == null || cost > budget) continue;
      const delta = itemUpgradePowerDelta(engine, economy, cardId);
      if (delta == null || delta <= 0) continue;
      actions.push({ kind: "itemUpgrade", cardId, value: delta, cost });
    }
  }
  // Trade-in (LG1): смена оси конкурирует с покупками за то же золото. Ценность — дельта силы
  // после обмена тем же runStrength-слоем; отрицательные обмены агент не делает (value-фильтр
  // общий). Не для random/passive: у них нет модели ценности.
  if (!agent.passive && !agent.random && ECONOMY.tradeInCost <= budget) {
    for (const outId of economy.equippedTactics) {
      for (const inId of economy.currentTradeOffers()) {
        const delta = tradePowerDelta(engine, economy, outId, inId);
        if (delta == null || delta <= 0) continue;
        actions.push({ kind: "trade", outId, inId, value: delta, cost: ECONOMY.tradeInCost });
      }
    }
  }
  return actions;
}

function nextTier(current: Rarity): Rarity {
  const order: Rarity[] = ["common", "unique", "mythic", "immortal"];
  return order[Math.min(order.length - 1, order.indexOf(current) + 1)];
}

/** Один Буткемп: покупки рынка и улучшения качества конкурируют за одно золото, при исчерпании
 *  полезных действий — реролл в рамках лимита агента. */
function shopCamp(
  engine: RunEngine, economy: RunEconomy, seed: string, agent: Agent, decision: Decision, stageCount: number,
  season: SeasonModel,
): { buys: number; rerolls: number; qualityUpgrades: number; trades: number; starBuys: number; itemUpgrades: number } {
  recordCampDiagnostic(engine, economy, agent, decision, stageCount);
  let buys = 0;
  let starBuys = 0;
  let itemUpgrades = 0;
  let rerolls = 0;
  let qualityUpgrades = 0;
  let trades = 0;
  let guard = 0;

  while (guard++ < 30) {
    if (!engine.score()) break;
    // Economy-first держит подушку ради процентов, но у финала сезона копить уже не для чего.
    const reserve = decision.stagesLeft <= 1 ? 0 : agent.holdGold;
    const budget = Math.max(0, economy.gold - reserve);
    const actions = availableActions(engine, economy, agent, decision, budget);

    if (!actions.length) {
      if (rerolls >= agent.maxRerolls) break;
      const view = economy.campView();
      if (view.freeMarketRerolls === 0 && view.rerollCost > budget) break;
      if (!economy.rerollMarket()) break;
      rerolls += 1;
      prepareMarket(engine, economy, seed, stageCount);
      continue;
    }

    // Выбор — по максимальному ПРИРОСТУ, а не по отдаче на золото. Отдача-на-золото выглядит
    // разумнее, но при бюджете Буткемпа в 6–11 золота она системно набирает пачку дешёвых
    // улучшений качества (+0.6 Hero Synergy за 3) вместо одной замены игрока на несколько очков
    // Team OVR — и «оракул» стабильно проигрывал наивному агенту. Замерено, а не угадано.
    const best = actions.reduce((top, a) => (a.value > top.value ? a : top));

    if (best.kind === "quality") {
      if (!economy.upgradeHeroRarity(best.heroId)) break;
      qualityUpgrades += 1;
      continue;
    }

    if (best.kind === "itemUpgrade") {
      if (!economy.upgradeItemTier(best.cardId)) break;
      itemUpgrades += 1;
      continue;
    }

    if (best.kind === "trade") {
      if (!economy.tradeCard(best.outId, best.inId)) break;
      trades += 1;
      // Как в игре (runStore.tradeCard): смена карты билда меняет market trade-off'ы.
      prepareMarket(engine, economy, seed, stageCount);
      continue;
    }

    const offer = best.offer;
    try {
      if (offer.kind === "player" && offer.playerSwap) {
        const incoming = engine.candidateByRef(offer.playerSwap.incoming);
        const slotHolder = engine.rosterView[offer.playerSwap.slotIndex].candidate;
        if (!incoming || slotHolder?.player.accountId !== offer.playerSwap.outgoingAccountId) break;
        if (!economy.purchaseMarket(offer.id)) break;
        engine.replacePlayer(offer.playerSwap.slotIndex, incoming);
        if (incoming.player.ovr >= 90) starBuys += 1;
      } else if (offer.kind === "hero" && offer.heroSwap) {
        if (!economy.purchaseMarket(offer.id)) break;
        engine.replaceHero(offer.heroSwap.outgoingHeroId, offer.heroSwap.incomingHeroId);
        // Тот же ролл, что делает стор при покупке: без него редкость в симуляторе не появлялась.
        economy.rollHeroRarity(offer.heroSwap.incomingHeroId, economy.snapshot.campStageIndex);
      }
      buys += 1;
      economy.replacePreparedMarketOffers(refreshAnteMarketOffers(
        engine,
        economy.campView().marketOffers,
        marketCostFactor(seed, economy.snapshot.campStageIndex, season, simStakes),
        // heroRarity здесь исторически не передавался; оставляем {} ради сопоставимости A/B —
        // повышение точности refresh-модели агентов — отдельное решение, не эта калибровка.
        {},
        economy.equippedTactics,
      ));
    } catch (error) { if (process.env.SIMDEBUG) console.error("shopCamp break:", error); break; }
  }
  return { buys, rerolls, qualityUpgrades, trades, starBuys, itemUpgrades };
}

/** Излишек золота уходит в поздние синки (T5.9). Ставится ПОСЛЕ рынка намеренно: синк обязан быть
 *  тем, что делают, когда купить больше нечего, а не заменой билду. Именно в этом состоянии живёт
 *  весь лагерь Династии — рынок там насыщен (0.08 карт с плюсом на лагерь).
 *
 *  Порядок внутри: сначала смена правила (адресная трата — снимает конкретный штраф), потом сборы
 *  (они сгорают за этап). Реролл правила берётся только если штраф РЕАЛЬНО есть: платить за смену
 *  выполненного условия незачем, а «может, выпадет полегче» — это не решение, а автоклик. */
function spendSurplus(
  engine: RunEngine, economy: RunEconomy, seed: string, agent: Agent,
): { preps: number; bossRerolls: number } {
  let preps = 0;
  let bossRerolls = 0;
  if (!useSinks || agent.passive || agent.random) return { preps, bossRerolls };
  const stageIndex = economy.snapshot.campStageIndex;

  const penaltyNow = () => {
    const tactics = tacticsOf(engine, economy);
    const mods = effectiveMods(engine, economy, tactics);
    const bossId = useBoss ? bossForStage(seed, stageIndex, economy.bossRerollsFor(stageIndex), simStakes) : null;
    return bossPenalty(engine, economy, seed, stageIndex, mods, bossId);
  };

  if (agent.bossAware) {
    // Потолок в две смены — не правило игры, а поведение агента: дальше он ушёл бы в бесконечный
    // перебор, а измерять надо разумную игру, а не эксплуатацию цены.
    while (bossRerolls < 2 && penaltyNow() > 0) {
      if (economy.gold - economy.campView().bossRerollCost < agent.holdGold) break;
      if (!economy.rerollBoss()) break;
      bossRerolls += 1;
    }
  }
  while (economy.gold - economy.campView().prepCost >= agent.holdGold) {
    if (!economy.buyPrep()) break;
    preps += 1;
  }
  return { preps, bossRerolls };
}

/** Разыграть все имеющиеся Camp Actions: они одноразовые и сгорают на следующем Буткемпе,
 *  поэтому держать их в слоте — чистая потеря. */
function playActions(economy: RunEconomy): void {
  for (const actionId of economy.campView().heldActions) economy.playCampAction(actionId);
}

function playRun(seed: string, agent: Agent, season: SeasonModel, dynasty = false): RunResult | null {
  let chargedActiveStages = 0;
  const engine = new RunEngine(data, config, seed);
  if (agent.optDraft) optimizingDraft(engine);
  else greedyDraft(engine);
  const score = engine.score();
  if (!score || !engine.isComplete) return null;

  const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "Sim", season, simStakes);
  const economy = new RunEconomy(seed);
  // Симулируем НЕ первый забег: иначе мета-гейт держит все дропы на common и профиль редкости
  // измерить нечем. Первый забег — отдельный онбординговый случай.
  economy.setRarityFlags({ drops: true, upgrades: true });
  economy.setStakes(simStakes);
  economy.setPlaybook(config.playbook);

  const camps: CampStat[] = [];
  const placements: PlacementKey[] = [];
  const rng = new Rng(`${seed}:agent:${agent.name}`);
  let guard = 0;

  const stageCount = season.stages.length;
  // Династия (R6.3) — добровольное продолжение ПОСЛЕ победы. Симулятор её играет, иначе её контент
  // пришлось бы крутить вслепую (требование R10). Глубина ограничена, чтобы прогон оставался
  // конечным: бесконечная фаза не должна означать бесконечный тест.
  while (guard++ < stageCount + DYNASTY_DEPTH_CAP + 5) {
    const stageIndex = anteRun.state.index;
    const bossId = useBoss ? bossForStage(seed, stageIndex, economy.bossRerollsFor(stageIndex), simStakes) : null;
    let phase = anteRun.resolveStage();
    if (phase === "won" && dynasty && anteRun.state.index < stageCount + DYNASTY_DEPTH_CAP - 1) {
      phase = anteRun.continueDynasty();
    }
    const placement = anteRun.state.lastPlacement;
    if (placement) placements.push(placement);

    if (phase !== "playing") {
      const tactics = tacticsOf(engine, economy);
      const mods = effectiveMods(engine, economy, tactics);
      return {
        outcome: phase,
        seasonWon: anteRun.state.seasonWon,
        stage: anteRun.state.index,
        placements,
        draftOvr: score.teamOvr,
        finalStrength: engine.score()!.teamOvr + mods.base + mods.heroSynergy + mods.chemistry,
        lostUnderBoss: phase === "lost"
          && bossPenalty(engine, economy, seed, stageIndex, mods, bossId) > 0,
        tacticsEquipped: economy.campView().equippedTactics.length,
        upgradedHeroes: engine.heroes.filter((h) => economy.rarityOf(h) !== "common").length,
        camps,
        ...editionStats(economy, chargedActiveStages),
      };
    }

    const campId = anteRun.state.index;
    // Заряды Charged-карт за пройденный этап (R13.5) — то же правило и те же sources, что в
    // runStore.openCampAfterStage; без этого симулятор мерил бы Editions как мёртвый дроп.
    if (useEditions) {
      const active = activeCardIds(tacticsOf(engine, economy), itemsOf(engine, economy));
      const editions = economy.cardEditions;
      if ([...active].some((id) => editions[id] === "charged")) chargedActiveStages += 1;
      economy.accrueCharges(active);
    }
    // Эффективный порог (мутатор круга LG3) — как в игре: премия за место судит по тому же
    // порогу, по которому этап был пройден.
    economy.awardStageClear(campId, anteRun.state.lastPlacement, effectiveStageTarget(seed, campId - 1, season, simStakes));
    // Титул Династии — по тому же правилу, что и в игре (общая grantsDynastyTitle): иначе
    // симулятор мерил бы Династию без её единственной награды.
    if (grantsDynastyTitle(campId - 1, season)) economy.awardDynastyTitle(campId);
    // Токены зачарования (LG6) тратятся тут же — как в игре: неиспользованный токен = несыгранная
    // ось, и симулятор мерил бы Династию без её единственной награды. Эвристика минимальная и
    // общая для всех агентов: Charged первой карте без Edition (рост), random — случайную ось.
    while (economy.editionTokens > 0) {
      const eligible = economy.enchantableCards();
      if (eligible.length === 0) break;
      economy.enchantCard(eligible[0], agent.random && rng.float() < 0.5 ? "tempered" : "charged");
    }
    economy.openCamp(campId);

    const decision: Decision = {
      boss: useBoss ? bossForStage(seed, campId, economy.bossRerollsFor(campId), simStakes) : null,
      gold: economy.gold,
      stagesLeft: stageCount - campId,
      rng,
    };
    takeReward(engine, economy, agent, decision);
    playActions(economy);
    prepareMarket(engine, economy, seed, stageCount);
    const shopped = shopCamp(engine, economy, seed, agent, decision, stageCount, season);
    const surplus = spendSurplus(engine, economy, seed, agent);
    camps.push({ goldAfter: economy.gold, dynasty: campId > stageCount, ...shopped, ...surplus });

    economy.leaveCamp();
    anteRun.rebuildCurrentStage(stageStrength(engine, economy, seed, anteRun.state.index));
  }

  const tactics = tacticsOf(engine, economy);
  const mods = effectiveMods(engine, economy, tactics);
  return {
    outcome: "lost", seasonWon: anteRun.state.seasonWon, stage: anteRun.state.index, placements, draftOvr: score.teamOvr,
    finalStrength: engine.score()!.teamOvr + mods.base + mods.heroSynergy + mods.chemistry,
    lostUnderBoss: false,
    tacticsEquipped: economy.campView().equippedTactics.length,
    upgradedHeroes: engine.heroes.filter((h) => economy.rarityOf(h) !== "common").length,
    camps,
    ...editionStats(economy, chargedActiveStages),
  };
}

/** Итог по Editions на конец забега (LG5): экипированные Charged, сумма их зарядов. */
function editionStats(economy: RunEconomy, chargedActiveStages: number) {
  const editions = economy.cardEditions;
  const charges = economy.cardCharges;
  const equippedCharged = economy.equippedTactics.filter((id) => editions[id] === "charged");
  return {
    chargedTaken: equippedCharged.length,
    chargesEnd: equippedCharged.reduce((sum, id) => sum + (charges[id] ?? 0), 0),
    chargedActiveStages,
    temperedTaken: economy.equippedTactics.filter((id) => editions[id] === "tempered").length,
  };
}

// ───────────────────────────────────── метрики и отчёт ─────────────────────────────────────

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

interface Report {
  agent: string;
  played: number;
  winRate: number;
  /** Доля забегов, доживших до этапа i (1-based по индексу массива). */
  survival: number[];
  strength: [number, number, number];
  gold: [number, number, number];
  buys: number;
  rerolls: number;
  /** Куплено улучшений качества за забег. */
  qualityBought: number;
  /** Сколько активных героев в итоге не common (лут + улучшения). */
  /** Куплено звёзд (OVR ≥ 90) на забег (R5.3). */
  /** Куплено тиров предметов на забег (LG3-хвост). */
  itemUpgrades: number;
  starBuys: number;
  rareHeroes: number;
  tactics: number;
  lostUnderBoss: number;
  podium: number;
  /** Куплено поздних синков (T5.9) на лагерь: сборы и смены правила. */
  preps: number;
  bossRerolls: number;
  /** Trade-in обменов на лагерь (LG1). */
  trades: number;
  /** Династия (R6.3): сколько забегов до неё дошло и насколько глубоко ушли. null — не мерили. */
  dynasty: {
    runs: number; depth: [number, number, number]; buys: number; camps: number; preps: number;
    /** Причина смерти в Династии: доля погибших под боссовым правилом (LG5). */
    bossDeaths: number; deaths: number;
  } | null;
  /** Editions (LG5): среднее Charged в билде к концу, средние заряды на карту и доля пройденных
   *  этапов с активной Charged (по забегам, где Charged вообще была взята). */
  editions: { runsWithCharged: number; avgTaken: number; avgCharges: number; activeShare: number } | null;
}

function runAgent(agent: Agent, seeds: number, season: SeasonModel, dynasty = false): Report {
  const survivedTo = Array(season.stages.length).fill(0);
  const strengths: number[] = [];
  const golds: number[] = [];
  let played = 0; let wins = 0; let bossDeaths = 0; let podium = 0;
  const dynastyDepths: number[] = [];
  let dynastyBuys = 0; let dynastyCamps = 0; let dynastyPreps = 0;
  let dynastyDeaths = 0; let dynastyBossDeaths = 0;
  let buys = 0; let rerolls = 0; let qualityBought = 0; let rareHeroes = 0; let tactics = 0; let camps = 0; let starBuys = 0; let itemUpgrades = 0;
  let preps = 0; let bossRerolls = 0; let trades = 0;
  let runsWithCharged = 0; let chargedTakenSum = 0; let chargesSum = 0;
  let chargedActiveSum = 0; let chargedStagesSum = 0; let runsWithTempered = 0; let temperedTakenSum = 0;

  for (let i = 0; i < seeds; i += 1) {
    const result = playRun(`sim-${i}`, agent, season, dynasty);
    if (!result) continue;
    played += 1;
    if (result.chargedTaken > 0) {
      runsWithCharged += 1;
      chargedTakenSum += result.chargedTaken;
      chargesSum += result.chargesEnd;
      chargedActiveSum += result.chargedActiveStages;
      chargedStagesSum += result.stage + 1;
    }
    if (result.temperedTaken > 0) {
      runsWithTempered += 1;
      temperedTakenSum += result.temperedTaken;
    }
    // Смерть в Династии (глубина > 0): причина — правило босса или само поле (LG5).
    if (result.outcome === "lost" && result.stage + 1 > season.stages.length) {
      dynastyDeaths += 1;
      if (result.lostUnderBoss) dynastyBossDeaths += 1;
    }
    strengths.push(result.finalStrength);
    tactics += result.tacticsEquipped;
    rareHeroes += result.upgradedHeroes;
    // В режиме Династии выигранный сезон продолжается и забег ВСЕГДА кончается поражением —
    // считать победы по outcome значило бы печатать 0% там, где сезон взят.
    if (result.outcome === "won" || result.seasonWon) wins += 1;
    // Глубина Династии считается по забегам, ДОШЕДШИМ до неё: иначе нули не-победителей
    // размажут медиану и «дошёл и умер сразу» будет неотличимо от «не дошёл вовсе».
    const depth = result.stage + 1 - season.stages.length;
    if (depth > 0 || result.seasonWon) dynastyDepths.push(Math.max(0, depth));
    if (result.lostUnderBoss) bossDeaths += 1;
    podium += result.placements.filter((p) => p === "1" || p === "2" || p === "3").length;
    // Забег дожил до этапа s, если он его сыграл: индекс окончания = число сыгранных − 1.
    for (let s = 0; s <= result.stage && s < season.stages.length; s += 1) survivedTo[s] += 1;
    for (const camp of result.camps) {
      golds.push(camp.goldAfter);
      buys += camp.buys; rerolls += camp.rerolls; qualityBought += camp.qualityUpgrades; camps += 1; starBuys += camp.starBuys ?? 0; itemUpgrades += camp.itemUpgrades ?? 0;
      preps += camp.preps; bossRerolls += camp.bossRerolls; trades += camp.trades;
      // Отдельно по Династии: если рынок там упирается в потолок ростера, это видно как падение
      // покупок на лагерь — гадать об этом не нужно, оно измеряется.
      if (camp.dynasty) { dynastyBuys += camp.buys; dynastyCamps += 1; dynastyPreps += camp.preps; }
    }
  }

  return {
    agent: agent.name,
    played,
    winRate: played ? wins / played : 0,
    survival: survivedTo.map((n) => (played ? n / played : 0)),
    strength: [percentile(strengths, 0.5), percentile(strengths, 0.9), percentile(strengths, 0.99)],
    gold: [percentile(golds, 0.5), percentile(golds, 0.9), percentile(golds, 0.99)],
    buys: camps ? buys / camps : 0,
    rerolls: camps ? rerolls / camps : 0,
    preps: camps ? preps / camps : 0,
    bossRerolls: camps ? bossRerolls / camps : 0,
    trades: camps ? trades / camps : 0,
    qualityBought: played ? qualityBought / played : 0,
    rareHeroes: played ? rareHeroes / played : 0,
    starBuys: played ? starBuys / played : 0,
    itemUpgrades: played ? itemUpgrades / played : 0,
    tactics: played ? tactics / played : 0,
    lostUnderBoss: played ? bossDeaths / played : 0,
    podium: played ? podium / played : 0,
    editions: runsWithCharged || runsWithTempered
      ? {
        runsWithCharged,
        avgTaken: runsWithCharged ? chargedTakenSum / runsWithCharged : 0,
        avgCharges: chargedTakenSum ? chargesSum / chargedTakenSum : 0,
        activeShare: chargedStagesSum ? chargedActiveSum / chargedStagesSum : 0,
        runsWithTempered,
        avgTempered: runsWithTempered ? temperedTakenSum / runsWithTempered : 0,
      }
      : null,
    dynasty: dynastyDepths.length
      ? {
        runs: dynastyDepths.length,
        depth: [percentile(dynastyDepths, 0.5), percentile(dynastyDepths, 0.9), Math.max(...dynastyDepths)],
        buys: dynastyCamps ? dynastyBuys / dynastyCamps : 0,
        preps: dynastyCamps ? dynastyPreps / dynastyCamps : 0,
        camps: dynastyCamps,
        deaths: dynastyDeaths,
        bossDeaths: dynastyBossDeaths,
      }
      : null,
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/** Условная проходимость финалов актов: доля забегов, которые ДОШЛИ до финала и прошли его.
 *
 *  Именно это, а не общий win%, отвечает на открытый вопрос PRD §10.I «цена одной неудачной
 *  сетки»: забег из 25 турниров, обрывающийся на одном BO5, виден здесь как провал конкретного
 *  финала, а не как размазанная по сезону смертность. Последний финал считается по win%: за ним
 *  следующего этапа нет, и «прошёл» = «выиграл сезон». */
function finalePassRates(report: Report, season: SeasonModel): Array<{ stage: number; pass: number }> {
  return season.stages
    .filter((stage) => stage.kind === "boss")
    .map((stage) => {
      const reached = report.survival[stage.index];
      const last = stage.index === season.stages.length - 1;
      const passed = last ? report.winRate : report.survival[stage.index + 1];
      return { stage: stage.index + 1, pass: reached > 0 ? passed / reached : 0 };
    });
}

function printReports(title: string, reports: Report[], season: SeasonModel): void {
  const targets = season.stages.map((stage) => stage.target);
  console.log(`\n${title}  (этапов: ${targets.length}, пороги: ${targets.join("/")})\n`);
  console.log(
    "agent           win%   survival по этапам".padEnd(38)
    + "  strength p50/p90/p99   gold p50/p90/p99  buys  rrl  qual  trd  prep  brr  rare  tac  boss-death",
  );
  for (const r of reports) {
    const survival = r.survival.map((s) => `${Math.round(100 * s)}`.padStart(3)).join(" ");
    console.log(
      r.agent.padEnd(15)
      + pct(r.winRate).padStart(6) + "   "
      + survival.padEnd(20)
      + `  ${r.strength.map((s) => s.toFixed(0)).join("/").padStart(11)}`
      + `   ${r.gold.map((g) => g.toFixed(0)).join("/").padStart(11)}`
      + `  ${r.buys.toFixed(2)}  ${r.rerolls.toFixed(2)}  ${r.qualityBought.toFixed(1).padStart(4)}`
      + `  ${r.trades.toFixed(2)}  ${r.preps.toFixed(2)}  ${r.bossRerolls.toFixed(2)}`
      + `  ${r.rareHeroes.toFixed(1).padStart(4)}  ${r.tactics.toFixed(1)}  ${pct(r.lostUnderBoss).padStart(6)}`,
    );
  }
  console.log("\nТиры предметов (LG3): куплено на забег — " + reports.map((r) => `${r.agent} ${r.itemUpgrades.toFixed(2)}`).join(" · "));
  console.log("\nЗвёзды (R5.3): куплено игроков OVR ≥ 90 на забег — " + reports.map((r) => `${r.agent} ${r.starBuys.toFixed(2)}`).join(" · "));
  if (reports.some((r) => r.dynasty)) {
    console.log("\nДинастия (из выигравших сезон): забегов · глубина p50/p90/max · покупок на лагерь (сезон → Династия)");
    for (const r of reports) {
      if (!r.dynasty) continue;
      console.log(
        `${r.agent.padEnd(15)}${String(r.dynasty.runs).padStart(3)} · ${r.dynasty.depth.join("/")}`
        + ` · ${r.buys.toFixed(2)} → ${r.dynasty.buys.toFixed(2)} (${r.dynasty.camps} лагерей)`
        + ` · сборов ${r.preps.toFixed(2)} → ${r.dynasty.preps.toFixed(2)}`
        + (r.dynasty.deaths
          ? ` · смертей ${r.dynasty.deaths}, под боссом ${pct(r.dynasty.bossDeaths / r.dynasty.deaths)}`
          : ""),
      );
    }
  }
  // Editions (LG5): играет ли Charged вообще — без этого калибровка dropChance/bonus слепа.
  if (reports.some((r) => r.editions)) {
    console.log("\nEditions: забегов с Charged · Charged в билде · заряды/карту · этапов с активной · забегов с Tempered · Tempered в билде");
    for (const r of reports) {
      if (!r.editions) continue;
      console.log(
        `${r.agent.padEnd(15)}${String(r.editions.runsWithCharged).padStart(3)}`
        + ` · ${r.editions.avgTaken.toFixed(2)} · ${r.editions.avgCharges.toFixed(2)}`
        + ` · ${pct(r.editions.activeShare)}`
        + ` · ${String(r.editions.runsWithTempered).padStart(3)} · ${r.editions.avgTempered.toFixed(2)}`,
      );
    }
  }
  // Профиль лагеря (T5.9): отвечает на «почему в лагере ничего не куплено».
  if (campDiag.length) {
    const show = (label: string, rows: CampDiagnostic[]) => {
      if (!rows.length) return;
      const avg = (f: (r: CampDiagnostic) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
      console.log(
        `${label.padEnd(10)} лагерей ${String(rows.length).padStart(5)}`
        + ` · золото ${avg((r) => r.gold).toFixed(1).padStart(6)}`
        + ` · карт ${avg((r) => r.offers).toFixed(1)}`
        + ` · с плюсом ${avg((r) => r.positive).toFixed(2)}`
        + ` · по карману ${avg((r) => r.affordable).toFixed(2)}`
        + ` · лучшая дельта ${avg((r) => r.bestDelta).toFixed(2).padStart(6)}`
        + ` · качество на максимуме ${(100 * avg((r) => (r.rarityMaxed ? 1 : 0))).toFixed(0)}%`
        + ` · слоты полны ${(100 * avg((r) => (r.slotsFull ? 1 : 0))).toFixed(0)}%`
        // «Осмысленно» — метрика приёмки R12.6: у лагеря есть решение, а не только «Next stage».
        + ` · осмысленно ${(100 * avg((r) => (meaningful(r) ? 1 : 0))).toFixed(0)}%`,
      );
    };
    console.log("\nДИАГНОСТИКА лагерей:");
    show("сезон", campDiag.filter((r) => !r.dynasty));
    // Разбивка по актам (LG5): среднее по сезону прятало позднюю игру — жалоба R12.6 живёт в
    // акте 5 и Династии, а не в «36% в среднем».
    for (let act = 0; act < season.acts; act += 1) {
      show(
        `  акт ${act + 1}`,
        campDiag.filter((r) => !r.dynasty
          && Math.floor(r.campStageIndex / season.actLength) === act),
      );
    }
    show("Династия", campDiag.filter((r) => r.dynasty));
  }
  console.log("\nпроходимость финалов актов (из дошедших):");
  for (const r of reports) {
    const rates = finalePassRates(r, season)
      .map(({ stage, pass }) => `S${stage} ${pct(pass)}`)
      .join("   ");
    console.log(`${r.agent.padEnd(15)}${rates}`);
  }
}

const N = Number(process.argv[2] ?? 500);
const compareSeasons = process.argv.includes("--seasons");
const compareFinales = process.argv.includes("--finales");
const playDynasty = process.argv.includes("--dynasty");

/** Кандидаты кривой финалов актов (вход для R6.4 и открытого вопроса PRD §10.I). Сравниваются на
 *  ОДНИХ И ТЕХ ЖЕ сидах и агентах — различие в профиле тогда принадлежит кривой, а не выборке. */
const FINALE_CURVES: Array<{ name: string; actFinales: number[] }> = [
  { name: "4/3/2/1/1 (текущая)", actFinales: [4, 3, 2, 1, 1] },
  { name: "4/3/2/2/1 (одно чемпионство)", actFinales: [4, 3, 2, 2, 1] },
  { name: "4/3/2/2/2 (без чемпионства)", actFinales: [4, 3, 2, 2, 2] },
  { name: "6/4/3/2/1 (мягкий вход)", actFinales: [6, 4, 3, 2, 1] },
];

console.log(
  `\nBalance sim (R10) — balanceConfigVersion=${BALANCE_CONFIG_VERSION}`
  + `  bosses=${useBoss ? "on" : "off"}  editions=${useEditions ? "on" : "off"}  seeds=${N}`,
);

if (compareFinales) {
  // R6.4: цена одной неудачной сетки в конце сезона. Смотреть надо не на win% (он падает от
  // любого ужесточения), а на проходимость КОНКРЕТНОГО финала: требование чемпионства режет
  // забег на одном BO5 независимо от того, насколько хорошо он собран.
  for (const curve of FINALE_CURVES) {
    const season = buildSeason({ actFinales: curve.actFinales });
    const reports = AGENTS.filter((a) => !a.random).map((agent) => runAgent(agent, N, season));
    printReports(`Финалы ${curve.name}`, reports, season);
  }
} else if (compareSeasons) {
  // Вход для R6.1/R6.4: какая длина сезона даёт осмысленный профиль выживаемости.
  // Ту же акт-модель, что играет игра, просто с другим числом актов — своей копии лестницы у
  // симулятора больше нет (R6.1).
  for (const acts of [4, 5, 6]) {
    const season = buildSeason({ acts });
    const reports = AGENTS.filter((a) => !a.passive).map((agent) => runAgent(agent, N, season));
    printReports(`Сезон ${season.stages.length} этапов (${acts} акта)`, reports, season);
  }
} else {
  printReports(
    playDynasty ? "Сезон + Династия" : "Сезон целиком",
    AGENTS.map((agent) => runAgent(agent, N, SEASON, playDynasty)),
    SEASON,
  );
}

console.log(
  "\nsurvival[i] = доля забегов, сыгравших этап i+1. Всё это НИЖНЯЯ граница: агенты жадные,"
  + "\nосмысленная игра человека выигрывает не хуже. Предметы (R8.3) экипируются и считаются;"
  + `\nStakes — T6.4, Династия — T5.8. ACT_LENGTH=${ACT_LENGTH}.\n`,
);
