// Детерминированный авто-драфт (Arena MP1): добирает ботов до полной сетки и заменяет
// не сдавших состав участников. Политика — порт «жадного» агента симулятора
// (scripts/sim_run.ts: лучший OVR в открытую роль, реролл когда взять некого, первый герой
// пака): не новый драфт-ИИ, а та же базовая линия, которой меряется баланс. Детерминизм —
// свойство RunEngine: тот же seed и та же последовательность решений ⇒ тот же состав, поэтому
// все клиенты комнаты считают ботов сами и получают одинаковые пятёрки без пересылки.
import type { GameData } from "../types/data.ts";
import { RunEngine } from "./engine.ts";
import type { RunConfig } from "./packs.ts";
import type { ScoreBreakdown } from "./score.ts";

/** Доиграть драфт жадно. Возвращает движок с полной пятёркой и героями. */
export function autoDraft(data: GameData, config: RunConfig, seed: string): RunEngine {
  const engine = new RunEngine(data, config, seed);
  let guard = 0;
  while (!engine.isComplete && guard++ < 80) {
    if (engine.rosterFilled < 5) {
      let bestIndex = -1;
      let bestOvr = -1;
      engine.currentPack.candidates.forEach((candidate, index) => {
        if (engine.canPickPlayer(index) && candidate.player.ovr > bestOvr) {
          bestOvr = candidate.player.ovr;
          bestIndex = index;
        }
      });
      if (bestIndex >= 0) { engine.pickPlayer(bestIndex); continue; }
      if (engine.rerollsLeft > 0) { engine.reroll(); continue; }
      break;
    }
    const hero = engine.packHeroes[0];
    if (hero == null) break;
    engine.pickHero(hero);
  }
  if (!engine.isComplete) throw new Error(`Авто-драфт не собрал состав (seed ${seed})`);
  return engine;
}

/** Сила авто-драфта: тот же score(), что у людей, — вторых правил счёта нет. */
export function autoDraftScore(data: GameData, config: RunConfig, seed: string): ScoreBreakdown {
  const score = autoDraft(data, config, seed).score();
  if (!score) throw new Error(`Авто-драфт без счёта (seed ${seed})`);
  return score;
}
