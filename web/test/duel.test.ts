// Дуэль (M-DUEL, срез 1): оркестрация двух сторон — змейка, общий пул, сетка хиро-драфта,
// детерминизм серии. Скоринг и матч-модель здесь не переизмеряются: они чужие (score/tournament).
import { describe, expect, it } from "vitest";
import { DUEL, DuelEngine, duelFallbackAction, heroDraftScript, type DuelSide } from "../src/game/duel.ts";
import { ROLE_SEQUENCE } from "../src/game/packs.ts";
import { loadGameData } from "./helpers/data.ts";

const data = loadGameData();

/** Доиграть драфт игроков: каждая сторона жадно берёт первого доступного кандидата. */
function draftPlayers(engine: DuelEngine): void {
  let guard = 0;
  while (engine.phase === "players" && guard++ < 60) {
    const index = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
    if (index >= 0) engine.pickPlayer(index);
    else engine.reroll();
  }
  if (engine.phase === "players") throw new Error("драфт игроков не завершился");
}

/** Доиграть текущий хиро-драфт: активная сторона берёт первый открытый герой. */
function draftHeroes(engine: DuelEngine): void {
  let guard = 0;
  while (engine.phase === "heroes" && guard++ < 40) {
    const open = engine.heroPool().find((cell) => cell.state === "open");
    if (!open) throw new Error("пул героев кончился раньше сетки");
    engine.actHero(open.heroId);
  }
}

function playSeries(seed: string, bestOf: 1 | 3 | 5 = 3): DuelEngine {
  const engine = new DuelEngine(data, { format: "last_2y", bestOf }, seed, ["A", "B"]);
  draftPlayers(engine);
  let guard = 0;
  while (engine.phase !== "done" && guard++ < 10) {
    draftHeroes(engine);
    engine.next();
  }
  expect(engine.phase).toBe("done");
  return engine;
}

