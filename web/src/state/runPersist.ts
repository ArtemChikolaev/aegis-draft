// Персист состояния забега и имени команды в localStorage (game-state-architecture).
// Забег НЕ сериализуется целиком: сохраняем config+seed+лог действий, а состояние
// восстанавливаем детерминированным replay на свежем RunEngine (seed+data ⇒ тот же забег).
// Версии данных + builtAt пишем в сейв: при обновлении датасета несовместимый забег отбрасываем.
// После завершённого турнира сейв очищаем — но только когда UI доиграл reveal до
// экрана результатов (finishTournament). Сама стадия playoffs ещё «в процессе».
import type { RosterSlot } from "../game/engine.ts";
import type { RunConfig } from "../game/packs.ts";
import type { Role } from "../types/data.ts";

export type RunMode = "classic" | "manager" | "tournament";

/** Действие игрока в забеге. Replay на движке восстанавливает точное состояние. */
export type RunAction =
  | { t: "pickPlayer"; index: number }
  | { t: "pickHero"; heroId: number }
  | { t: "reroll" }
  | { t: "fieldReroll" }
  | { t: "assign"; accountId: number; heroId: number }
  | { t: "swap"; a: number; b: number };

/** Замороженный ростер после драфта — проверка replay после смены датасета. */
export type FrozenRosterSlot = { role: Role; accountId: number; heroId: number };

export interface SavedRun {
  v: 1;
  schemaVersion: number;
  ratingModelVersion: string;
  /** manifest.builtAt на момент сохранения — инвалидирует сейв при data-refresh без bump версии. */
  dataBuiltAt: string;
  mode: RunMode;
  config: RunConfig;
  seed: string;
  actions: RunAction[];
  /** Число открытых турнирных этапов; результат пересобирается из seed. */
  tournamentStep?: number;
  tournamentStarted?: boolean;
  /** Ростер на момент persist; replay должен совпасть побайтно. */
  frozenRoster?: FrozenRosterSlot[];
}

const RUN_KEY = "aegis:run:v1";
const TEAM_KEY = "aegis:teamName:v1";

export function saveRun(run: SavedRun): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* localStorage недоступен (private mode) — просто не персистим */
  }
}

/**
 * JSON не умеет Infinity: `JSON.stringify({ rerolls: Infinity })` → `null`.
 * Easy-режим после reload должен снова получить бесконечные рероллы, иначе
 * `rerollsLeft <= 0` блокирует replay и resume молча сгорает.
 */
export function normalizeSavedRun(run: SavedRun): SavedRun {
  const rerolls = run.config?.rerolls;
  if (rerolls != null && Number.isFinite(rerolls)) return run;
  return { ...run, config: { ...run.config, rerolls: Infinity } };
}

export function loadSavedRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedRun;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.actions)) return null;
    return normalizeSavedRun(parsed);
  } catch {
    return null;
  }
}

export function clearSavedRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

/** Сейв совместим с текущим датасетом (иначе паки/seed разошлись — resume невалиден). */
export function isRunCompatible(
  run: SavedRun,
  schemaVersion: number,
  ratingModelVersion: string,
  dataBuiltAt: string,
): boolean {
  return (
    run.schemaVersion === schemaVersion
    && run.ratingModelVersion === ratingModelVersion
    && run.dataBuiltAt === dataBuiltAt
  );
}

/** Можно ли предложить resume: версии ок + есть seed/config. Пустой actions — ок (только стартовали). */
export function isSavedRunResumable(
  run: SavedRun | null,
  schemaVersion: number,
  ratingModelVersion: string,
  dataBuiltAt: string,
): run is SavedRun {
  return Boolean(
    run
    && isRunCompatible(run, schemaVersion, ratingModelVersion, dataBuiltAt)
    && run.seed
    && run.config,
  );
}

export function freezeRoster(
  roster: RosterSlot[],
  assignment: Record<number, number>,
): FrozenRosterSlot[] | null {
  const filled = roster.filter((slot) => slot.candidate);
  if (filled.length !== 5) return null;
  const frozen: FrozenRosterSlot[] = [];
  for (const slot of filled) {
    const accountId = slot.candidate!.player.accountId;
    const heroId = assignment[accountId];
    if (heroId == null) return null;
    frozen.push({ role: slot.role, accountId, heroId });
  }
  return frozen;
}

export function frozenRostersMatch(saved: FrozenRosterSlot[], replayed: FrozenRosterSlot[]): boolean {
  if (saved.length !== replayed.length) return false;
  return saved.every(
    (slot, index) =>
      slot.role === replayed[index].role
      && slot.accountId === replayed[index].accountId
      && slot.heroId === replayed[index].heroId,
  );
}

export function saveTeamName(name: string): void {
  try {
    localStorage.setItem(TEAM_KEY, name);
  } catch {
    /* ignore */
  }
}

export function loadTeamName(): string {
  try {
    return localStorage.getItem(TEAM_KEY) ?? "";
  } catch {
    return "";
  }
}
