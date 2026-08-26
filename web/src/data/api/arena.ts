// Arena (MP0): REST-создание комнаты + ws-клиент лобби. Отражает протокол v1 сервера
// (server/internal/transport/rooms.go): {v, type, payload}; hello → welcome, presence-рассылка,
// ping/pong. Оркестрация (стор, reconnect-политика) — в state/arenaStore, здесь только кодек.
import { apiBase, apiFetch, toApiError } from "./client.ts";

export const ARENA_PROTOCOL_VERSION = 1;

export interface ArenaVersions {
  schemaVersion: number;
  ratingModelVersion: string;
  dataHash?: string;
  balanceConfigVersion: string;
}

export interface ArenaMember {
  id: string;
  name: string;
  connected: boolean;
}

export interface ArenaWelcome {
  token: string;
  selfId: string;
  code: string;
  versions: ArenaVersions;
  members: ArenaMember[];
}

export interface ArenaPresence {
  event: { kind: "joined" | "reconnected" | "disconnected" | "left"; id: string; name: string };
  members: ArenaMember[];
}

export interface ArenaError {
  code: string;
  message: string;
}

/** Relay-сообщение комнаты (Дуэль M-DUEL; Arena MP2 — тот же слой): сервер — источник порядка
 *  (`seq` монотонен) и отправителя (`from` проштампован по токену слота, подделать нельзя);
 *  payload непрозрачен — протокол режима живёт на клиентах. */
export interface RoomRelayEntry {
  seq: number;
  from: string;
  payload: unknown;
}

interface Envelope {
  v: number;
  type: string;
  payload?: unknown;
}

/** POST /api/rooms — создать пустое лобби; версии пинит первый ws-джойн. */
export async function createArenaRoom(): Promise<string> {
  const res = await apiFetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw await toApiError(res);
  const body = (await res.json()) as { code: string };
  return body.code;
}

export interface ArenaSocketHandlers {
  onWelcome: (welcome: ArenaWelcome) => void;
  onPresence: (presence: ArenaPresence) => void;
  /** Протокольная ошибка сервера (version_mismatch/room_not_found/…) — сокет закроется следом. */
  onError: (error: ArenaError) => void;
  /** Сокет закрыт (после error, обрыва сети или leave). */
  onClose: () => void;
  /** Живое relay-сообщение (после welcome/relay_log). Опционален: лобби Arena релей не читает. */
  onRelay?: (entry: RoomRelayEntry) => void;
  /** Реплей лога при входе/reconnect — приходит лично, ДО живых relay. */
  onRelayLog?: (entries: RoomRelayEntry[]) => void;
}

export interface ArenaSocket {
  /** Явный выход: сервер освобождает слот (обрыв без leave держит место под reconnect). */
  leave: () => void;
  close: () => void;
  /** Отправить relay-сообщение комнаты (вернётся всем через сервер с seq/from). */
  sendRelay: (payload: unknown) => void;
}

const PING_INTERVAL_MS = 25_000; // сервер ждёт до 75с — три пропущенных пинга = обрыв

/** ws://…/api/ws/rooms/{code} из той же базы, что HTTP API. */
function socketUrl(code: string): string {
  const base = new URL(apiBase());
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `${base.pathname.replace(/\/$/, "")}/api/ws/rooms/${encodeURIComponent(code)}`;
  return base.toString();
}

/**
 * Подключение к лобби. `token` — reconnection-токен из прошлого welcome (пусто = новый вход).
 * Кодек терпим к незнакомым type (forward-совместимость внутри v1), но чужая мажорная версия
 * конверта — повод молча игнорировать сообщение: сервер таких не шлёт.
 */
export function connectArenaRoom(
  code: string,
  name: string,
  token: string,
  versions: ArenaVersions,
  handlers: ArenaSocketHandlers,
): ArenaSocket {
  const socket = new WebSocket(socketUrl(code));
  let pingTimer: number | null = null;
  let closed = false;

  const send = (type: string, payload: unknown) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ v: ARENA_PROTOCOL_VERSION, type, payload } satisfies Envelope));
    }
  };

  socket.addEventListener("open", () => {
    send("hello", { name, token: token || undefined, versions });
    pingTimer = window.setInterval(() => send("ping", {}), PING_INTERVAL_MS);
  });

  socket.addEventListener("message", (event) => {
    let msg: Envelope;
    try {
      msg = JSON.parse(String(event.data)) as Envelope;
    } catch {
      return; // не-JSON кадр — не наш протокол, игнор
    }
    if (msg.v !== ARENA_PROTOCOL_VERSION) return;
    switch (msg.type) {
      case "welcome":
        handlers.onWelcome(msg.payload as ArenaWelcome);
        break;
      case "presence":
        handlers.onPresence(msg.payload as ArenaPresence);
        break;
      case "error":
        handlers.onError(msg.payload as ArenaError);
        break;
      case "relay":
        handlers.onRelay?.(msg.payload as RoomRelayEntry);
        break;
      case "relay_log":
        handlers.onRelayLog?.((msg.payload as { entries: RoomRelayEntry[] }).entries ?? []);
        break;
      default:
        break; // pong и будущие типы
    }
  });

  const teardown = () => {
    if (closed) return;
    closed = true;
    if (pingTimer != null) window.clearInterval(pingTimer);
    handlers.onClose();
  };
  socket.addEventListener("close", teardown);
  socket.addEventListener("error", teardown);

  return {
    leave: () => {
      send("leave", {});
      window.setTimeout(() => socket.close(), 200); // сервер закроет сам; страховка
    },
    close: () => socket.close(),
    sendRelay: (payload) => send("relay", payload),
  };
}
