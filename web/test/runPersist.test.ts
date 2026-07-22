import { beforeEach, describe, expect, it } from "vitest";
import { RunEngine } from "../src/game/engine.ts";
import { careerRunIdFromRun } from "../src/state/careerStore.ts";
import {
  clearSavedRun,
  freezeRoster,
  frozenRostersMatch,
  isRunCompatible,
  isSavedRunResumable,
  loadSavedRun,
  normalizeSavedRun,
  saveRun,
  type RunAction,
  type SavedRun,
} from "../src/state/runPersist.ts";
import { useRun } from "../src/state/runStore.ts";
import { useCareer } from "../src/state/careerStore.ts";
import { loadGameData } from "./helpers/data.ts";
import { defaultRunConfig } from "./helpers/packs.ts";
import { runToEnd } from "./helpers/engine.ts";

function draftWithLog(
  data: ReturnType<typeof loadGameData>,
  config: typeof defaultRunConfig,
  seed: string,
  opts?: { forceReroll?: boolean },
) {
  const engine = new RunEngine(data, config, seed);
  const actions: RunAction[] = [];
  if (opts?.forceReroll) {
    expect(engine.reroll()).toBe(true);
    actions.push({ t: "reroll" });
  }
  let guard = 0;
  while (!engine.isComplete && guard++ < 200) {
    if (engine.rosterFilled < 5) {
      const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      engine.pickPlayer(idx);
      actions.push({ t: "pickPlayer", index: idx });
    } else {
      const hid = engine.packHeroes.find((h) => engine.canPickHero(h));
      if (hid == null) {
        if (!engine.reroll()) throw new Error("stuck");
        actions.push({ t: "reroll" });
        continue;
      }
      engine.pickHero(hid);
      actions.push({ t: "pickHero", heroId: hid });
    }
  }
  return { engine, actions };
}

