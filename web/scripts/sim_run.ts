// Балансовый прогон Roguelite Run (dev-инструмент, НЕ CI-тест: числа зависят от реального
// датасета). Играет N сидов несколькими СТИЛЯМИ авто-игрока и печатает win-rate по стилям +
// распределение достигнутых этапов, кривую золота и насыщение билда. Прототип T6.3 (Balance
// simulator). Запуск: `npm run sim -- 500`  (env NOBOSS=1 — прогон без боссов для сравнения).
//
// Стили — НИЖНЯЯ граница мастерства: реальная осмысленная игра выигрывает не хуже. Dynasty-метрики
// (survival по абсолютному Stage, распределение первого Aegis) включатся, когда появится срез 6.
import { loadGameData } from "../test/helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { AnteRunEngine, ANTE_TARGETS } from "../src/game/anteRun.ts";
import { RunEconomy, type Offer } from "../src/game/anteEconomy.ts";
import { buildAnteMarketRoulette, refreshAnteMarketOffers } from "../src/game/anteMarket.ts";
import { bannedHeroesForStage, bossForStage, evaluateBoss, type BossId } from "../src/game/bossConditions.ts";
import { BALANCE_CONFIG_VERSION } from "../src/game/balance.ts";
import type { RunConfig } from "../src/game/packs.ts";

