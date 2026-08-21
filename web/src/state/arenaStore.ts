// Лобби Arena (MP0): тонкая оркестрация поверх data/api/arena. Здесь политика — кодек в api.
// Комната и presence; драфт/турнир приедут срезами MP1/MP2 (BACKLOG M10).
import { create } from "zustand";
import {
  connectArenaRoom,
  createArenaRoom,
  type ArenaMember,
  type ArenaSocket,
  type ArenaVersions,
} from "../data/api/arena.ts";
import { ApiError } from "../data/api/index.ts";
import { BALANCE_CONFIG_VERSION } from "../game/balance.ts";
import { useRun } from "./runStore.ts";

export type ArenaStatus = "idle" | "connecting" | "lobby" | "error";

interface ArenaStore {
  status: ArenaStatus;
  code: string | null;
  selfId: string | null;
  members: ArenaMember[];
  /** Машинный код ошибки протокола/сети (version_mismatch/room_not_found/network/…). */
  errorCode: string | null;

  createRoom: (name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => void;
  leaveRoom: () => void;
  dismissError: () => void;
}

/** Reconnection-токены per-код в sessionStorage: reload возвращает ТОГО ЖЕ участника
 *  (сервер по токену заменяет сессию — призрак не появляется). Session, не local:
 *  токен — секрет слота, переживать смену вкладки/устройства он не должен. */
function tokenKey(code: string): string {
  return `aegis:arena:token:${code}`;
}

function readToken(code: string): string {
  try {
    return sessionStorage.getItem(tokenKey(code)) ?? "";
  } catch {
    return "";
  }
}

function writeToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(code), token);
  } catch {
    /* приватный режим — reconnect просто станет новым входом */
  }
}

/** Версии клиента для пина комнаты — те же оси, что у сейва/ссылки (runPersist/runLink). */
function clientVersions(): ArenaVersions | null {
  const manifest = useRun.getState().data?.manifest;
  if (!manifest) return null;
  return {
    schemaVersion: manifest.schemaVersion,
    ratingModelVersion: manifest.ratingModelVersion,
    dataHash: manifest.dataHash,
    balanceConfigVersion: BALANCE_CONFIG_VERSION,
  };
}

let socket: ArenaSocket | null = null;

export const useArena = create<ArenaStore>((set, get) => {
  const connect = (code: string, name: string) => {
    const versions = clientVersions();
    if (!versions) {
      set({ status: "error", errorCode: "no_data" });
      return;
    }
    socket?.close();
    set({ status: "connecting", code, errorCode: null });
    socket = connectArenaRoom(code, name, readToken(code), versions, {
      onWelcome: (welcome) => {
        writeToken(code, welcome.token);
        set({ status: "lobby", code: welcome.code, selfId: welcome.selfId, members: welcome.members });
      },
      onPresence: (presence) => {
        set({ members: presence.members });
      },
      onError: (error) => {
        set({ status: "error", errorCode: error.code });
      },
      onClose: () => {
        // Ошибка уже показана — не перетираем; обычный обрыв возвращает в idle
        // (автоreconnect-политика — за MP1, вместе с ready-флоу).
        if (get().status !== "error") set({ status: "idle", members: [], selfId: null });
        socket = null;
      },
    });
  };

  return {
    status: "idle",
    code: null,
    selfId: null,
    members: [],
    errorCode: null,

    async createRoom(name) {
      set({ status: "connecting", errorCode: null });
      try {
        const code = await createArenaRoom();
        connect(code, name);
      } catch (error) {
        set({ status: "error", errorCode: error instanceof ApiError ? error.code : "network" });
      }
    },

    joinRoom(code, name) {
      const normalized = code.trim().toUpperCase();
      if (!normalized) return;
      connect(normalized, name);
    },

    leaveRoom() {
      socket?.leave();
      socket = null;
      set({ status: "idle", code: null, selfId: null, members: [] });
    },

    dismissError() {
      set({ status: "idle", errorCode: null });
    },
  };
});
