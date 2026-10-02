// Оценка e2e-сидов anteRun по датасету — общая для спеки и скриптов подбора (sweep_seeds_both, find_camp_seed).
// Сид проходит путь теста, только пока пул тот же: data-refresh сдвигает его, и тест падал НЕ на регрессии (09-30 —
// четыре теста и два джоба красные, 10-01 — снова зелёные). Спека проверяет свой сид на том датасете, который отдаёт
// e2e-сервер (`public/data`: в CI — mock или реальный), и при провале берёт годный той же моделью (M24).
// Модель повторяет путь теста дословно: run-link конфиг, драфт «первым доступным», свежая карьера (дропы выключены),
// первая карточка нужного вида. Точна до первой покупки на рынке; прокачка cheat-забега (boostInCamp) — приближение.
import { loadGameData } from "../../test/helpers/data.ts";
import { RunEngine } from "../../src/game/engine.ts";
import { AnteRunEngine, SEASON, seasonStage } from "../../src/game/anteRun.ts";
import { RunEconomy } from "../../src/game/anteEconomy.ts";
import type { Offer } from "../../src/game/anteEconomy.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../../src/game/anteMarket.ts";
import { buildTacticContext } from "../../src/game/tactics.ts";
import { evaluateRunPower, evaluateStage } from "../../src/game/runStrength.ts";
import { upgradeCost } from "../../src/game/heroRarity.ts";
import type { Rarity } from "../../src/game/rarity.ts";
import type { GameData } from "../../src/types/data.ts";
import { E2E_RUN_CONFIG as config, firstAvailableDraft } from "./sim_shared.ts";

/** Режимы спеки: `camp` — CAMP_SEED, `cheat` — CHEAT_SEED, `item` / `scouting` / `standIn` — тесты с первой наградой. */
export type E2eSeedMode = "camp" | "cheat" | "item" | "scouting" | "standIn";
export interface SeedVerdict { ok: boolean; note: string }

/** Сила этапа — та же сборка, что в игре и в балансовом симуляторе (game/runStrength.ts). */
function stageStrength(data: GameData, engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number): number {
  return evaluateStage(engine, economy, { data, seed, stakes: [] }, stageIndex)?.power.total ?? 0;
}

