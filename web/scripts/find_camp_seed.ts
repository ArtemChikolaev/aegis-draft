// Подбор seed для e2e anteRun: по умолчанию — «предмет в слоте показывает разложение силы»,
// с `--scouting` / `--stand-in` — тесты Camp Action (см. ниже и комментарии в спеке).
// Повторяет ровно путь теста: тот же run-link конфиг, драфт «первым доступным» (как
// helpers.completeDraft — НЕ жадный, в отличие от sim_run), первый этап, Буткемп, карточная
// награда вида item. Годный seed — тот, где после взятия награды разложение силы не тривиально.
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { AnteRunEngine, SEASON, seasonStage } from "../src/game/anteRun.ts";
import { RunEconomy } from "../src/game/anteEconomy.ts";
import { buildTacticContext } from "../src/game/tactics.ts";
import { evaluateRunPower, evaluateStage } from "../src/game/runStrength.ts";
import { E2E_RUN_CONFIG as config, firstAvailableDraft } from "./lib/sim_shared.ts";

const data = loadGameData();

// Пути спеки с Camp Action наградой первого Буткемпа (helpers.chooseReward берёт ПЕРВУЮ
// action-карту — она и должна быть нужной):
//   `--scouting` — «разведка раскрывает будущего босса»: scouting разыгрывается, и этап 2 после
//                  неё обязан быть пройден (тест доходит до второго Буткемпа);
//   `--stand-in` — «stand-in делает замену игрока бесплатной»: только этап 1 и карта standIn.
// Раньше такие сиды подбирали руками.
const actionMode = process.argv.includes("--scouting") ? "scouting"
  : process.argv.includes("--stand-in") ? "standIn"
  : null;
const maxFound = Number(process.env.MAX_FOUND ?? (actionMode ? 12 : 5));
// Для разведки на реальном слайсе годен примерно один сид из сотни (2026-09-26: 33 из 3000) —
// диапазон расширяется env.
const maxSeed = Number(process.env.MAX_SEED ?? 400);
const found: string[] = [];
for (let n = 1; n <= maxSeed && found.length < maxFound; n++) {
  const seed = `camp-e2e-${n}`;
  if (actionMode) {
    const engine = new RunEngine(data, config, seed);
    firstAvailableDraft(engine);
    const score = engine.score();
    if (!score || !engine.isComplete) continue;
    const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "E2E", SEASON);
    if (anteRun.resolveStage() !== "playing") continue;
    // Свежая карьера, как у gotoFreshApp: случайные повышенные качества выключены (runStore).
    const economy = new RunEconomy(seed);
    economy.setRarityFlags({ drops: false, upgrades: true });
    const campId = anteRun.state.index;
    const firstPlacement = anteRun.state.lastPlacement;
    economy.awardStageClear(campId, firstPlacement, seasonStage(campId - 1).target);
    economy.openCamp(campId);
    const action = economy.campView().rewardOffers.find((o) => o.kind === "action");
    if (action?.cardId !== actionMode || !economy.chooseReward(action.id)) continue;
    if (!economy.playCampAction(actionMode)) continue;
    if (actionMode === "standIn") {
      found.push(seed);
      console.log(`✅ ${seed}  standIn наградой первого Буткемпа, место этапа 1: ${firstPlacement}`);
      continue;
    }
    // Второй этап (как advanceAnteStage): сила снимается до leaveCamp, поле пересобирается под неё.
    const stage = evaluateStage(engine, economy, { data, seed, stakes: [] }, anteRun.state.index);
    economy.leaveCamp();
    if (!stage) continue;
    anteRun.rebuildCurrentStage(stage.power.total);
    if (anteRun.resolveStage() !== "playing") continue;
    found.push(seed);
    // Места обоих этапов — запас сида: «1 → 1» переживёт следующий data-refresh вероятнее, чем «7-8».
    console.log(`✅ ${seed}  scouting наградой первого Буткемпа, места этапов 1/2: ${firstPlacement} / ${anteRun.state.lastPlacement}`);
    continue;
  }
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
