import { describe, expect, it } from "vitest";
import {
  buildCareerEntry,
  collectionStats,
  hqTrophies,
  type CareerEntry,
} from "../src/state/careerStore.ts";
import { viewFromHash } from "../src/state/shellStore.ts";
import { TournamentEngine } from "../src/game/tournament.ts";
import { loadGameData } from "./helpers/data.ts";

const base = (over: Partial<CareerEntry>): CareerEntry => ({
  v: 1,
  finishedAt: "2026-09-02T10:00:00Z",
  seed: "camp-e2e-1",
  datasetSchemaVersion: 1,
  ratingModelVersion: "v1.13.0",
  configLabel: { format: "last_2y", difficulty: "smurfing", scoring: "event", draftStyle: "team", mode: "run" },
  placement: "1",
  score: { base: 80, heroSynergy: 3, chemistry: 2, teamOvr: 85 },
  roster: [],
  results: { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 } as CareerEntry["results"],
  ...over,
});

describe("Штаб: коллекция карт из карьеры", () => {
  const entries: CareerEntry[] = [
    base({ seed: "a", rogueliteStage: { index: 24, count: 25 }, seasonWon: true, build: { cards: ["widePool", "blackKingBar"], actions: ["scouting"] } }),
    base({ seed: "b", rogueliteStage: { index: 6, count: 25 }, build: { cards: ["widePool"] } }),
    // Cheat Mode — несоревновательный: в коллекцию и трофеи не идёт.
    base({ seed: "c", configLabel: { format: "last_2y", difficulty: "smurfing", scoring: "event", draftStyle: "team", mode: "run", cheatMode: true }, rogueliteStage: { index: 24, count: 25 }, seasonWon: true, build: { cards: ["dagon"] } }),
    // Quick Draft без билда — не влияет.
    base({ seed: "d", configLabel: { format: "last_2y", difficulty: "normal", scoring: "event", draftStyle: "team" } }),
  ];

  it("считает взятия, победы и лучший этап по каждой карте; чит и Quick Draft не учитываются", () => {
    const stats = collectionStats(entries);
    expect(stats.widePool).toEqual({ taken: 2, won: 1, bestStage: 25 });
    expect(stats.blackKingBar).toEqual({ taken: 1, won: 1, bestStage: 25 });
    expect(stats.scouting).toEqual({ taken: 1, won: 1, bestStage: 25 });
    expect(stats.dagon).toBeUndefined();
  });

  it("трофеи: забеги, сезоны, лучший этап, дейлики", () => {
    const t = hqTrophies([...entries, base({ seed: "daily-2026-09-02", configLabel: { format: "last_2y", difficulty: "normal", scoring: "event", draftStyle: "team" } })]);
    expect(t.rogueliteRuns).toBe(2);
    expect(t.seasonsWon).toBe(1);
    expect(t.bestStage).toBe(25);
    expect(t.dynastyBest).toBeNull();
    expect(t.dailyPlayed).toBe(1);
    expect(t.stakesUnlocked).toBe(true);
  });

  it("глубина Династии — этапы сверх сезона у записей Династии", () => {
    const t = hqTrophies([base({ seed: "x", configLabel: { format: "last_2y", difficulty: "smurfing", scoring: "event", draftStyle: "team", mode: "run", dynasty: true }, rogueliteStage: { index: 31, count: 25 }, seasonWon: true })]);
    expect(t.dynastyBest).toBe(7);
    expect(t.bestStage).toBe(25);
  });
});

describe("Штаб: билд пишется в запись карьеры только у Roguelite Run", () => {
  const data = loadGameData();
  const tournamentEngine = new TournamentEngine(data, "last_2y", "hq-career-seed", 83, "HQ Five");
  while (tournamentEngine.advance()) { /* до терминальной стадии */ }
  const players = data.packs[0].players.slice(0, 5);
  const input = {
    seed: "hq-career", datasetSchemaVersion: 1, ratingModelVersion: "vX",
    config: { draftStyle: "team", format: "last_2y", rerolls: 2, scoring: "event", allocation: "auto" } as const,
    score: {
      base: 80, heroSynergy: 2, chemistry: 1, teamOvr: 83,
      assignment: { byPlayer: Object.fromEntries(players.map((p, i) => [p.accountId, i + 1])), total: 0 },
    },
    roster: players.map((player, i) => ({
      role: player.role,
      candidate: {
        player, teamId: data.packs[0].teamId, teamName: data.packs[0].teamName,
        eventId: data.packs[0].eventId, signatureHeroes: [i + 1],
      },
    })),
    tournament: tournamentEngine.snapshot,
    build: { cards: ["widePool"] },
  };
  it("run → build есть; classic → нет; пустой билд не пишется", () => {
    expect(buildCareerEntry({ ...input, mode: "run" }).build).toEqual({ cards: ["widePool"] });
    expect(buildCareerEntry({ ...input }).build).toBeUndefined();
    expect(buildCareerEntry({ ...input, mode: "run", build: { cards: [] } }).build).toBeUndefined();
  });
});

describe("shell: вид Штаба доступен по hash", () => {
  it("#/hq → hq", () => {
    expect(viewFromHash("#/hq")).toBe("hq");
  });
});
