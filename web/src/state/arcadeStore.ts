// Стор Arcade (PRD §5.15, T13.5): оркестрация забега — старт/пауза/выбор карточки/финиш — и
// local-first история результатов. Сам сим живёт вне React (модульная переменная): 60 тиков в
// секунду через zustand — лишняя работа, HUD читает состояние по `serial`, который бампает цикл
// экрана ~10 раз в секунду. Посреди забега сейва нет (как у референса): пауза — по visibilitychange.
import { create } from "zustand";
import { ArcadeSim } from "../game/arcade/sim.ts";
import { ARCADE_CONFIG_VERSION } from "../game/arcade/config.ts";
import type { AbilityKey, ActId, ArcadeOutcome, SchoolId } from "../game/arcade/types.ts";
import { MAX_RANK_STEP } from "../game/arcade/content/ranks.ts";
import { HEROES, type HeroId } from "../game/arcade/content/heroes.ts";
import { arcadeDaily, type ArcadeReplay } from "../game/arcade/replay.ts";
import type { InputLogEntry } from "../game/arcade/types.ts";
import { COSMETIC_BY_ID, SHARD_PRICE, rollCosmeticDrops, type CosmeticDrop, type CosmeticSlot } from "../game/arcade/content/cosmetics.ts";
import { GEAR_SALVAGE, GEAR_SLOTS, type GearItem, type GearSlot } from "../game/arcade/content/gear.ts";
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
const GEAR_KEY = "aegis-draft.arcade.gear";
const AUTOCAST_KEY = "aegis-draft.arcade.autocast";

/** Автокаст по умениям — настройка игрока, живёт между забегами (владелец 2026-09-06:
 *  «умения не должны нажиматься сами, пока не включишь переключатель рядом»). По умолчанию всё выключено. */
export type AutoCastState = Record<AbilityKey, boolean> & { attack: boolean };
// Автоатака по умолчанию включена (без неё герой просто стоит), умения — выключены.
const AUTOCAST_OFF: AutoCastState = { q: false, w: false, e: false, r: false, attack: true };
function readAutoCast(): AutoCastState {
  try {
    const parsed = JSON.parse(readCached(AUTOCAST_KEY) ?? "null") as Partial<AutoCastState> | null;
    return parsed ? { q: !!parsed.q, w: !!parsed.w, e: !!parsed.e, r: !!parsed.r, attack: parsed.attack !== false } : { ...AUTOCAST_OFF };
  } catch {
    return { ...AUTOCAST_OFF };
  }
}
const GEAR_CAP = 80;

export interface GearState {
  items: GearItem[];
  equipped: Partial<Record<GearSlot, string>>;
}

function readGear(): GearState {
  try {
    const raw = readCached(GEAR_KEY);
    const parsed = raw ? (JSON.parse(raw) as GearState) : null;
    return parsed && Array.isArray(parsed.items) ? { items: parsed.items, equipped: parsed.equipped ?? {} } : { items: [], equipped: {} };
  } catch {
    return { items: [], equipped: {} };
  }
}

/** Надетые предметы как список для сима. */
export function equippedGear(gear: GearState): GearItem[] {
  return GEAR_SLOTS.map((slot) => gear.items.find((i) => i.uid === gear.equipped[slot])).filter((i): i is GearItem => !!i);
}

export interface CosmeticsState {
  owned: string[];
  equipped: Partial<Record<CosmeticSlot, string>>;
  shards: number;
  /** Выбранный стиль скина (аркана/самоцвет): id косметики → id стиля. Стиль бесплатен, он идёт со скином. */
  styles: Record<string, string>;
}

