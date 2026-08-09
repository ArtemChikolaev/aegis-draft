// Свип CAMP_SEED под e2e «пассивные карточки занимают слоты» (anteRun.spec.ts). Любой сдвиг
// потока Rng (пороги, cadence боссов, состав паков рынка) может сделать текущий seed непроходным —
// это записанная цена M5R, и тогда перебор запускается заново: npx tsx scripts/find_camp_seed_deep.ts
// Повторяет ровно путь теста: драфт «первым доступным» (как helpers.completeDraft), три этапа
// подряд, в каждом Буткемпе — первая карточная награда (item|tactic), рынок не трогается. Слои
// силы — через те же функции, что игра (никаких своих сумм — урок R10). Кандидат обязан пройти
// этапы 1–3 и видеть карточную награду во всех трёх лагерях. Финальная правда — полный прогон e2e.
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { AnteRunEngine, SEASON, seasonStage } from "../src/game/anteRun.ts";
import { RunEconomy } from "../src/game/anteEconomy.ts";
import { buildTacticContext, evaluateTactics, type TacticEvaluation } from "../src/game/tactics.ts";
import { runModifiers, stageStrength as runStageStrength } from "../src/game/runStrength.ts";
import { evaluateItems, protectedBossPenalty } from "../src/game/items.ts";
import { bannedHeroesForStage, bossForStage, evaluateBoss, type BossId } from "../src/game/bossConditions.ts";
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

const STAGES_NEEDED = 3;
const found: string[] = [];
for (let n = 1; n <= 600 && found.length < 6; n++) {
  const seed = `camp-e2e-${n}`;
  const engine = new RunEngine(data, config, seed);
  firstAvailableDraft(engine);
  const score = engine.score();
  if (!score || !engine.isComplete) continue;

  const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "E2E", SEASON);
  // Свежая карьера (gotoFreshApp): случайные дропы качества закрыты, ручное улучшение открыто.
  const economy = new RunEconomy(seed);
  economy.setRarityFlags({ drops: false, upgrades: true });

  let ok = true;
  for (let stage = 1; stage <= STAGES_NEEDED; stage++) {
    if (anteRun.resolveStage() !== "playing") { ok = false; break; }
    const campId = anteRun.state.index;
    economy.awardStageClear(campId, anteRun.state.lastPlacement, seasonStage(campId - 1).target);
    economy.openCamp(campId);
    const card = economy.campView().rewardOffers.find((o) => o.kind === "item" || o.kind === "tactic");
    if (!card || !economy.chooseReward(card.id)) { ok = false; break; }
    economy.leaveCamp();
    anteRun.rebuildCurrentStage(stageStrength(engine, economy, seed, anteRun.state.index));
  }
  if (!ok) continue;
  // Четвёртый resolve не обязателен тесту, но пусть сид не умирает сразу после сцены теста.
  found.push(seed);
  console.log(`✅ ${seed}  (3 этапа пройдены, карточная награда во всех трёх лагерях)`);
}
if (!found.length) console.log("❌ подходящий seed не найден в диапазоне 1..600");
