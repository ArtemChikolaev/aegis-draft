// Протокол Arena MP2: применялка relay-лога общего драфта. Ключевые свойства: (1) резолв
// раунда происходит в одной и той же точке лога у всех клиентов (последняя человеческая заявка
// либо close хоста); (2) два клиента с РАЗНЫМИ «я» из одного лога строят бит-в-бит один турнир.
// Полная сетка 18 требует реального датасета — на mock эти тесты честно скипаются, а mock
// покрывает обратное свойство: тонкий пул молча игнорирует start (комната остаётся в лобби).
import { describe, expect, it } from "vitest";
import { applyArenaEntry, arenaSimSeed, type ArenaMatchState } from "../src/game/arenaProtocol.ts";
import { ARENA_DRAFT } from "../src/game/arenaDraft.ts";
import { QUICK_DRAFT_FIELD, TournamentEngine, monogramOf, SIGIL_COLORS, type TournamentTeam } from "../src/game/tournament.ts";
import { loadGameData } from "./helpers/data.ts";
import { isMockBaseline } from "./helpers/dataset.ts";

const data = loadGameData();
const onMock = isMockBaseline(data.manifest);
const HOST = "member-a";
const GUEST = "member-b";
const MEMBERS = [
  { id: HOST, name: "Alice" },
  { id: GUEST, name: "Bob" },
];
const START = { kind: "start", seed: "arena-seed", format: "last_2y", members: MEMBERS };

function startedState(): ArenaMatchState {
  const state = applyArenaEntry(null, { from: HOST, payload: START }, data);
  expect(state).not.toBeNull();
  return state!;
}

describe("applyArenaEntry (MP2)", () => {
  it.skipIf(onMock)("start: мусор и зритель игнорируются, валидный собирает посадку 18", () => {
    expect(applyArenaEntry(null, { from: HOST, payload: "junk" }, data)).toBeNull();
    expect(applyArenaEntry(null, { from: HOST, payload: { kind: "start", seed: "", format: "last_2y", members: MEMBERS } }, data)).toBeNull();
    expect(applyArenaEntry(null, { from: HOST, payload: { ...START, format: "nope" } }, data)).toBeNull();
    // Стартовать может только будущий участник — зритель не решает за комнату.
    expect(applyArenaEntry(null, { from: "spectator", payload: START }, data)).toBeNull();
    const state = startedState();
    expect(state.hostId).toBe(HOST);
    expect(state.engine.seats.length).toBe(ARENA_DRAFT.fieldSize);
    expect(state.engine.seats.filter((seat) => !seat.isBot).map((seat) => seat.id)).toEqual([HOST, GUEST]);
  });

  it.skipIf(!onMock)("тонкий пул (mock): start молча игнорируется — комната остаётся в лобби", () => {
    expect(applyArenaEntry(null, { from: HOST, payload: START }, data)).toBeNull();
  });

  it.skipIf(onMock)("pick: резолв в момент последней человеческой заявки; дубли и зрители — игнор", () => {
    const state = startedState();
    const engine = state.engine;
    const target = engine.openPlayers()[0].player.accountId;
    expect(applyArenaEntry(state, { from: "spectator", payload: { kind: "pick", round: 0, main: target } }, data)).toBe(state);
    applyArenaEntry(state, { from: HOST, payload: { kind: "pick", round: 0, main: target } }, data);
    expect(engine.round).toBe(0); // GUEST ещё не сдал — раунд открыт
    applyArenaEntry(state, { from: HOST, payload: { kind: "pick", round: 0, main: target } }, data); // дубль — игнор
    expect(engine.round).toBe(0);
    applyArenaEntry(state, { from: GUEST, payload: { kind: "pick", round: 0, main: target } }, data);
    expect(engine.round).toBe(1); // последняя заявка резолвит раунд у всех в одной точке лога
    expect(engine.history[0].filter((pick) => !engine.seats[pick.seatIndex].isBot).length).toBe(2);
  });

  it.skipIf(onMock)("close: только host и только текущий раунд; молчавших доигрывает бот-политика", () => {
    const state = startedState();
    const engine = state.engine;
    expect(applyArenaEntry(state, { from: GUEST, payload: { kind: "close", round: 0 } }, data)).toBe(state);
    expect(engine.round).toBe(0);
    applyArenaEntry(state, { from: HOST, payload: { kind: "close", round: 1 } }, data); // не тот раунд
    expect(engine.round).toBe(0);
    applyArenaEntry(state, { from: HOST, payload: { kind: "close", round: 0 } }, data);
    expect(engine.round).toBe(1);
    expect(engine.history[0].every((pick) => pick.source === "auto")).toBe(true);
  });

  it.skipIf(onMock)("два клиента с разными «я» строят бит-в-бит один турнир из одного лога", () => {
    // Общий лог: host и guest сдают по заявке в каждом раунде, где успевают; остальное — close.
    const log: { from: string; payload: unknown }[] = [{ from: HOST, payload: START }];
    const probe = startedState();
    for (let round = 0; round < probe.engine.totalRounds; round += 1) {
      const open = probe.engine.phase === "players"
        ? probe.engine.openPlayers().map((candidate) => candidate.player.accountId)
        : probe.engine.openHeroes();
      const hostPick = { from: HOST, payload: { kind: "pick", round, main: open[0], backup: open[1] } };
      const guestPick = { from: GUEST, payload: { kind: "pick", round, main: open[0], backup: open[2] } };
      log.push(hostPick, guestPick);
      applyArenaEntry(probe, hostPick, data);
      applyArenaEntry(probe, guestPick, data);
    }
    expect(probe.engine.phase).toBe("done");

    const replay = (): ArenaMatchState => {
      let state: ArenaMatchState | null = null;
      for (const entry of log) state = applyArenaEntry(state, entry, data);
      return state!;
    };
    const a = replay();
    const b = replay();
    expect(b.engine.results()).toEqual(a.engine.results());

    const simFor = (state: ArenaMatchState, selfId: string) => {
      const results = state.engine.results();
      const mine = results.find((team) => team.id === selfId)!;
      const opponents: TournamentTeam[] = results
        .filter((team) => team.id !== selfId)
        .map((team, index) => ({
          id: team.id, name: team.name, eventLabel: "Arena", strength: team.strength,
          isUser: false, sigil: { monogram: monogramOf(team.name), color: index % SIGIL_COLORS },
        }));
      const engine = new TournamentEngine(
        data, "last_2y", arenaSimSeed("arena-seed"), mine.strength, mine.name, 0, QUICK_DRAFT_FIELD, opponents,
      );
      while (engine.snapshot.canAdvance) engine.advance();
      return engine.snapshot;
    };
    const forHost = simFor(a, HOST);
    const forGuest = simFor(b, GUEST);
    expect(forHost.standings.map((row) => `${row.team.name}:${row.placement}`))
      .toEqual(forGuest.standings.map((row) => `${row.team.name}:${row.placement}`));
    expect(forHost.champion.name).toBe(forGuest.champion.name);
  });

  it.skipIf(onMock)("сетевой мусор после старта не роняет применялку и не двигает состояние", () => {
    const state = startedState();
    const round = state.engine.round;
    for (const payload of [null, 42, "x", { kind: "pick" }, { kind: "pick", round: 0, main: "abc" }, { kind: "wat" }]) {
      expect(applyArenaEntry(state, { from: HOST, payload }, data)).toBe(state);
    }
    expect(state.engine.round).toBe(round);
    expect(state.engine.pending.size).toBe(0);
  });
});
