import { describe, expect, it } from "vitest";
import { loadGameData } from "./helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { EMPTY_PREP, PREP, prepOverlay, prepPointsLeft, heroGamesKey } from "../src/game/prep.ts";
import {
  SCORING,
  chemistryBonus,
  chemistryPairEdges,
  pairKey,
  scoreTeam,
  heroStatsForAssignment,
  chemistryPlayersFromRoster,
  signatureLookup,
  withHeroGamesOverlay,
} from "../src/game/score.ts";
import { SYNERGY_MAX_PER_HERO } from "../src/game/assign.ts";
import type { RunConfig } from "../src/game/packs.ts";

const data = loadGameData();
const CONFIG: RunConfig = { draftStyle: "mixed", format: "last_2y", rerolls: 1, scoring: "event", allocation: "auto" };

/** Полный драфт первым доступным (как helpers.completeDraft в e2e). */
function draftComplete(seed: string): RunEngine {
  const engine = new RunEngine(data, CONFIG, seed);
  let guard = 0;
  while (!engine.isComplete && guard++ < 40) {
    if (engine.rosterFilled < 5) {
      const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      if (idx >= 0) { engine.pickPlayer(idx); continue; }
      if (engine.rerollsLeft > 0) { engine.reroll(); continue; }
      break;
    }
    const hero = engine.packHeroes[0];
    if (hero != null) { engine.pickHero(hero); continue; }
    break;
  }
  if (!engine.isComplete) throw new Error(`draft incomplete for ${seed}`);
  return engine;
}

describe("prep — наложение подготовки на формулу (RT-E)", () => {
  it("overlay суммирует виртуальные игры по паре и по игрок×герой независимо от порядка пары", () => {
    const overlay = prepOverlay({ actions: [
      { kind: "scrim", a: 1, b: 2 }, { kind: "scrim", a: 2, b: 1 },
      { kind: "practice", accountId: 1, heroId: 5 }, { kind: "practice", accountId: 1, heroId: 5 }, { kind: "practice", accountId: 2, heroId: 5 },
    ] });
    expect(overlay.pairGames.get(pairKey(1, 2))).toBe(2 * PREP.scrimGames);
    expect(overlay.heroGames.get(heroGamesKey(1, 5))).toBe(2 * PREP.practiceGames);
    expect(overlay.heroGames.get(heroGamesKey(2, 5))).toBe(PREP.practiceGames);
    expect(prepPointsLeft({ actions: [] })).toBe(PREP.budget);
    expect(prepPointsLeft({ actions: Array(PREP.budget + 3).fill({ kind: "scrim", a: 1, b: 2 }) })).toBe(0);
  });

  it("сыгровка: пара без истории получает ровно pairChemistryBonus(виртуальные игры), потолок пары и суммы держатся", () => {
    const roster = [{ accountId: 1, teamId: 1, eventId: "e" }, { accountId: 2, teamId: 2, eventId: "e" }];
    // Пара 1–2 реально не играла вместе (синтетические id) → базовая химия 0.
    expect(chemistryBonus(roster, data.squadSynergy, data.teammates)).toBe(0);
    const one = new Map([[pairKey(1, 2), PREP.scrimGames]]);
    expect(chemistryBonus(roster, data.squadSynergy, data.teammates, one)).toBeCloseTo(PREP.scrimGames / SCORING.chemFullGames, 6);
    // Рёбра радара видят ту же пару — иначе радар и плитка разъедутся.
    expect(chemistryPairEdges(roster, data.squadSynergy, data.teammates, one)).toEqual([
      { a: 1, b: 2, games: PREP.scrimGames, bonus: PREP.scrimGames / SCORING.chemFullGames },
    ]);
    const many = new Map([[pairKey(1, 2), PREP.scrimGames * 100]]);
    expect(chemistryBonus(roster, data.squadSynergy, data.teammates, many)).toBe(SCORING.chemMaxPerPair);
  });

  it("тренировка: виртуальные игры поднимают Hero Synergy игрока на герое до потолка и не трогают чужие записи", () => {
    const engine = draftComplete("prep-practice-1");
    const players = engine.players;
    const heroId = engine.heroes[0];
    const accountId = players[0].accountId;
    const phs = heroStatsForAssignment(data);
    const boosted = withHeroGamesOverlay(phs, new Map([[heroGamesKey(accountId, heroId), 10_000]]));
    expect(boosted[String(accountId)][String(heroId)].games).toBeGreaterThanOrEqual(10_000);
    // Другие игроки — тот же объект (ни копий, ни мутаций исходного справочника).
    expect(boosted[String(players[1].accountId)]).toBe(phs[String(players[1].accountId)]);
    expect(phs[String(accountId)]?.[String(heroId)]?.games ?? 0).toBeLessThan(10_000);
    // На потолке вклад игрока = SYNERGY_MAX_PER_HERO: синергия с фиксированным назначением не выше
    // базовой + (потолок − текущий вклад).
    const fixed = { [accountId]: heroId };
    const rosterCandidates = engine.rosterView.map((slot) => slot.candidate);
    const base = scoreTeam(players, engine.heroes, phs, data.squadSynergy, data.teammates, chemistryPlayersFromRoster(engine.rosterView), signatureLookup(rosterCandidates), fixed);
    const after = scoreTeam(players, engine.heroes, phs, data.squadSynergy, data.teammates, chemistryPlayersFromRoster(engine.rosterView), signatureLookup(rosterCandidates), fixed, undefined, { pairGames: new Map(), heroGames: new Map([[heroGamesKey(accountId, heroId), 10_000]]) });
    expect(after.heroSynergy).toBeGreaterThanOrEqual(base.heroSynergy);
    expect(after.heroSynergy - base.heroSynergy).toBeLessThanOrEqual(SYNERGY_MAX_PER_HERO + 1e-9);
    expect(after.chemistry).toBe(base.chemistry);
    expect(after.base).toBe(base.base);
  });
});

