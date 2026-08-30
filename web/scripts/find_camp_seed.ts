// Одноразовый подбор seed для e2e «предмет в слоте показывает разложение силы».
// Повторяет ровно путь теста: тот же run-link конфиг, драфт «первым доступным» (как
// helpers.completeDraft — НЕ жадный, в отличие от sim_run), первый этап, Буткемп, карточная
// награда вида item. Годный seed — тот, где после взятия награды разложение силы не тривиально.
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { AnteRunEngine, SEASON } from "../src/game/anteRun.ts";
import { RunEconomy } from "../src/game/anteEconomy.ts";
import { buildTacticContext } from "../src/game/tactics.ts";
import { evaluateRunPower } from "../src/game/runStrength.ts";
import type { RunConfig } from "../src/game/packs.ts";

const data = loadGameData();
const config: RunConfig = {
  draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto", hardMode: false,
};

/** Драфт «первым доступным» — точная копия e2e/helpers.completeDraft: тест кликает первую
 *  незаблокированную карточку, а не лучшую по OVR. Жадный драфт дал бы другой ростер и другой seed. */
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

const found: string[] = [];
for (let n = 1; n <= 400 && found.length < 5; n++) {
  const seed = `camp-e2e-${n}`;
  {
    const engine = new RunEngine(data, config, seed);
    firstAvailableDraft(engine);
    const score = engine.score();
    if (!score || !engine.isComplete) continue;

    // Первый этап обязан быть пройден: тест жмёт «ante-to-camp» после исхода.
    const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "E2E", SEASON);
    if (anteRun.resolveStage() !== "playing") continue;

    const economy = new RunEconomy(seed);
    economy.openCamp(anteRun.state.index);
    const item = economy.campView().rewardOffers.find((o) => o.kind === "item");
    if (!item || !economy.chooseReward(item.id)) continue;

    const camp = economy.campView();
    const evaluation = evaluateRunPower({
      score: { base: score.base, heroSynergy: score.heroSynergy, chemistry: score.chemistry },
      tacticContext: buildTacticContext(engine.rosterView, score.assignment.byPlayer, data, camp.campStageIndex),
      activeHeroes: engine.heroes,
      heroRarity: camp.heroRarity,
    }, {
      economy: camp.modifiers,
      equippedCards: camp.equippedTactics,
      cardRarity: camp.cardRarity,
      // Обязательное поле с R13.5 — скрипт tsx-вне-tsc и молча падал без него (дрейф).
      cardCharges: camp.cardCharges ?? {},
    });

    if (!evaluation.power.trivial) {
      found.push(seed);
      console.log(`✅ ${seed}  item=${item.id}  total=${evaluation.power.total.toFixed(2)} (teamOvr ${evaluation.power.teamOvr.toFixed(2)})`);
    }
  }
}
if (!found.length) console.log("❌ подходящий seed не найден в диапазоне");
