// Zustand-адаптер поверх RunEngine (T3.5). Вся логика — в движке; стор лишь хранит
// инстанс и снимок для рендера (граница из CLAUDE.md: game/ не зависит от ui/).
// Персист (game-state-architecture): забег сохраняется как config+seed+лог действий и
// восстанавливается детерминированным replay; имя команды — отдельная durable-настройка.
import { create } from "zustand";
import { RunEngine, type RosterSlot } from "../game/engine.ts";
import type { RunConfig, DraftPack } from "../game/packs.ts";
import { StaticDataSource } from "../data/DataSource.ts";
import type { GameData } from "../types/data.ts";
import type { ScoreBreakdown } from "../game/score.ts";
import {
  clearSavedRun,
  isRunCompatible,
  loadSavedRun,
  loadTeamName,
  saveRun,
  saveTeamName,
  type RunAction,
  type RunMode,
  type SavedRun,
} from "./runPersist.ts";

type Phase = "loading" | "start" | "draft" | "result";
export type { RunMode } from "./runPersist.ts";

interface Snapshot {
  currentPack: DraftPack;
  roster: RosterSlot[];
  rerollsLeft: number;
  currentSlotIndex: number;
  rosterFilled: number;
  isComplete: boolean;
  heroes: number[]; // драфтованные герои
  heroesLeft: number;
  packHeroes: number[]; // драфтуемые герои текущего пака
  score: ScoreBreakdown | null;
}

interface RunStore {
  phase: Phase;
  error: string | null;
  data: GameData | null;
  engine: RunEngine | null;
  config: RunConfig | null;
  seed: string;
  snapshot: Snapshot | null;
  selectedMode: RunMode | null;
  teamName: string;
  actions: RunAction[]; // лог действий текущего забега (для персиста/replay)
  resumable: SavedRun | null; // незавершённый совместимый забег, предложить продолжить

  loadData: () => Promise<void>;
  start: (config: RunConfig, seed: string) => void;
  pickPlayer: (idx: number) => void;
  pickHero: (heroId: number) => void;
  canPickPlayer: (idx: number) => boolean;
  canPickHero: (heroId: number) => boolean;
  assign: (accountId: number, heroId: number) => void;
  swapHeroes: (accountIdA: number, accountIdB: number) => void;
  reroll: () => void;
  reset: () => void;
  setSelectedMode: (mode: RunMode | null) => void;
  setTeamName: (name: string) => void;
  resumeRun: () => void;
  discardResume: () => void;
}

function snap(engine: RunEngine): Snapshot {
  return {
    currentPack: engine.currentPack,
    roster: engine.rosterView,
    rerollsLeft: engine.rerollsLeft,
    currentSlotIndex: engine.currentSlotIndex,
    rosterFilled: engine.rosterFilled,
    isComplete: engine.isComplete,
    heroes: engine.heroes,
    heroesLeft: engine.heroesLeft,
    packHeroes: engine.packHeroes,
    score: engine.score(),
  };
}

/** Детерминированный повтор действий на свежем движке (восстановление забега). */
function replay(engine: RunEngine, actions: RunAction[]): void {
  for (const action of actions) {
    if (action.t === "pickPlayer") engine.pickPlayer(action.index);
    else if (action.t === "pickHero") engine.pickHero(action.heroId);
    else if (action.t === "reroll") engine.reroll();
    else if (action.t === "assign") engine.assign(action.accountId, action.heroId);
    else if (action.t === "swap") engine.swapHeroes(action.a, action.b);
  }
}

