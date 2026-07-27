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
//   NOBOSS=1 npm run sim -- 500        без боссов, для сравнения
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { ACT_LENGTH, AnteRunEngine, ANTE_TARGETS } from "../src/game/anteRun.ts";
import {
  RunEconomy,
  type Offer,
  type OfferKind,
  type SummandModifiers,
} from "../src/game/anteEconomy.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../src/game/anteMarket.ts";
import { buildTacticContext, evaluateTactics, type TacticEvaluation } from "../src/game/tactics.ts";
import { rarityModifiers, upgradeCost, type Rarity } from "../src/game/heroRarity.ts";
import { runModifiers } from "../src/game/runStrength.ts";
import { bannedHeroesForStage, bossForStage, evaluateBoss, type BossId } from "../src/game/bossConditions.ts";
import { BALANCE_CONFIG_VERSION } from "../src/game/balance.ts";
import { Rng } from "../src/game/rng.ts";
import type { RunConfig } from "../src/game/packs.ts";
import type { PlacementKey } from "../src/game/tournament.ts";

const data = loadGameData();
const config: RunConfig = {
  draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto", hardMode: false,
};
const useBoss = !process.env.NOBOSS;

// ─────────────────────────────── сила билда (зеркало runStore) ───────────────────────────────

function tacticsOf(engine: RunEngine, economy: RunEconomy): TacticEvaluation | null {
  const score = engine.score();
  if (!score) return null;
  const ctx = buildTacticContext(
    engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex,
  );
  return evaluateTactics(economy.equippedTactics, ctx);
}

/** Композиция слоёв — общая с игрой (game/runStrength.ts). Складывать их здесь «своей» суммой
 *  нельзя: именно так эта копия однажды разъехалась и симулятор мерил билд без редкости и тактик. */
function effectiveMods(
  engine: RunEngine, economy: RunEconomy, tactics: TacticEvaluation | null,
): SummandModifiers {
  return runModifiers({
    economy: economy.modifiers(),
    tactics: tactics?.modifiers ?? null,
    heroRarity: economy.heroRarity,
    activeHeroes: engine.heroes,
  });
}

function bossPenalty(
  engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number,
  mods: SummandModifiers, bossId: BossId | null,
): number {
  const score = engine.score();
  if (!score || !bossId) return 0;
  return evaluateBoss(bossId, {
    base: score.base + mods.base,
    heroSynergy: score.heroSynergy + mods.heroSynergy,
    chemistry: score.chemistry + mods.chemistry,
    playerOvrs: engine.players.map((p) => p.ovr),
    activeHeroes: engine.heroes,
    bannedHeroes: bannedHeroesForStage(seed, stageIndex, engine.allFormatHeroes),
  }).penalty;
}

/** Итоговая сила состава на этапе — то, что уезжает в поле турнира. */
function stageStrength(engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number): number {
  const score = engine.score();
  if (!score) return 0;
  const tactics = tacticsOf(engine, economy);
  const mods = effectiveMods(engine, economy, tactics);
  const bossId = useBoss ? bossForStage(seed, stageIndex) : null;
  return score.teamOvr + mods.base + mods.heroSynergy + mods.chemistry
    - bossPenalty(engine, economy, seed, stageIndex, mods, bossId);
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
}

