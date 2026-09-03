// Таблицы опций стартового экрана (T12.5, 2026-09-02): раньше жили в StartScreen.tsx, теперь их
// читают и ветки выбора режима/варианта (ModeSelect, VariantSelect, ModePreview).
import type { MessageKey } from "../../i18n/core.ts";
import type { RunMode } from "../../state/runStore.ts";
import type { DraftStyle, Scoring, Allocation } from "../../game/packs.ts";
import type { Format } from "../../types/data.ts";
import type { MutatorId } from "../../game/dynastyMutators.ts";

export interface Opt<T> {
  value: T;
  label: MessageKey;
  hint?: MessageKey;
  soon?: boolean;
  /** Опция есть, но недоступна при текущих настройках (в отличие от `soon` — «будет позже»). */
  disabled?: boolean;
}

/** `needsNetwork` — режим неиграбелен без интернета ПО СМЫСЛУ (живые соперники), а не потому,
 *  что данные лежат на CDN: одиночные режимы играются офлайн и этим флагом не помечаются. */
export const MODES: { value: RunMode; label: MessageKey; hint: MessageKey; detail: MessageKey; available: boolean; needsNetwork?: boolean }[] = [
  { value: "classic", label: "start.modeClassic", hint: "start.modeClassicHint", detail: "start.modeClassicLong", available: true },
  // Manager доступен (T5.5, срез 1): карточка ведёт в собственный флоу ManagerScreen —
  // App перехватывает selectedMode === "manager" до фазовых экранов classic-забега.
  { value: "manager", label: "start.modeManager", hint: "start.modeManagerHint", detail: "start.modeManagerLong", available: true },
  // Real Tournament доступен (T5.6): поле = реальные составы выбранного события, roster lock.
  { value: "tournament", label: "start.modeTournament", hint: "start.modeTournamentHint", detail: "start.modeTournamentLong", available: true },
  // Arena (M10, PRD §5.12): онлайн-турнир на 18 команд. Карточка и красный акцент режима живут
  // уже сейчас; сам режим ждёт живого ws-сервера (MP0) — до него превью «Скоро», как у соседей.
  { value: "arena", label: "start.modeArena", hint: "start.modeArenaHint", detail: "start.modeArenaLong", available: false, needsNetwork: true },
  // Дуэль (M-DUEL): онлайн 1×1 по коду комнаты (relay-инфраструктура MP0). App перехватывает
  // selectedMode === "duel" до фазовых экранов, как у Manager.
  { value: "duel", label: "start.modeDuel", hint: "start.modeDuelHint", detail: "start.modeDuelLong", available: true, needsNetwork: true },
];

/** Режимы, использующие Classic-конфиг драфта (Quick Draft и Roguelite Run поверх него).
 *  Обе ветки открываются из одной карточки Classic через шаг выбора варианта. */
export const DRAFT_CONFIG_MODES: RunMode[] = ["classic", "run", "tournament"];
/** Roguelite Run фиксирует рероллы (стартовых всегда максимум 2) — сложность не выбирается. */
export const ROGUELITE_REROLLS = 2;

export const DRAFT: Opt<DraftStyle>[] = [
  { value: "team", label: "start.teamPacks", hint: "start.teamPacksHint" },
  { value: "mixed", label: "start.mixedDraft", hint: "start.mixedDraftHint" },
];
export const FORMAT: Opt<Format>[] = [
  { value: "last_1y", label: "start.last1y" },
  { value: "last_2y", label: "start.last2y", hint: "start.standard" },
  { value: "last_5y", label: "start.last5y" },
  { value: "valve_legacy", label: "start.valveLegacy", hint: "start.legacyHint" },
];
/** Сложность = число рероллов пака. Хардкор равен нулю рероллов, отсюда и связка ниже. */
export const HARDCORE_REROLLS = 0;
export const DIFFICULTY: Opt<number>[] = [
  { value: HARDCORE_REROLLS, label: "start.hard", hint: "start.rerolls0" },
  { value: 1, label: "start.normal", hint: "start.rerolls1" },
  { value: 2, label: "start.smurfing", hint: "start.rerolls2" },
  { value: Infinity, label: "start.easy", hint: "start.rerollsInfinite" },
];
export const SCORING: Opt<Scoring>[] = [
  { value: "event", label: "start.eventRating", hint: "start.eventRatingHint" },
  { value: "peak", label: "start.peakRating", hint: "start.peakRatingHint", soon: true },
];
export const HARD_MODE: Opt<boolean>[] = [
  { value: false, label: "hard.off", hint: "hard.offHint" },
  { value: true, label: "hard.on", hint: "hard.onHint" },
];
export const CHEAT_MODE: Opt<boolean>[] = [
  { value: false, label: "cheat.off", hint: "cheat.offHint" },
  { value: true, label: "cheat.on", hint: "cheat.onHint" },
];
/** Стартовые Stakes (T6.4) — лестница по ЗАМЕРЕННОЙ тяжести (300 сидов, база 31.3%):
 *  uncappedBoss 27.7% и doubleBans 27.7% (умеренные, b1.41.0 — семантика пересмотрена до
 *  рабочей в сезоне), expensiveMarket 25.0% (средний), tighterTargets 23.3% (жёсткий).
 *  Замеры — BACKLOG T6.4. */
export const STAKE_CHOICES: { id: MutatorId; severity: MessageKey }[] = [
  { id: "uncappedBoss", severity: "stake.sevLight" },
  { id: "doubleBans", severity: "stake.sevLight" },
  { id: "expensiveMarket", severity: "stake.sevMedium" },
  { id: "tighterTargets", severity: "stake.sevHard" },
];

export const ALLOCATION: Opt<Allocation>[] = [
  { value: "auto", label: "start.automatic", hint: "start.automaticHint" },
  { value: "manual", label: "start.manual", hint: "start.manualHint" },
];
