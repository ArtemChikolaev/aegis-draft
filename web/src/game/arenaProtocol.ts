// Протокол Arena MP1 поверх relay-комнат (тот же слой, что Дуэль/duelProtocol): сервер отдаёт
// упорядоченный лог {seq, from, payload}, клиенты детерминированно применяют его и строят ОДНО
// и то же поле турнира на 18 команд. Сервер раздаёт только порядок и отправителя — сид, составы
// и боты считаются клиентами (версии датасета/баланса запинены комнатой, расхождений нет).
//
// MP1-поток: host шлёт start (общий сид + конфиг драфта) → каждый драфтит СВОИ паки локально
// (personal seed от memberId) и шлёт roster → host шлёт lock → поле = сданные составы + боты
// до 18 (autoDraft на детерминированных сидax; не сдавшие к локу участники честно заменяются
// ботами) → каждый клиент строит ОДИН И ТОТ ЖЕ турнир (canonical-рассадка buildResult сортирует
// по силе; эпсилон по каноническому индексу исключает точные ничьи сил, на которых tie-break по
// id разошёлся бы между клиентами — у зрителя «моя» команда имеет другой id, чем у меня).
//
// Правило устойчивости — как у Дуэли: невалидное сообщение молча игнорируется одинаково у всех.
// Анти-чит — MP3 (teamOvr в roster-сообщении принимается на веру; refs+heroes едут в логе,
// серверная ре-симуляция сможет проверить их задним числом).
import type { GameData } from "../types/data.ts";
import type { CandidateRef, RunConfig } from "./packs.ts";
import { autoDraftScore } from "./botDraft.ts";

export interface ArenaStartAction {
  kind: "start";
  seed: string;
  config: RunConfig;
}

export interface ArenaRosterAction {
  kind: "roster";
  name: string;
  refs: CandidateRef[];
  heroes: number[];
  teamOvr: number;
}

export interface ArenaLockAction {
  kind: "lock";
}

export type ArenaAction = ArenaStartAction | ArenaRosterAction | ArenaLockAction;

export interface ArenaRosterEntry {
  name: string;
  refs: CandidateRef[];
  heroes: number[];
  teamOvr: number;
}

export interface ArenaMatchState {
  seed: string;
  config: RunConfig;
  /** Отправитель start: только он может закрыть драфт (lock). */
  hostId: string;
  rosters: Record<string, ArenaRosterEntry>;
  locked: boolean;
}

/** Полная сетка классического турнира. */
export const ARENA_FIELD_SIZE = 18;

/** Личный сид драфта участника: паки у каждого свои, но воспроизводимые из общего сида. */
export function arenaDraftSeed(seed: string, memberId: string): string {
  return `${seed}:arena:${memberId}`;
}

/** Общий сид симуляции турнира — один на комнату. */
export function arenaSimSeed(seed: string): string {
  return `${seed}:arena:sim`;
}

function isRunConfig(raw: unknown): raw is RunConfig {
  if (typeof raw !== "object" || raw === null) return false;
  const config = raw as Record<string, unknown>;
  return (config.draftStyle === "team" || config.draftStyle === "mixed")
    && typeof config.format === "string"
    && typeof config.rerolls === "number"
    && typeof config.scoring === "string"
    && typeof config.allocation === "string";
}

function isRoster(raw: unknown): raw is ArenaRosterAction {
  if (typeof raw !== "object" || raw === null) return false;
  const action = raw as Record<string, unknown>;
  return action.kind === "roster"
    && typeof action.name === "string"
    && Array.isArray(action.refs) && action.refs.length === 5
    && Array.isArray(action.heroes) && action.heroes.length === 5
    && action.heroes.every((hero) => typeof hero === "number")
    && typeof action.teamOvr === "number" && Number.isFinite(action.teamOvr)
    && action.teamOvr >= 0 && action.teamOvr <= 200;
}

/** Применить одну запись relay-лога комнаты. Та же дисциплина, что duelProtocol. */
export function applyArenaEntry(
  state: ArenaMatchState | null,
  entry: { from: string; payload: unknown },
): ArenaMatchState | null {
  const raw = entry.payload;
  if (typeof raw !== "object" || raw === null) return state;
  const kind = (raw as Record<string, unknown>).kind;
  if (!state) {
    if (kind !== "start") return state;
    const start = raw as Record<string, unknown>;
    if (typeof start.seed !== "string" || start.seed.length === 0 || !isRunConfig(start.config)) return state;
    return {
      seed: start.seed,
      config: start.config,
      hostId: entry.from,
      rosters: {},
      locked: false,
    };
  }
  if (kind === "roster") {
    // Один состав на участника, только до лока: пере-сдать или дослать после закрытия нельзя.
    if (state.locked || state.rosters[entry.from] || !isRoster(raw)) return state;
    return {
      ...state,
      rosters: {
        ...state.rosters,
        [entry.from]: { name: raw.name, refs: raw.refs, heroes: raw.heroes, teamOvr: raw.teamOvr },
      },
    };
  }
  if (kind === "lock") {
    if (state.locked || entry.from !== state.hostId) return state;
    return { ...state, locked: true };
  }
  return state;
}

export interface ArenaTeamSeed {
  /** memberId участника либо `bot-N`. */
  id: string;
  name: string;
  /** Сила с каноническим эпсилоном — у всех клиентов совпадает до бита. */
  strength: number;
}

/**
 * Каноническое поле из 18 команд — ТОЛЬКО из состояния протокола (лог + датасет), никакого
 * живого presence: список участников комнаты меняется, а поле обязано быть одинаковым у всех.
 * Порядок: сданные составы по memberId (лексикографически), затем боты. Эпсилон по индексу
 * делает силы попарно различными — canonical-сортировка buildResult больше не зависит от
 * tie-break по id (который у «своей» команды у каждого клиента свой).
 */
export function buildArenaField(state: ArenaMatchState, data: GameData): ArenaTeamSeed[] {
  const humans = Object.entries(state.rosters)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, ARENA_FIELD_SIZE)
    .map(([memberId, roster]) => ({ id: memberId, name: roster.name, strength: roster.teamOvr }));
  const teams: ArenaTeamSeed[] = [...humans];
  for (let index = 0; teams.length < ARENA_FIELD_SIZE; index += 1) {
    const seed = `${state.seed}:arena:bot-${index}`;
    teams.push({ id: `bot-${index}`, name: `Bot ${index + 1}`, strength: autoDraftScore(data, state.config, seed).teamOvr });
  }
  return teams.map((team, index) => ({ ...team, strength: team.strength + index * 1e-6 }));
}