function readCosmetics(): CosmeticsState {
  try {
    const raw = readCached(COSMETICS_KEY);
    const parsed = raw ? (JSON.parse(raw) as CosmeticsState) : null;
    return parsed && Array.isArray(parsed.owned)
      ? { owned: parsed.owned, equipped: parsed.equipped ?? {}, shards: parsed.shards ?? 0, styles: parsed.styles ?? {} }
      : { owned: [], equipped: {}, shards: 0, styles: {} };
  } catch {
    return { owned: [], equipped: {}, shards: 0, styles: {} };
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
  autoCast: AutoCastState;
  /** Просмотр реплея: ввод берётся из лога, а не с клавиатуры; в историю не пишется. */
  replayLog: InputLogEntry[] | null;
  /** Реплей, готовый к просмотру (из кода/ссылки). */
  loadedReplay: ArcadeReplay | null;
  /** Косметика (T13.12): коллекция, экип, осколки; дроп последнего забега — для экрана итога. */
  cosmetics: CosmeticsState;
  lastDrops: CosmeticDrop[];
  /** Экипировка между забегами (T13.14): инвентарь и надетое по слотам. */
  gear: GearState;
  lastLoot: GearItem[];

  start: (seed?: string) => void;
  startDaily: () => void;
  startReplay: (replay: ArcadeReplay) => void;
  setLoadedReplay: (replay: ArcadeReplay | null) => void;
  equip: (slot: CosmeticSlot, id: string | null) => void;
  /** Выбрать стиль скина (аркана с самоцветом/стилем). null — базовый стиль. */
  setStyle: (cosmeticId: string, styleId: string | null) => void;
  equipGear: (slot: GearSlot, uid: string | null) => void;
  /** Разобрать предмет в осколки Aegis (надетый — снимается). */
  salvageGear: (uid: string) => void;
  /** Купить косметику за осколки Aegis (трата дублей). false — не хватает или уже есть. */
  buyCosmetic: (id: string) => boolean;
  setRank: (rank: number) => void;
  setHero: (hero: HeroId) => void;
  setAct: (act: ActId) => void;
  pause: () => void;
  resume: () => void;
  choose: (index: number) => void;
  /** Реролл офферов уровня (за золото) и изгнание апгрейда (карта i). */
  levelReroll: () => void;
  levelBanish: (index: number) => void;
  /** Действие в Secret Shop (SHOP_ACT): купить слот / реролл / закрыть. */
  shopAct: (act: number) => void;
  /** Переключить автокаст умения (сохраняется между забегами; в сим уходит через input-лог). */
  toggleAutoCast: (key: AbilityKey | "attack") => void;
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
  autoCast: readAutoCast(),
  replayLog: null,
  loadedReplay: null,
  cosmetics: readCosmetics(),
  lastDrops: [],
  gear: readGear(),
  lastLoot: [],

  start(seed) {
    const next = seed?.trim() || createRunSeed();
    const rank = Math.min(get().rank, maxUnlockedRank(get().history));
    sim = new ArcadeSim(next, { rank, hero: get().hero, act: get().act, gear: equippedGear(get().gear) });
    set({ status: "running", seed: next, rank, outcome: null, serial: 0, replayLog: null, lastDrops: [], lastLoot: [] });
  },
  startDaily() {
    const d = arcadeDaily();
    // Дейлик — без экипировки: у всех одинаковые условия.
    sim = new ArcadeSim(d.seed, { rank: d.rank, hero: d.hero, act: d.act });
    set({ status: "running", seed: d.seed, rank: d.rank, hero: d.hero, act: d.act, outcome: null, serial: 0, replayLog: null });
  },
  startReplay(replay) {
    sim = new ArcadeSim(replay.seed, { rank: replay.rank, hero: replay.hero, act: replay.act, gear: replay.gear });
    set({ status: "running", seed: replay.seed, rank: replay.rank, hero: replay.hero, act: replay.act, outcome: null, serial: 0, replayLog: replay.log });
  },
  equipGear(slot, uid) {
    const g = get().gear;
    if (uid !== null) { const item = g.items.find((i) => i.uid === uid); if (!item || item.slot !== slot) return; }
    const equipped = { ...g.equipped };
    if (uid === null) delete equipped[slot]; else equipped[slot] = uid;
    const gear = { ...g, equipped };
    void writePersisted(GEAR_KEY, JSON.stringify(gear));
    set({ gear });
  },
  salvageGear(uid) {
    const g = get().gear;
    const item = g.items.find((i) => i.uid === uid);
    if (!item) return;
    const equipped = { ...g.equipped };
    for (const slot of GEAR_SLOTS) if (equipped[slot] === uid) delete equipped[slot];
    const gear = { items: g.items.filter((i) => i.uid !== uid), equipped };
    const cosmetics = { ...get().cosmetics, shards: get().cosmetics.shards + GEAR_SALVAGE[item.rarity] };
    void writePersisted(GEAR_KEY, JSON.stringify(gear));
    void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics));
    set({ gear, cosmetics });
  },
  buyCosmetic(id) {
    const def = COSMETIC_BY_ID[id];
    const c = get().cosmetics;
    if (!def || c.owned.includes(id) || c.shards < SHARD_PRICE[def.rarity]) return false;
    const cosmetics: CosmeticsState = { ...c, owned: [...c.owned, id], shards: c.shards - SHARD_PRICE[def.rarity] };
    void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics));
    set({ cosmetics });
    return true;
  },
  setStyle(cosmeticId, styleId) {
    const def = COSMETIC_BY_ID[cosmeticId];
    if (!def || (styleId !== null && !def.styles?.some((st) => st.id === styleId))) return;
    const styles = { ...get().cosmetics.styles };
    if (styleId === null) delete styles[cosmeticId]; else styles[cosmeticId] = styleId;
    const cosmetics = { ...get().cosmetics, styles };
    void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics));
    set({ cosmetics });
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
    if (act === "dire" && !hasFullActVictory(get().history)) return;
    if (act === "river" && !hasActVictory(get().history, "dire")) return;
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
  levelReroll() {
    if (!sim || !sim.pending) return;
    sim.step({ mx: 0, my: 0, cast: 0, choose: -2, act: 0 });
    set((s) => ({ serial: s.serial + 1 }));
  },
  levelBanish(index) {
    if (!sim || !sim.pending) return;
    sim.step({ mx: 0, my: 0, cast: 0, choose: -1, act: 30 + index });
    set((s) => ({ serial: s.serial + 1 }));
  },
  toggleAutoCast(key) {
    const autoCast: AutoCastState = { ...get().autoCast, [key]: !get().autoCast[key] };
    void writePersisted(AUTOCAST_KEY, JSON.stringify(autoCast));
    set({ autoCast });
  },
  shopAct(act) {
    if (!sim || (!sim.shopOpen && !sim.neutralOpen && !sim.lootOpen)) return;
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
    // Добыча — в инвентарь (и при смерти тоже, как у референса); переполнение — старые standard в осколки.
    const loot = o.loot as GearItem[];
    let items = [...get().gear.items.filter((i) => !loot.some((l) => l.uid === i.uid)), ...loot];
    let extraShards = 0;
    while (items.length > GEAR_CAP) {
      const idx = items.findIndex((i) => i.rarity === "standard" && !Object.values(get().gear.equipped).includes(i.uid));
      if (idx < 0) break;
      extraShards += GEAR_SALVAGE.standard;
      items.splice(idx, 1);
    }
    const equipped = { ...get().gear.equipped };
    for (const slot of GEAR_SLOTS) { const g = sim.player.gear[slot] as GearItem | undefined; if (g) equipped[slot] = g.uid; }
    const gear: GearState = { items, equipped };
    void writePersisted(GEAR_KEY, JSON.stringify(gear));
    if (extraShards) { cosmetics.shards += extraShards; void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics)); }
    set({ status: "over", outcome: o, history, cosmetics, lastDrops: drops, gear, lastLoot: loot });
  },
  quit() {
    sim = null;
    set({ status: "setup", outcome: null });
  },
  bump() {
    set((s) => ({ serial: s.serial + 1 }));
  },
}));

/** Победа в конкретном акте (акт 2 открывает победа в полном акте 1, акт 3 — победа в акте 2). */
export function hasActVictory(history: ArcadeHistoryEntry[], act: ActId): boolean {
  return history.some((e) => e.outcome === "victory" && e.act === act);
}

export function hasFullActVictory(history: ArcadeHistoryEntry[]): boolean {
  return hasActVictory(history, "full");
}

/** Открытая ступень: победа на ступени N открывает N+1 (как у референса — сложность за победы). */
export function maxUnlockedRank(history: ArcadeHistoryEntry[]): number {
  let best = 0;
  // Ступень открывает только победа в полном акте: разминка до 9:00 — тренировка, не зачёт.
  for (const e of history) if (e.outcome === "victory" && e.act && e.act !== "short") best = Math.max(best, (e.rank ?? 0) + 1);
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
      if (e.act && e.act !== "short") { out.fullVictories++; out.bestRank = Math.max(out.bestRank ?? 0, e.rank ?? 0); }
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
