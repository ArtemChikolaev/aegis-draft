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
import { LEGACY_MAX_RANK, LEGACY_NONE, LEGACY_ZERO, clampLegacy, legacyBonus, legacySpentTotal, type LegacyBranch, type LegacySpent } from "../game/arcade/content/legacy.ts";
import type { InputLogEntry } from "../game/arcade/types.ts";
import { COSMETICS, COSMETIC_BY_ID, SHARD_PRICE, rollCosmeticDrops, type CosmeticDrop, type CosmeticSlot } from "../game/arcade/content/cosmetics.ts";
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
  /** Отметки мастерства за забег (T13.48): что случилось, независимо от исхода. */
  camp?: boolean;
  outpost?: boolean;
  centaur?: boolean;
  necro?: boolean;
  revived?: boolean;
  contract?: boolean;
  thunder?: boolean;
  warden?: boolean;
  stalker?: boolean;
  /** Разлом пройден (T13.58). */
  rift?: boolean;
  /** Убийства по видам за забег (T13.56). */
  killsByKind?: Record<string, number>;
}

/** Отметки мастерства героя (T13.48): победы по актам, без единой смерти, лагерь, аванпост, чемпионы. */
export const MARK_IDS = ["win_full", "win_dire", "win_river", "flawless", "camp", "outpost", "centaur", "necro", "contract", "thunder", "warden", "stalker", "rift"] as const;
export type MarkId = (typeof MARK_IDS)[number];

const HISTORY_KEY = "aegis-draft.arcade.history";
const COSMETICS_KEY = "aegis-draft.arcade.cosmetics";
const GEAR_KEY = "aegis-draft.arcade.gear";
const AUTOCAST_KEY = "aegis-draft.arcade.autocast";
/** Постоянный прогресс (T13.37): открытия и lifetime-трофеи живут отдельно от ленты последних забегов. */
const PROGRESS_KEY = "aegis-draft.arcade.progress";
/** Ключей награждённых завершений наследия храним ограниченно: одинаковый seed/hero/act/rank награждается один раз. */
const LEGACY_CLAIMED_CAP = 200;

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
  /** Надетое по слотам для ВЫБРАННОГО героя — производное: `shared` + пресет героя (если включён) + его скин из `skins`
   *  (владелец 2026-09-07: «надеваю аркану на одном персонаже, а на другом она снимается»). Читатели работают с ним как с одним слотом. */
  equipped: Partial<Record<CosmeticSlot, string>>;
  /** Общий образ (эффекты для всех героев) — правда для слотов кроме `skin`. */
  shared: Partial<Record<CosmeticSlot, string>>;
  shards: number;
  /** Выбранный стиль скина (аркана/самоцвет): id косметики → id стиля. Стиль бесплатен, он идёт со скином. */
  styles: Record<string, string>;
  /** Скин у каждого героя свой: id героя → id косметики. */
  skins: Record<string, string>;
  /** Пресеты образа (T13.49): полный набор эффектов героя — id героя → слоты; действует вместо `shared`, когда
   *  `perHeroLook` включён и пресет есть (пустой слот = снято). Скин всегда на героя (`skins`). */
  perHero: Record<string, Partial<Record<CosmeticSlot, string>>>;
  perHeroLook: boolean;
}

/** `equipped.skin` = скин героя `hero` (или ничего): все читатели слота продолжают работать как с одним слотом. */
function withHeroSkin(c: CosmeticsState, hero: string): CosmeticsState {
  // Пресеты включены — образ героя целиком его (пустой слот в пресете = снято), без пресета — общий; скин — всегда героя (T13.49).
  const equipped: Partial<Record<CosmeticSlot, string>> = { ...(c.perHeroLook ? c.perHero[hero] ?? c.shared : c.shared) };
  delete equipped.skin;
  const id = c.skins[hero];
  if (id) equipped.skin = id;
  return { ...c, equipped };
}

