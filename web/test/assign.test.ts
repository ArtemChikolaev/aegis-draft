import { describe, expect, it } from "vitest";
import { bestAssignment, assignmentPairScore } from "../src/game/assign.ts";
import { loadGameData } from "./helpers/data.ts";
import {
  assignmentPairScoreTotal,
  chemFromPack,
  greedyAssignmentPairScore,
  sigFromPack,
} from "./helpers/assignment.ts";

describe("bestAssignment", () => {
  const data = loadGameData();
  const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
  const phs = data.playerHeroStats;
  const sig = sigFromPack(spirit);

  it("назначает всех 5 героев без дубликатов", () => {
    const assignment = bestAssignment(spirit.players, spirit.signatureHeroes, phs, sig);
    expect(Object.keys(assignment.byPlayer)).toHaveLength(5);
    expect(new Set(Object.values(assignment.byPlayer)).size).toBe(5);
  });

  it("matching не хуже жадности по assignmentPairScore", () => {
    const assignment = bestAssignment(spirit.players, spirit.signatureHeroes, phs, sig);
    const matchingTotal = assignmentPairScoreTotal(assignment.byPlayer, phs, sig);
    const greedyTotal = greedyAssignmentPairScore(spirit.players, spirit.signatureHeroes, phs, sig);
    // Допуск на флоат: при совпадении оптимума матчинг и жадность дают одну сумму, но
    // порядок слагаемых разный — точное >= падало на разнице в 13-м знаке (117002.63541726189
    // против 117002.6354172619). Инвариант «матчинг не хуже» это не ослабляет: 1e-9 при
    // значениях ~1e5 — это 1e-14 относительной погрешности.
    expect(matchingTotal).toBeGreaterThanOrEqual(greedyTotal - 1e-9);
  });

  it("assignmentPairScore: любой опыт на герое бьёт отсутствие данных", () => {
    const withGames = assignmentPairScore(1, 100, { "1": { "100": { games: 1, winrate: 0 } } });
    const noData = assignmentPairScore(2, 100, {});
    expect(withGames).toBeGreaterThan(noData);
  });

  it("matching: 5 назначений при пуле 40 героев", () => {
    const largePool = Array.from({ length: 40 }, (_, i) => i + 1);
    const largeStats: typeof phs = {};
    spirit.players.forEach((player, i) => {
      largeStats[String(player.accountId)] = { [String(36 + i)]: { games: 100, winrate: 0.9 } };
    });
    const assignment = bestAssignment(spirit.players, largePool, largeStats);
    expect(Object.keys(assignment.byPlayer)).toHaveLength(5);
  });
});

describe("bestAssignment (mixed roster)", () => {
  const data = loadGameData();
  const phs = data.playerHeroStats;
  const squad = data.squadSynergy;

  it("mixed: собрано 5 игроков из разных команд", () => {
    type Sourced = { player: typeof data.packs[0]["players"][0]; teamId: number };
    const byRole = (role: string): Sourced[] => {
      const fromTeams = new Map<number, Sourced>();
      for (const pk of data.packs) {
        for (const pl of pk.players) {
          if (pl.role === role && !fromTeams.has(pk.teamId)) {
            fromTeams.set(pk.teamId, { player: pl, teamId: pk.teamId });
          }
        }
      }
      return [...fromTeams.values()];
    };
    const mixed = [
      byRole("safelane")[0],
      byRole("mid")[1],
      byRole("offlane")[0],
      byRole("support")[1],
      byRole("support")[3],
    ].filter(Boolean);
    expect(mixed).toHaveLength(5);
    expect(new Set(mixed.map((x) => x.teamId)).size).toBeGreaterThanOrEqual(3);

    const players = mixed.map((x) => x.player);
    const heroPool = [...new Set(data.packs.flatMap((p) => p.signatureHeroes))].slice(0, 6);
    const assignment = bestAssignment(players, heroPool, phs);
    expect(Object.keys(assignment.byPlayer)).toHaveLength(5);
    expect(squad.length).toBeGreaterThan(0);
  });
});
