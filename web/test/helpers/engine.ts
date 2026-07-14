import { RunEngine } from "../../src/game/engine.ts";
import { ROLE_SEQUENCE } from "../../src/game/packs.ts";

/** Пройти забег до конца: 5 игроков, затем 5 героев. */
export function runToEnd(engine: RunEngine): void {
  let guard = 0;
  while (!engine.isComplete && guard++ < 200) {
    if (engine.rosterFilled < ROLE_SEQUENCE.length) {
      const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      if (idx === -1) throw new Error("нет кандидата под открытую роль");
      engine.pickPlayer(idx);
    } else {
      const hid = engine.packHeroes.find((h) => engine.canPickHero(h));
      if (hid == null) {
        if (!engine.reroll()) throw new Error("нет героя и рероллы кончились");
        continue;
      }
      engine.pickHero(hid);
    }
  }
}

export type EngineAction =
  | { t: "pickPlayer"; index: number }
  | { t: "pickHero"; heroId: number }
  | { t: "reroll" };

export function driveEngine(engine: RunEngine, log: EngineAction[]): void {
  for (const action of log) {
    if (action.t === "pickPlayer") engine.pickPlayer(action.index);
    else if (action.t === "pickHero") engine.pickHero(action.heroId);
    else if (action.t === "reroll") engine.reroll();
  }
}

export function engineSignature(engine: RunEngine): string {
  return JSON.stringify({
    roster: engine.rosterView.map((s) => s.candidate?.player.accountId ?? null),
    heroes: engine.heroes,
    rerollsLeft: engine.rerollsLeft,
    pack: engine.currentPack.signatureHeroes,
    ovr: Math.round((engine.score()?.teamOvr ?? 0) * 100),
  });
}
