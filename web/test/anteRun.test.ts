import { describe, expect, it } from "vitest";
import {
  AnteRunEngine,
  ANTE_FIELD_STEP,
  ANTE_TARGETS,
  LEGAL_ANTE_TARGETS,
  isActFinale,
  isLegalAnteTarget,
  placementWorstRank,
} from "../src/game/anteRun.ts";
import { TournamentEngine } from "../src/game/tournament.ts";
import { loadGameData } from "./helpers/data.ts";

const data = loadGameData();

function botStrengths(engine: TournamentEngine): number[] {
  return engine.snapshot.field.filter((t) => !t.isUser).map((t) => t.strength);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Прогнать забег до конца, собрав места каждого разрешённого этапа. */
function runToEnd(engine: AnteRunEngine) {
  const placements: (string | null)[] = [];
  let guard = 0;
  while (engine.state.phase === "playing" && guard < 50) {
    engine.resolveStage();
    placements.push(engine.state.lastPlacement);
    guard += 1;
  }
  return { placements, phase: engine.state.phase, index: engine.state.index };
}

describe("placementWorstRank", () => {
  it("бакет мест → худшее числовое место", () => {
    expect(placementWorstRank("1")).toBe(1);
    expect(placementWorstRank("4")).toBe(4);
    expect(placementWorstRank("5-6")).toBe(6);
    expect(placementWorstRank("7-8")).toBe(8);
    expect(placementWorstRank("9-12")).toBe(12);
    expect(placementWorstRank("17")).toBe(17);
    expect(placementWorstRank("18")).toBe(18);
  });
});

describe("TournamentEngine fieldBoost", () => {
  it("boost=0 тождественен Quick Draft (golden не двигается)", () => {
    const base = new TournamentEngine(data, "last_2y", "ante-fb", 80, "N");
    const explicit = new TournamentEngine(data, "last_2y", "ante-fb", 80, "N", 0, 0);
    expect(botStrengths(explicit)).toEqual(botStrengths(base));
    expect(explicit.snapshot.userPlacement).toBe(base.snapshot.userPlacement);
  });

  it("boost>0 усиливает поле (растущий этап)", () => {
    const flat = new TournamentEngine(data, "last_2y", "ante-fb", 80, "N", 0, 0);
    const boosted = new TournamentEngine(data, "last_2y", "ante-fb", 80, "N", 0, 9);
    expect(mean(botStrengths(boosted))).toBeGreaterThan(mean(botStrengths(flat)));
  });
});

describe("AnteRunEngine", () => {
  it("детерминизм: тот же seed → та же последовательность и та же фаза", () => {
    const a = runToEnd(new AnteRunEngine(data, "last_2y", "ante-det", 78, "Five"));
    const b = runToEnd(new AnteRunEngine(data, "last_2y", "ante-det", 78, "Five"));
    expect(a).toEqual(b);
  });

  it("забег всегда завершается за число этапов лестницы", () => {
    const run = runToEnd(new AnteRunEngine(data, "last_2y", "ante-fin", 75, "Five"));
    expect(run.phase).not.toBe("playing");
    expect(run.placements.length).toBeLessThanOrEqual(ANTE_TARGETS.length);
  });

  it("поле каждого следующего этапа сильнее предыдущего", () => {
    // Порог 18 всегда пройден (худшее место ≤ 18) → движок доходит до последних этапов,
    // и можно сравнить силу поля этапа 0 и этапа 2 при одном teamOvr.
    const trivialTargets = [18, 18, 18];
    const engine = new AnteRunEngine(data, "last_2y", "ante-grow", 82, "Five", trivialTargets);
    const stage0 = mean(botStrengths(engine.tournament));
    engine.resolveStage();
    engine.resolveStage();
    const stage2 = mean(botStrengths(engine.tournament));
    expect(engine.state.index).toBe(2);
    expect(engine.state.fieldBoost).toBe(2 * ANTE_FIELD_STEP);
    expect(stage2).toBeGreaterThan(stage0);
  });

  it("проходимая лестница доводит до победы", () => {
    // targets=[18,18]: оба этапа гарантированно проходятся → терминальная фаза «won».
    const run = runToEnd(new AnteRunEngine(data, "last_2y", "ante-win", 70, "Five", [18, 18]));
    expect(run.phase).toBe("won");
    expect(run.placements).toHaveLength(2);
  });

  it("непроходимый порог = смерть на этом этапе", () => {
    // Слабый состав против требования чемпионства → гарантированная смерть на этапе 0.
    // Раньше здесь стоял target=0: он «недостижим», но и не является реальным бакетом, а такие
    // числа теперь запрещены (R9.3) — ложные подписи порогов ловятся конструктором.
    const engine = new AnteRunEngine(data, "last_2y", "ante-death", 45, "Five", [1, 8]);
    expect(engine.resolveStage()).toBe("lost");
    expect(engine.state.index).toBe(0);
    expect(engine.state.lastPlacement).not.toBeNull();
  });

  it("после конца забега resolveStage — no-op", () => {
    const engine = new AnteRunEngine(data, "last_2y", "ante-noop", 45, "Five", [1]);
    engine.resolveStage();
    const after = engine.state;
    expect(engine.resolveStage()).toBe("lost");
    expect(engine.state).toEqual(after);
  });

  it("порог обязан быть worst-rank реального бакета (R9.3)", () => {
    // «топ-10» невыразимо: бакет 9-12 кончается на 12, поэтому target=10 вёл себя как топ-8.
    expect(LEGAL_ANTE_TARGETS).toEqual([1, 2, 3, 4, 6, 8, 12, 16, 17, 18]);
    expect(ANTE_TARGETS.every(isLegalAnteTarget)).toBe(true);
    expect(() => new AnteRunEngine(data, "last_2y", "illegal", 80, "Five", [10]))
      .toThrow(/worst-rank/);
    // Смена подписи 10 → 8 не сдвинула ни один бакет: оба режут ровно «9-12» и ниже.
    expect(placementWorstRank("7-8") <= 8).toBe(true);
    expect(placementWorstRank("9-12") > 8).toBe(true);
  });

  it("боссы стоят только на финалах актов (R6.2)", () => {
    expect([0, 1, 2, 3].map(isActFinale)).toEqual([false, false, false, false]);
    expect([4, 9, 14, 19, 24].map(isActFinale)).toEqual([true, true, true, true, true]);
  });

  it("слабый состав не проходит стартовый порог топ-8", () => {
    // teamOvr сильно ниже даже гандикапнутого поля (N74 на этапе 0) → место у дна → промах.
    const engine = new AnteRunEngine(data, "last_2y", "ante-weak", 45, "Five");
    expect(engine.resolveStage()).toBe("lost");
    expect(placementWorstRank(engine.state.lastPlacement!)).toBeGreaterThan(ANTE_TARGETS[0]);
  });
});
