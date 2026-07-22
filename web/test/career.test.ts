import { beforeEach, describe, expect, it } from "vitest";
import type { PlacementKey } from "../src/game/tournament.ts";
import {
  appendCareerEntry,
  careerEntriesForMode,
  careerRunId,
  placementBucket,
  summarizeCareer,
  tournamentCareerResults,
  useCareer,
  type CareerEntry,
} from "../src/state/careerStore.ts";
import type { Role } from "../src/types/data.ts";
import { loadGameData } from "./helpers/data.ts";
import { advanceToEnd, createTournament } from "./helpers/tournament.ts";

describe("placementBucket", () => {
  const expected: Record<PlacementKey, string> = {
    "1": "1", "2": "2", "3": "3", "4": "4", "5-6": "5-6", "7-8": "7-8",
    "9-12": "rest", "13-16": "rest", "17": "rest", "18": "rest",
  };
  for (const [placement, bucket] of Object.entries(expected) as [PlacementKey, string][]) {
    it(`${placement} → ${bucket}`, () => {
      expect(placementBucket(placement)).toBe(bucket);
    });
  }
});

describe("tournamentCareerResults", () => {
  const data = loadGameData();

  it("детерминированный seed → одинаковая career-статистика карт", () => {
    const tournament = advanceToEnd(createTournament(data, "career-contract", 61.5, "Career Five"));
    const results = tournamentCareerResults(tournament);
    const replay = advanceToEnd(createTournament(data, "career-contract", 61.5, "Career Five"));
    expect(results).toEqual(tournamentCareerResults(replay));
    expect(results.gamesWon + results.gamesLost).toBeGreaterThanOrEqual(16);
  });

  it("groupClean и undefeated согласованы с картами", () => {
    const snapshot = advanceToEnd(createTournament(data, "career-contract", 61.5, "Career Five"));
    const results = tournamentCareerResults(snapshot);
    const userGroupLosses = snapshot.groups
      .flatMap((g) => g.standings)
      .find((row) => row.team.isUser)?.losses ?? 0;
    expect(results.groupClean).toBe(userGroupLosses === 0);
    expect(results.undefeated).toBe(results.gamesLost === 0);
  });
});

describe("careerStore", () => {
  const data = loadGameData();
  const roles: Role[] = ["safelane", "mid", "offlane", "support", "support"];

  beforeEach(() => {
    useCareer.setState({ entries: [] });
  });

  function sampleEntry(seed: string, placement: PlacementKey = "5-6"): CareerEntry {
    const snapshot = advanceToEnd(createTournament(data, seed, 61.5, "Career Five"));
    const results = tournamentCareerResults(snapshot);
    return {
      v: 1,
      finishedAt: "2026-07-12T12:00:00.000Z",
      seed,
      datasetSchemaVersion: data.manifest.schemaVersion,
      ratingModelVersion: data.manifest.ratingModelVersion,
      configLabel: { format: "last_2y", difficulty: "normal", scoring: "event", draftStyle: "team" },
      placement,
      score: { base: 60, heroSynergy: 2, chemistry: 1, teamOvr: 63 },
      roster: roles.map((role, index) => ({
        role,
        nickname: `Player ${index + 1}`,
        accountId: index + 1,
        heroId: index + 1,
      })),
      results,
    };
  }

  it("runId не зависит от finishedAt", () => {
    const entry = sampleEntry("career-contract");
    const later = { ...entry, finishedAt: "2026-07-13T12:00:00.000Z" };
    expect(careerRunId(entry)).toBe(careerRunId(later));
  });

  it("runId Roguelite-забега не зависит от этапа результата", () => {
    const base = sampleEntry("roguelite-stage");
    const entry = {
      ...base,
      configLabel: { ...base.configLabel, mode: "run" as const },
      rogueliteStage: { index: 1, count: 5 },
    };
    expect(careerRunId(entry)).toBe(careerRunId({ ...entry, rogueliteStage: { index: 3, count: 5 } }));
  });

  it("appendCareerEntry дедуплицирует повторный runId", () => {
    const entry = sampleEntry("career-contract");
    const later = { ...entry, finishedAt: "2026-07-13T12:00:00.000Z" };
    const once = appendCareerEntry([], entry);
    const twice = appendCareerEntry(once, later);
    expect(once).toHaveLength(1);
    expect(twice).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("Quick Draft и Roguelite Run с одинаковым seed — разные записи", () => {
    const quick = sampleEntry("shared-seed");
    const roguelite = {
      ...quick,
      configLabel: { ...quick.configLabel, mode: "run" as const },
    };
    const entries = appendCareerEntry(appendCareerEntry([], quick), roguelite);
    expect(entries).toHaveLength(2);
    expect(careerRunId(quick)).not.toBe(careerRunId(roguelite));
  });

  it("финальная история разделяет Quick Draft и Roguelite, старые записи считает Quick Draft", () => {
    const legacyQuick = sampleEntry("legacy-quick");
    const explicitQuick = {
      ...sampleEntry("explicit-quick"),
      configLabel: { ...legacyQuick.configLabel, mode: "classic" as const },
    };
    const roguelite = {
      ...sampleEntry("roguelite"),
      configLabel: { ...legacyQuick.configLabel, mode: "run" as const },
    };
    const entries = [legacyQuick, explicitQuick, roguelite];

    expect(careerEntriesForMode(entries, "classic")).toEqual([legacyQuick, explicitQuick]);
    expect(careerEntriesForMode(entries, "run")).toEqual([roguelite]);
  });

  it("record добавляет забег ровно один раз", () => {
    const entry = sampleEntry("career-contract");
    const later = { ...entry, finishedAt: "2026-07-13T12:00:00.000Z" };
    expect(useCareer.getState().record(entry)).toBe(true);
    expect(useCareer.getState().record(later)).toBe(false);
    expect(useCareer.getState().entries).toHaveLength(1);
  });

  it("summarizeCareer агрегирует runs, placements, undefeated", () => {
    const entry = sampleEntry("career-contract");
    const other = {
      ...sampleEntry("career-contract-2", "1"),
      results: { gamesWon: 20, gamesLost: 0, groupClean: true, undefeated: true },
    };
    const summary = summarizeCareer([entry, other]);
    expect(summary.runs).toBe(2);
    expect(summary.gamesWon).toBe(entry.results.gamesWon + 20);
    expect(summary.gamesLost).toBe(entry.results.gamesLost);
    expect(summary.placements[placementBucket(entry.placement)]).toBeGreaterThanOrEqual(1);
    expect(summary.placements["1"]).toBeGreaterThanOrEqual(1);
    expect(summary.undefeated).toBe(Number(entry.results.undefeated) + 1);
    expect(summary.flawlessGroups).toBe(Number(entry.results.groupClean) + 1);
  });
});
