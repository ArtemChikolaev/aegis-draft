// Вход в relay-комнату Арены и Дуэли асинхронный: создание комнаты и барьер отложенного
// squadSynergy. До ревизии 2026-09-13 повторный клик «Войти» во время барьера открывал второй
// сокет, выход во время барьера оставлял «зомби-лобби», а поздние события заменённого сокета
// (close, error) обнуляли ссылку на живое подключение и сбивали статус.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArenaSocketHandlers } from "../src/data/api/arena.ts";
import { useArena } from "../src/state/arenaStore.ts";
import { useDuel } from "../src/state/duelStore.ts";
import { useRun } from "../src/state/runStore.ts";
import { loadGameData } from "./helpers/data.ts";

interface FakeSocket {
  handlers: ArenaSocketHandlers;
  left: boolean;
  closed: boolean;
}

const { sockets } = vi.hoisted(() => ({ sockets: [] as FakeSocket[] }));

vi.mock("../src/data/api/arena.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/data/api/arena.ts")>();
  return {
    ...actual,
    createArenaRoom: vi.fn(async () => "ROOM"),
    connectArenaRoom: vi.fn((_code: string, _name: string, _token: string, _versions: unknown, handlers: ArenaSocketHandlers) => {
      const fake: FakeSocket = { handlers, left: false, closed: false };
      sockets.push(fake);
      return {
        leave: () => { fake.left = true; },
        // Как у настоящего WebSocket: close приходит асинхронно, когда стор уже открыл новый сокет.
        close: () => { fake.closed = true; setTimeout(() => handlers.onClose(), 0); },
        sendRelay: () => {},
      };
    }),
  };
});

const data = loadGameData();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function barrier() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

const welcome = (code: string) => ({
  token: "token",
  selfId: "me",
  code,
  versions: { schemaVersion: 1, ratingModelVersion: "test", balanceConfigVersion: "test" },
  members: [{ id: "me", name: "P1", connected: true }],
});

const rooms = [
  {
    mode: "Арена",
    join: (code: string) => useArena.getState().joinRoom(code, "P1"),
    leave: () => useArena.getState().leaveRoom(),
    status: () => useArena.getState().status,
  },
  {
    mode: "Дуэль",
    join: (code: string) => useDuel.getState().joinRoom(code, "P1"),
    leave: () => useDuel.getState().leaveRoom(),
    status: () => useDuel.getState().status,
  },
];

describe.each(rooms)("$mode: вход в relay-комнату", (room) => {
  beforeEach(() => {
    room.leave();
    sockets.length = 0;
    useRun.setState({ data, ensureSquadSynergy: async () => {} });
  });

  it("повторный вход во время барьера открывает один сокет", async () => {
    const gate = barrier();
    useRun.setState({ ensureSquadSynergy: () => gate.promise });
    room.join("AAAA");
    expect(room.status()).toBe("connecting");
    room.join("AAAA");
    gate.open();
    await flush();
    expect(sockets).toHaveLength(1);
  });

  it("выход во время барьера не открывает сокет", async () => {
    const gate = barrier();
    useRun.setState({ ensureSquadSynergy: () => gate.promise });
    room.join("AAAA");
    room.leave();
    gate.open();
    await flush();
    expect(sockets).toHaveLength(0);
    expect(room.status()).toBe("idle");
  });

  it("поздние события заменённого сокета не трогают новое подключение", async () => {
    room.join("AAAA");
    await flush();
    room.join("BBBB");
    await flush();
    await flush();
    expect(sockets).toHaveLength(2);
    expect(sockets[0].closed).toBe(true);
    sockets[1].handlers.onWelcome(welcome("BBBB"));
    expect(room.status()).toBe("lobby");
    sockets[0].handlers.onError({ code: "room_not_found", message: "" });
    expect(room.status()).toBe("lobby");
    room.leave();
    // Ссылка на живой сокет пережила close заменённого: выход ушёл именно в него.
    expect(sockets[1].left).toBe(true);
  });
});
