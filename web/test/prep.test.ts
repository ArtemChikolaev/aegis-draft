import { describe, expect, it } from "vitest";
import { loadGameData } from "./helpers/data.ts";
import { RunEngine } from "../src/game/engine.ts";
import { EMPTY_PREP, PREP, prepOverlay, prepPointsLeft, heroGamesKey, scoutedTeams } from "../src/game/prep.ts";
import { buildRealField, realTournamentEvents, realPackScore, rescoreRealField, scoutOptions, scoutedPackStrength } from "../src/game/realTournament.ts";
import { isMockBaseline } from "./helpers/dataset.ts";
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

describe("prep — разбор соперника (RT-E срез 2)", () => {
  const onMock = isMockBaseline(data.manifest);

  it("scout: движок держит лимит и уникальность, overlay своего счёта не трогает", () => {
    const engine = draftComplete("prep-scout-gate");
    expect(engine.canPrep({ kind: "scout", teamId: "" })).toBe(false);
    expect(engine.addPrep({ kind: "scout", teamId: "team-a" })).toBe(true);
    // Свой счёт разбором не меняется: наложение пусто.
    expect(engine.scoreOverlay.pairGames.size).toBe(0);
    expect(engine.scoreOverlay.heroGames.size).toBe(0);
    expect(engine.score()!.teamOvr).toBeCloseTo(engine.previewWithoutPrep()!.teamOvr, 9);
    // Один состав — один раз; не больше PREP.scoutMax.
    expect(engine.canPrep({ kind: "scout", teamId: "team-a" })).toBe(false);
    expect(engine.addPrep({ kind: "scout", teamId: "team-b" })).toBe(true);
    expect(engine.canPrep({ kind: "scout", teamId: "team-c" })).toBe(false);
    expect(scoutedTeams(engine.prepPlan)).toEqual(new Set(["team-a", "team-b"]));
    // Недели общие с остальными рычагами: два разбора съели два очка бюджета.
    expect(engine.prepPointsLeft).toBe(PREP.budget - 2);
  });

  it.skipIf(onMock)("rescoreRealField: разобранный состав теряет ровно долю Hero Synergy, состав поля не меняется", () => {
    const eventId = realTournamentEvents(data)[0].eventId;
    const field = buildRealField(data, eventId);
    const leader = field.opponents[0];
    const pack = data.packs.find((item) => item.id === leader.id)!;
    const score = realPackScore(data, pack);
    expect(scoutedPackStrength(data, pack)).toBeCloseTo(
      Math.round((score.base + score.heroSynergy * (1 - PREP.scoutSynergyCut)) * 10) / 10, 6,
    );
    const rescored = rescoreRealField(data, field, new Set([leader.id]));
    // Те же 17 id (поле известно заранее), но разобранный ослаб и порядок мог смениться.
    expect(new Set(rescored.opponents.map((o) => o.id))).toEqual(new Set(field.opponents.map((o) => o.id)));
    const after = rescored.opponents.find((o) => o.id === leader.id)!;
    expect(after.strength).toBeLessThan(leader.strength);
    // Без разборов — тот же объект (ни копий, ни пересборки).
    expect(rescoreRealField(data, field, new Set())).toBe(field);
  });

  it.skipIf(onMock)("scoutOptions: потеря = сила − сила после разбора, разобранные помечены", () => {
    const eventId = realTournamentEvents(data)[0].eventId;
    const field = buildRealField(data, eventId);
    const first = scoutOptions(data, field, new Set());
    expect(first).toHaveLength(field.opponents.length);
    for (const option of first) {
      expect(option.loss).toBeCloseTo(Math.round((option.strength - option.scoutedStrength) * 10) / 10, 6);
      expect(option.loss).toBeGreaterThanOrEqual(0);
      expect(option.scouted).toBe(false);
    }
    const marked = scoutOptions(data, field, new Set([field.opponents[0].id]));
    expect(marked.find((o) => o.teamId === field.opponents[0].id)!.scouted).toBe(true);
  });
});
