// Протокол Arena MP2 поверх relay-комнат (тот же слой, что Дуэль/duelProtocol): сервер отдаёт
// упорядоченный лог {seq, from, payload}, клиенты детерминированно применяют его к
// ArenaDraftEngine и приходят в одно и то же состояние без сверки. Сервер раздаёт только
// порядок и отправителя (версии датасета/баланса запинены комнатой — расхождений пулов нет).
//
// MP2-поток: host шлёт start (общий сид + формат + снапшот участников на момент старта) →
// каждый раунд участники шлют pick (пик + необязательный запасной); раунд резолвится в тот
// момент лога, когда сдал ПОСЛЕДНИЙ человек, либо по close от host (таймер раунда — авто-close
// хоста; серверного таймера нет, как и в MP1 «host лочит»). После 10 раундов драфт завершён —
// каждый клиент строит ОДИН И ТОТ ЖЕ турнир из результатов драфта (эпсилон по сиденью
// исключает точные ничьи сил, на которых canonical-рассадка разошлась бы между клиентами).
//
// Правило устойчивости — как у Дуэли: невалидное сообщение (зритель, не тот раунд, повторная
// заявка, мусор) молча игнорируется одинаково у всех. Анти-чит — MP3: клиентский пик по
// построению не даёт силы (пул общий, резолв одинаковый), но серверная валидация — там.
import type { Format, GameData } from "../types/data.ts";
import { ArenaDraftEngine, type ArenaPick } from "./arenaDraft.ts";

export interface ArenaStartAction {
  kind: "start";
  seed: string;
  format: Format;
  /** Снапшот участников на момент старта (порядок входа): резолв не смотрит на живой
   *  presence — список участников комнаты меняется, а посадка обязана быть одинаковой у всех. */
  members: { id: string; name: string }[];
}

export interface ArenaPickMessage {
  kind: "pick";
  round: number;
  main: number;
  backup?: number;
}

/** Принудительный резолв раунда (host): молчавших людей доигрывает бот-политика. */
export interface ArenaCloseMessage {
  kind: "close";
  round: number;
}

export type ArenaAction = ArenaStartAction | ArenaPickMessage | ArenaCloseMessage;

export interface ArenaMatchState {
  engine: ArenaDraftEngine;
  /** Отправитель start: только он закрывает раунды по таймеру. */
  hostId: string;
}

/** Общий сид симуляции турнира — один на комнату. */
export function arenaSimSeed(seed: string): string {
  return `${seed}:arena:sim`;
}

const FORMATS: readonly Format[] = ["last_1y", "last_2y", "last_5y", "valve_legacy"];

function parseStart(payload: unknown): ArenaStartAction | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = payload as Record<string, unknown>;
  if (raw.kind !== "start") return null;
  if (typeof raw.seed !== "string" || raw.seed.length === 0) return null;
  if (!FORMATS.includes(raw.format as Format)) return null;
  if (!Array.isArray(raw.members) || raw.members.length === 0) return null;
  const members: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const member of raw.members) {
    if (typeof member !== "object" || member === null) return null;
    const { id, name } = member as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0 || typeof name !== "string") return null;
    if (seen.has(id)) return null;
    seen.add(id);
    members.push({ id, name });
  }
  return { kind: "start", seed: raw.seed, format: raw.format as Format, members };
}

/**
 * Применить одну запись relay-лога комнаты. Возвращает новое состояние (или прежнее, если
 * запись проигнорирована). Мутирует движок внутри match — вызывающий бампает свой serial.
 */
export function applyArenaEntry(
  match: ArenaMatchState | null,
  entry: { from: string; payload: unknown },
  data: GameData,
): ArenaMatchState | null {
  if (!match) {
    const start = parseStart(entry.payload);
    if (!start) return match;
    // Стартовать может только будущий участник партии — зритель не решает за комнату.
    if (!start.members.some((member) => member.id === entry.from)) return match;
    try {
      return {
        engine: new ArenaDraftEngine(data, start.format, start.seed, start.members),
        hostId: entry.from,
      };
    } catch {
      return match; // тонкий пул/битый формат — старт игнорируется, комната остаётся в лобби
    }
  }

  const raw = entry.payload;
  if (typeof raw !== "object" || raw === null) return match;
  const action = raw as Record<string, unknown>;
  const engine = match.engine;
  try {
    if (action.kind === "pick") {
      if (typeof action.round !== "number" || typeof action.main !== "number") return match;
      if (action.backup !== undefined && typeof action.backup !== "number") return match;
      const pick: ArenaPick = { main: action.main, backup: action.backup as number | undefined };
      if (!engine.submitPick(entry.from, action.round, pick)) return match;
      // Резолв в момент лога, когда сдал последний человек, — одна и та же точка у всех
      // клиентов (боты не ждут таймера: их ведёт политика прямо в резолве).
      if (engine.allHumansSubmitted) engine.resolveRound();
      return match;
    }
    if (action.kind === "close") {
      if (entry.from !== match.hostId) return match;
      if (engine.phase === "done" || action.round !== engine.round) return match;
      engine.resolveRound();
      return match;
    }
    return match;
  } catch {
    return match; // страховка: применялка не имеет права уронить клиент из-за сетевого мусора
  }
}