describe("prep — RunEngine: план, бюджет, превью, откат", () => {
  it("до завершения драфта подготовка недоступна; после — только на игроков состава и активных героев", () => {
    const engine = new RunEngine(data, CONFIG, "prep-engine-gate");
    const firstIdx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
    engine.pickPlayer(firstIdx);
    const id = engine.players[0].accountId;
    expect(engine.canPrep({ kind: "scrim", a: id, b: 999_999_999 })).toBe(false);
    const done = draftComplete("prep-engine-gate-2");
    const [p1, p2] = done.players;
    expect(done.canPrep({ kind: "scrim", a: p1.accountId, b: p2.accountId })).toBe(true);
    expect(done.canPrep({ kind: "scrim", a: p1.accountId, b: p1.accountId })).toBe(false);
    expect(done.canPrep({ kind: "scrim", a: p1.accountId, b: 999_999_999 })).toBe(false);
    expect(done.canPrep({ kind: "practice", accountId: p1.accountId, heroId: done.heroes[0] })).toBe(true);
    expect(done.canPrep({ kind: "practice", accountId: p1.accountId, heroId: -1 })).toBe(false);
  });

  it("addPrep меняет score() ровно на превью, бюджет убывает до нуля, undo возвращает всё назад", () => {
    const engine = draftComplete("prep-engine-flow");
    const [p1, p2] = engine.players;
    const baseline = engine.score()!;
    expect(engine.prepPointsLeft).toBe(PREP.budget);
    const action = { kind: "scrim" as const, a: p1.accountId, b: p2.accountId };
    const preview = engine.previewPrep(action)!;
    expect(preview.teamOvr).toBeGreaterThan(baseline.teamOvr);
    expect(engine.addPrep(action)).toBe(true);
    expect(engine.score()!.teamOvr).toBeCloseTo(preview.teamOvr, 9);
    expect(engine.prepPointsLeft).toBe(PREP.budget - 1);
    // Превью «без подготовки» = исходный счёт.
    expect(engine.previewWithoutPrep()!.teamOvr).toBeCloseTo(baseline.teamOvr, 9);
    // Бюджет конечен: лишние недели не принимаются.
    for (let i = 1; i < PREP.budget; i += 1) expect(engine.addPrep(action)).toBe(true);
    expect(engine.prepPointsLeft).toBe(0);
    expect(engine.addPrep(action)).toBe(false);
    expect(engine.previewPrep(action)).toBeNull();
    // Откат стеком до пустого плана — счёт возвращается к исходному.
    for (let i = 0; i < PREP.budget; i += 1) expect(engine.undoPrep()).not.toBeNull();
    expect(engine.undoPrep()).toBeNull();
    expect(engine.prepPlan).toEqual(EMPTY_PREP);
    expect(engine.score()!.teamOvr).toBeCloseTo(baseline.teamOvr, 9);
  });

  it("детерминизм: тот же сид + тот же план ⇒ тот же счёт на свежем движке", () => {
    const a = draftComplete("prep-determinism");
    const b = draftComplete("prep-determinism");
    const [p1, p2, p3] = a.players;
    const plan = [
      { kind: "scrim" as const, a: p1.accountId, b: p2.accountId },
      { kind: "practice" as const, accountId: p3.accountId, heroId: a.heroes[2] },
    ];
    for (const action of plan) { a.addPrep(action); b.addPrep(action); }
    expect(b.score()).toEqual(a.score());
  });
});