export const useRun = create<RunStore>((set, get) => {
  // Сохранить текущий забег (config+seed+лог) под версию активного датасета.
  const persist = () => {
    const { data, config, seed, selectedMode, actions } = get();
    if (!data || !config || !selectedMode) return;
    saveRun({
      v: 1,
      schemaVersion: data.manifest.schemaVersion,
      ratingModelVersion: data.manifest.ratingModelVersion,
      mode: selectedMode,
      config,
      seed,
      actions,
    });
  };
  // Записать действие в лог и сохранить.
  const record = (action: RunAction) => {
    set((state) => ({ actions: [...state.actions, action] }));
    persist();
  };

  return {
    phase: "loading",
    error: null,
    data: null,
    engine: null,
    config: null,
    seed: "",
    snapshot: null,
    selectedMode: null,
    teamName: "",
    actions: [],
    resumable: null,

    async loadData() {
      try {
        const data = await new StaticDataSource().load();
        const saved = loadSavedRun();
        const compatible = saved
          && isRunCompatible(saved, data.manifest.schemaVersion, data.manifest.ratingModelVersion)
          && saved.actions.length > 0;
        if (saved && !compatible) clearSavedRun(); // датасет обновился — старый забег невалиден
        set({ data, phase: "start", teamName: loadTeamName(), resumable: compatible ? saved : null });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    start(config, seed) {
      const { data } = get();
      if (!data) return;
      try {
        const engine = new RunEngine(data, config, seed);
        set({ engine, config, seed, phase: "draft", snapshot: snap(engine), actions: [], resumable: null, error: null });
        persist();
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    pickPlayer(idx) {
      const { engine } = get();
      if (!engine || !engine.canPickPlayer(idx)) return;
      engine.pickPlayer(idx);
      set({ snapshot: snap(engine), phase: engine.isComplete ? "result" : "draft" });
      record({ t: "pickPlayer", index: idx });
    },

    pickHero(heroId) {
      const { engine } = get();
      if (!engine || !engine.canPickHero(heroId)) return;
      engine.pickHero(heroId);
      set({ snapshot: snap(engine), phase: engine.isComplete ? "result" : "draft" });
      record({ t: "pickHero", heroId });
    },

    assign(accountId, heroId) {
      const { engine } = get();
      if (!engine) return;
      engine.assign(accountId, heroId);
      set({ snapshot: snap(engine) });
      record({ t: "assign", accountId, heroId });
    },

    swapHeroes(accountIdA, accountIdB) {
      const { engine } = get();
      if (!engine) return;
      try {
        engine.swapHeroes(accountIdA, accountIdB);
        set({ snapshot: snap(engine) });
        record({ t: "swap", a: accountIdA, b: accountIdB });
      } catch {
        /* ignore invalid swap */
      }
    },

    reroll() {
      const { engine } = get();
      if (!engine) return;
      const ok = engine.reroll();
      set({ snapshot: snap(engine) });
      if (ok) record({ t: "reroll" });
    },

    canPickPlayer(idx) {
      return get().engine?.canPickPlayer(idx) ?? false;
    },

    canPickHero(heroId) {
      return get().engine?.canPickHero(heroId) ?? false;
    },

    reset() {
      clearSavedRun();
      set({ phase: "start", engine: null, config: null, seed: "", snapshot: null, actions: [], resumable: null, error: null });
    },

    setSelectedMode(selectedMode) {
      set({ selectedMode });
    },

    setTeamName(name) {
      saveTeamName(name);
      set({ teamName: name });
    },

    resumeRun() {
      const { data, resumable } = get();
      if (!data || !resumable) return;
      try {
        const engine = new RunEngine(data, resumable.config, resumable.seed);
        replay(engine, resumable.actions);
        set({
          engine,
          config: resumable.config,
          seed: resumable.seed,
          selectedMode: resumable.mode,
          actions: resumable.actions,
          snapshot: snap(engine),
          phase: engine.isComplete ? "result" : "draft",
          resumable: null,
          error: null,
        });
      } catch {
        clearSavedRun(); // сейв не воспроизвёлся (данные разошлись) — отбрасываем
        set({ resumable: null });
      }
    },

    discardResume() {
      clearSavedRun();
      set({ resumable: null });
    },
  };
});
