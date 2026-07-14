import { describe, expect, it } from "vitest";
import { smoothedWinrate, SMOOTHING } from "../src/game/smoothing.ts";

describe("smoothedWinrate", () => {
  it("сглаживает к mu при малых games", () => {
    expect(smoothedWinrate({ games: 1, winrate: 1 })).toBeCloseTo(
      (1 + SMOOTHING.m * SMOOTHING.mu) / (1 + SMOOTHING.m),
      4,
    );
    expect(smoothedWinrate({ games: 5, winrate: 0 })).toBeCloseTo(
      (0 + SMOOTHING.m * SMOOTHING.mu) / (5 + SMOOTHING.m),
      4,
    );
  });

  it("отсутствующая статистика → нейтральное mu", () => {
    expect(smoothedWinrate(undefined)).toBe(SMOOTHING.mu);
  });

  it("при больших games сглаживание почти не сдвигает winrate", () => {
    expect(smoothedWinrate({ games: 1000, winrate: 0.8 })).toBeCloseTo(0.8, 2);
  });

  it("монотонно растёт с ростом winrate при фиксированных games", () => {
    const low = smoothedWinrate({ games: 10, winrate: 0.3 });
    const high = smoothedWinrate({ games: 10, winrate: 0.7 });
    expect(high).toBeGreaterThan(low);
  });
});