const AGENTS: Agent[] = [
  // Контрольный «пол» PRD: статичный состав должен жить до середины и почти не выигрывать.
  {
    name: "static", weights: { base: 0, hero: 0, chem: 0 }, rewardPref: ["gold"],
    holdGold: 0, maxRerolls: 0, buysQuality: false, bossAware: false, passive: true,
  },
  // Нижняя граница: покупает что попало из того, что по карману.
  {
    name: "random", weights: { base: 1, hero: 1, chem: 1 }, rewardPref: ["gold", "tactic", "action", "reroll", "quality"],
    holdGold: 0, maxRerolls: 1, buysQuality: false, bossAware: false, random: true,
  },
  // Жадность по сырому Team OVR — не видит ни редкости, ни условий тактик.
  {
    name: "naive-ovr", weights: { base: 1, hero: 1, chem: 1 }, rewardPref: ["gold"],
    holdGold: 0, maxRerolls: 0, buysQuality: false, bossAware: false,
  },
  // Жадность по ИТОГОВОЙ силе: та же покупка оценивается с учётом редкости входящего героя и
  // пересчёта условных тактик. Пока нет Tournament Power (R8.2) — это ближайший честный аналог
  // «greedy Tournament Power» из плана R10.
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
    name: "synergy-build", weights: { base: 1, hero: 1.3, chem: 1.6 }, rewardPref: ["tactic", "action", "quality", "gold"],
    holdGold: 0, maxRerolls: 1, buysQuality: true, bossAware: true, powerAware: true,
  },
  // Верхняя граница ЖАДНОЙ игры (не истинный оптимум): лучшая по замеру политика наград плюс все
  // рычаги — качество, рероллы, адаптация к боссу. Политика наград здесь ВЫБРАНА ИЗМЕРЕНИЕМ:
  // приоритет карточек лишает агента золота и роняет win-rate почти вдвое (см. synergy-build).
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

interface CampStat {
  goldAfter: number;
  buys: number;
  rerolls: number;
  qualityUpgrades: number;
}

interface RunResult {
  outcome: "won" | "lost";
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

function prepareMarket(engine: RunEngine, economy: RunEconomy, seed: string, stageCount: number): void {
  const st = economy.snapshot;
  economy.prepareMarketOffers(buildAnteMarketRoulette(
    engine, seed, st.campStageIndex, st.marketRerolls, economy.equippedTactics,
    { rarityDrops: economy.rarityDropsEnabled, stageCount },
  ));
}

/** Взять награду по предпочтению агента. Карточка занимает слот, поэтому при полном наборе
 *  падаем на следующий вид — иначе агент «выбирал» бы недоступное и терял награду вовсе. */
function takeReward(economy: RunEconomy, agent: Agent, decision: Decision): void {
  const offers = economy.campView().rewardOffers;
  const order = agent.random
    ? decision.rng.shuffle([...offers]).map((o) => o.kind)
    : agent.rewardPref;
  for (const kind of order) {
    const offer = offers.find((o) => o.kind === kind);
    if (!offer) continue;
    if (!economy.canTakeCard(offer.kind)) continue;
    if (economy.chooseReward(offer.id)) return;
  }
  for (const offer of offers) if (economy.chooseReward(offer.id)) return;
}

type Action =
  | { kind: "market"; offer: Offer; value: number; cost: number }
  | { kind: "quality"; heroId: number; value: number; cost: number };

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
): { buys: number; rerolls: number; qualityUpgrades: number } {
  let buys = 0;
  let rerolls = 0;
  let qualityUpgrades = 0;
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

    const offer = best.offer;
    try {
      if (offer.kind === "player" && offer.playerSwap) {
        const incoming = engine.candidateByRef(offer.playerSwap.incoming);
        const slotHolder = engine.rosterView[offer.playerSwap.slotIndex].candidate;
        if (!incoming || slotHolder?.player.accountId !== offer.playerSwap.outgoingAccountId) break;
        if (!economy.purchaseMarket(offer.id)) break;
        engine.replacePlayer(offer.playerSwap.slotIndex, incoming);
      } else if (offer.kind === "hero" && offer.heroSwap) {
        if (!economy.purchaseMarket(offer.id)) break;
        engine.replaceHero(offer.heroSwap.outgoingHeroId, offer.heroSwap.incomingHeroId);
        // Тот же ролл, что делает стор при покупке: без него редкость в симуляторе не появлялась.
        economy.rollHeroRarity(offer.heroSwap.incomingHeroId, economy.snapshot.campStageIndex);
      }
      buys += 1;
      economy.replacePreparedMarketOffers(refreshAnteMarketOffers(engine, economy.campView().marketOffers));
    } catch { break; }
  }
  return { buys, rerolls, qualityUpgrades };
}

