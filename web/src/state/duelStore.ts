// Стор онлайн-Дуэли (M-DUEL): оркестрация relay-комнаты MP0 (та же инфраструктура, что лобби
// Arena — код, ws, версии, reconnect-токены) + применение упорядоченного лога к DuelEngine.
// Политика здесь, кодек — в data/api/arena, применялка — в game/duelProtocol (чистая).
//
// Единственный источник порядка — сервер: свои действия НЕ применяются оптимистично, а едут
// через relay и применяются, когда вернулись с seq (пол-секунды на ход — честная цена отказа
// от разрешения конфликтов). Reconnect получает relay_log и реплеит партию с нуля.
import { create } from "zustand";
import {
  connectArenaRoom,
  createArenaRoom,
  type ArenaMember,
  type ArenaSocket,
  type ArenaVersions,
  type RoomRelayEntry,
} from "../data/api/arena.ts";
import { ApiError } from "../data/api/index.ts";
import { BALANCE_CONFIG_VERSION } from "../game/balance.ts";
import { createRunSeed } from "../game/rng.ts";
import { applyDuelEntry, type DuelMatch, type DuelPlayAction, type DuelStartAction } from "../game/duelProtocol.ts";
import type { DuelConfig } from "../game/duel.ts";
import { useRun } from "./runStore.ts";

export type DuelStatus = "idle" | "connecting" | "lobby" | "error";

interface DuelStore {
  status: DuelStatus;
  code: string | null;
  selfId: string | null;
  members: ArenaMember[];
  errorCode: string | null;
  /** Активная партия (после start в relay-логе) + счётчик мутаций движка для подписок. */
  match: DuelMatch | null;
  serial: number;

  createRoom: (name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => void;
  /** Создатель: разослать start обоим капитанам (первые два участника комнаты). */
  startMatch: (config: DuelConfig) => void;
  /** Свой ход: уезжает на сервер, применится с возвратом (порядок — серверный). */
  sendAction: (action: DuelPlayAction) => void;
  leaveRoom: () => void;
  dismissError: () => void;
}

/** Reconnection-токены — как у Arena (sessionStorage, секрет слота), свой неймспейс. */
function tokenKey(code: string): string {
  return `aegis:duel:token:${code}`;
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

/** Версии клиента для пина комнаты — оба капитана обязаны сойтись датасетом и балансом,
 *  иначе паки и счёт разъедутся (тот же контракт, что у Arena/сейва/ссылки). */
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
/** Последний применённый seq: страж от дублей (live-сообщение после реплея лога). */
let lastSeq = 0;

export const useDuel = create<DuelStore>((set, get) => {
  const applyEntry = (entry: RoomRelayEntry) => {
    if (entry.seq <= lastSeq) return;
    const data = useRun.getState().data;
    if (!data) return;
    lastSeq = entry.seq;
    const next = applyDuelEntry(get().match, entry, data);
    // Движок мутирует внутри match — serial бампается на каждую запись, даже проигнорированную:
    // это дёшево и не даёт подписчикам пропустить границу применения лога.
    set({ match: next, serial: get().serial + 1 });
  };

  const connect = (code: string, name: string) => {
    const versions = clientVersions();
    if (!versions) {
      set({ status: "error", errorCode: "no_data" });
      return;
    }
    socket?.close();
    lastSeq = 0;
    set({ status: "connecting", code, errorCode: null, match: null });
    socket = connectArenaRoom(code, name, readToken(code), versions, {
      onWelcome: (welcome) => {
        writeToken(code, welcome.token);
        set({ status: "lobby", code: welcome.code, selfId: welcome.selfId, members: welcome.members });
      },
      onRelayLog: (entries) => {
        // Реплей с нуля: reconnect мог прийти в середине партии.
        lastSeq = 0;
        set({ match: null });
        for (const entry of entries) applyEntry(entry);
      },
      onRelay: applyEntry,
      onPresence: (presence) => set({ members: presence.members }),
      onError: (error) => set({ status: "error", errorCode: error.code }),
      onClose: () => {
        if (get().status !== "error") set({ status: "idle" });
      },
    });
  };

  return {
    status: "idle",
    code: null,
    selfId: null,
    members: [],
    errorCode: null,
    match: null,
    serial: 0,

    createRoom: async (name) => {
      set({ status: "connecting", errorCode: null });
      try {
        const code = await createArenaRoom();
        connect(code, name);
      } catch (error) {
        set({ status: "error", errorCode: error instanceof ApiError ? error.code : "network" });
      }
    },

    joinRoom: (code, name) => connect(code.trim().toUpperCase(), name),

    startMatch: (config) => {
      const { members, selfId } = get();
      // Стороны — первые два участника комнаты (порядок входа стабилен на сервере);
      // старт доступен только одному из них, и только когда второй на месте.
      const captains = members.slice(0, 2);
      if (captains.length < 2 || !captains.some((member) => member.id === selfId)) return;
      const start: DuelStartAction = {
        kind: "start",
        seed: createRunSeed(),
        format: config.format,
        bestOf: config.bestOf,
        sides: { [captains[0].id]: 0, [captains[1].id]: 1 },
        names: [captains[0].name, captains[1].name],
      };
      socket?.sendRelay(start);
    },

    sendAction: (action) => socket?.sendRelay(action),

    leaveRoom: () => {
      socket?.leave();
      socket = null;
      lastSeq = 0;
      set({ status: "idle", code: null, selfId: null, members: [], match: null, errorCode: null });
    },

    dismissError: () => set({ status: "idle", errorCode: null, code: null, members: [], match: null }),
  };
});

/** Сторона этого клиента в активной партии (null — зритель или партия не началась). */
export function selfSide(state: Pick<DuelStore, "match" | "selfId">): 0 | 1 | null {
  if (!state.match || !state.selfId) return null;
  return state.match.sides[state.selfId] ?? null;
}