function readCosmetics(): CosmeticsState {
  const empty: CosmeticsState = { owned: [], equipped: {}, shared: {}, shards: 0, styles: {}, skins: {}, perHero: {}, perHeroLook: false };
  try {
    const raw = readCached(COSMETICS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<CosmeticsState>) : null;
    if (!parsed || !Array.isArray(parsed.owned)) return empty;
    const equipped = parsed.equipped ?? {};
    // Сейвы до 2026-09-07: один слот скина на всех — переносим его герою, которому он принадлежит.
    const legacy = equipped.skin ? COSMETIC_BY_ID[equipped.skin] : undefined;
    const skins = parsed.skins ?? (legacy?.hero ? { [legacy.hero]: legacy.id } : {});
    // Сейвы до T13.49: общий образ лежал в `equipped` — берём его как `shared` (без скина).
    const shared = { ...(parsed.shared ?? equipped) }; delete shared.skin;
    const perHero = parsed.perHero && typeof parsed.perHero === "object" ? parsed.perHero : {};
    return { owned: parsed.owned, equipped, shared, shards: parsed.shards ?? 0, styles: parsed.styles ?? {}, skins, perHero, perHeroLook: parsed.perHeroLook === true };
  } catch {
    return empty;
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

/**
 * Прогресс читается из своего ключа; профиль без него (сейвы до T13.37) один раз сворачивается из
 * доступной истории. Победы, уже вытесненные из ленты 50 записей, восстановить нельзя — только то,
 * что осталось. Битая запись тоже сворачивается из истории, а не молча обнуляется.
 */
function readProgress(history: ArcadeHistoryEntry[]): ArcadeProgress {
  try {
    const raw = readCached(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ArcadeProgress>) : null;
    if (parsed && Array.isArray(parsed.acts) && parsed.perHero && typeof parsed.perHero === "object") return sanitizeProgress(parsed);
  } catch {
    /* сворачиваем из истории ниже */
  }
  return progressFromHistory(history);
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Запись из хранилища (в том числе будущей версии) приводится к известным полям; лишнее не ломает чтение. */
function sanitizeProgress(p: Partial<ArcadeProgress>): ArcadeProgress {
  const perHero: ArcadeProgress["perHero"] = {};
  for (const [hero, h] of Object.entries(p.perHero ?? {})) {
    if (!h || typeof h !== "object") continue;
    perHero[hero] = { runs: num(h.runs), victories: num(h.victories), bestSeconds: num(h.bestSeconds), bestLevel: num(h.bestLevel), marks: Array.isArray(h.marks) ? h.marks.filter((m): m is MarkId => (MARK_IDS as readonly string[]).includes(m)) : [] };
  }
  const lg = p.legacy;
  return {
    v: 1,
    acts: (p.acts ?? []).filter((a): a is ActId => a === "full" || a === "dire" || a === "river"),
    runs: num(p.runs), victories: num(p.victories), fullVictories: num(p.fullVictories),
    bestRank: p.bestRank == null ? null : num(p.bestRank), bestSeconds: num(p.bestSeconds), perHero,
    // Наследие (T13.44): профиль до него — нули; потраченное не может превышать заработанное.
    legacy: { seals: Math.max(0, num(lg?.seals)), spent: clampLegacy(lg?.spent), claimed: Array.isArray(lg?.claimed) ? lg!.claimed.filter((k): k is string => typeof k === "string").slice(-LEGACY_CLAIMED_CAP) : [] },
    bestiary: Object.fromEntries(Object.entries(p.bestiary && typeof p.bestiary === "object" ? p.bestiary : {}).filter(([, v]) => typeof v === "number" && v > 0).map(([k, v]) => [k, Math.floor(v as number)])),
  };
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
  /** Постоянные открытия и трофеи (T13.37): не зависят от обрезки `history`. */
  progress: ArcadeProgress;
  /** Печатей наследия, начисленных последним завершением (для экрана итога). */
  lastSeals: number;
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
  /** Пресеты образа (T13.49): свой набор эффектов у каждого героя вместо общего. */
  setPerHeroLook: (on: boolean) => void;
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
  /** Наследие Aegis (T13.44): вложить печать в ветку / бесплатно сбросить все. */
  legacySpend: (branch: LegacyBranch) => void;
  legacyReset: () => void;
  /** Забег закончился внутри сима — зафиксировать результат и записать историю. */
  finish: () => void;
  quit: () => void;
  bump: () => void;
}

const initialHistory = readHistory();

export const useArcade = create<ArcadeStore>((set, get) => ({
  status: "setup",
  seed: "",
  rank: 0,
  hero: "juggernaut",
  act: "full",
  serial: 0,
  outcome: null,
  history: initialHistory,
  progress: readProgress(initialHistory),
  lastSeals: 0,
  autoCast: readAutoCast(),
  replayLog: null,
  loadedReplay: null,
  cosmetics: withHeroSkin(readCosmetics(), "juggernaut"),
  lastDrops: [],
  gear: readGear(),
  lastLoot: [],

  start(seed) {
    const next = seed?.trim() || createRunSeed();
    const rank = Math.min(get().rank, maxUnlockedRank(get().progress));
    sim = new ArcadeSim(next, { rank, hero: get().hero, act: get().act, gear: equippedGear(get().gear), legacy: legacyBonus(get().progress.legacy.spent) });
    set({ status: "running", seed: next, rank, outcome: null, serial: 0, replayLog: null, lastDrops: [], lastLoot: [] });
  },
  startDaily() {
    const d = arcadeDaily();
    // Дейлик — без экипировки и без наследия: у всех одинаковые условия.
    sim = new ArcadeSim(d.seed, { rank: d.rank, hero: d.hero, act: d.act, legacy: LEGACY_NONE });
    set({ status: "running", seed: d.seed, rank: d.rank, hero: d.hero, act: d.act, outcome: null, serial: 0, replayLog: null });
  },
  startReplay(replay) {
    // Реплей читает снимок наследия из кода, не текущую прокачку зрителя.
    sim = new ArcadeSim(replay.seed, { rank: replay.rank, hero: replay.hero, act: replay.act, gear: replay.gear, legacy: legacyBonus(replay.legacy ?? LEGACY_ZERO) });
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
    if (!def || def.unlock || c.owned.includes(id) || c.shards < SHARD_PRICE[def.rarity]) return false;
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
    const c = get().cosmetics;
    const shared = { ...c.shared };
    const skins = { ...c.skins };
    const perHero = { ...c.perHero };
    if (slot === "skin") {
      // Скин — у героя, которому он принадлежит; снятие — у выбранного героя.
      const hero = id === null ? get().hero : COSMETIC_BY_ID[id]?.hero ?? get().hero;
      if (id === null) delete skins[hero]; else skins[hero] = id;
    } else if (c.perHeroLook) {
      // Пресет героя (T13.49): эффект пишется только выбранному герою.
      const mine = { ...(perHero[get().hero] ?? {}) };
      if (id === null) delete mine[slot]; else mine[slot] = id;
      perHero[get().hero] = mine;
    } else if (id === null) delete shared[slot]; else shared[slot] = id;
    const cosmetics = withHeroSkin({ ...c, shared, skins, perHero }, get().hero);
    void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics));
    set({ cosmetics });
  },
  setPerHeroLook(on) {
    const c = get().cosmetics;
    if (c.perHeroLook === on) return;
    const perHero = { ...c.perHero };
    // Включили — герой стартует с текущего общего образа, чтобы картинка не прыгала; выключили — пресеты остаются в сейве.
    if (on && !perHero[get().hero]) perHero[get().hero] = { ...c.shared };
    const cosmetics = withHeroSkin({ ...c, perHero, perHeroLook: on }, get().hero);
    void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics));
    set({ cosmetics });
  },
  setLoadedReplay(replay) {
    set({ loadedReplay: replay });
  },
  setAct(act) {
    if (act === "dire" && !hasFullActVictory(get().progress)) return;
    if (act === "river" && !hasActVictory(get().progress, "dire")) return;
    set({ act });
  },
  setHero(hero) {
    if (hero in HEROES) set({ hero, cosmetics: withHeroSkin(get().cosmetics, hero) });
  },
  setRank(rank) {
    set({ rank: Math.max(0, Math.min(MAX_RANK_STEP, Math.min(rank, maxUnlockedRank(get().progress)))) });
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
  legacySpend(branch) {
    const p = get().progress;
    const free = p.legacy.seals - legacySpentTotal(p.legacy.spent);
    if (free <= 0 || p.legacy.spent[branch] >= LEGACY_MAX_RANK) return;
    const progress: ArcadeProgress = { ...p, legacy: { ...p.legacy, spent: { ...p.legacy.spent, [branch]: p.legacy.spent[branch] + 1 } } };
    void writePersisted(PROGRESS_KEY, JSON.stringify(progress));
    set({ progress });
  },
  legacyReset() {
    const p = get().progress;
    if (legacySpentTotal(p.legacy.spent) === 0) return;
    const progress: ArcadeProgress = { ...p, legacy: { ...p.legacy, spent: { ...LEGACY_ZERO } } };
    void writePersisted(PROGRESS_KEY, JSON.stringify(progress));
    set({ progress });
  },
  toggleAutoCast(key) {
    const autoCast: AutoCastState = { ...get().autoCast, [key]: !get().autoCast[key] };
    void writePersisted(AUTOCAST_KEY, JSON.stringify(autoCast));
    set({ autoCast });
  },
  shopAct(act) {
    if (!sim || (!sim.shopOpen && !sim.neutralOpen && !sim.lootOpen && !sim.pondOpen && !sim.contractOpen && !sim.forgeOpen && !sim.riftOpen)) return;
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
      camp: o.campsCleared > 0, outpost: o.outpostCaptured, centaur: o.centaurSlain, necro: o.necromancerSlain, revived: o.revived, contract: o.contractDone, thunder: o.thunderSlain, warden: o.wardenSlain, stalker: o.stalkerSlain, rift: o.riftDone, killsByKind: o.killsByKind,
    };
    const history = [entry, ...get().history].slice(0, HISTORY_CAP);
    void writePersisted(HISTORY_KEY, JSON.stringify(history));
    // Прогресс — до обрезки ленты и один раз на завершение (повторный finish отсекает `status === "over"` выше).
    const progress = recordProgress(get().progress, entry);
    const lastSeals = progress.legacy.seals - get().progress.legacy.seals;
    void writePersisted(PROGRESS_KEY, JSON.stringify(progress));
    // Дроп косметики: детерминирован сидом и исходом; дубликаты → осколки.
    const prev = get().cosmetics;
    const drops = rollCosmeticDrops(sim.seed, o, prev.owned);
    const owned = [...prev.owned];
    let shards = prev.shards;
    for (const d of drops) { if (d.duplicate) shards += d.shards; else owned.push(d.id); }
    // Трофеи за отметки (T13.48): выдаются один раз, когда отметка появилась у любого героя; показываются как дроп.
    for (const c of COSMETICS) if (c.unlock && !owned.includes(c.id) && anyHeroHasMark(progress, c.unlock.mark)) { owned.push(c.id); drops.push({ id: c.id, duplicate: false, shards: 0 }); }
    const cosmetics: CosmeticsState = { ...prev, owned, shards };
    void writePersisted(COSMETICS_KEY, JSON.stringify(cosmetics));
    // Добыча — в инвентарь (и при смерти тоже, как у референса); переполнение — старые standard в осколки.
    const loot = o.loot as GearItem[];
    // Закалённая в кузне стартовая вещь (T13.52) живёт в инвентаре под тем же uid — берём версию из сима.
    const worn = Object.values(sim.player.gear) as GearItem[];
    let items = [...get().gear.items.filter((i) => !loot.some((l) => l.uid === i.uid)).map((i) => worn.find((w) => w.uid === i.uid && w.forged) ?? i), ...loot];
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
    set({ status: "over", outcome: o, history, progress, lastSeals, cosmetics, lastDrops: drops, gear, lastLoot: loot });
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
export function hasActVictory(progress: ArcadeProgress, act: ActId): boolean {
  return progress.acts.includes(act);
}

export function hasFullActVictory(progress: ArcadeProgress): boolean {
  return hasActVictory(progress, "full");
}

/** Открытая ступень: победа на ступени N открывает N+1 (как у референса — сложность за победы). */
export function maxUnlockedRank(progress: ArcadeProgress): number {
  // Ступень открывает только победа в полном акте: разминка до 9:00 — тренировка, не зачёт.
  return progress.bestRank === null ? 0 : Math.min(MAX_RANK_STEP, progress.bestRank + 1);
}

export interface ArcadeTrophies {
  runs: number;
  victories: number;
  fullVictories: number;
  /** Лучшая ступень, взятая победой в полном акте; null — побед нет. */
  bestRank: number | null;
  /** Лучшее время выживания в секундах (по любому акту). */
  bestSeconds: number;
  perHero: Record<string, { runs: number; victories: number; bestSeconds: number; bestLevel: number; marks: MarkId[] }>;
}

/** Звание героя по числу отметок: показывается рядом с именем на экране настройки. */
export function masteryTitle(marks: readonly MarkId[]): "novice" | "veteran" | "master" | "legend" {
  return marks.length >= 8 ? "legend" : marks.length >= 4 ? "master" : marks.length >= 1 ? "veteran" : "novice";
}

/** Есть ли отметка хотя бы у одного героя (награды-трофеи общие). */
export function anyHeroHasMark(progress: ArcadeProgress, mark: string): boolean {
  return Object.values(progress.perHero).some((h) => h.marks.includes(mark as MarkId));
}

/**
 * Постоянный профиль Аркады (T13.37): витрина для Штаба/Карьеры плюс взятые акты. Считается
 * накопительно по каждому завершению, поэтому не забывает победы, когда лента истории обрезается.
 */
export interface ArcadeProgress extends ArcadeTrophies {
  v: 1;
  /** Акты, взятые победой; разминка (`short`) сюда не входит — она ничего не открывает. */
  acts: ActId[];
  /** Наследие Aegis (T13.44): заработанные печати, вложенные пункты и ключи уже награждённых завершений. */
  legacy: { seals: number; spent: LegacySpent; claimed: string[] };
  /** Бестиарий (T13.56): суммарные убийства по видам врагов за все забеги. */
  bestiary: Record<string, number>;
}

export function emptyProgress(): ArcadeProgress {
  return { v: 1, acts: [], runs: 0, victories: 0, fullVictories: 0, bestRank: null, bestSeconds: 0, perHero: {}, legacy: { seals: 0, spent: { ...LEGACY_ZERO }, claimed: [] }, bestiary: {} };
}

/** Ключ завершения для однократной награды (дейлик содержит дату в сиде — не чаще раза в день). */
export function legacyClaimKey(e: Pick<ArcadeHistoryEntry, "seed" | "hero" | "act" | "rank">): string {
  return `${e.seed}|${e.hero ?? "juggernaut"}|${e.act ?? "short"}|${e.rank ?? 0}`;
}

/** Одно завершение забега поверх профиля. Разминка считается забегом и победой, но акт/ступень не открывает. */
export function recordProgress(p: ArcadeProgress, e: ArcadeHistoryEntry): ArcadeProgress {
  const hero = e.hero ?? "juggernaut";
  const prev = p.perHero[hero] ?? { runs: 0, victories: 0, bestSeconds: 0, bestLevel: 0, marks: [] };
  const h = { runs: prev.runs + 1, victories: prev.victories, bestSeconds: Math.max(prev.bestSeconds, e.seconds), bestLevel: Math.max(prev.bestLevel, e.level), marks: [...(prev.marks ?? [])] };
  const mark = (m: MarkId) => { if (!h.marks.includes(m)) h.marks.push(m); };
  if (e.camp) mark("camp"); if (e.outpost) mark("outpost"); if (e.centaur) mark("centaur"); if (e.necro) mark("necro"); if (e.contract) mark("contract"); if (e.thunder) mark("thunder"); if (e.warden) mark("warden"); if (e.stalker) mark("stalker"); if (e.rift) mark("rift");
  const bestiary = { ...p.bestiary };
  for (const [k, n] of Object.entries(e.killsByKind ?? {})) if (n > 0) bestiary[k] = (bestiary[k] ?? 0) + n;
  const next: ArcadeProgress = { ...p, acts: [...p.acts], runs: p.runs + 1, bestSeconds: Math.max(p.bestSeconds, e.seconds), perHero: { ...p.perHero, [hero]: h }, legacy: { ...p.legacy, spent: { ...p.legacy.spent }, claimed: [...p.legacy.claimed] }, bestiary };
  if (e.outcome === "victory") {
    next.victories++; h.victories++;
    if (e.act && e.act !== "short") {
      mark(`win_${e.act}` as MarkId);
      if (!e.revived) mark("flawless");
      // Печать наследия: за победу в полном акте, +1 за первую полную победу этим героем; одна и та же
      // комбинация seed/hero/act/rank — один раз (повтор пользовательского сида, реимпорт, повторный callback).
      const key = legacyClaimKey(e);
      const firstFull = !p.legacy.claimed.some((k) => k.split("|")[1] === hero);
      if (!next.legacy.claimed.includes(key)) {
        next.legacy.seals += 1 + (firstFull ? 1 : 0);
        next.legacy.claimed.push(key);
        if (next.legacy.claimed.length > LEGACY_CLAIMED_CAP) next.legacy.claimed.splice(0, next.legacy.claimed.length - LEGACY_CLAIMED_CAP);
      }
      next.fullVictories++;
      next.bestRank = Math.max(next.bestRank ?? 0, e.rank ?? 0);
      if (!next.acts.includes(e.act)) next.acts.push(e.act);
    }
  }
  return next;
}

/** Свёртка истории в профиль — миграция сейвов до T13.37 и витрина по произвольной ленте (лента новейшими вперёд). */
export function progressFromHistory(history: ArcadeHistoryEntry[]): ArcadeProgress {
  let p = emptyProgress();
  for (let i = history.length - 1; i >= 0; i--) p = recordProgress(p, history[i]);
  return p;
}

/** Витрина Аркады для Штаба и Карьеры (T13.5): тот же профиль. */
export function arcadeTrophies(progress: ArcadeProgress): ArcadeProgress {
  return progress;
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
