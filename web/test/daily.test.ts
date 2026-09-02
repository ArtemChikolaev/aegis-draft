import { describe, expect, it } from "vitest";
import { DAILY_CONFIG, dailyDateKey, dailySeed, dailySeedDate, formatDailyDate, isDailySeed } from "../src/game/daily.ts";
import { RunEngine } from "../src/game/engine.ts";
import { loadGameData } from "./helpers/data.ts";

describe("daily challenge seed", () => {
  it("выводится из даты по UTC и стабилен внутри суток", () => {
    expect(dailySeed(new Date("2026-09-02T00:00:00Z"))).toBe("daily-2026-09-02");
    expect(dailySeed(new Date("2026-09-02T23:59:59Z"))).toBe("daily-2026-09-02");
    expect(dailySeed(new Date("2026-09-03T00:00:00Z"))).toBe("daily-2026-09-03");
    expect(dailyDateKey(new Date("2026-01-31T12:00:00Z"))).toBe("2026-01-31");
  });

  it("узнаёт дейличный сид и достаёт дату; чужие сиды не путает", () => {
    expect(isDailySeed("daily-2026-09-02")).toBe(true);
    expect(dailySeedDate("daily-2026-09-02")).toBe("2026-09-02");
    expect(isDailySeed("daily-2026-9-2")).toBe(false);
    expect(isDailySeed("m1abc-xyz")).toBe(false);
    expect(dailySeedDate("")).toBeNull();
  });

  it("подпись дня трактует дату как UTC (без сдвига на день в западных поясах)", () => {
    expect(formatDailyDate("2026-09-02", "en")).toBe("Sep 2");
  });

  it("один и тот же сид даёт один и тот же первый пак у всех игроков", () => {
    const data = loadGameData();
    const seed = dailySeed(new Date("2026-09-02T10:00:00Z"));
    const first = new RunEngine(data, DAILY_CONFIG, seed).currentPack.candidates.map((c) => c.player.accountId);
    const second = new RunEngine(data, DAILY_CONFIG, seed).currentPack.candidates.map((c) => c.player.accountId);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });
});