function currentPower(data: GameData, engine: RunEngine, economy: RunEconomy): number {
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

function offerDelta(data: GameData, engine: RunEngine, economy: RunEconomy, offer: Offer): number | null {
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
  return after - currentPower(data, engine, economy);
}

function prepareMarket(engine: RunEngine, economy: RunEconomy, seed: string): void {
  const st = economy.snapshot;
  economy.prepareMarketOffers(buildAnteMarketRoulette(
    engine, seed, st.campStageIndex, st.marketRerolls, economy.equippedTactics,
    { rarityDrops: economy.rarityDropsEnabled, stageCount: SEASON.stages.length, heroRarity: economy.heroRarity },
  ));
}

/** Приближение e2e `helpers.boostInCamp`: первая награда, покупки с неотрицательной дельтой силы, улучшения качества. */
function boostInCamp(data: GameData, engine: RunEngine, economy: RunEconomy, seed: string): void {
  const reward = economy.campView().rewardOffers[0];
  if (reward) economy.chooseReward(reward.id);
  prepareMarket(engine, economy, seed);
  for (let i = 0; i < 6; i++) {
    const offers = economy.campView().marketOffers;
    const ordered = [...offers.filter((o) => o.kind === "player"), ...offers.filter((o) => o.kind === "hero")];
    const pick = ordered.find((o) => {
      const delta = offerDelta(data, engine, economy, o);
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
      economy.replacePreparedMarketOffers(refreshAnteMarketOffers(
        engine, economy.campView().marketOffers, 1, economy.heroRarity, economy.equippedTactics,
      ));
    } catch { break; }
  }
  for (let i = 0; i < 5; i++) {
    const heroId = engine.heroes.find((h) => upgradeCost(economy.rarityOf(h)) != null);
    if (heroId == null) break;
    if (!economy.upgradeHeroRarity(heroId)) break;
  }
}

/** Драфт теста и первый этап. null — драфт не собрался (сид отбраковывается). */
function startRun(data: GameData, seed: string): { engine: RunEngine; anteRun: AnteRunEngine; economy: RunEconomy } | null {
  const engine = new RunEngine(data, config, seed);
  firstAvailableDraft(engine);
  const score = engine.score();
  if (!score || !engine.isComplete) return null;
  const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "E2E", SEASON);
  // Свежая карьера, как у gotoFreshApp: случайные повышенные качества выключены (runStore).
  const economy = new RunEconomy(seed);
  economy.setRarityFlags({ drops: false, upgrades: true });
  return { engine, anteRun, economy };
}

/** Статичный забег (ничего не покупаем): этап терминального исхода или null, если жив ≥12. */
export function staticDeathOf(data: GameData, seed: string): number | null {
  try {
    const run = startRun(data, seed);
    if (!run) return null;
    const { engine, anteRun, economy } = run;
    for (let stage = 1; stage <= 12; stage++) {
      if (anteRun.resolveStage() !== "playing") return stage;
      const campId = anteRun.state.index;
      economy.awardStageClear(campId, anteRun.state.lastPlacement, seasonStage(campId - 1).target);
      economy.openCamp(campId);
      economy.leaveCamp();
      anteRun.rebuildCurrentStage(stageStrength(data, engine, economy, seed, anteRun.state.index));
    }
  } catch { /* сид отбраковывается */ }
  return null;
}

/** Путь теста «пассивные карточки»: 3 этапа, карточная награда (item/tactic) в каждом лагере. Места этапов — запас. */
export function campDeepOf(data: GameData, seed: string): { ok: boolean; places: string[] } {
  const places: string[] = [];
  try {
    const run = startRun(data, seed);
    if (!run) return { ok: false, places };
    const { engine, anteRun, economy } = run;
    for (let stage = 1; stage <= 3; stage++) {
      if (anteRun.resolveStage() !== "playing") return { ok: false, places };
      places.push(String(anteRun.state.lastPlacement));
      const campId = anteRun.state.index;
      economy.awardStageClear(campId, anteRun.state.lastPlacement, seasonStage(campId - 1).target);
      economy.openCamp(campId);
      const card = economy.campView().rewardOffers.find((o) => o.kind === "item" || o.kind === "tactic");
      if (!card || !economy.chooseReward(card.id)) return { ok: false, places };
      economy.leaveCamp();
      anteRun.rebuildCurrentStage(stageStrength(data, engine, economy, seed, anteRun.state.index));
    }
    return { ok: true, places };
  } catch {
    return { ok: false, places };
  }
}

/** Cheat-забег: ∞ золото + приближение boostInCamp доживает до финала акта. */
export function cheatBoostOf(data: GameData, seed: string): boolean {
  try {
    const run = startRun(data, seed);
    if (!run) return false;
    const { engine, anteRun, economy } = run;
    economy.setUnlimitedGold(true);
    for (let stage = 1; stage <= SEASON.actLength; stage++) {
      if (anteRun.resolveStage() !== "playing") return false;
      const campId = anteRun.state.index;
      economy.awardStageClear(campId, anteRun.state.lastPlacement, seasonStage(campId - 1).target);
      economy.openCamp(campId);
      boostInCamp(data, engine, economy, seed);
      economy.leaveCamp();
      anteRun.rebuildCurrentStage(stageStrength(data, engine, economy, seed, anteRun.state.index));
    }
    return true;
  } catch {
    return false;
  }
}

/** Тесты с первой наградой: этап 1 пройден, первая карта нужного вида — та, что ждёт тест (helpers.chooseReward). */
function firstRewardOf(data: GameData, mode: "item" | "scouting" | "standIn", seed: string): SeedVerdict {
  const no = (note: string): SeedVerdict => ({ ok: false, note });
  try {
    const run = startRun(data, seed);
    if (!run) return no("драфт не собрался");
    const { engine, anteRun, economy } = run;
    if (anteRun.resolveStage() !== "playing") return no("этап 1 проигран");
    const campId = anteRun.state.index;
    const firstPlacement = anteRun.state.lastPlacement;
    economy.awardStageClear(campId, firstPlacement, seasonStage(campId - 1).target);
    economy.openCamp(campId);
    if (mode === "item") {
      const item = economy.campView().rewardOffers.find((o) => o.kind === "item");
      if (!item || !economy.chooseReward(item.id)) return no("нет item-награды");
      const score = engine.score()!;
      const camp = economy.campView();
      const evaluation = evaluateRunPower({
        score: { base: score.base, heroSynergy: score.heroSynergy, chemistry: score.chemistry },
        tacticContext: buildTacticContext(engine.rosterView, score.assignment.byPlayer, data, camp.campStageIndex),
        activeHeroes: engine.heroes,
        heroRarity: camp.heroRarity,
      }, { economy: camp.modifiers, equippedCards: camp.equippedTactics, cardRarity: camp.cardRarity, cardCharges: camp.cardCharges ?? {} });
      if (evaluation.power.trivial) return no("разложение силы тривиально");
      return { ok: true, note: `item=${item.id} total=${evaluation.power.total.toFixed(2)} (teamOvr ${evaluation.power.teamOvr.toFixed(2)}), место этапа 1: ${firstPlacement}` };
    }
    const action = economy.campView().rewardOffers.find((o) => o.kind === "action");
    if (action?.cardId !== mode || !economy.chooseReward(action.id)) return no(`первая action-карта не ${mode}`);
    if (!economy.playCampAction(mode)) return no(`${mode} не разыгрывается`);
    if (mode === "standIn") return { ok: true, note: `место этапа 1: ${firstPlacement}` };
    // Разведка: тест доходит до второго Буткемпа. Сила снимается до leaveCamp, поле пересобирается под неё.
    const stage = evaluateStage(engine, economy, { data, seed, stakes: [] }, anteRun.state.index);
    economy.leaveCamp();
    if (!stage) return no("этап 2 не собрался");
    anteRun.rebuildCurrentStage(stage.power.total);
    if (anteRun.resolveStage() !== "playing") return no("этап 2 проигран");
    return { ok: true, note: `места этапов 1/2: ${firstPlacement} / ${anteRun.state.lastPlacement}` };
  } catch (err) {
    return no(String(err));
  }
}

/** Годен ли сид для режима на этом датасете (критерии — skill e2e-seed-resweep, «Карта сидов»). */
export function evaluateE2eSeed(data: GameData, mode: E2eSeedMode, seed: string): SeedVerdict {
  if (mode === "item" || mode === "scouting" || mode === "standIn") return firstRewardOf(data, mode, seed);
  if (mode === "camp") {
    // 3 этапа с карточной наградой + статичная смерть за ≤6 этапов (бюджет slow() теста «завершение забега»).
    const deep = campDeepOf(data, seed);
    const death = staticDeathOf(data, seed);
    return { ok: deep.ok && death !== null && death <= 6, note: `места ${deep.places.join("/") || "—"}, статичная смерть @${death ?? "—"}` };
  }
  // cheat: прокачанный забег доживает до финала акта, статичный — гибнет за ≤6 этапов («вне статистики»).
  const death = staticDeathOf(data, seed);
  return { ok: cheatBoostOf(data, seed) && death !== null && death <= 6, note: `статичная смерть @${death ?? "—"}` };
}

/** Префикс сидов режима: cheat-забеги — свой ряд, остальные — ряд Буткемпа. */
const PREFIX: Record<E2eSeedMode, string> = { camp: "camp-e2e-", cheat: "cheat-e2e-", item: "camp-e2e-", scouting: "camp-e2e-", standIn: "camp-e2e-" };

/**
 * Годные сиды для режима на датасете e2e-сервера: `preferred` (подобранный и пройденный живьём) первым, если он ещё
 * годен, дальше — ряд `<prefix>1…max` по порядку. Пусто — тест упадёт с понятной причиной, а не на таймауте клика.
 */
export function pickE2eSeeds(mode: E2eSeedMode, preferred: string, opts: { count?: number; max?: number; data?: GameData } = {}): string[] {
  const data = opts.data ?? loadGameData();
  const count = opts.count ?? 3;
  const max = opts.max ?? (mode === "scouting" ? 3000 : 400);
  const out: string[] = [];
  if (evaluateE2eSeed(data, mode, preferred).ok) out.push(preferred);
  for (let n = 1; n <= max && out.length < count; n++) {
    const seed = `${PREFIX[mode]}${n}`;
    if (seed !== preferred && evaluateE2eSeed(data, mode, seed).ok) out.push(seed);
  }
  return out;
}
