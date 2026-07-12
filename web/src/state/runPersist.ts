// Персист состояния забега и имени команды в localStorage (game-state-architecture).
// Забег НЕ сериализуется целиком: сохраняем config+seed+лог действий, а состояние
// восстанавливаем детерминированным replay на свежем RunEngine (seed+data ⇒ тот же забег).
// Версии данных пишем в сейв: при обновлении датасета несовместимый забег отбрасываем.
import type { RunConfig } from "../game/packs.ts";

export type RunMode = "classic" | "manager" | "tournament";

/** Действие игрока в забеге. Replay на движке восстанавливает точное состояние. */
export type RunAction =
  | { t: "pickPlayer"; index: number }
  | { t: "pickHero"; heroId: number }
  | { t: "reroll" }
  | { t: "assign"; accountId: number; heroId: number }
  | { t: "swap"; a: number; b: number };

export interface SavedRun {
  v: 1;
  schemaVersion: number;
  ratingModelVersion: string;
  mode: RunMode;
  config: RunConfig;
  seed: string;
  actions: RunAction[];
  /** Число открытых турнирных этапов; результат пересобирается из seed. */
  tournamentStep?: number;
  tournamentStarted?: boolean;
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

export function loadSavedRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedRun;
    return parsed && parsed.v === 1 && Array.isArray(parsed.actions) ? parsed : null;
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
export function isRunCompatible(run: SavedRun, schemaVersion: number, ratingModelVersion: string): boolean {
  return run.schemaVersion === schemaVersion && run.ratingModelVersion === ratingModelVersion;
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