describe("heroDraftScript", () => {
  it("баны чередуются, пики — змейкой, приоритет отдан firstSide", () => {
    const script = heroDraftScript(0);
    expect(script.length).toBe(DUEL.bansPerSide * 2 + 10);
    expect(script.slice(0, DUEL.bansPerSide * 2).map((s) => `${s.side}${s.kind[0]}`)).toEqual(["0b", "1b", "0b", "1b"]);
    const picks = script.filter((s) => s.kind === "pick").map((s) => s.side);
    expect(picks).toEqual([0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
    // Зеркало: firstSide=1 меняет стороны местами, форма змейки та же.
    expect(heroDraftScript(1).filter((s) => s.kind === "pick").map((s) => s.side)).toEqual([1, 0, 0, 1, 1, 0, 0, 1, 1, 0]);
  });
});

describe("DuelEngine — драфт игроков", () => {
  it("змейка 0-1-1-0…, оба ростера заполняются по ролям, личности не пересекаются", () => {
    const engine = new DuelEngine(data, { format: "last_2y", bestOf: 1 }, "duel-draft", ["A", "B"]);
    const observedOrder: DuelSide[] = [];
    let guard = 0;
    while (engine.phase === "players" && guard++ < 60) {
      const index = engine.currentPack.candidates.findIndex((_, i) => engine.canPickPlayer(i));
      if (index < 0) { engine.reroll(); continue; }
      observedOrder.push(engine.currentPicker);
      engine.pickPlayer(index);
    }
    expect(observedOrder).toEqual([0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
    const ids = new Set<number>();
    for (const side of [0, 1] as const) {
      expect(engine.rosters[side].every((slot) => slot !== null)).toBe(true);
      engine.rosters[side].forEach((slot, index) => {
        expect(slot!.player.role).toBe(ROLE_SEQUENCE[index]);
        ids.add(slot!.player.accountId);
      });
    }
    expect(ids.size).toBe(10); // общий пул: никто не сыграл за обе стороны
    expect(engine.phase).toBe("heroes");
  });

  it("детерминизм: тот же seed и та же последовательность решений — те же паки и ростеры", () => {
    const run = () => {
      const engine = new DuelEngine(data, { format: "last_2y", bestOf: 1 }, "duel-repro", ["A", "B"]);
      draftPlayers(engine);
      return engine.rosters.map((roster) => roster.map((slot) => slot!.player.accountId));
    };
    expect(run()).toEqual(run());
  });
});

describe("DuelEngine — хиро-драфт и серия", () => {
  it("бан и пик забирают героя из пула; чужой/занятый герой не берётся", () => {
    const engine = new DuelEngine(data, { format: "last_2y", bestOf: 1 }, "duel-heroes", ["A", "B"]);
    draftPlayers(engine);
    const first = engine.heroPool()[0];
    expect(engine.currentStep?.kind).toBe("ban");
    engine.actHero(first.heroId);
    expect(engine.heroPool().find((cell) => cell.heroId === first.heroId)?.state).toBe("banned");
    expect(engine.canActHero(first.heroId)).toBe(false);
    expect(() => engine.actHero(first.heroId)).toThrow();
  });

  it("серия bo3 играется до 2 побед; каждая игра — свежий драфт; исходы детерминированы", () => {
    const engine = playSeries("duel-series", 3);
    const [a, b] = engine.seriesScore;
    expect(Math.max(a, b)).toBe(2);
    expect(engine.games.length).toBeGreaterThanOrEqual(2);
    expect(engine.games.length).toBeLessThanOrEqual(3);
    for (const game of engine.games) {
      expect(game.pSideA).toBeGreaterThan(0);
      expect(game.pSideA).toBeLessThan(1);
      expect(game.score[0].teamOvr).toBeGreaterThan(0);
    }
    // Полный реплей той же серии тем же способом — бит-в-бит те же исходы.
    const replay = playSeries("duel-series", 3);
    expect(replay.games.map((game) => game.winner)).toEqual(engine.games.map((game) => game.winner));
    expect(replay.games.map((game) => game.pSideA)).toEqual(engine.games.map((game) => game.pSideA));
  });

  it("bo1 заканчивается одной игрой", () => {
    const engine = playSeries("duel-bo1", 1);
    expect(engine.games.length).toBe(1);
  });

  it("приоритет хиро-драфта чередуется по играм серии", () => {
    const engine = new DuelEngine(data, { format: "last_2y", bestOf: 5 }, "duel-priority", ["A", "B"]);
    draftPlayers(engine);
    expect(engine.currentStep?.side).toBe(0); // game 1 начинает сторона 0
    draftHeroes(engine);
    if (engine.seriesWinner === null) {
      engine.next();
      expect(engine.currentStep?.side).toBe(1); // game 2 — сторона 1
    }
  });
});

describe("duelFallbackAction — авто-ход по таймауту", () => {
  it("в драфте игроков берёт лучшего по OVR из пикабельных; в хиро-драфте — верхнюю открытую клетку", () => {
    const engine = new DuelEngine(data, { format: "last_2y", bestOf: 1 }, "duel-fallback", ["A", "B"]);
    const fallback = duelFallbackAction(engine);
    expect(fallback?.kind).toBe("pickPlayer");
    const index = (fallback as { kind: "pickPlayer"; index: number }).index;
    expect(engine.canPickPlayer(index)).toBe(true);
    const best = Math.max(...engine.currentPack.candidates
      .filter((_, i) => engine.canPickPlayer(i))
      .map((candidate) => candidate.player.ovr));
    expect(engine.currentPack.candidates[index].player.ovr).toBe(best);

    draftPlayers(engine);
    const heroFallback = duelFallbackAction(engine);
    expect(heroFallback?.kind).toBe("actHero");
    const topOpen = engine.heroPool().find((cell) => cell.state === "open")!;
    expect((heroFallback as { kind: "actHero"; heroId: number }).heroId).toBe(topOpen.heroId);
    expect(engine.canActHero(topOpen.heroId)).toBe(true);

    draftHeroes(engine);
    // После резолва игры таймер не гонит «дальше» — авто-хода нет.
    expect(duelFallbackAction(engine)).toBeNull();
  });
});