describe("runPersist", () => {
  const data = loadGameData();
  const baseRun: SavedRun = {
    v: 1,
    schemaVersion: data.manifest.schemaVersion,
    ratingModelVersion: data.manifest.ratingModelVersion,
    dataBuiltAt: data.manifest.builtAt,
    mode: "classic",
    config: defaultRunConfig,
    seed: "persist-seed",
    actions: [{ t: "pickPlayer", index: 0 }],
  };

  beforeEach(() => {
    clearSavedRun();
  });

  it("isRunCompatible требует совпадения schema, rating и builtAt", () => {
    const { schemaVersion, ratingModelVersion, builtAt } = data.manifest;
    expect(isRunCompatible(baseRun, schemaVersion, ratingModelVersion, builtAt)).toBe(true);
    expect(isRunCompatible(baseRun, schemaVersion, ratingModelVersion, "2020-01-01T00:00:00Z")).toBe(false);
    expect(isRunCompatible({ ...baseRun, ratingModelVersion: "v0" }, schemaVersion, ratingModelVersion, builtAt)).toBe(false);
  });

  it("freezeRoster + frozenRostersMatch ловят расхождение replay", () => {
    const engine = new RunEngine(data, defaultRunConfig, "roster-freeze");
    runToEnd(engine);
    const score = engine.score()!;
    const frozen = freezeRoster(engine.rosterView, score.assignment.byPlayer)!;
    const replay = new RunEngine(data, defaultRunConfig, "roster-freeze");
    runToEnd(replay);
    const replayed = freezeRoster(replay.rosterView, replay.score()!.assignment.byPlayer)!;
    expect(frozenRostersMatch(frozen, replayed)).toBe(true);

    const other = new RunEngine(data, defaultRunConfig, "other-seed");
    runToEnd(other);
    const otherFrozen = freezeRoster(other.rosterView, other.score()!.assignment.byPlayer)!;
    expect(frozenRostersMatch(frozen, otherFrozen)).toBe(false);
  });

  it("saveRun/loadSavedRun roundtrip с frozenRoster", () => {
    const engine = new RunEngine(data, defaultRunConfig, "persist-roundtrip");
    runToEnd(engine);
    const score = engine.score()!;
    saveRun({
      ...baseRun,
      seed: "persist-roundtrip",
      frozenRoster: freezeRoster(engine.rosterView, score.assignment.byPlayer) ?? undefined,
    });
    const loaded = loadSavedRun();
    expect(loaded?.seed).toBe("persist-roundtrip");
    expect(loaded?.frozenRoster).toHaveLength(5);
  });

  it("Easy Infinity переживает JSON: null → Infinity", () => {
    saveRun({
      ...baseRun,
      config: { ...defaultRunConfig, rerolls: Infinity },
    });
    const raw = JSON.parse(localStorage.getItem("aegis:run:v1")!) as SavedRun;
    expect(raw.config.rerolls).toBeNull();
    expect(normalizeSavedRun(raw).config.rerolls).toBe(Infinity);
    expect(loadSavedRun()?.config.rerolls).toBe(Infinity);
  });

  it("isSavedRunResumable: пустой actions после start — всё ещё resume", () => {
    const { schemaVersion, ratingModelVersion, builtAt } = data.manifest;
    const started: SavedRun = { ...baseRun, actions: [] };
    expect(isSavedRunResumable(started, schemaVersion, ratingModelVersion, builtAt)).toBe(true);
    expect(isSavedRunResumable(null, schemaVersion, ratingModelVersion, builtAt)).toBe(false);
    expect(isSavedRunResumable(
      { ...started, dataBuiltAt: "other" },
      schemaVersion,
      ratingModelVersion,
      builtAt,
    )).toBe(false);

    // Тот же первый пак после resume без пиков
    const live = new RunEngine(data, defaultRunConfig, baseRun.seed);
    const packLabel = live.currentPack.label;
    saveRun(started);
    useRun.setState({
      phase: "start", error: null, data, engine: null, config: null, seed: "",
      snapshot: null, selectedMode: null, teamName: "", actions: [],
      resumable: loadSavedRun(), tournamentEngine: null, tournament: null, tournamentStep: 0, resultsSeen: false,
    });
    useRun.getState().resumeRun();
    expect(useRun.getState().phase).toBe("draft");
    expect(useRun.getState().snapshot?.currentPack.label).toBe(packLabel);
    expect(useRun.getState().snapshot?.rosterFilled).toBe(0);
  });

  it("mid-draft: пики + реролл переживают save→load→resume", () => {
    const seed = "mid-draft-resume";
    const engine = new RunEngine(data, defaultRunConfig, seed);
    const actions: RunAction[] = [];
    expect(engine.reroll()).toBe(true);
    actions.push({ t: "reroll" });
    const idx = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
    engine.pickPlayer(idx);
    actions.push({ t: "pickPlayer", index: idx });
    const nickname = engine.rosterView.find((s) => s.candidate)?.candidate?.player.nickname;

    saveRun({
      ...baseRun,
      seed,
      actions,
    });
    const loaded = loadSavedRun()!;
    expect(isSavedRunResumable(
      loaded,
      data.manifest.schemaVersion,
      data.manifest.ratingModelVersion,
      data.manifest.builtAt,
    )).toBe(true);

    useCareer.setState({ entries: [] });
    useRun.setState({
      phase: "start", error: null, data, engine: null, config: null, seed: "",
      snapshot: null, selectedMode: null, teamName: "", actions: [],
      resumable: loaded, tournamentEngine: null, tournament: null, tournamentStep: 0, resultsSeen: false,
    });
    useRun.getState().resumeRun();
    const state = useRun.getState();
    expect(state.phase).toBe("draft");
    expect(state.snapshot?.rosterFilled).toBe(1);
    expect(state.snapshot?.rerollsLeft).toBe(defaultRunConfig.rerolls - 1);
    expect(state.snapshot?.roster.find((s) => s.candidate)?.candidate?.player.nickname).toBe(nickname);
  });

  it("careerRunIdFromRun стабилен для config+seed", () => {
    const a = careerRunIdFromRun("seed-a", 1, "v1.3.0", defaultRunConfig);
    const b = careerRunIdFromRun("seed-a", 1, "v1.3.0", defaultRunConfig);
    const c = careerRunIdFromRun("seed-b", 1, "v1.3.0", defaultRunConfig);
    const roguelite = careerRunIdFromRun("seed-a", 1, "v1.3.0", defaultRunConfig, "run");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(roguelite);
  });
});

