// Движок общего драфта Arena (MP2): детерминизм, глобальная уникальность пула, змейка
// приоритета, резолв конфликтов (main → backup → авто) и гейт ёмкости пула. Тесты гоняются на
// ОБОИХ датасетах (правило чек-листа): размер поля здесь маленький (3), чтобы mock (20 игроков,
// 15 героев) честно тянул общий пул; полная сетка 18 — за протокольными тестами на real.
import { describe, expect, it } from "vitest";
import { ArenaDraftEngine, ARENA_DRAFT, arenaPoolShortage } from "../src/game/arenaDraft.ts";
import { ROLE_SEQUENCE } from "../src/game/packs.ts";
import { loadGameData } from "./helpers/data.ts";

const data = loadGameData();
const FIELD = 3;
const HUMANS = [
  { id: "member-a", name: "Alice" },
  { id: "member-b", name: "Bob" },
];

function makeEngine(seed = "arena-seed"): ArenaDraftEngine {
  return new ArenaDraftEngine(data, "last_2y", seed, HUMANS, FIELD);
}

function fastForward(engine: ArenaDraftEngine): void {
  while (engine.phase !== "done") engine.resolveRound();
}

describe("ArenaDraftEngine", () => {
  it("детерминизм: один сид ⇒ одна посадка, одни авто-раунды и один счёт бит-в-бит", () => {
    const a = makeEngine();
    const b = makeEngine();
    expect(b.priority).toEqual(a.priority);
    fastForward(a);
    fastForward(b);
    expect(b.rosters.map((roster) => roster.map((slot) => slot?.player.accountId)))
      .toEqual(a.rosters.map((roster) => roster.map((slot) => slot?.player.accountId)));
    expect(b.heroPicks).toEqual(a.heroPicks);
    expect(b.results().map((team) => team.strength)).toEqual(a.results().map((team) => team.strength));
  });

  it("глобальная уникальность: игроки и герои не повторяются, роли слотов соблюдены", () => {
    const engine = makeEngine();
    fastForward(engine);
    const players = engine.rosters.flat().map((slot) => slot!.player.accountId);
    expect(new Set(players).size).toBe(FIELD * ROLE_SEQUENCE.length);
    const heroes = engine.heroPicks.flat();
    expect(new Set(heroes).size).toBe(FIELD * ROLE_SEQUENCE.length);
    for (const roster of engine.rosters) {
      roster.forEach((slot, index) => expect(slot!.player.role).toBe(ROLE_SEQUENCE[index]));
    }
  });

  it("змейка: нечётные раунды инвертируют приоритет; фазы 5+5 раундов", () => {
    const engine = makeEngine();
    expect(engine.roundOrder(1)).toEqual([...engine.roundOrder(0)].reverse());
    expect(engine.roundOrder(2)).toEqual(engine.roundOrder(0));
    expect(engine.phase).toBe("players");
    for (let i = 0; i < ARENA_DRAFT.playerRounds; i += 1) engine.resolveRound();
    expect(engine.phase).toBe("heroes");
    for (let i = 0; i < ARENA_DRAFT.heroRounds; i += 1) engine.resolveRound();
    expect(engine.phase).toBe("done");
    expect(() => engine.resolveRound()).toThrow();
  });

  it("конфликт за игрока выигрывает лучший приоритет раунда; проигравшему — запасной", () => {
    const engine = makeEngine();
    const order = engine.roundOrder(0);
    const seatA = engine.seatOf(HUMANS[0].id)!;
    const seatB = engine.seatOf(HUMANS[1].id)!;
    const winner = order.indexOf(seatA) < order.indexOf(seatB) ? HUMANS[0].id : HUMANS[1].id;
    const loser = winner === HUMANS[0].id ? HUMANS[1].id : HUMANS[0].id;
    const open = engine.openPlayers().filter((c) => c.player.role === "mid");
    const contested = open[0].player.accountId;
    const fallback = open[1].player.accountId;
    expect(engine.submitPick(winner, 0, { main: contested })).toBe(true);
    expect(engine.submitPick(loser, 0, { main: contested, backup: fallback })).toBe(true);
    const resolved = engine.resolveRound();
    const winnerSeat = engine.seatOf(winner)!;
    const loserSeat = engine.seatOf(loser)!;
    expect(resolved.find((pick) => pick.seatIndex === winnerSeat)).toMatchObject({ id: contested, source: "main" });
    expect(resolved.find((pick) => pick.seatIndex === loserSeat)).toMatchObject({ id: fallback, source: "backup" });
  });

  it("протухшая заявка без запасного падает в авто-пик, а не в ошибку", () => {
    const engine = makeEngine();
    const open = engine.openPlayers().filter((c) => c.player.role === "mid");
    const contested = open[0].player.accountId;
    for (const human of HUMANS) engine.submitPick(human.id, 0, { main: contested });
    const resolved = engine.resolveRound();
    const sources = resolved
      .filter((pick) => !engine.seats[pick.seatIndex].isBot)
      .map((pick) => pick.source)
      .sort();
    expect(sources).toEqual(["auto", "main"]);
  });

  it("заявки: только участники, только текущий раунд, только один раз", () => {
    const engine = makeEngine();
    const anyPlayer = engine.openPlayers()[0].player.accountId;
    expect(engine.submitPick("spectator", 0, { main: anyPlayer })).toBe(false);
    expect(engine.submitPick(HUMANS[0].id, 1, { main: anyPlayer })).toBe(false);
    expect(engine.submitPick(HUMANS[0].id, 0, { main: anyPlayer })).toBe(true);
    expect(engine.submitPick(HUMANS[0].id, 0, { main: anyPlayer })).toBe(false);
    expect(engine.allHumansSubmitted).toBe(false);
    expect(engine.submitPick(HUMANS[1].id, 0, { main: anyPlayer })).toBe(true);
    expect(engine.allHumansSubmitted).toBe(true);
  });

  it("ёмкость пула: заведомо неподъёмное поле отбивается словами, конструктор — ошибкой", () => {
    expect(arenaPoolShortage(data, "last_2y", 10_000)).not.toBeNull();
    expect(() => new ArenaDraftEngine(data, "last_2y", "s", HUMANS, 10_000)).toThrow();
    expect(arenaPoolShortage(data, "last_2y", FIELD)).toBeNull();
  });

  it("результаты: только после done; силы попарно различны (эпсилон по сиденью)", () => {
    const engine = makeEngine();
    expect(() => engine.results()).toThrow();
    fastForward(engine);
    const results = engine.results();
    expect(results.length).toBe(FIELD);
    expect(new Set(results.map((team) => team.strength)).size).toBe(FIELD);
    for (const team of results) expect(team.score.teamOvr).toBeGreaterThan(0);
  });
});
