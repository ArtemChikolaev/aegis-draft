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
  type RoomRelayEntry,
} from "../data/api/arena.ts";
import { ApiError } from "../data/api/index.ts";
import { createRunSeed } from "../game/rng.ts";
import { applyDuelEntry, type DuelMatch, type DuelPlayAction, type DuelStartAction } from "../game/duelProtocol.ts";
import { DUEL, duelFallbackAction, type DuelConfig, type DuelSide } from "../game/duel.ts";
import { useRun } from "./runStore.ts";
import { clientVersions, roomTokenStore } from "./relayRoom.ts";

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
  /** Дедлайн текущего хода (epoch ms) — отсчёт видят оба; авто-ход шлёт клиент актора. */
  turnDeadline: number | null;

  createRoom: (name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => void;
  /** Создатель: разослать start обоим капитанам (первые два участника комнаты). */
  startMatch: (config: DuelConfig) => void;
  /** Свой ход: уезжает на сервер, применится с возвратом (порядок — серверный). */
  sendAction: (action: DuelPlayAction) => void;
  /** Реванш той же комнатой (после done, только капитан): новый сид, те же правила,
   *  СТОРОНЫ МЕНЯЮТСЯ — первый пик уходит проигравшему приоритету прошлой партии. */
  rematch: () => void;
  leaveRoom: () => void;
  dismissError: () => void;
}

const tokens = roomTokenStore("duel");

let socket: ArenaSocket | null = null;
/** Последний применённый seq: страж от дублей (live-сообщение после реплея лога). */
let lastSeq = 0;
/** Таймер авто-хода (жив только у актора) + подпись шага, на который он взведён. */
let turnTimer: ReturnType<typeof setTimeout> | null = null;
/** Подпись шага, на который взведён отсчёт: игнорируемый мусор в логе не сбрасывает таймер. */
let armedStep: string | null = null;

function clearTurnTimer(): void {
  if (turnTimer !== null) clearTimeout(turnTimer);
  turnTimer = null;
  armedStep = null;
}

/** Подпись текущего шага партии: меняется на каждый применённый ход — по ней и отсчёт,
 *  и проверка «таймер стрельнул ещё по тому же шагу» (реплей после reconnect не дублирует ход). */
function stepSignature(match: DuelMatch | null): string {
  if (!match) return "";
  const engine = match.engine;
  return [
    engine.games.length, engine.phase, engine.pickIndex, engine.rerollsLeft.join(","),
    engine.bannedHeroes.length, engine.heroPicks[0].length, engine.heroPicks[1].length,
  ].join("|");
}

export const useDuel = create<DuelStore>((set, get) => {
  /** Ход применился (или партия началась): перезапустить отсчёт; актор взводит авто-ход. */
  const armTurn = () => {
    const { match, selfId } = get();
    const signature = stepSignature(match);
    if (signature === armedStep) return; // шаг не сменился (мусор в логе) — отсчёт не трогаем
    clearTurnTimer();
    armedStep = signature;
    const engine = match?.engine ?? null;
    if (!engine || (engine.phase !== "players" && engine.phase !== "heroes")) {
      set({ turnDeadline: null });
      return;
    }
    set({ turnDeadline: Date.now() + DUEL.turnSeconds * 1000 });
    const actor = engine.phase === "players" ? engine.currentPicker : engine.currentStep?.side ?? null;
    if (actor === null || !selfId || match!.sides[selfId] !== actor) return;
    turnTimer = setTimeout(() => {
      const state = get();
      // Стреляем только по ТОМУ ЖЕ шагу: ход мог уже уехать руками или прийти реплеем.
      if (!state.match || stepSignature(state.match) !== signature) return;
      const action = duelFallbackAction(state.match.engine);
      if (action) socket?.sendRelay(action);
    }, DUEL.turnSeconds * 1000);
  };

  const applyEntry = (entry: RoomRelayEntry) => {
    if (entry.seq <= lastSeq) return;
    const data = useRun.getState().data;
    if (!data) return;
    lastSeq = entry.seq;
    const next = applyDuelEntry(get().match, entry, data);
    // Движок мутирует внутри match — serial бампается на каждую запись, даже проигнорированную:
    // это дёшево и не даёт подписчикам пропустить границу применения лога.
    set({ match: next, serial: get().serial + 1 });
    armTurn();
  };

  const connect = async (code: string, name: string) => {
    const versions = clientVersions();
    if (!versions) {
      set({ status: "error", errorCode: "no_data" });
      return;
    }
    // Барьер отложенного squadSynergy: движок комнаты считает сыгранность, а relay-лог может
    // прийти сразу после welcome — файл должен лежать в data ДО открытия сокета.
    try {
      await useRun.getState().ensureSquadSynergy();
    } catch {
      set({ status: "error", errorCode: "network" });
      return;
    }
    socket?.close();
    lastSeq = 0;
    clearTurnTimer();
    set({ status: "connecting", code, errorCode: null, match: null, turnDeadline: null });
    socket = connectArenaRoom(code, name, tokens.read(code), versions, {
      onWelcome: (welcome) => {
        tokens.write(code, welcome.token);
        set({ status: "lobby", code: welcome.code, selfId: welcome.selfId, members: welcome.members });
      },
      onRelayLog: (entries) => {
        // Реплей с нуля: reconnect мог прийти в середине партии.
        lastSeq = 0;
        clearTurnTimer();
        set({ match: null, turnDeadline: null });
        for (const entry of entries) applyEntry(entry);
      },
      onRelay: applyEntry,
      onPresence: (presence) => set({ members: presence.members }),
      onError: (error) => set({ status: "error", errorCode: error.code }),
      onClose: () => {
        clearTurnTimer();
        if (get().status !== "error") set({ status: "idle", turnDeadline: null });
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
    turnDeadline: null,

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

    rematch: () => {
      const { match, selfId } = get();
      // Только после доигранной серии и только капитан (применялка проверит то же самое).
      if (!match || match.engine.phase !== "done" || !selfId || match.sides[selfId] === undefined) return;
      const memberBySide = new Map<DuelSide, string>();
      for (const [memberId, side] of Object.entries(match.sides)) memberBySide.set(side, memberId);
      const config = match.engine.config;
      // Стороны меняются: сторона 0 (первый пик игры 1) уходит бывшей стороне 1 — реванш
      // честен по приоритету, а не повтор той же раздачи преимуществ.
      const start: DuelStartAction = {
        kind: "start",
        seed: createRunSeed(),
        format: config.format,
        bestOf: config.bestOf,
        sides: { [memberBySide.get(1)!]: 0, [memberBySide.get(0)!]: 1 },
        names: [match.engine.names[1], match.engine.names[0]],
      };
      socket?.sendRelay(start);
    },

    leaveRoom: () => {
      socket?.leave();
      socket = null;
      lastSeq = 0;
      clearTurnTimer();
      set({ status: "idle", code: null, selfId: null, members: [], match: null, errorCode: null, turnDeadline: null });
    },

    dismissError: () => set({ status: "idle", errorCode: null, code: null, members: [], match: null }),
  };
});

/** Сторона этого клиента в активной партии (null — зритель или партия не началась). */
export function selfSide(state: Pick<DuelStore, "match" | "selfId">): 0 | 1 | null {
  if (!state.match || !state.selfId) return null;
  return state.match.sides[state.selfId] ?? null;
}
