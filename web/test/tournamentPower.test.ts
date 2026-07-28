import { describe, expect, it } from "vitest";
import {
  EMPTY_POWER,
  POWER_LIMITS,
  eloDivisorForScale,
  powerBreakdown,
  powerLayers,
  rosterPower,
  tournamentPower,
  xMultProduct,
} from "../src/game/tournamentPower.ts";
import { QUICK_DRAFT_FIELD, TournamentEngine } from "../src/game/tournament.ts";
import { anteFieldModel } from "../src/game/anteRun.ts";
import { loadGameData } from "./helpers/data.ts";
import { advanceToEnd } from "./helpers/tournament.ts";

const ELO_BASE = 22;
const winProb = (gap: number, divisor: number) => 1 / (1 + Math.pow(10, -gap / divisor));

describe("Tournament Power — слои и порядок применения", () => {
  it("пустые слои дают ровно Team OVR (сегодняшнее поведение не меняется)", () => {
    const layers = powerLayers(88);
    expect(rosterPower(layers)).toBe(88);
    expect(tournamentPower(layers)).toBe(88);
    expect(powerBreakdown(layers).trivial).toBe(true);
    expect(tournamentPower({ ...EMPTY_POWER, teamOvr: 0 })).toBe(0);
  });

  it("порядок фиксирован: (teamOvr + flat) × additive × Π xMult", () => {
    const layers = powerLayers(100, { flat: 8, additive: 25, xMults: [1.2, 1.25] });
    // 108 × 1.25 × 1.5 = 202.5 — именно в этом порядке, а не «сначала множители».
    expect(rosterPower(layers)).toBe(108);
    expect(xMultProduct(layers)).toBeCloseTo(1.5, 6);
    expect(tournamentPower(layers)).toBeCloseTo(202.5, 6);
  });

  it("Team OVR предметами не умножается — он входит слагаемым, а не множимым", () => {
    // Инвариант PRD §5.9.3: рейтинг состава остаётся читаемым. Проверяем, что flat живёт в том же
    // слое, что teamOvr, и множители применяются к их сумме, а не к одному из них.
    const a = tournamentPower(powerLayers(100, { flat: 10, additive: 50 }));
    const b = tournamentPower(powerLayers(110, { additive: 50 }));
    expect(a).toBeCloseTo(b, 6);
  });

  it("xMult клампится: множитель < 1 не роняет силу, глобальный потолок соблюдён", () => {
    expect(xMultProduct(powerLayers(100, { xMults: [0.5] }))).toBe(1);
    expect(xMultProduct(powerLayers(100, { xMults: [99] }))).toBe(POWER_LIMITS.xMultHard);
    expect(POWER_LIMITS.xMultMin).toBeGreaterThan(1);
    expect(POWER_LIMITS.xMultMax).toBeLessThan(POWER_LIMITS.xMultHard);
  });

  it("breakdown перестаёт быть тривиальным, как только слой активен", () => {
    expect(powerBreakdown(powerLayers(90, { flat: 1 })).trivial).toBe(false);
    expect(powerBreakdown(powerLayers(90, { additive: 1 })).trivial).toBe(false);
    expect(powerBreakdown(powerLayers(90, { xMults: [1.2] })).trivial).toBe(false);
  });
});

describe("ELO против инфляции силы", () => {
  it("Quick Draft получает ровно базовый делитель (golden не двигается)", () => {
    expect(eloDivisorForScale(ELO_BASE, QUICK_DRAFT_FIELD.mean)).toBe(ELO_BASE);
  });

  it("слабое поле не сжимает делитель — ранние этапы не становятся детерминированными", () => {
    expect(eloDivisorForScale(ELO_BASE, 60)).toBe(ELO_BASE);
    expect(eloDivisorForScale(ELO_BASE, anteFieldModel(0).mean)).toBe(ELO_BASE);
  });

  it("одинаковое ОТНОСИТЕЛЬНОЕ преимущество даёт одинаковую вероятность на любой шкале", () => {
    // Это и есть смысл правки: без масштабирования делителя разрыв в 40 очков на шкале 180
    // означал бы победу с вероятностью ≈1, и турнир превратился бы в сравнение чисел.
    const base = QUICK_DRAFT_FIELD.mean;
    const reference = winProb(10, eloDivisorForScale(ELO_BASE, base));
    for (const k of [2, 3, 5]) {
      const scaled = winProb(10 * k, eloDivisorForScale(ELO_BASE, base * k));
      expect(scaled).toBeCloseTo(reference, 6);
    }
  });

  it("без масштабирования тот же разрыв выродился бы в определённость", () => {
    // Контрольный расчёт, фиксирующий саму проблему, а не только решение.
    expect(winProb(50, ELO_BASE)).toBeGreaterThan(0.99);
    expect(winProb(50, eloDivisorForScale(ELO_BASE, QUICK_DRAFT_FIELD.mean * 5))).toBeLessThan(0.75);
  });

  it("турнир на инфлированной шкале остаётся валидным турниром", () => {
    const data = loadGameData();
    // Поздний этап: угроза уводит силу поля далеко за 99.
    const snapshot = advanceToEnd(new TournamentEngine(
      data, "last_2y", "power-scale", 130, "Five", 0, anteFieldModel(24),
    ));
    expect(snapshot.standings).toHaveLength(18);
    expect(new Set(snapshot.standings.map((row) => row.team.id)).size).toBe(18);
    expect(snapshot.userPlacement).toBeTruthy();
  });
});
