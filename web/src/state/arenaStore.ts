// Лобби и партия Arena (MP0 + MP1): тонкая оркестрация поверх data/api/arena. Здесь политика —
// кодек в api, детерминированная применялка relay-лога — в game/arenaProtocol (чистая, как у
// Дуэли). MP1-поток: host шлёт start → каждый драфтит СВОИ паки обычным DraftScreen (runStore,
// personal seed) → сдаёт roster → host лочит → все строят ОДИН турнир 18 команд
// (runStore.startArenaTournament, canonical-поле из лога + боты).
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
import { candidateRef, type RunConfig } from "../game/packs.ts";
import { monogramOf, SIGIL_COLORS, type TournamentTeam } from "../game/tournament.ts";
import {
  applyArenaEntry,
  arenaDraftSeed,
  arenaSimSeed,
  buildArenaField,
  type ArenaMatchState,
} from "../game/arenaProtocol.ts";
import { useRun } from "./runStore.ts";

export type ArenaStatus = "idle" | "connecting" | "lobby" | "error";

interface ArenaStore {
  status: ArenaStatus;
  code: string | null;
  selfId: string | null;
  members: ArenaMember[];
  /** Машинный код ошибки протокола/сети (version_mismatch/room_not_found/network/…). */
  errorCode: string | null;
  /** Состояние партии MP1 из relay-лога (null — комната ещё в лобби без start). */
  match: ArenaMatchState | null;

  createRoom: (name: string) => Promise<void>;
  joinRoom: (code: string, name: string) => void;
  /** Host (первый участник): разослать start — общий сид + конфиг драфта. */
  startMatch: (config: RunConfig) => void;
  /** Сдать свой готовый драфт в комнату (зовёт экран ожидания по завершении драфта). */
  submitRoster: () => void;
  /** Host: закрыть драфт — несданные составы заменят боты, все строят общий турнир. */
  lockMatch: () => void;
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
/** Последний применённый seq relay-лога — страж от дублей (live после реплея). */
let lastSeq = 0;

export const useArena = create<ArenaStore>((set, get) => {
  /** Начать СВОЙ драфт после start: обычный classic-флоу runStore на personal seed.
   *  Не начинаем, если уже сдался/идёт драфт/комната заперта — реплей лога после reconnect
   *  не должен перетирать живое состояние. */
  const maybeBeginDraft = () => {
    const { match, selfId } = get();
    if (!match || !selfId || match.locked || match.rosters[selfId]) return;
    const run = useRun.getState();
    if (run.selectedMode !== "arena" || run.phase !== "start") return;
    run.start(match.config, arenaDraftSeed(match.seed, selfId));
  };

  /** Комната заперта: построить ОБЩИЙ турнир (canonical-поле из лога + боты). Только для
   *  сдавших состав: у зрителя нет драфт-снапшота, ему остаётся лобби. */
  const maybeStartTournament = () => {
    const { match, selfId } = get();
    const data = useRun.getState().data;
    if (!match || !match.locked || !selfId || !match.rosters[selfId] || !data) return;
    const field = buildArenaField(match, data);
    const mine = field.find((team) => team.id === selfId);
    if (!mine) return;
    const opponents: TournamentTeam[] = field
      .filter((team) => team.id !== selfId)
      .map((team, index) => ({
        id: team.id,
        name: team.name,
        eventLabel: "Arena",
        strength: team.strength,
        isUser: false,
        sigil: { monogram: monogramOf(team.name), color: index % SIGIL_COLORS },
      }));
    useRun.getState().startArenaTournament(
      { name: mine.name, strength: mine.strength },
      opponents,
      arenaSimSeed(match.seed),
    );
  };

  const applyEntry = (entry: RoomRelayEntry) => {
    if (entry.seq <= lastSeq) return;
    lastSeq = entry.seq;
    const prev = get().match;
    const next = applyArenaEntry(prev, entry);
    if (next === prev) return;
    set({ match: next });
    if (!prev && next) maybeBeginDraft();
    if (next?.locked && !prev?.locked) maybeStartTournament();
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
    match: null,

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

    startMatch(config) {
      const { members, selfId, match } = get();
      // Start — привилегия host (первый участник); повторный start применялка игнорирует сама.
      if (match || members.length === 0 || members[0].id !== selfId) return;
      socket?.sendRelay({ kind: "start", seed: createRunSeed(), config } satisfies { kind: "start"; seed: string; config: RunConfig });
    },

    submitRoster() {
      const { match, selfId, members } = get();
      if (!match || !selfId || match.locked || match.rosters[selfId]) return;
      const { engine } = useRun.getState();
      const score = engine?.score();
      if (!engine?.isComplete || !score) return;
      const refs = engine.rosterView.map((slot) => {
        if (!slot.candidate) throw new Error("Arena roster requires a complete draft");
        return candidateRef(slot.candidate);
      });
      const name = members.find((member) => member.id === selfId)?.name || "Captain";
      socket?.sendRelay({ kind: "roster", name, refs, heroes: [...engine.heroes], teamOvr: score.teamOvr });
    },

    lockMatch() {
      const { match, selfId } = get();
      if (!match || match.locked || match.hostId !== selfId) return;
      socket?.sendRelay({ kind: "lock" });
    },

    leaveRoom() {
      socket?.leave();
      socket = null;
      lastSeq = 0;
      set({ status: "idle", code: null, selfId: null, members: [], match: null });
    },

    dismissError() {
      set({ status: "idle", errorCode: null });
    },
  };
});
