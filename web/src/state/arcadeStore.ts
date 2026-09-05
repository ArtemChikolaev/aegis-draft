// Стор Arcade (PRD §5.15, T13.5): оркестрация забега — старт/пауза/выбор карточки/финиш — и
// local-first история результатов. Сам сим живёт вне React (модульная переменная): 60 тиков в
// секунду через zustand — лишняя работа, HUD читает состояние по `serial`, который бампает цикл
// экрана ~10 раз в секунду. Посреди забега сейва нет (как у референса): пауза — по visibilitychange.
import { create } from "zustand";
import { ArcadeSim } from "../game/arcade/sim.ts";
import { ARCADE_CONFIG_VERSION } from "../game/arcade/config.ts";
import type { ActId, ArcadeOutcome, SchoolId } from "../game/arcade/types.ts";
import { MAX_RANK_STEP } from "../game/arcade/content/ranks.ts";
import { HEROES, type HeroId } from "../game/arcade/content/heroes.ts";
import { arcadeDaily, type ArcadeReplay } from "../game/arcade/replay.ts";
import type { InputLogEntry } from "../game/arcade/types.ts";
import { COSMETIC_BY_ID, rollCosmeticDrops, type CosmeticDrop, type CosmeticSlot } from "../game/arcade/content/cosmetics.ts";
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
  act?: ActId;
}

const HISTORY_KEY = "aegis-draft.arcade.history";
const COSMETICS_KEY = "aegis-draft.arcade.cosmetics";

export interface CosmeticsState {
  owned: string[];
  equipped: Partial<Record<CosmeticSlot, string>>;
  shards: number;
}

