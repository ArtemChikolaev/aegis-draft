// Персист состояния забега и имени команды в localStorage (game-state-architecture).
// Забег НЕ сериализуется целиком: сохраняем config+seed+лог действий, а состояние
// восстанавливаем детерминированным replay на свежем RunEngine (seed+data ⇒ тот же забег).
// Версии данных + dataHash пишем в сейв: при изменении датасета несовместимый забег отбрасываем.
// После завершённого турнира сейв очищаем — но только когда UI доиграл reveal до
// экрана результатов (finishTournament). Сама стадия playoffs ещё «в процессе».
import type { RosterSlot } from "../game/engine.ts";
import type { PrepAction } from "../game/prep.ts";
import type { CandidateRef, RunConfig } from "../game/packs.ts";
import type { RunEconomyState } from "../game/anteEconomy.ts";
import type { Role } from "../types/data.ts";
import { readCached, readPersisted, removePersisted, writePersisted } from "./persist.ts";

export type RunMode = "classic" | "run" | "manager" | "tournament" | "arena" | "duel";

/** Действие игрока в забеге. Replay на движке восстанавливает точное состояние. */
export type RunAction =
  | { t: "pickPlayer"; index: number }
  | { t: "pickHero"; heroId: number }
  | { t: "reroll" }
  | { t: "fieldReroll" }
  | { t: "assign"; accountId: number; heroId: number }
  | { t: "swap"; a: number; b: number }
  | { t: "replacePlayer"; slotIndex: number; incoming: CandidateRef }
  | { t: "swapReservePlayer"; slotIndex: number; benchAccountId: number }
  | { t: "replaceHero"; outgoingHeroId: number; incomingHeroId: number }
  | { t: "swapReserveHero"; outgoingHeroId: number; reserveHeroId: number }
  // Подготовка к событию (Real Tournament, RT-E): недели сборов и их откат — часть лога, чтобы
  // resume восстанавливал план replay'ем, как ручную аллокацию; `prepDone` закрывает фазу.
  | { t: "prep"; action: PrepAction }
  | { t: "prepUndo" }
  | { t: "prepDone" };

/** Замороженный ростер после драфта — проверка replay после смены датасета. */
export type FrozenRosterSlot = { role: Role; accountId: number; heroId: number };

export interface SavedRun {
  v: 1;
  schemaVersion: number;
  ratingModelVersion: string;
  /** manifest.dataHash на момент сохранения — builtAt-only refresh не инвалидирует сейв. */
  dataHash?: string;
  /** Legacy-fallback для миграции старого сейва и отката на прежний frontend. */
  dataBuiltAt?: string;
  mode: RunMode;
  config: RunConfig;
  seed: string;
  actions: RunAction[];
  /** Число открытых турнирных этапов; результат пересобирается из seed. */
  tournamentStep?: number;
  tournamentStarted?: boolean;
  /** Roguelite Run: индекс текущего ante-этапа (mode "run"). Прочие режимы не пишут.
   *  В Династии (R6.3) уходит за длину сезона — верхней границы у него нет. */
  anteStageIndex?: number;
  /** Roguelite Run: сезон уже выигран, забег продолжается Династией (R6.3). Флаг хранится, а не
   *  выводится из индекса: победа — факт, а не следствие того, докуда дошёл счётчик. */
  anteSeasonWon?: boolean;
  /** Roguelite Run: экономика забега (валюта/покупки/Буткемп). Опционально — старые сейвы без неё читаются. */
  economy?: RunEconomyState;
  /** Roguelite Run: balanceConfigVersion на момент сохранения (T6.3). Смена коэффициентов орка/
   *  экономики/боссов меняет поле/награды → resume на новой версии невалиден. Legacy без ключа
   *  предшествует версионированию и читается lenient. */
  balanceConfigVersion?: string;
  /** Ростер на момент persist; replay должен совпасть побайтно. */
  frozenRoster?: FrozenRosterSlot[];
  /** Real Tournament (T5.6): событие, чьё поле играется. Обязателен для mode "tournament" —
   *  из него на resume детерминированно пересобираются поле и roster lock. */
  realEventId?: string;
}

const RUN_KEY = "aegis:run:v1";
const TEAM_KEY = "aegis:teamName:v1";

export function saveRun(run: SavedRun): void {
  // Синхронно в кэш + фоном в CloudStorage (state/persist): в webview Telegram кэш эфемерный.
  void writePersisted(RUN_KEY, JSON.stringify(run));
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

function parseSavedRun(raw: string | null): SavedRun | null {
  try {
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedRun;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.actions)) return null;
    return normalizeSavedRun(parsed);
  } catch {
    return null;
  }
}

/** Синхронное чтение из кэша. В Telegram кэш может быть пуст — там нужен `loadSavedRunAsync`. */
export function loadSavedRun(): SavedRun | null {
  return parseSavedRun(readCached(RUN_KEY));
}

/** Чтение с учётом облака: зовётся из `loadData`, который и так асинхронный. */
export async function loadSavedRunAsync(): Promise<SavedRun | null> {
  return parseSavedRun(await readPersisted(RUN_KEY));
}

export function clearSavedRun(): void {
  void removePersisted(RUN_KEY);
}

/** Сейв совместим с текущим датасетом (иначе паки/seed разошлись — resume невалиден).
 *  Для Roguelite Run дополнительно сверяется balanceConfigVersion: смена коэффициентов меняет
 *  поле/награды/боссы. Значима только для mode "run"; legacy-сейв без ключа — lenient. */
export function isRunCompatible(
  run: SavedRun,
  schemaVersion: number,
  ratingModelVersion: string,
  dataHash: string,
  dataBuiltAt?: string,
  balanceConfigVersion?: string,
): boolean {
  const sameData = run.dataHash
    ? run.dataHash === dataHash
    : Boolean(run.dataBuiltAt && dataBuiltAt && run.dataBuiltAt === dataBuiltAt);
  const sameBalance = run.mode !== "run"
    || run.balanceConfigVersion === undefined
    || balanceConfigVersion === undefined
    || run.balanceConfigVersion === balanceConfigVersion;
  return (
    run.schemaVersion === schemaVersion
    && run.ratingModelVersion === ratingModelVersion
    && sameData
    && sameBalance
  );
}

/** Можно ли предложить resume: версии ок + есть seed/config. Пустой actions — ок (только стартовали). */
export function isSavedRunResumable(
  run: SavedRun | null,
  schemaVersion: number,
  ratingModelVersion: string,
  dataHash: string,
  dataBuiltAt?: string,
  balanceConfigVersion?: string,
): run is SavedRun {
  return Boolean(
    run
    && isRunCompatible(run, schemaVersion, ratingModelVersion, dataHash, dataBuiltAt, balanceConfigVersion)
    && run.seed
    && run.config
    // Real Tournament без события не восстановить: поле и lock выводятся из realEventId.
    && (run.mode !== "tournament" || run.realEventId),
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
  void writePersisted(TEAM_KEY, name);
}

/** Имя команды с учётом облака — читается там же, где сейв забега. */
export async function loadTeamNameAsync(): Promise<string> {
  return (await readPersisted(TEAM_KEY)) ?? "";
}
