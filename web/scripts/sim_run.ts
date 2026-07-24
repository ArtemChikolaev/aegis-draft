// Балансовый прогон Roguelite Run (dev-инструмент, НЕ CI-тест: числа зависят от реального
// датасета). Играет N сидов авто-игроком и печатает win-rate + распределение достигнутых этапов,
// чтобы после правок орка/боссов/экономики быстро проверить «вообще выигрываемо и каков шанс».
// Прототип T6.3 (Balance simulator). Запуск: `npm run sim -- 500`  (env NOBOSS=1 — без боссов).
//
// Стратегия авто-игрока намеренно НАИВНАЯ (жадный best-OVR драфт + жадная покупка лучшего
// прироста Team OVR, без адаптации к боссу) — это НИЖНЯЯ граница: осмысленная игра выигрывает
// чаще. Реальный survival-профиль и калибровка — за T6.3.
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { AnteRunEngine, ANTE_TARGETS } from "../src/game/anteRun.ts";
import { RunEconomy } from "../src/game/anteEconomy.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../src/game/anteMarket.ts";
import { bannedHeroesForStage, bossForStage, evaluateBoss } from "../src/game/bossConditions.ts";
import type { RunConfig } from "../src/game/packs.ts";

const data = loadGameData();
const config: RunConfig = { draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto", hardMode: false };

function greedyDraft(engine: RunEngine) {
  let guard = 0;
  while (!engine.isComplete && guard++ < 40) {
    if (engine.rosterFilled < 5) {
      let bestIdx = -1; let bestOvr = -1;
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

function playCamp(engine: RunEngine, economy: RunEconomy, seed: string) {
  const gold = economy.campView().rewardOffers
    .filter((o) => o.kind === "gold")
    .sort((a, b) => (b.goldGain ?? 0) - (a.goldGain ?? 0))[0];
  if (gold) economy.chooseReward(gold.id);

  const st = economy.snapshot;
  economy.prepareMarketOffers(buildAnteMarketRoulette(engine, seed, st.campStageIndex, st.marketRerolls, economy.equippedTactics));

  let guard = 0;
  while (guard++ < 12) {
    if (!engine.score()) break;
    let best: { id: string; gain: number } | null = null;
    for (const o of economy.campView().marketOffers) {
      if ((o.kind !== "player" && o.kind !== "hero") || !o.preview) continue;
      const a = o.preview.after; const b = o.preview.before;
      const gain = (a.base + a.heroSynergy + a.chemistry) - (b.base + b.heroSynergy + b.chemistry);
      const free = o.kind === "player" && economy.snapshot.freePlayerSwaps > 0;
      if ((free ? 0 : o.cost) > economy.gold || gain <= 0) continue;
      if (!best || gain > best.gain) best = { id: o.id, gain };
    }
    if (!best) break;
    const offer = economy.campView().marketOffers.find((o) => o.id === best!.id)!;
    try {
      if (offer.kind === "player" && offer.playerSwap) {
        const incoming = engine.candidateByRef(offer.playerSwap.incoming);
        if (!incoming || engine.rosterView[offer.playerSwap.slotIndex].candidate?.player.accountId !== offer.playerSwap.outgoingAccountId) break;
        if (!economy.purchaseMarket(offer.id)) break;
        engine.replacePlayer(offer.playerSwap.slotIndex, incoming);
      } else if (offer.kind === "hero" && offer.heroSwap) {
        if (!economy.purchaseMarket(offer.id)) break;
        engine.replaceHero(offer.heroSwap.outgoingHeroId, offer.heroSwap.incomingHeroId);
      }
      economy.replacePreparedMarketOffers(refreshAnteMarketOffers(engine, economy.campView().marketOffers));
    } catch { break; }
  }
}

function stageStrength(engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number): number {
  const score = engine.score()!;
  const mods = economy.modifiers();
  const bossId = process.env.NOBOSS ? null : bossForStage(seed, stageIndex);
  const penalty = bossId ? evaluateBoss(bossId, {
    base: score.base + mods.base,
    heroSynergy: score.heroSynergy + mods.heroSynergy,
    chemistry: score.chemistry + mods.chemistry,
    playerOvrs: engine.players.map((p) => p.ovr),
    activeHeroes: engine.heroes,
    bannedHeroes: bannedHeroesForStage(seed, stageIndex, engine.allFormatHeroes),
  }).penalty : 0;
  return score.teamOvr + mods.base + mods.heroSynergy + mods.chemistry - penalty;
}

function playRun(seed: string): { outcome: "won" | "lost"; stage: number; ovr: number } {
  const engine = new RunEngine(data, config, seed);
  greedyDraft(engine);
  const score = engine.score();
  if (!score || !engine.isComplete) return { outcome: "lost", stage: -1, ovr: 0 };
  const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "Sim");
  const economy = new RunEconomy(seed);
  let guard = 0;
  while (guard++ < 40) {
    const phase = anteRun.resolveStage();
    if (phase !== "playing") return { outcome: phase, stage: anteRun.state.index, ovr: score.teamOvr };
    const campId = anteRun.state.index;
    economy.awardStageClear(campId, anteRun.state.lastPlacement, ANTE_TARGETS[campId - 1]);
    economy.openCamp(campId);
    playCamp(engine, economy, seed);
    economy.leaveCamp();
    anteRun.rebuildCurrentStage(stageStrength(engine, economy, seed, anteRun.state.index));
  }
  return { outcome: "lost", stage: anteRun.state.index, ovr: score.teamOvr };
}

const N = Number(process.argv[2] ?? 500);
let wins = 0; let fails = 0;
const reached: Record<number, number> = {};
const ovrs: number[] = [];
for (let i = 0; i < N; i++) {
  const r = playRun(`sim-${i}`);
  if (r.stage < 0) { fails++; continue; }
  ovrs.push(r.ovr);
  if (r.outcome === "won") wins++;
  reached[r.stage] = (reached[r.stage] ?? 0) + 1;
}
const played = N - fails;
const avg = ovrs.reduce((s, v) => s + v, 0) / (ovrs.length || 1);
console.log(`seeds=${N}  played=${played}  draft-fails=${fails}  avg draft teamOvr=${avg.toFixed(1)}  boss=${process.env.NOBOSS ? "off" : "on"}`);
console.log(`win-rate=${(100 * wins / played).toFixed(1)}%  (wins=${wins})`);
for (let s = 0; s <= ANTE_TARGETS.length - 1; s++) {
  const c = reached[s] ?? 0;
  const note = s === ANTE_TARGETS.length - 1 ? " (incl. wins)" : "";
  console.log(`  outcome at stage ${s}${note}: ${c} (${(100 * c / played).toFixed(1)}%)  ${"█".repeat(Math.round(40 * c / played))}`);
}
