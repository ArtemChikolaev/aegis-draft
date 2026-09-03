// Лобби и партия Arena (MP0 + MP2): тонкая оркестрация поверх data/api/arena. Здесь политика —
// кодек в api, детерминированная применялка relay-лога — в game/arenaProtocol (чистая, как у
// Дуэли). MP2-поток: host шлёт start (сид + формат + снапшот участников) → все драфтят из
// ОБЩЕГО пула одновременными раундами (заявки — pick в relay-лог; раунд резолвится, когда сдал
// последний человек, либо по close хоста — его шлёт таймер раунда) → после 10 раундов каждый
// клиент строит ОДИН турнир 18 команд из результатов драфта (runStore.startArenaTournament).
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
import { ROLE_SEQUENCE, type RunConfig } from "../game/packs.ts";
import { ARENA_DRAFT } from "../game/arenaDraft.ts";
import { monogramOf, SIGIL_COLORS, type TournamentTeam } from "../game/tournament.ts";
import { applyArenaEntry, arenaSimSeed, type ArenaMatchState } from "../game/arenaProtocol.ts";
import { useRun, type Snapshot } from "./runStore.ts";
import { clientVersions, roomTokenStore } from "./relayRoom.ts";
import type { Format } from "../types/data.ts";

export type ArenaStatus = "idle" | "connecting" | "lobby" | "error";

interface ArenaStore {
  status: ArenaStatus;
  code: string | null;
  selfId: string | null;
  members: ArenaMember[];
  /** Машинный код ошибки протокола/сети (version_mismatch/room_not_found/network/…). */
  errorCode: string | null;
  /** Состояние партии MP2 из relay-лога (null — комната ещё в лобби без start). */
  match: ArenaMatchState | null;
  /** Мутации движка внутри match не меняют ссылку — подписка UI идёт через счётчик. */
  serial: number;
  /** Дедлайн текущего раунда (epoch ms) для отсчёта в UI; резолв по нему шлёт только host. */
  roundDeadline: number | null;

