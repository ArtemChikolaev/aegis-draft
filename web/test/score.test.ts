import { describe, expect, it } from "vitest";
import {
  bestAssignment,
  assignmentPairScore,
  synergyTotalForAssignment,
} from "../src/game/assign.ts";
import {
  baseRating,
  chemistryBonus,
  chemistryPairEdges,
  heroSynergyBonus,
  heroSynergyRows,
  heroSynergyTier,
  playerHeroGames,
  scoreTeam,
  squadChemistryRows,
} from "../src/game/score.ts";
import { loadGameData } from "./helpers/data.ts";
import { chemFromPack, sigFromPack } from "./helpers/assignment.ts";
import { rosterFromPack } from "./helpers/packs.ts";

describe("scoreTeam", () => {
  const data = loadGameData();
  const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
  const phs = data.playerHeroStats;
  const chem = chemFromPack(spirit);
  const sig = sigFromPack(spirit);
  const scored = scoreTeam(
    spirit.players,
    spirit.signatureHeroes,
    phs,
    data.squadSynergy,
    data.teammates,
    chem,
    sig,
  );

  it("base + synergy + chemistry = teamOvr", () => {
    const base = baseRating(spirit.players);
    const synergy = heroSynergyBonus(scored.assignment);
    const chemistry = chemistryBonus(chem, data.squadSynergy, data.teammates);
    expect(scored.base).toBeCloseTo(base, 5);
    expect(scored.heroSynergy).toBeCloseTo(synergy, 5);
    expect(scored.chemistry).toBeCloseTo(chemistry, 5);
    expect(scored.teamOvr).toBeCloseTo(base + synergy + chemistry, 5);
  });

  it("assignment.total = synergy (pairScore), не games-score", () => {
    const synergyTotal = synergyTotalForAssignment(scored.assignment.byPlayer, phs, sig);
    expect(scored.assignment.total).toBeCloseTo(synergyTotal, 5);
    const gamesScoreTotal = Object.entries(scored.assignment.byPlayer).reduce(
      (sum, [accountId, heroId]) =>
        sum + assignmentPairScore(Number(accountId), heroId, phs, sig),
      0,
    );
    expect(scored.assignment.total).not.toBeCloseTo(gamesScoreTotal, 0);
  });

  it("Hero Synergy = 0, пока герой не выбран", () => {
    const partial = scoreTeam(
      spirit.players.slice(0, 1),
      [],
      phs,
      data.squadSynergy,
      data.teammates,
      chem.slice(0, 1),
      sig,
    );
    expect(partial.heroSynergy).toBe(0);
  });

  it("добавление игрока не разбавляет Hero Synergy выбранной пары", () => {
    const progress = spirit.players.map((_, index) =>
      scoreTeam(
        spirit.players.slice(0, index + 1),
        spirit.signatureHeroes.slice(0, 1),
        phs,
        data.squadSynergy,
        data.teammates,
        chem.slice(0, index + 1),
        sig,
      ).heroSynergy,
    );
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1] - 1e-9);
    }
  });

  it("Chemistry сыгранного ростера не падает при добавлении тиммейтов", () => {
    const progress = spirit.players.map((_, index) =>
      chemistryBonus(chem.slice(0, index + 1), data.squadSynergy, data.teammates),
    );
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1] - 1e-9);
    }
    expect(progress[4]).toBeCloseTo(scored.chemistry, 5);
  });
});

describe("scoreTeam (mixed draft roster)", () => {
  const data = loadGameData();
  const phs = data.playerHeroStats;

  it("mixed: 5 игроков из разных команд, chemistry >= 0", () => {
    type Sourced = { player: typeof data.packs[0]["players"][0]; teamId: number; eventId: string };
    const byRole = (role: string): Sourced[] => {
      const fromTeams = new Map<number, Sourced>();
      for (const pk of data.packs) {
        for (const pl of pk.players) {
          if (pl.role === role && !fromTeams.has(pk.teamId)) {
            fromTeams.set(pk.teamId, { player: pl, teamId: pk.teamId, eventId: pk.eventId });
          }
        }
      }
      return [...fromTeams.values()];
    };
    const mixedSrc = [
      byRole("safelane")[0],
      byRole("mid")[1],
      byRole("offlane")[0],
      byRole("support")[1],
      byRole("support")[3],
    ].filter(Boolean);
    expect(mixedSrc).toHaveLength(5);
    expect(new Set(mixedSrc.map((x) => x.teamId)).size).toBeGreaterThanOrEqual(3);

    const mixed = mixedSrc.map((x) => x.player);
    const mixedChem = mixedSrc.map((x) => ({
      accountId: x.player.accountId,
      teamId: x.teamId,
      eventId: x.eventId,
    }));
    const heroPool = [...new Set(data.packs.flatMap((p) => p.signatureHeroes))].slice(0, 6);
    const scored = scoreTeam(mixed, heroPool, phs, data.squadSynergy, data.teammates, mixedChem, {});
    expect(scored.chemistry).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(scored.teamOvr)).toBe(true);
  });
});

describe("heroSynergyRows / squadChemistryRows", () => {
  const data = loadGameData();
  const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
  const phs = data.playerHeroStats;
  const sig = sigFromPack(spirit);
  const roster = rosterFromPack(spirit);
  const assignment = bestAssignment(spirit.players, spirit.signatureHeroes, phs, sig);

  it("heroSynergyRows: 5 строк, games из stats", () => {
    const rows = heroSynergyRows(roster, assignment, phs);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      if (row.heroId != null) {
        expect(row.games).toBe(playerHeroGames(phs, row.accountId, row.heroId));
      }
    }
  });

  it("heroSynergyTier: пороги great / insane", () => {
    expect(heroSynergyTier(3)).toBeNull();
    expect(heroSynergyTier(4)).toBe("great");
    expect(heroSynergyTier(7)).toBe("insane");
  });

  it("squadChemistryRows: все пары ростера с историей, даже bonus=0", () => {
    const rows = squadChemistryRows(roster, data.squadSynergy, data.teammates);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.some((r) => r.bonus === 0 && r.games > 0)).toBe(true);
  });

  it("chemistryPairEdges: только пары с bonus >= 0.05", () => {
    const chem = chemFromPack(spirit);
    const edges = chemistryPairEdges(chem, data.squadSynergy, data.teammates);
    expect(edges.every((e) => e.bonus >= 0.05)).toBe(true);
  });
});

describe("chemistryBonus", () => {
  it("не уходит в минус при плохом winrate", () => {
    const players = [
      { accountId: 1, teamId: 1, eventId: "ev" },
      { accountId: 2, teamId: 1, eventId: "ev" },
    ];
    const badSynergy = [{ ids: [1, 2] as [number, number], games: 100, winrate: 0.3 }];
    expect(chemistryBonus(players, badSynergy, {})).toBeGreaterThanOrEqual(0);
  });
});