/** Разыграть все имеющиеся Camp Actions: они одноразовые и сгорают на следующем Буткемпе,
 *  поэтому держать их в слоте — чистая потеря. */
function playActions(economy: RunEconomy): void {
  for (const actionId of economy.campView().heldActions) economy.playCampAction(actionId);
}

function playRun(seed: string, agent: Agent, targets: readonly number[]): RunResult | null {
  const engine = new RunEngine(data, config, seed);
  greedyDraft(engine);
  const score = engine.score();
  if (!score || !engine.isComplete) return null;

  const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "Sim", targets);
  const economy = new RunEconomy(seed);
  // Симулируем НЕ первый забег: иначе мета-гейт держит все дропы на common и профиль редкости
  // измерить нечем. Первый забег — отдельный онбординговый случай.
  economy.setRarityFlags({ drops: true, upgrades: true });

  const camps: CampStat[] = [];
  const placements: PlacementKey[] = [];
  const rng = new Rng(`${seed}:agent:${agent.name}`);
  let guard = 0;

  while (guard++ < targets.length + 5) {
    const stageIndex = anteRun.state.index;
    const bossId = useBoss ? bossForStage(seed, stageIndex) : null;
    const phase = anteRun.resolveStage();
    const placement = anteRun.state.lastPlacement;
    if (placement) placements.push(placement);

    if (phase !== "playing") {
      const tactics = tacticsOf(engine, economy);
      const mods = effectiveMods(engine, economy, tactics);
      return {
        outcome: phase,
        stage: anteRun.state.index,
        placements,
        draftOvr: score.teamOvr,
        finalStrength: engine.score()!.teamOvr + mods.base + mods.heroSynergy + mods.chemistry,
        lostUnderBoss: phase === "lost"
          && bossPenalty(engine, economy, seed, stageIndex, mods, bossId) > 0,
        tacticsEquipped: economy.campView().equippedTactics.length,
        upgradedHeroes: engine.heroes.filter((h) => economy.rarityOf(h) !== "common").length,
        camps,
      };
    }

    const campId = anteRun.state.index;
    economy.awardStageClear(campId, anteRun.state.lastPlacement, targets[campId - 1]);
    economy.openCamp(campId);

    const decision: Decision = {
      boss: useBoss ? bossForStage(seed, campId) : null,
      gold: economy.gold,
      stagesLeft: targets.length - campId,
      rng,
    };
    takeReward(economy, agent, decision);
    playActions(economy);
    prepareMarket(engine, economy, seed, targets.length);
    const shopped = shopCamp(engine, economy, seed, agent, decision, targets.length);
    camps.push({ goldAfter: economy.gold, ...shopped });

    economy.leaveCamp();
    anteRun.rebuildCurrentStage(stageStrength(engine, economy, seed, anteRun.state.index));
  }

  const tactics = tacticsOf(engine, economy);
  const mods = effectiveMods(engine, economy, tactics);
  return {
    outcome: "lost", stage: anteRun.state.index, placements, draftOvr: score.teamOvr,
    finalStrength: engine.score()!.teamOvr + mods.base + mods.heroSynergy + mods.chemistry,
    lostUnderBoss: false,
    tacticsEquipped: economy.campView().equippedTactics.length,
    upgradedHeroes: engine.heroes.filter((h) => economy.rarityOf(h) !== "common").length,
    camps,
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
  rareHeroes: number;
  tactics: number;
  lostUnderBoss: number;
  podium: number;
}

