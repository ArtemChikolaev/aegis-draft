// Свип сидов anteRun-e2e (CAMP_SEED/CHEAT_SEED) по ТЕКУЩЕМУ датасету в web/public/data.
// Сид обязан проходить на ДВУХ датасетах (локально — реальный слайс, CI — mock), поэтому гонять
// дважды и брать пересечение:
//   npm run gen:mock && npx tsx scripts/sweep_seeds_both.ts        # mock (как CI)
//   git checkout -- public/data && npx tsx scripts/sweep_seeds_both.ts  # реальный
// Модель отбирает КАНДИДАТОВ; boostInCamp повторяется неточно — финальная правда только живым
// прогоном cheat-тестов по кандидатам (R15.8: модельные 3/9/13 падали на mock, 15 прошёл).
// Для каждого сида:
//   campDeep     — путь теста «пассивные карточки»: 3 этапа, карточная награда в каждом лагере;
//   staticDeath  — на каком этапе гибнет статичный ростер (бюджет теста «завершение забега» и
//                  «вне статистики»: терминал должен наступать за ≤6 этапов);
//   cheatBoost   — модель boostInCamp доживает до финала акта (тесты «boss на финале»/«синки»).
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { AnteRunEngine, SEASON, seasonStage } from "../src/game/anteRun.ts";
import { RunEconomy } from "../src/game/anteEconomy.ts";
import type { Offer } from "../src/game/anteEconomy.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../src/game/anteMarket.ts";
import { buildTacticContext, evaluateTactics, type TacticEvaluation } from "../src/game/tactics.ts";
import { activeCardIds, runModifiers, stageStrength as runStageStrength, evaluateRunPower } from "../src/game/runStrength.ts";
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
  // Заряды Charged (R13.5) — как в игре: без них sweep номинировал бы сиды по заниженной силе.
  return evaluateTactics(economy.equippedTactics, ctx, economy.cardCharges);
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
    activeHeroes: engine.heroes, cardRarity: economy.cardRarity, cardCharges: economy.cardCharges,
  });
}

function bossPenalty(engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number, bossId: BossId | null): number {
  const score = engine.score();
  if (!score || !bossId) return 0;
  const tactics = tacticsOf(engine, economy);
  const mods = runModifiers(strengthInput(engine, economy, tactics));
  const raw = evaluateBoss(bossId, {
    seed,
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
  const items = itemsOf(engine, economy);
  const editions = economy.cardEditions;
  const activeTempered = [...activeCardIds(tactics, items)].filter((id) => editions[id] === "tempered").length;
  return protectedBossPenalty(raw, items, activeTempered);
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
    cardCharges: economy.cardCharges,
  }).power.total;
}

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
    cardCharges: economy.cardCharges,
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

type Verdict = { campDeep: boolean; staticDeath: number | null; cheatBoost: boolean; cheatStaticDeath: number | null };

/** Статичный забег (ничего не покупаем): этап терминального исхода или null, если жив ≥12. */
function staticDeathOf(seed: string): number | null {
  try {
    const engine = new RunEngine(data, config, seed);
    firstAvailableDraft(engine);
    const score = engine.score();
    if (!score || !engine.isComplete) return null;
    const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "E2E", SEASON);
    const economy = new RunEconomy(seed);
    economy.setRarityFlags({ drops: false, upgrades: true });
    for (let stage = 1; stage <= 12; stage++) {
      if (anteRun.resolveStage() !== "playing") return stage;
      const campId = anteRun.state.index;
      economy.awardStageClear(campId, anteRun.state.lastPlacement, seasonStage(campId - 1).target);
      economy.openCamp(campId);
      economy.leaveCamp();
      anteRun.rebuildCurrentStage(stageStrength(engine, economy, seed, anteRun.state.index));
    }
  } catch { /* сид отбраковывается */ }
  return null;
}

function evalSeed(campSeed: string, cheatSeed: string): Verdict {
  const verdict: Verdict = { campDeep: false, staticDeath: null, cheatBoost: false, cheatStaticDeath: null };
  verdict.cheatStaticDeath = staticDeathOf(cheatSeed);
  // campDeep: 3 этапа, карточная награда в каждом лагере (свежая карьера: drops выключены).
  try {
    const engine = new RunEngine(data, config, campSeed);
    firstAvailableDraft(engine);
    const score = engine.score();
    if (score && engine.isComplete) {
      const anteRun = new AnteRunEngine(data, config.format, campSeed, score.teamOvr, "E2E", SEASON);
      const economy = new RunEconomy(campSeed);
      economy.setRarityFlags({ drops: false, upgrades: true });
      let ok = true;
      for (let stage = 1; stage <= 3; stage++) {
        if (anteRun.resolveStage() !== "playing") { ok = false; break; }
        const campId = anteRun.state.index;
        economy.awardStageClear(campId, anteRun.state.lastPlacement, seasonStage(campId - 1).target);
        economy.openCamp(campId);
        const card = economy.campView().rewardOffers.find((o) => o.kind === "item" || o.kind === "tactic");
        if (!card || !economy.chooseReward(card.id)) { ok = false; break; }
        economy.leaveCamp();
        anteRun.rebuildCurrentStage(stageStrength(engine, economy, campSeed, anteRun.state.index));
      }
      verdict.campDeep = ok;
    }
  } catch { /* сид отбраковывается */ }
  // staticDeath: тот же CAMP_SEED, ничего не покупаем — на каком этапе терминал.
  verdict.staticDeath = staticDeathOf(campSeed);
  // cheatBoost: CHEAT_SEED, ∞ золото + boost-модель, дожить до финала акта.
  try {
    const engine = new RunEngine(data, config, cheatSeed);
    firstAvailableDraft(engine);
    const score = engine.score();
    if (score && engine.isComplete) {
      const anteRun = new AnteRunEngine(data, config.format, cheatSeed, score.teamOvr, "E2E", SEASON);
      const economy = new RunEconomy(cheatSeed);
      economy.setRarityFlags({ drops: false, upgrades: true });
      economy.setUnlimitedGold(true);
      let ok = true;
      for (let stage = 1; stage <= SEASON.actLength; stage++) {
        if (anteRun.resolveStage() !== "playing") { ok = false; break; }
        const campId = anteRun.state.index;
        economy.awardStageClear(campId, anteRun.state.lastPlacement, seasonStage(campId - 1).target);
        economy.openCamp(campId);
        boostInCamp(engine, economy, cheatSeed);
        economy.leaveCamp();
        anteRun.rebuildCurrentStage(stageStrength(engine, economy, cheatSeed, anteRun.state.index));
      }
      verdict.cheatBoost = ok;
    }
  } catch { /* сид отбраковывается */ }
  return verdict;
}

const campOk: string[] = [];
const cheatOk: string[] = [];
for (let n = 1; n <= 200; n++) {
  const v = evalSeed(`camp-e2e-${n}`, `cheat-e2e-${n}`);
  if (v.campDeep && v.staticDeath != null && v.staticDeath <= 6) campOk.push(`camp-e2e-${n}(death@${v.staticDeath})`);
  if (v.cheatBoost && v.cheatStaticDeath != null && v.cheatStaticDeath <= 6) cheatOk.push(`cheat-e2e-${n}(death@${v.cheatStaticDeath})`);
}
console.log("CAMP ok:", campOk.join(" ") || "—");
console.log("CHEAT ok:", cheatOk.join(" ") || "—");