const data = loadGameData();
const config: RunConfig = { draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto", hardMode: false };
const useBoss = !process.env.NOBOSS;

/** Оценка оффера для конкретного стиля: чем выше, тем охотнее покупаем. boss — правило СЛЕДУЮЩЕГО
 *  этапа (или null), чтобы стиль мог под него адаптироваться. */
type Style = { name: string; value: (o: Offer, boss: BossId | null) => number };

function deltas(o: Offer) {
  const a = o.preview!.after; const b = o.preview!.before;
  return { base: a.base - b.base, hero: a.heroSynergy - b.heroSynergy, chem: a.chemistry - b.chemistry };
}

const STYLES: Style[] = [
  // Статик: не покупает ничего (кроме reward-золота, но не тратит) — контрольный «пол» PRD
  // (статичный состав должен жить до середины и почти не выигрывать).
  { name: "static", value: () => -1 },
  // Наивный: максимизирует суммарный прирост Team OVR, боссов не замечает.
  { name: "naive-ovr", value: (o) => { const d = deltas(o); return d.base + d.hero + d.chem; } },
  // Boss-adaptive: под chemistryBlackout не ценит Chemistry, под спрос-боссами усиливает нужное.
  {
    name: "boss-adaptive",
    value: (o, boss) => {
      const d = deltas(o);
      const chemW = boss === "chemistryBlackout" ? 0 : 1;
      const baseW = boss === "baseFloor" || boss === "unbalancedRoster" ? 1.5 : 1;
      const heroW = boss === "heroSynergyDemand" || boss === "heroBan" ? 1.5 : 1;
      return d.base * baseW + d.hero * heroW + d.chem * chemW;
    },
  },
  // Chemistry-lean: отдельный архетип — приоритет связкам (проверка, что он вообще жизнеспособен).
  { name: "chem-lean", value: (o) => { const d = deltas(o); return d.chem * 2 + d.base + d.hero; } },
];

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

interface CampStat { goldAfter: number; buys: number }

function playCamp(engine: RunEngine, economy: RunEconomy, seed: string, style: Style, boss: BossId | null): CampStat {
  const gold = economy.campView().rewardOffers
    .filter((o) => o.kind === "gold")
    .sort((a, b) => (b.goldGain ?? 0) - (a.goldGain ?? 0))[0];
  if (gold) economy.chooseReward(gold.id);

  const st = economy.snapshot;
  // Опции обязательны: без `stageCount` прогресс сезона всегда 0, и симулятор не проверял бы
  // кривую нижней границы рынка (R5.1-fix) — то есть мерил бы не ту игру, в которую играют.
  economy.prepareMarketOffers(buildAnteMarketRoulette(
    engine,
    seed,
    st.campStageIndex,
    st.marketRerolls,
    economy.equippedTactics,
    { rarityDrops: economy.rarityDropsEnabled, stageCount: ANTE_TARGETS.length },
  ));

  let buys = 0; let guard = 0;
  while (guard++ < 12) {
    if (!engine.score()) break;
    let best: { id: string; v: number; kind: string } | null = null;
    for (const o of economy.campView().marketOffers) {
      if ((o.kind !== "player" && o.kind !== "hero") || !o.preview) continue;
      const free = o.kind === "player" && economy.snapshot.freePlayerSwaps > 0;
      if ((free ? 0 : o.cost) > economy.gold) continue;
      const v = style.value(o, boss);
      if (v <= 0) continue;
      if (!best || v > best.v) best = { id: o.id, v, kind: o.kind };
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
      buys++;
      economy.replacePreparedMarketOffers(refreshAnteMarketOffers(engine, economy.campView().marketOffers));
    } catch { break; }
  }
  return { goldAfter: economy.gold, buys };
}

function stageStrength(engine: RunEngine, economy: RunEconomy, seed: string, stageIndex: number): number {
  const score = engine.score()!;
  const mods = economy.modifiers();
  const bossId = useBoss ? bossForStage(seed, stageIndex) : null;
  const penalty = bossId ? evaluateBoss(bossId, {
    base: score.base + mods.base, heroSynergy: score.heroSynergy + mods.heroSynergy, chemistry: score.chemistry + mods.chemistry,
    playerOvrs: engine.players.map((p) => p.ovr), activeHeroes: engine.heroes,
    bannedHeroes: bannedHeroesForStage(seed, stageIndex, engine.allFormatHeroes),
  }).penalty : 0;
  return score.teamOvr + mods.base + mods.heroSynergy + mods.chemistry - penalty;
}

interface RunResult { outcome: "won" | "lost"; stage: number; draftOvr: number; finalOvr: number; camps: CampStat[] }

function playRun(seed: string, style: Style): RunResult | null {
  const engine = new RunEngine(data, config, seed);
  greedyDraft(engine);
  const score = engine.score();
  if (!score || !engine.isComplete) return null;
  const anteRun = new AnteRunEngine(data, config.format, seed, score.teamOvr, "Sim");
  const economy = new RunEconomy(seed);
  const camps: CampStat[] = [];
  let guard = 0;
  while (guard++ < 40) {
    const phase = anteRun.resolveStage();
    if (phase !== "playing") {
      return { outcome: phase, stage: anteRun.state.index, draftOvr: score.teamOvr, finalOvr: engine.score()!.teamOvr, camps };
    }
    const campId = anteRun.state.index;
    economy.awardStageClear(campId, anteRun.state.lastPlacement, ANTE_TARGETS[campId - 1]);
    economy.openCamp(campId);
    const boss = useBoss ? bossForStage(seed, anteRun.state.index) : null;
    camps.push(playCamp(engine, economy, seed, style, boss));
    economy.leaveCamp();
    anteRun.rebuildCurrentStage(stageStrength(engine, economy, seed, anteRun.state.index));
  }
  return { outcome: "lost", stage: anteRun.state.index, draftOvr: score.teamOvr, finalOvr: engine.score()!.teamOvr, camps };
}

const N = Number(process.argv[2] ?? 500);
const lastStage = ANTE_TARGETS.length - 1;
console.log(`\nBalance sim — balanceConfigVersion=${BALANCE_CONFIG_VERSION}  bosses=${useBoss ? "on" : "off"}  seeds=${N}\n`);
console.log("style          win%   lost@stage 0 / 1 / 2 / 3 / 4    avg draft→final OVR   avg gold/camp  buys/camp");
for (const style of STYLES) {
  let wins = 0; let played = 0; let fails = 0;
  const reached: number[] = Array(ANTE_TARGETS.length).fill(0);
  let sumDraft = 0; let sumFinal = 0; let sumGold = 0; let sumBuys = 0; let camps = 0;
  for (let i = 0; i < N; i++) {
    const r = playRun(`sim-${i}`, style);
    if (!r) { fails++; continue; }
    played++;
    sumDraft += r.draftOvr; sumFinal += r.finalOvr;
    for (const c of r.camps) { sumGold += c.goldAfter; sumBuys += c.buys; camps++; }
    if (r.outcome === "won") wins++;
    reached[r.stage]++;
  }
  const pct = (x: number) => (100 * x / played).toFixed(0).padStart(3);
  const dist = reached.map((c) => pct(c)).join(" /");
  const winStr = `${(100 * wins / played).toFixed(1)}%`.padStart(6);
  const ovrStr = `${(sumDraft / played).toFixed(1)}→${(sumFinal / played).toFixed(1)}`.padStart(11);
  const goldStr = camps ? (sumGold / camps).toFixed(1).padStart(9) : "—".padStart(9);
  const buysStr = camps ? (sumBuys / camps).toFixed(2).padStart(9) : "—".padStart(9);
  console.log(`${style.name.padEnd(14)}${winStr}   ${dist}       ${ovrStr}   ${goldStr}   ${buysStr}${fails ? `   (draft-fails=${fails})` : ""}`);
}
console.log(`\nnote: outcome@stage ${lastStage} incl. wins; всё это НИЖНЯЯ граница (наивные стили). Калибровка — при явном вылете из целевого профиля.\n`);