function runAgent(agent: Agent, seeds: number, targets: readonly number[]): Report {
  const survivedTo = Array(targets.length).fill(0);
  const strengths: number[] = [];
  const golds: number[] = [];
  let played = 0; let wins = 0; let bossDeaths = 0; let podium = 0;
  let buys = 0; let rerolls = 0; let qualityBought = 0; let rareHeroes = 0; let tactics = 0; let camps = 0;

  for (let i = 0; i < seeds; i += 1) {
    const result = playRun(`sim-${i}`, agent, targets);
    if (!result) continue;
    played += 1;
    strengths.push(result.finalStrength);
    tactics += result.tacticsEquipped;
    rareHeroes += result.upgradedHeroes;
    if (result.outcome === "won") wins += 1;
    if (result.lostUnderBoss) bossDeaths += 1;
    podium += result.placements.filter((p) => p === "1" || p === "2" || p === "3").length;
    // Забег дожил до этапа s, если он его сыграл: индекс окончания = число сыгранных − 1.
    for (let s = 0; s <= result.stage && s < targets.length; s += 1) survivedTo[s] += 1;
    for (const camp of result.camps) {
      golds.push(camp.goldAfter);
      buys += camp.buys; rerolls += camp.rerolls; qualityBought += camp.qualityUpgrades; camps += 1;
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
    qualityBought: played ? qualityBought / played : 0,
    rareHeroes: played ? rareHeroes / played : 0,
    tactics: played ? tactics / played : 0,
    lostUnderBoss: played ? bossDeaths / played : 0,
    podium: played ? podium / played : 0,
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

function printReports(title: string, reports: Report[], targets: readonly number[]): void {
  console.log(`\n${title}  (этапов: ${targets.length}, пороги: ${targets.join("/")})\n`);
  console.log(
    "agent           win%   survival по этапам".padEnd(38)
    + "  strength p50/p90/p99   gold p50/p90/p99  buys  rrl  qual  rare  tac  boss-death",
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
      + `  ${r.rareHeroes.toFixed(1).padStart(4)}  ${r.tactics.toFixed(1)}  ${pct(r.lostUnderBoss).padStart(6)}`,
    );
  }
}

/** Лестница сезона из `acts` актов по шаблону PRD §5.9.3: обычные этапы топ-8, «элитный» топ-6,
 *  playoff check топ-4, финал акта ужесточается до чемпионства. Нужна, чтобы сравнить 20/25/30
 *  этапов ДО того, как акт-модель будет реализована (R6.1). */
function seasonTargets(acts: number): number[] {
  const finales = [4, 3, 2, 1, 1];
  return Array.from({ length: acts }, (_, act) => [
    8, 8, 6, 4, finales[Math.min(act, finales.length - 1)],
  ]).flat();
}

const N = Number(process.argv[2] ?? 500);
const compareSeasons = process.argv.includes("--seasons");

console.log(
  `\nBalance sim (R10) — balanceConfigVersion=${BALANCE_CONFIG_VERSION}`
  + `  bosses=${useBoss ? "on" : "off"}  seeds=${N}`,
);

if (compareSeasons) {
  // Вход для R6.1/R6.4: какая длина сезона даёт осмысленный профиль выживаемости.
  for (const acts of [4, 5, 6]) {
    const targets = seasonTargets(acts);
    const reports = AGENTS.filter((a) => !a.passive).map((agent) => runAgent(agent, N, targets));
    printReports(`Сезон ${targets.length} этапов (${acts} акта)`, reports, targets);
  }
} else {
  printReports("Текущая лестница", AGENTS.map((agent) => runAgent(agent, N, ANTE_TARGETS)), ANTE_TARGETS);
}

console.log(
  "\nsurvival[i] = доля забегов, сыгравших этап i+1. Всё это НИЖНЯЯ граница: агенты жадные,"
  + "\nосмысленная игра человека выигрывает не хуже. Tournament Power и Stakes в модели ещё нет"
  + `\n(R8.2 / T6.4), Династия — T5.8. ACT_LENGTH=${ACT_LENGTH}.\n`,
);
