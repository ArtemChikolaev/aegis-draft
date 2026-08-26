// Протокол онлайн-Дуэли: детерминированная применялка relay-лога. Ключевое свойство — оба
// клиента (и reconnect-реплей) применяют один лог одними правилами и приходят в одно состояние;
// мусор, чужие ходы и действия зрителей игнорируются одинаково и молча.
import { describe, expect, it } from "vitest";
import { applyDuelEntry, type DuelMatch, type DuelStartAction } from "../src/game/duelProtocol.ts";
import { loadGameData } from "./helpers/data.ts";

const data = loadGameData();
const A = "member-a";
const B = "member-b";

function startAction(): DuelStartAction {
  return {
    kind: "start",
    seed: "proto-seed",
    format: "last_2y",
    bestOf: 1,
    sides: { [A]: 0, [B]: 1 },
    names: ["Alice", "Bob"],
  };
}

function startedMatch(): DuelMatch {
  const match = applyDuelEntry(null, { from: A, payload: startAction() }, data);
  expect(match).not.toBeNull();
  return match!;
}

/** id актора текущего шага (для валидного хода) и его оппонента (для чужого). */
function actors(match: DuelMatch): { actor: string; other: string } {
  const engine = match.engine;
  const side = engine.phase === "players" ? engine.currentPicker : engine.currentStep!.side;
  return side === 0 ? { actor: A, other: B } : { actor: B, other: A };
}

describe("duelProtocol — start", () => {
  it("валидный start собирает движок; мусор, зритель и повторный start игнорируются", () => {
    expect(applyDuelEntry(null, { from: A, payload: { kind: "start" } }, data)).toBeNull();
    expect(applyDuelEntry(null, { from: A, payload: "garbage" }, data)).toBeNull();
    // Зритель (не из sides) стартовать не может.
    expect(applyDuelEntry(null, { from: "stranger", payload: startAction() }, data)).toBeNull();
    const match = startedMatch();
    expect(match.engine.phase).toBe("players");
    expect(match.engine.names).toEqual(["Alice", "Bob"]);
    // Повторный start на живой партии игнорируется (второй парсится уже как play-действие).
    expect(applyDuelEntry(match, { from: B, payload: startAction() }, data)).toBe(match);
  });
});

describe("duelProtocol — ходы", () => {
  it("свой ход применяется, чужой/зрительский/невалидный — игнор без мутаций", () => {
    const match = startedMatch();
    const { actor, other } = actors(match);
    const index = match.engine.currentPack.candidates.findIndex((_, i) => match.engine.canPickPlayer(i));
    // Чужой ход и зритель — игнор.
    expect(applyDuelEntry(match, { from: other, payload: { kind: "pickPlayer", index } }, data)).toBe(match);
    expect(applyDuelEntry(match, { from: "stranger", payload: { kind: "pickPlayer", index } }, data)).toBe(match);
    expect(match.engine.pickIndex).toBe(0);
    // Невалидный индекс — игнор.
    expect(applyDuelEntry(match, { from: actor, payload: { kind: "pickPlayer", index: 99 } }, data)).toBe(match);
    // Свой валидный — применяется.
    applyDuelEntry(match, { from: actor, payload: { kind: "pickPlayer", index } }, data);
    expect(match.engine.pickIndex).toBe(1);
  });

  it("полный лог доигрывает серию, и реплей того же лога детерминирован", () => {
    // Собираем лог «жадной» партии: каждый шаг делает актор текущего шага.
    const log: { from: string; payload: unknown }[] = [{ from: A, payload: startAction() }];
    let match = applyDuelEntry(null, log[0], data)!;
    let guard = 0;
    while (match.engine.phase !== "done" && guard++ < 80) {
      const engine = match.engine;
      let payload: unknown;
      let from: string;
      if (engine.phase === "players") {
        const index = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
        from = actors(match).actor;
        payload = index >= 0 ? { kind: "pickPlayer", index } : { kind: "reroll" };
      } else if (engine.phase === "heroes") {
        const open = engine.heroPool().find((cell) => cell.state === "open")!;
        from = actors(match).actor;
        payload = { kind: "actHero", heroId: open.heroId };
      } else {
        from = A; // «дальше» жмёт любой капитан
        payload = { kind: "next" };
      }
      log.push({ from, payload });
      match = applyDuelEntry(match, { from, payload }, data)!;
    }
    expect(match.engine.phase).toBe("done");
    // Дублирующий next после конца — игнор (у второго капитана кнопка тоже была).
    expect(applyDuelEntry(match, { from: B, payload: { kind: "next" } }, data)).toBe(match);

    // Реплей (reconnect): тот же лог с нуля → та же серия до последнего знака.
    let replay: DuelMatch | null = null;
    for (const entry of log) replay = applyDuelEntry(replay, entry, data);
    expect(replay!.engine.phase).toBe("done");
    expect(replay!.engine.games.map((game) => game.winner)).toEqual(match.engine.games.map((game) => game.winner));
    expect(replay!.engine.games.map((game) => game.pSideA)).toEqual(match.engine.games.map((game) => game.pSideA));
  });
});
