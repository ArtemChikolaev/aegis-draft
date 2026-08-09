// Свип CHEAT_SEED под cheat-e2e (anteRun.spec.ts, «boss на финале акта» и «поздние синки»).
// Любой сдвиг потока Rng может сделать текущий seed непроходным (записанная цена M5R) — тогда
// перебор запускается заново: npx tsx scripts/find_cheat_seed_deep.ts
// Модель повторяет путь e2e-хелпера boostInCamp: первая награда, затем до 6 покупок «первая
// карточка с неотрицательной дельтой» в порядке DOM (игроки → герои), затем до 5 улучшений
// качества первого немаксимального героя. Слои силы и исполнение покупок — те же функции, что в
// игре/симуляторе (урок R10). Финальная правда — прогон e2e с CHEAT_SEED=<кандидат>.
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { AnteRunEngine, SEASON, seasonStage } from "../src/game/anteRun.ts";
import { RunEconomy } from "../src/game/anteEconomy.ts";
import type { Offer } from "../src/game/anteEconomy.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../src/game/anteMarket.ts";
import { buildTacticContext, evaluateTactics, type TacticEvaluation } from "../src/game/tactics.ts";
import { runModifiers, stageStrength as runStageStrength, evaluateRunPower } from "../src/game/runStrength.ts";
import { evaluateItems, protectedBossPenalty } from "../src/game/items.ts";
import { bannedHeroesForStage, bossForStage, evaluateBoss, type BossId } from "../src/game/bossConditions.ts";
import { upgradeCost } from "../src/game/heroRarity.ts";
import type { Rarity } from "../src/game/rarity.ts";
import type { RunConfig } from "../src/game/packs.ts";

const data = loadGameData();
const config: RunConfig = {
  draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto", hardMode: false,
};

function firstAvailableDraft(engine: RunEngine): void {
  for (let step = 0; step < 40 && !engine.isComplete; step++) {
    if (engine.rosterFilled < 5) {
      const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      if (idx >= 0) { engine.pickPlayer(idx); continue; }
      if (engine.rerollsLeft > 0) { engine.reroll(); continue; }
      break;
    }
    const hero = engine.packHeroes[0];
    if (hero == null) break;
    engine.pickHero(hero);
  }
}

function tacticsOf(engine: RunEngine, economy: RunEconomy): TacticEvaluation | null {
  const score = engine.score();
  if (!score || economy.equippedTactics.length === 0) return null;
  const ctx = buildTacticContext(engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex);
  return evaluateTactics(economy.equippedTactics, ctx);
}

function strengthInput(engine: RunEngine, economy: RunEconomy, tactics: TacticEvaluation | null) {
  return {
    economy: economy.modifiers(),
    tactics: tactics?.modifiers ?? null,
    heroRarity: economy.heroRarity,
    activeHeroes: engine.heroes,
  };
}

function itemsOf(engine: RunEngine, economy: RunEconomy) {
  return evaluateItems(economy.equippedTactics, {
    activeHeroes: engine.heroes,
    cardRarity: economy.cardRarity,
  });
}

function bossPenalty(engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number, bossId: BossId | null): number {
  const score = engine.score();
  if (!score || !bossId) return 0;
  const tactics = tacticsOf(engine, economy);
  const mods = runModifiers(strengthInput(engine, economy, tactics));
  const raw = evaluateBoss(bossId, {
    absoluteStageIndex: stageIndex,
    base: score.base + mods.base,
    heroSynergy: score.heroSynergy + mods.heroSynergy,
    chemistry: score.chemistry + mods.chemistry,
    playerOvrs: engine.players.map((p) => p.ovr),
    activeHeroes: engine.heroes,
    bannedHeroes: bannedHeroesForStage(seed, stageIndex, engine.allFormatHeroes, economy.bossRerollsFor(stageIndex)),
    assignedHeroGames: buildTacticContext(
      engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex,
    ).players.map((player) => player.assignedHeroGames),
  }).penalty;
  return protectedBossPenalty(raw, itemsOf(engine, economy));
}

function stageStrength(engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number): number {
  const score = engine.score();
  if (!score) return 0;
  const tactics = tacticsOf(engine, economy);
  const bossId = bossForStage(seed, stageIndex, economy.bossRerollsFor(stageIndex));
  const items = itemsOf(engine, economy);
  return runStageStrength(score.teamOvr, strengthInput(engine, economy, tactics), {
    bossPenalty: bossPenalty(engine, economy, seed, stageIndex, bossId),
    power: { flat: items.flat, additive: items.additive, xMults: items.xMults },
  });
}

/** Сила забега как её видит центр радара (без штрафа босса) — базис дельты карточки рынка. */
function currentPower(engine: RunEngine, economy: RunEconomy): number {
  const score = engine.score()!;
  return evaluateRunPower({
    score: { base: score.base, heroSynergy: score.heroSynergy, chemistry: score.chemistry },
    tacticContext: buildTacticContext(engine.rosterView, score.assignment.byPlayer, data, economy.snapshot.campStageIndex),
    activeHeroes: engine.heroes,
    heroRarity: economy.heroRarity,
  }, {
    economy: economy.modifiers(),
    equippedCards: economy.equippedTactics,
    cardRarity: economy.cardRarity,
  }).power.total;
}

/** Дельта карточки рынка — как previewPower на карточке (CampScreen): пересобирает тактики,
 *  редкость и предметные слои для состояния ПОСЛЕ покупки. */