describe("useRun.resumeRun Easy + reroll", () => {
  const data = loadGameData();

  beforeEach(() => {
    clearSavedRun();
    useCareer.setState({ entries: [] });
    useRun.setState({
      phase: "start",
      error: null,
      data,
      engine: null,
      config: null,
      seed: "",
      snapshot: null,
      selectedMode: null,
      teamName: "Dream team",
      actions: [],
      resumable: null,
      tournamentEngine: null,
      tournament: null,
      tournamentStep: 0,
      resultsSeen: false,
    });
  });

  it("Easy с рероллом: JSON roundtrip → resume открывает tournament", () => {
    const seed = "easy-reroll-resume";
    const easy = { ...defaultRunConfig, rerolls: Infinity };
    const { engine, actions } = draftWithLog(data, easy, seed, { forceReroll: true });
    const score = engine.score()!;
    saveRun({
      v: 1,
      schemaVersion: data.manifest.schemaVersion,
      ratingModelVersion: data.manifest.ratingModelVersion,
      dataBuiltAt: data.manifest.builtAt,
      mode: "classic",
      config: easy,
      seed,
      actions,
      tournamentStep: 0,
      tournamentStarted: true,
      frozenRoster: freezeRoster(engine.rosterView, score.assignment.byPlayer) ?? undefined,
    });
    const loaded = loadSavedRun()!;
    expect(loaded.config.rerolls).toBe(Infinity);
    useRun.setState({ resumable: loaded, data, phase: "start" });

    useRun.getState().resumeRun();

    const state = useRun.getState();
    expect(state.phase).toBe("tournament");
    expect(state.tournament?.stage).toBe("field");
    expect(state.error).toBeNull();
    expect(state.snapshot?.isComplete).toBe(true);
  });

  it("вход в playoffs не чистит сейв; finishTournament — чистит и пишет career", () => {
    const seed = "playoffs-mid-reveal";
    const { engine, actions } = draftWithLog(data, defaultRunConfig, seed);
    const score = engine.score()!;
    const frozen = freezeRoster(engine.rosterView, score.assignment.byPlayer) ?? undefined;

    // Восстанавливаем как после драфта и симулируем advance field→groups→playoffs.
    useRun.setState({
      data,
      selectedMode: "classic",
      config: defaultRunConfig,
      seed,
      actions,
      engine,
      snapshot: {
        currentPack: engine.currentPack,
        roster: engine.rosterView,
        rerollsLeft: engine.rerollsLeft,
        currentSlotIndex: engine.currentSlotIndex,
        rosterFilled: engine.rosterFilled,
        isComplete: true,
        heroes: engine.heroes,
        heroesLeft: engine.heroesLeft,
        packHeroes: engine.packHeroes,
        packSerial: engine.packSerial,
        score,
      },
      phase: "tournament",
      resultsSeen: false,
    });
    // Через resume-путь поднимаем tournament engine на field, затем advance.
    saveRun({
      v: 1,
      schemaVersion: data.manifest.schemaVersion,
      ratingModelVersion: data.manifest.ratingModelVersion,
      dataBuiltAt: data.manifest.builtAt,
      mode: "classic",
      config: defaultRunConfig,
      seed,
      actions,
      tournamentStep: 0,
      tournamentStarted: true,
      frozenRoster: frozen,
    });
    useRun.setState({ resumable: loadSavedRun() });
    useRun.getState().resumeRun();
    useRun.getState().advanceTournament(); // → groups
    useRun.getState().advanceTournament(); // → playoffs

    expect(useRun.getState().tournament?.stage).toBe("playoffs");
    expect(useRun.getState().tournament?.canAdvance).toBe(false);
    expect(loadSavedRun()).not.toBeNull(); // сейв жив во время reveal
    expect(useCareer.getState().entries).toHaveLength(0);

    useRun.getState().finishTournament();

    expect(loadSavedRun()).toBeNull();
    expect(useRun.getState().resultsSeen).toBe(true);
    expect(useCareer.getState().entries).toHaveLength(1);
    useRun.getState().finishTournament(); // идемпотентно
    expect(useCareer.getState().entries).toHaveLength(1);
  });
});
