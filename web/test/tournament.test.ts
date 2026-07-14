import { describe, expect, it } from "vitest";
import { loadGameData } from "./helpers/data.ts";
import { advanceToEnd, collectStages, createTournament } from "./helpers/tournament.ts";

describe("TournamentEngine", () => {
  const data = loadGameData();

  it("детерминированный seed → идентичная симуляция", () => {
    const first = createTournament(data);
    const second = createTournament(data);
    expect(JSON.stringify(first.snapshot)).toBe(JSON.stringify(second.snapshot));
  });

  it("поле: 18 уникальных команд, одна — игрок", () => {
    const snapshot = createTournament(data).snapshot;
    expect(snapshot.field).toHaveLength(18);
    expect(new Set(snapshot.field.map((t) => t.id)).size).toBe(18);
    expect(snapshot.field.filter((t) => t.isUser)).toHaveLength(1);
  });

  it("группы: две по 9, 16 карт, upper/lower/out", () => {
    const snapshot = advanceToEnd(createTournament(data));
    expect(snapshot.groups).toHaveLength(2);
    for (const group of snapshot.groups) {
      expect(group.standings).toHaveLength(9);
      expect(group.standings.every((row) => row.wins + row.losses === 16)).toBe(true);
      expect(group.standings.filter((r) => r.route === "upper")).toHaveLength(4);
      expect(group.standings.filter((r) => r.route === "lower")).toHaveLength(4);
      expect(group.standings.filter((r) => r.route === "out")).toHaveLength(1);
    }
  });

  it("playoffs: 9 раундов, Grand Final BO5", () => {
    const snapshot = advanceToEnd(createTournament(data));
    expect(snapshot.playoffRounds).toHaveLength(9);
    expect(snapshot.grandFinal.bestOf).toBe(5);
  });

  it("итоговая таблица: 18 мест, чемпион = победитель GF", () => {
    const snapshot = advanceToEnd(createTournament(data));
    expect(snapshot.standings).toHaveLength(18);
    expect(new Set(snapshot.standings.map((r) => r.team.id)).size).toBe(18);
    expect(snapshot.champion.id).toBe(snapshot.grandFinal.winnerId);
    expect(snapshot.standings.some((r) => r.team.isUser && r.placement === snapshot.userPlacement)).toBe(true);
  });

  it("этапы: field → groups → playoffs (терминальный)", () => {
    const engine = createTournament(data);
    expect(collectStages(engine)).toEqual(["field", "groups", "playoffs"]);
    expect(engine.advance()).toBe(false);
    expect(engine.snapshot.stage).toBe("playoffs");
  });
});