  createRoom: (name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => void;
  /** Host (первый участник): разослать start — общий сид, формат и посадку. */
  startMatch: (format: Format) => void;
  /** Заявка на текущий раунд: пик + необязательный запасной. */
  sendPick: (main: number, backup?: number) => void;
  /** Host: принудительный резолв раунда (молчавших доигрывает бот-политика). */
  closeRound: () => void;
  /** Идемпотентный ретрай входа в готовый турнир: драфт мог завершиться, пока runStore был
   *  не готов (игрок ушёл с экрана арены) — экран драфта дёргает это на маунте. */
  syncTournament: () => void;
  leaveRoom: () => void;
  dismissError: () => void;
}

const tokens = roomTokenStore("arena");

let socket: ArenaSocket | null = null;
/** Последний применённый seq relay-лога — страж от дублей (live после реплея). */
let lastSeq = 0;
/** Таймер авто-close текущего раунда (только у хоста). */
let roundTimer: ReturnType<typeof setTimeout> | null = null;

function clearRoundTimer(): void {
  if (roundTimer !== null) clearTimeout(roundTimer);
  roundTimer = null;
}

export const useArena = create<ArenaStore>((set, get) => {
  /** Раунд сменился (или партия началась): перезапустить отсчёт; host ставит авто-close. */
  const armRound = () => {
    clearRoundTimer();
    const { match, selfId } = get();
    if (!match || match.engine.phase === "done") {
      set({ roundDeadline: null });
      return;
    }
    set({ roundDeadline: Date.now() + ARENA_DRAFT.roundSeconds * 1000 });
    if (match.hostId !== selfId) return;
    const round = match.engine.round;
    roundTimer = setTimeout(() => {
      const state = get();
      if (!state.match || state.match.hostId !== state.selfId) return;
      if (state.match.engine.phase === "done" || state.match.engine.round !== round) return;
      socket?.sendRelay({ kind: "close", round });
    }, ARENA_DRAFT.roundSeconds * 1000);
  };

  /** Драфт завершён: построить ОБЩИЙ турнир из результатов. Только для сидящих — у зрителя
   *  нет команды, ему остаётся лобби. Reload посреди турнира реплеит лог и строит его заново. */
  const maybeStartTournament = () => {
    const { match, selfId } = get();
    if (!match || !selfId || match.engine.phase !== "done") return;
    const engine = match.engine;
    const seatIndex = engine.seatOf(selfId);
    if (seatIndex === null) return;
    const run = useRun.getState();
    if (!run.data || run.selectedMode !== "arena" || run.phase !== "start") return;
    const results = engine.results();
    const mine = results[seatIndex];
    const roster = ROLE_SEQUENCE.map((role, index) => ({ role, candidate: engine.rosters[seatIndex][index] }));
    const candidates = roster.flatMap((slot) => (slot.candidate ? [slot.candidate] : []));
    // Синтетический снапшот той же формы, что у RunEngine: турнирный экран и карьера читают
    // score/roster/heroes — второго рендер-пути для арены не заводим.
    const snapshot: Snapshot = {
      currentPack: {
        kind: "mixed",
        label: "Arena",
        candidates,
        signatureHeroes: [...new Set(candidates.flatMap((candidate) => candidate.signatureHeroes))],
      },
      roster,
      rerollsLeft: 0,
      currentSlotIndex: ROLE_SEQUENCE.length,
      rosterFilled: candidates.length,
      isComplete: true,
      heroes: [...engine.heroPicks[seatIndex]],
      heroesLeft: 0,
      packHeroes: [],
      packSerial: 0,
      score: mine.score,
      reservePlayers: [],
      reserveHeroes: [],
      prepOverlay: { pairGames: new Map(), heroGames: new Map() },
    };
    const opponents: TournamentTeam[] = results
      .filter((team) => team.id !== mine.id)
      .map((team, index) => ({
        id: team.id,
        name: team.name,
        eventLabel: "Arena",
        strength: team.strength,
        isUser: false,
        sigil: { monogram: monogramOf(team.name), color: index % SIGIL_COLORS },
      }));
    const config: RunConfig = {
      draftStyle: "mixed", format: engine.format, rerolls: 0, scoring: "event", allocation: "auto",
    };
    run.startArenaTournament({
      config,
      seed: engine.seed,
      snapshot,
      user: { name: mine.name, strength: mine.strength },
      opponents,
      simSeed: arenaSimSeed(engine.seed),
    });
  };

  const applyEntry = (entry: RoomRelayEntry) => {
    if (entry.seq <= lastSeq) return;
    lastSeq = entry.seq;
    const data = useRun.getState().data;
    if (!data) return;
    const prev = get().match;
    // Применялка мутирует движок внутри той же ссылки — раунд/фазу снимаем ДО применения.
    const prevRound = prev?.engine.round ?? -1;
    const prevPhase = prev?.engine.phase ?? null;
    const next = applyArenaEntry(prev, entry, data);
    if (next !== prev) set({ match: next });
    // Дешёвый бамп на любую запись: принятая заявка не меняет ссылку match, а UI обязан увидеть её.
    set((state) => ({ serial: state.serial + 1 }));
    if (!next) return;
    if (prev === null || next.engine.round !== prevRound) armRound();
    if (next.engine.phase === "done" && prevPhase !== "done") {
      clearRoundTimer();
      set({ roundDeadline: null });
      maybeStartTournament();
    }
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
    clearRoundTimer();
    set({ status: "connecting", code, errorCode: null, match: null, serial: 0, roundDeadline: null });
    socket = connectArenaRoom(code, name, tokens.read(code), versions, {
      onWelcome: (welcome) => {
        tokens.write(code, welcome.token);
        set({ status: "lobby", code: welcome.code, selfId: welcome.selfId, members: welcome.members });
      },
      onRelayLog: (entries) => {
        // Реплей с нуля: reconnect мог прийти в середине партии.
        lastSeq = 0;
        clearRoundTimer();
        set({ match: null, roundDeadline: null });
        for (const entry of entries) applyEntry(entry);
      },
      onRelay: applyEntry,
      onPresence: (presence) => {
        set({ members: presence.members });
      },
      onError: (error) => {
        set({ status: "error", errorCode: error.code });
      },
      onClose: () => {
        // Ошибка уже показана — не перетираем; обычный обрыв возвращает в idle
        // (автоreconnect-политика — вместе с прод-прогоном T9.0).
        if (get().status !== "error") set({ status: "idle", members: [], selfId: null });
        clearRoundTimer();
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
    match: null,
    serial: 0,
    roundDeadline: null,

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

    startMatch(format) {
      const { members, selfId, match } = get();
      // Start — привилегия host (первый участник); повторный start применялка игнорирует сама.
      if (match || members.length === 0 || members[0].id !== selfId) return;
      socket?.sendRelay({
        kind: "start",
        seed: createRunSeed(),
        format,
        members: members.map((member) => ({ id: member.id, name: member.name })),
      });
    },

    sendPick(main, backup) {
      const { match, selfId } = get();
      if (!match || !selfId) return;
      const engine = match.engine;
      if (engine.phase === "done") return;
      const seatIndex = engine.seatOf(selfId);
      if (seatIndex === null || engine.pending.has(seatIndex)) return;
      socket?.sendRelay({ kind: "pick", round: engine.round, main, ...(backup !== undefined ? { backup } : {}) });
    },

    closeRound() {
      const { match, selfId } = get();
      if (!match || match.hostId !== selfId || match.engine.phase === "done") return;
      socket?.sendRelay({ kind: "close", round: match.engine.round });
    },

    syncTournament() {
      maybeStartTournament();
    },

    leaveRoom() {
      socket?.leave();
      socket = null;
      lastSeq = 0;
      clearRoundTimer();
      set({ status: "idle", code: null, selfId: null, members: [], match: null, serial: 0, roundDeadline: null });
    },

    dismissError() {
      set({ status: "idle", errorCode: null });
    },
  };
});
