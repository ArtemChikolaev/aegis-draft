// Сила этапа Roguelite Run после перезагрузки посреди этапа обязана совпасть с той, что игра
// построила при выходе из Буткемпа. До ревизии 2026-09-13 resume собирал силу своей копией без
// слоёв предметов и защиты от босса, а игровое поле — без ослабления Wide Pool: после reload поле
// этапа выходило другой силы. Теперь обе дороги идут через game/runStrength.evaluateStage.
import { describe, expect, it } from "vitest";
import { RunEngine } from "../src/game/engine.ts";
import { RunEconomy } from "../src/game/anteEconomy.ts";
import { BALANCE_CONFIG_VERSION } from "../src/game/balance.ts";
import type { Rarity } from "../src/game/rarity.ts";
import { useRun } from "../src/state/runStore.ts";
import { freezeRoster, loadSavedRun, saveRun, type RunAction } from "../src/state/runPersist.ts";
import { loadGameData } from "./helpers/data.ts";
import { defaultRunConfig } from "./helpers/packs.ts";

const data = loadGameData();

/** Драфт «первым доступным» с логом действий — ровно то, что resume переиграет. */
function draft(seed: string) {
  const engine = new RunEngine(data, defaultRunConfig, seed);
  const actions: RunAction[] = [];
  for (let guard = 0; guard < 200 && !engine.isComplete; guard += 1) {
    if (engine.rosterFilled < 5) {
      const index = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      engine.pickPlayer(index);
      actions.push({ t: "pickPlayer", index });
    } else {
      const heroId = engine.packHeroes.find((hero) => engine.canPickHero(hero))!;
      engine.pickHero(heroId);
      actions.push({ t: "pickHero", heroId });
    }
  }
  return { engine, actions };
}

function resetStore(resumable: ReturnType<typeof loadSavedRun>) {
  useRun.setState({
    phase: "start", error: null, data, engine: null, config: null, seed: "", snapshot: null,
    selectedMode: null, teamName: "Resume", actions: [], resumable, tournamentEngine: null, tournament: null,
    tournamentStep: 0, resultsSeen: false, anteRun: null, ante: null, economy: null, economyView: null,
    camp: null, prep: null, tactics: null, boss: null, scoutedBoss: null, campCelebration: false,
  });
}

/** Сила пользователя в поле этапа: (1) resume в Буткемп → «Следующий этап» в игре; (2) перезагрузка
 *  посреди этого этапа → resume. */
function stageStrengths(seed: string, equipped: string[], rarityOf: (heroes: number[]) => Record<string, Rarity>) {
  const { engine, actions } = draft(seed);
  const score = engine.score()!;
  const economy = {
    ...new RunEconomy(seed).snapshot,
    equippedTactics: equipped, ownedCards: [...equipped], inCamp: true, campStageIndex: 1,
    awardedCamps: [1], heroRarity: rarityOf(engine.heroes), rarityUpgradesEnabled: true,
  };
  saveRun({
    v: 1, schemaVersion: data.manifest.schemaVersion, ratingModelVersion: data.manifest.ratingModelVersion,
    dataHash: data.manifest.dataHash, dataBuiltAt: data.manifest.builtAt, mode: "run", config: defaultRunConfig,
    seed, actions, tournamentStep: 0, tournamentStarted: true, anteStageIndex: 1, economy,
    balanceConfigVersion: BALANCE_CONFIG_VERSION,
    frozenRoster: freezeRoster(engine.rosterView, score.assignment.byPlayer) ?? undefined,
  });

  resetStore(loadSavedRun());
  useRun.getState().resumeRun();
  expect(useRun.getState().phase).toBe("camp");
  useRun.getState().advanceAnteStage();
  const inGame = useRun.getState();
  expect(inGame.phase).toBe("tournament");
  const game = inGame.tournament!.field.find((team) => team.isUser)!.strength;

  resetStore(loadSavedRun());
  useRun.getState().resumeRun();
  const resumed = useRun.getState();
  expect(resumed.phase).toBe("tournament");
  return { game, resumed: resumed.tournament!.field.find((team) => team.isUser)!.strength };
}

describe("Roguelite: сила этапа после перезагрузки", () => {
  it("без карт совпадает с игровой", () => {
    const { game, resumed } = stageStrengths("stage-resume-a", [], () => ({}));
    expect(resumed).toBeCloseTo(game, 9);
  });

  it("слой X Mult предмета (Divine Rapier) переживает перезагрузку", () => {
    const control = stageStrengths("stage-resume-a", [], () => ({}));
    const { game, resumed } = stageStrengths("stage-resume-a", ["divineRapier"], () => ({}));
    expect(game).toBeGreaterThan(control.game);
    expect(resumed).toBeCloseTo(game, 9);
  });

  it("ослабление редкости Wide Pool одинаково в игре и после перезагрузки", () => {
    const { game, resumed } = stageStrengths("stage-resume-a", ["widePool"], (heroes) => ({ [String(heroes[0])]: "immortal" }));
    expect(resumed).toBeCloseTo(game, 9);
  });
});
