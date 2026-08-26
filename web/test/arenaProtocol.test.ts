// Протокол Arena MP1: применялка relay-лога + каноническое поле 18 команд. Ключевое свойство —
// два клиента с РАЗНЫМИ «я» (свой id всегда USER_ID, чужие — memberId) обязаны построить
// бит-в-бит один турнир: рассадка buildResult сортирует по силе, а эпсилон по каноническому
// индексу исключает точные ничьи, на которых tie-break по id разошёлся бы между клиентами.
import { describe, expect, it } from "vitest";
import {
  applyArenaEntry,
  ARENA_FIELD_SIZE,
  buildArenaField,
  type ArenaMatchState,
} from "../src/game/arenaProtocol.ts";
import { QUICK_DRAFT_FIELD, TournamentEngine, monogramOf, SIGIL_COLORS, type TournamentTeam } from "../src/game/tournament.ts";
import type { RunConfig } from "../src/game/packs.ts";
import { loadGameData } from "./helpers/data.ts";

const data = loadGameData();
const HOST = "member-a";
const GUEST = "member-b";
const config: RunConfig = { draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto" };

function roster(name: string, teamOvr: number) {
  return {
    kind: "roster",
    name,
    refs: Array.from({ length: 5 }, (_, i) => ({ accountId: i + 1, teamId: 1, eventId: "e" })),
    heroes: [1, 2, 3, 4, 5],
    teamOvr,
  };
}

function startedState(): ArenaMatchState {
  const state = applyArenaEntry(null, { from: HOST, payload: { kind: "start", seed: "arena-seed", config } });
  expect(state).not.toBeNull();
  return state!;
}

describe("applyArenaEntry", () => {
  it("start собирает состояние; мусор и не-start до старта игнорируются", () => {
    expect(applyArenaEntry(null, { from: HOST, payload: "junk" })).toBeNull();
    expect(applyArenaEntry(null, { from: HOST, payload: { kind: "roster" } })).toBeNull();
    expect(applyArenaEntry(null, { from: HOST, payload: { kind: "start", seed: "", config } })).toBeNull();
    const state = startedState();
    expect(state.hostId).toBe(HOST);
    expect(state.locked).toBe(false);
  });

  it("roster — один на участника и только до лока; lock — только host и один раз", () => {
    let state = startedState();
    state = applyArenaEntry(state, { from: GUEST, payload: roster("Bob", 80) })!;
    expect(Object.keys(state.rosters)).toEqual([GUEST]);
    // Пере-сдача и битая форма игнорируются.
    expect(applyArenaEntry(state, { from: GUEST, payload: roster("Bob2", 90) })).toBe(state);
    expect(applyArenaEntry(state, { from: HOST, payload: { kind: "roster", name: "X" } })).toBe(state);
    // Lock от не-хоста — игнор; от хоста — закрывает; после лока roster не принимается.
    expect(applyArenaEntry(state, { from: GUEST, payload: { kind: "lock" } })).toBe(state);
    const locked = applyArenaEntry(state, { from: HOST, payload: { kind: "lock" } })!;
    expect(locked.locked).toBe(true);
    expect(applyArenaEntry(locked, { from: HOST, payload: roster("Late", 70) })).toBe(locked);
    expect(applyArenaEntry(locked, { from: HOST, payload: { kind: "lock" } })).toBe(locked);
  });
});

describe("buildArenaField", () => {
  it("поле всегда из 18, силы попарно различны, боты детерминированы", () => {
    let state = startedState();
    state = applyArenaEntry(state, { from: GUEST, payload: roster("Bob", 80) })!;
    state = applyArenaEntry(state, { from: HOST, payload: roster("Alice", 78) })!;
    const field = buildArenaField(state, data);
    expect(field.length).toBe(ARENA_FIELD_SIZE);
    expect(new Set(field.map((team) => team.strength)).size).toBe(ARENA_FIELD_SIZE);
    // Люди впереди в порядке memberId, дальше — боты.
    expect(field[0].id).toBe(HOST);
    expect(field[1].id).toBe(GUEST);
    expect(field.slice(2).every((team) => team.id.startsWith("bot-"))).toBe(true);
    expect(buildArenaField(state, data)).toEqual(field);
  });

  it("два клиента с разными «я» строят бит-в-бит один турнир", () => {
    let state = startedState();
    state = applyArenaEntry(state, { from: HOST, payload: roster("Alice", 84) })!;
    state = applyArenaEntry(state, { from: GUEST, payload: roster("Bob", 84) })!; // намеренная ничья до эпсилона
    const field = buildArenaField(state, data);

    const simFor = (selfId: string) => {
      const mine = field.find((team) => team.id === selfId)!;
      const opponents: TournamentTeam[] = field
        .filter((team) => team.id !== selfId)
        .map((team, index) => ({
          id: team.id, name: team.name, eventLabel: "Arena", strength: team.strength,
          isUser: false, sigil: { monogram: monogramOf(team.name), color: index % SIGIL_COLORS },
        }));
      const engine = new TournamentEngine(
        data, config.format, "arena-seed:arena:sim", mine.strength, mine.name, 0, QUICK_DRAFT_FIELD, opponents,
      );
      while (engine.snapshot.canAdvance) engine.advance();
      return engine.snapshot;
    };

    const forHost = simFor(HOST);
    const forGuest = simFor(GUEST);
    expect(forHost.standings.map((row) => `${row.team.name}:${row.placement}`))
      .toEqual(forGuest.standings.map((row) => `${row.team.name}:${row.placement}`));
    expect(forHost.champion.name).toBe(forGuest.champion.name);
  });
});
