// Zustand-адаптер поверх RunEngine (T3.5). Вся логика — в движке; стор лишь хранит
// инстанс и снимок для рендера (граница из CLAUDE.md: game/ не зависит от ui/).
import { create } from "zustand";
import { RunEngine, type RosterSlot } from "../game/engine.ts";
import type { RunConfig, DraftPack } from "../game/packs.ts";
import { StaticDataSource } from "../data/DataSource.ts";
import type { GameData } from "../types/data.ts";
import type { ScoreBreakdown } from "../game/score.ts";

type Phase = "loading" | "start" | "draft" | "result";
export type RunMode = "classic" | "manager" | "tournament";

interface Snapshot {
  currentPack: DraftPack;
  roster: RosterSlot[];
  rerollsLeft: number;
  currentSlotIndex: number;
  isComplete: boolean;
  heroPool: number[];
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

  loadData: () => Promise<void>;
  start: (config: RunConfig, seed: string) => void;
  pick: (idx: number) => void;
  reroll: () => void;
  canPick: (idx: number) => boolean;
  reset: () => void;
  setSelectedMode: (mode: RunMode | null) => void;
}

function snap(engine: RunEngine): Snapshot {
  return {
    currentPack: engine.currentPack,
    roster: engine.rosterView,
    rerollsLeft: engine.rerollsLeft,
    currentSlotIndex: engine.currentSlotIndex,
    isComplete: engine.isComplete,
    heroPool: engine.heroPool,
    score: engine.score(),
  };
}

export const useRun = create<RunStore>((set, get) => ({
  phase: "loading",
  error: null,
  data: null,
  engine: null,
  config: null,
  seed: "",
  snapshot: null,
  selectedMode: null,

  async loadData() {
    try {
      const data = await new StaticDataSource().load();
      set({ data, phase: "start" });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  start(config, seed) {
    const { data } = get();
    if (!data) return;
    try {
      const engine = new RunEngine(data, config, seed);
      set({ engine, config, seed, phase: "draft", snapshot: snap(engine), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  pick(idx) {
    const { engine } = get();
    if (!engine || !engine.canPick(idx)) return;
    engine.pick(idx);
    set({ snapshot: snap(engine), phase: engine.isComplete ? "result" : "draft" });
  },

  reroll() {
    const { engine } = get();
    if (!engine) return;
    engine.reroll();
    set({ snapshot: snap(engine) });
  },

  canPick(idx) {
    return get().engine?.canPick(idx) ?? false;
  },

  reset() {
    set({ phase: "start", engine: null, config: null, seed: "", snapshot: null, error: null });
  },

  setSelectedMode(selectedMode) {
    set({ selectedMode });
  },
}));