function offerDelta(engine: RunEngine, economy: RunEconomy, offer: Offer): number | null {
  const score = engine.score();
  if (!score || !offer.preview) return null;
  const assignment = offer.preview.afterAssignment ?? score.assignment.byPlayer;
  let roster = engine.rosterView;
  let heroes: readonly number[] = engine.heroes;
  const rarity: Record<string, Rarity> = { ...economy.heroRarity };
  if (offer.kind === "player" && offer.playerSwap) {
    const incoming = engine.candidateByRef(offer.playerSwap.incoming);
    if (!incoming) return null;
    roster = roster.map((slot, i) => (i === offer.playerSwap!.slotIndex ? { ...slot, candidate: incoming } : slot));
  } else if (offer.kind === "hero" && offer.heroSwap) {
    heroes = heroes.map((h) => (h === offer.heroSwap!.outgoingHeroId ? offer.heroSwap!.incomingHeroId : h));
    rarity[String(offer.heroSwap.incomingHeroId)] = offer.heroSwap.incomingRarity ?? "common";
  } else if (offer.heroUpgrade) {
    rarity[String(offer.heroUpgrade.heroId)] = offer.heroUpgrade.targetRarity;
  } else {
    return null;
  }
  const after = evaluateRunPower({
    score: offer.preview.after,
    tacticContext: buildTacticContext(roster, assignment, data, economy.snapshot.campStageIndex),
    activeHeroes: heroes,
    heroRarity: rarity,
  }, {
    economy: economy.modifiers(),
    equippedCards: economy.equippedTactics,
    cardRarity: economy.cardRarity,
  }).power.total;
  return after - currentPower(engine, economy);
}

function prepareMarket(engine: RunEngine, economy: RunEconomy, seed: string): void {
  const st = economy.snapshot;
  economy.prepareMarketOffers(buildAnteMarketRoulette(
    engine, seed, st.campStageIndex, st.marketRerolls, economy.equippedTactics,
    { rarityDrops: economy.rarityDropsEnabled, stageCount: SEASON.stages.length, heroRarity: economy.heroRarity },
  ));
}

/** Модель boostInCamp: первая награда → до 6 «первых карточек с дельтой ≥ 0» → до 5 улучшений. */
function boostInCamp(engine: RunEngine, economy: RunEconomy, seed: string): void {
  const reward = economy.campView().rewardOffers[0];
  if (reward) economy.chooseReward(reward.id);
  prepareMarket(engine, economy, seed);

  for (let i = 0; i < 6; i++) {
    const offers = economy.campView().marketOffers;
    const ordered = [...offers.filter((o) => o.kind === "player"), ...offers.filter((o) => o.kind === "hero")];
    const pick = ordered.find((o) => {
      const delta = offerDelta(engine, economy, o);
      return delta != null && delta >= 0;
    });
    if (!pick) break;
    try {
      if (pick.kind === "player" && pick.playerSwap) {
        const incoming = engine.candidateByRef(pick.playerSwap.incoming);
        const slotHolder = engine.rosterView[pick.playerSwap.slotIndex].candidate;
        if (!incoming || slotHolder?.player.accountId !== pick.playerSwap.outgoingAccountId) break;
        if (!economy.purchaseMarket(pick.id)) break;
        engine.replacePlayer(pick.playerSwap.slotIndex, incoming);
      } else if (pick.kind === "hero" && pick.heroSwap) {
        if (!economy.purchaseMarket(pick.id)) break;
        engine.replaceHero(pick.heroSwap.outgoingHeroId, pick.heroSwap.incomingHeroId);
        economy.rollHeroRarity(pick.heroSwap.incomingHeroId, economy.snapshot.campStageIndex);
      } else if (pick.heroUpgrade) {
        // Тир применяет сама экономика внутри purchaseMarket — ростер не меняется.
        if (!economy.purchaseMarket(pick.id)) break;
      } else break;
      economy.replacePreparedMarketOffers(refreshAnteMarketOffers(engine, economy.campView().marketOffers));
    } catch { break; }
  }

  for (let i = 0; i < 5; i++) {
    const heroId = engine.heroes.find((h) => upgradeCost(economy.rarityOf(h)) != null);
    if (heroId == null) break;
    if (!economy.upgradeHeroRarity(heroId)) break;
  }
}

const found: string[] = [];
for (let n = 1; n <= 400 && found.length < 6; n++) {
  const seed = `cheat-e2e-${n}`;
  const engine = new RunEngine(data, config, seed);
  firstAvailableDraft(engine);
  const score = engine.score();
  if (!score || !engine.isComplete) continue;

  const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "E2E", SEASON);
  const economy = new RunEconomy(seed);
  economy.setRarityFlags({ drops: false, upgrades: true });
  economy.setUnlimitedGold(true);

  let ok = true;
  for (let stage = 1; stage <= SEASON.actLength; stage++) {
    if (anteRun.resolveStage() !== "playing") { ok = false; break; }
    const campId = anteRun.state.index;
    economy.awardStageClear(campId, anteRun.state.lastPlacement, seasonStage(campId - 1).target);
    economy.openCamp(campId);
    boostInCamp(engine, economy, seed);
    economy.leaveCamp();
    anteRun.rebuildCurrentStage(stageStrength(engine, economy, seed, anteRun.state.index));
  }
  if (!ok) continue;
  found.push(seed);
  console.log(`✅ ${seed}  (акт пройден целиком под boost-моделью)`);
}
if (!found.length) console.log("❌ подходящий seed не найден в диапазоне 1..400");