function readCosmetics(): CosmeticsState {
  try {
    const raw = readCached(COSMETICS_KEY);
    const parsed = raw ? (JSON.parse(raw) as CosmeticsState) : null;
    return parsed && Array.isArray(parsed.owned) ? { owned: parsed.owned, equipped: parsed.equipped ?? {}, shards: parsed.shards ?? 0 } : { owned: [], equipped: {}, shards: 0 };
  } catch {
    return { owned: [], equipped: {}, shards: 0 };
  }
}
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
  act: ActId;
  serial: number;
  outcome: ArcadeOutcome | null;
  history: ArcadeHistoryEntry[];
  /** Авто-каст способностей (по умолчанию включён: тач без него неиграбелен). */
  autoCast: boolean;
  /** Просмотр реплея: ввод берётся из лога, а не с клавиатуры; в историю не пишется. */
  replayLog: InputLogEntry[] | null;
  /** Реплей, готовый к просмотру (из кода/ссылки). */
  loadedReplay: ArcadeReplay | null;
  /** Косметика (T13.12): коллекция, экип, осколки; дроп последнего забега — для экрана итога. */
  cosmetics: CosmeticsState;
  lastDrops: CosmeticDrop[];

  start: (seed?: string) => void;
  startDaily: () => void;
  startReplay: (replay: ArcadeReplay) => void;
  setLoadedReplay: (replay: ArcadeReplay | null) => void;
  equip: (slot: CosmeticSlot, id: string | null) => void;
  setRank: (rank: number) => void;
  setHero: (hero: HeroId) => void;
  setAct: (act: ActId) => void;
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
  act: "full",
  serial: 0,
  outcome: null,
  history: readHistory(),
  autoCast: true,
  replayLog: null,
  loadedReplay: null,
  cosmetics: readCosmetics(),
  lastDrops: [],

  start(seed) {
    const next = seed?.trim() || createRunSeed();
    const rank = Math.min(get().rank, maxUnlockedRank(get().history));
    sim = new ArcadeSim(next, { rank, hero: get().hero, act: get().act });
    set({ status: "running", seed: next, rank, outcome: null, serial: 0, replayLog: null, lastDrops: [] });
  },
  startDaily() {
    const d = arcadeDaily();
    sim = new ArcadeSim(d.seed, { rank: d.rank, hero: d.hero, act: d.act });
    set({ status: "running", seed: d.seed, rank: d.rank, hero: d.hero, act: d.act, outcome: null, serial: 0, replayLog: null });
  },
  startReplay(replay) {
    sim = new ArcadeSim(replay.seed, { rank: replay.rank, hero: replay.hero, act: replay.act });
    set({ status: "running", seed: replay.seed, rank: replay.rank, hero: replay.hero, act: replay.act, outcome: null, serial: 0, replayLog: replay.log });
  },
  equip(slot, id) {
    if (id !== null && (!COSMETIC_BY_ID[id] || COSMETIC_BY_ID[id].slot !== slot || !get().cosmetics.owned.includes(id))) return;
    const equipped = { ...get().cosmetics.equipped };
    if (id === null) delete equipped[slot]; else equipped[slot] = id;
    const cosmetics = { ...get().cosmetics, equipped };
    void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics));
    set({ cosmetics });
  },
  setLoadedReplay(replay) {
    set({ loadedReplay: replay });
  },
  setAct(act) {
    set({ act });
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
    if (get().replayLog) { set({ status: "over", outcome: o }); return; }
    const entry: ArcadeHistoryEntry = {
      seed: sim.seed, outcome: o.outcome, seconds: Math.floor(o.tick / 60), level: o.level, kills: o.kills, gold: o.gold,
      schools: o.schools, configVersion: ARCADE_CONFIG_VERSION, at: Date.now(), rank: o.rank, greedStacks: o.greedStacks, items: o.items, hero: o.hero, act: o.act,
    };
    const history = [entry, ...get().history].slice(0, HISTORY_CAP);
    void writePersisted(HISTORY_KEY, JSON.stringify(history));
    // Дроп косметики: детерминирован сидом и исходом; дубликаты → осколки.
    const prev = get().cosmetics;
    const drops = rollCosmeticDrops(sim.seed, o, prev.owned);
    const owned = [...prev.owned];
    let shards = prev.shards;
    for (const d of drops) { if (d.duplicate) shards += d.shards; else owned.push(d.id); }
    const cosmetics: CosmeticsState = { ...prev, owned, shards };
    void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics));
    set({ status: "over", outcome: o, history, cosmetics, lastDrops: drops });
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
  // Ступень открывает только победа в полном акте: разминка до 9:00 — тренировка, не зачёт.
  for (const e of history) if (e.outcome === "victory" && (e.act ?? "short") === "full") best = Math.max(best, (e.rank ?? 0) + 1);
  return Math.min(MAX_RANK_STEP, best);
}

export interface ArcadeTrophies {
  runs: number;
  victories: number;
  fullVictories: number;
  /** Лучшая ступень, взятая победой в полном акте; null — побед нет. */
  bestRank: number | null;
  /** Лучшее время выживания в секундах (по любому акту). */
  bestSeconds: number;
  perHero: Record<string, { runs: number; victories: number; bestSeconds: number; bestLevel: number }>;
}

/** Витрина Аркады для Штаба и Карьеры (T13.5) — производная собственной истории режима. */
export function arcadeTrophies(history: ArcadeHistoryEntry[]): ArcadeTrophies {
  const out: ArcadeTrophies = { runs: 0, victories: 0, fullVictories: 0, bestRank: null, bestSeconds: 0, perHero: {} };
  for (const e of history) {
    const hero = e.hero ?? "juggernaut";
    const h = out.perHero[hero] ?? (out.perHero[hero] = { runs: 0, victories: 0, bestSeconds: 0, bestLevel: 0 });
    out.runs++; h.runs++;
    h.bestSeconds = Math.max(h.bestSeconds, e.seconds);
    h.bestLevel = Math.max(h.bestLevel, e.level);
    out.bestSeconds = Math.max(out.bestSeconds, e.seconds);
    if (e.outcome === "victory") {
      out.victories++; h.victories++;
      if ((e.act ?? "short") === "full") { out.fullVictories++; out.bestRank = Math.max(out.bestRank ?? 0, e.rank ?? 0); }
    }
  }
  return out;
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
