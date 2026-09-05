// Стор Arcade (PRD §5.15, T13.5): оркестрация забега — старт/пауза/выбор карточки/финиш — и
// local-first история результатов. Сам сим живёт вне React (модульная переменная): 60 тиков в
// секунду через zustand — лишняя работа, HUD читает состояние по `serial`, который бампает цикл
// экрана ~10 раз в секунду. Посреди забега сейва нет (как у референса): пауза — по visibilitychange.
import { create } from "zustand";
import { ArcadeSim } from "../game/arcade/sim.ts";
import { ARCADE_CONFIG_VERSION } from "../game/arcade/config.ts";
import type { ArcadeOutcome, SchoolId } from "../game/arcade/types.ts";
import { MAX_RANK_STEP } from "../game/arcade/content/ranks.ts";
import { HEROES, type HeroId } from "../game/arcade/content/heroes.ts";
import { createRunSeed } from "../game/rng.ts";
import { readCached, writePersisted } from "./persist.ts";

export type ArcadeStatus = "setup" | "running" | "paused" | "over";

export interface ArcadeHistoryEntry {
  seed: string;
  outcome: ArcadeOutcome["outcome"];
  seconds: number;
  level: number;
  kills: number;
  gold: number;
  schools: SchoolId[];
  configVersion: string;
  at: number;
  /** Ступень лестницы сложности (T13.7); у записей до a0.3.0 отсутствует = 0. */
  rank?: number;
  greedStacks?: number;
  items?: string[];
  hero?: string;
}

const HISTORY_KEY = "aegis-draft.arcade.history";
const HISTORY_CAP = 50;

let sim: ArcadeSim | null = null;

/** Живой сим текущего забега (для цикла экрана и рендера). null вне забега. */
export function getArcadeSim(): ArcadeSim | null {
  return sim;
}

function readHistory(): ArcadeHistoryEntry[] {
  try {
    const raw = readCached(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as ArcadeHistoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface ArcadeStore {
  status: ArcadeStatus;
  seed: string;
  /** Выбранная ступень сложности для следующего забега. */
  rank: number;
  hero: HeroId;
  serial: number;
  outcome: ArcadeOutcome | null;
  history: ArcadeHistoryEntry[];
  /** Авто-каст способностей (по умолчанию включён: тач без него неиграбелен). */
  autoCast: boolean;

  start: (seed?: string) => void;
  setRank: (rank: number) => void;
  setHero: (hero: HeroId) => void;
  pause: () => void;
  resume: () => void;
  choose: (index: number) => void;
  /** Действие в Secret Shop (SHOP_ACT): купить слот / реролл / закрыть. */
  shopAct: (act: number) => void;
  /** Забег закончился внутри сима — зафиксировать результат и записать историю. */
  finish: () => void;
  quit: () => void;
  bump: () => void;
}

export const useArcade = create<ArcadeStore>((set, get) => ({
  status: "setup",
  seed: "",
  rank: 0,
  hero: "juggernaut",
  serial: 0,
  outcome: null,
  history: readHistory(),
  autoCast: true,

  start(seed) {
    const next = seed?.trim() || createRunSeed();
    const rank = Math.min(get().rank, maxUnlockedRank(get().history));
    sim = new ArcadeSim(next, { rank, hero: get().hero });
    set({ status: "running", seed: next, rank, outcome: null, serial: 0 });
  },
  setHero(hero) {
    if (hero in HEROES) set({ hero });
  },
  setRank(rank) {
    set({ rank: Math.max(0, Math.min(MAX_RANK_STEP, Math.min(rank, maxUnlockedRank(get().history)))) });
  },
  pause() {
    if (get().status === "running") set({ status: "paused" });
  },
  resume() {
    if (get().status === "paused") set({ status: "running" });
  },
  choose(index) {
    if (!sim || !sim.pending) return;
    sim.step({ mx: 0, my: 0, cast: 0, choose: index, act: 0 });
    set((s) => ({ serial: s.serial + 1 }));
  },
  shopAct(act) {
    if (!sim || !sim.shopOpen) return;
    sim.step({ mx: 0, my: 0, cast: 0, choose: -1, act });
    set((s) => ({ serial: s.serial + 1 }));
  },
  finish() {
    if (!sim?.over || get().status === "over") return;
    const o = sim.over;
    const entry: ArcadeHistoryEntry = {
      seed: sim.seed, outcome: o.outcome, seconds: Math.floor(o.tick / 60), level: o.level, kills: o.kills, gold: o.gold,
      schools: o.schools, configVersion: ARCADE_CONFIG_VERSION, at: Date.now(), rank: o.rank, greedStacks: o.greedStacks, items: o.items, hero: o.hero,
    };
    const history = [entry, ...get().history].slice(0, HISTORY_CAP);
    void writePersisted(HISTORY_KEY, JSON.stringify(history));
    set({ status: "over", outcome: o, history });
  },
  quit() {
    sim = null;
    set({ status: "setup", outcome: null });
  },
  bump() {
    set((s) => ({ serial: s.serial + 1 }));
  },
}));

/** Открытая ступень: победа на ступени N открывает N+1 (как у референса — сложность за победы). */
export function maxUnlockedRank(history: ArcadeHistoryEntry[]): number {
  let best = 0;
  for (const e of history) if (e.outcome === "victory") best = Math.max(best, (e.rank ?? 0) + 1);
  return Math.min(MAX_RANK_STEP, best);
}

/** Лучший результат в истории: сначала победы, потом по времени выживания. */
export function bestArcadeEntry(history: ArcadeHistoryEntry[]): ArcadeHistoryEntry | null {
  let best: ArcadeHistoryEntry | null = null;
  for (const e of history) {
    if (!best) { best = e; continue; }
    const score = (x: ArcadeHistoryEntry) => (x.outcome === "victory" ? 100000 : 0) + (x.rank ?? 0) * 1000 + x.seconds;
    if (score(e) > score(best)) best = e;
  }
  return best;
}
