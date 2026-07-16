import { describe, expect, it } from "vitest";
import { bestAssignment, assignmentPairScore, synergyTotalForAssignment } from "../src/game/assign.ts";
import { RunEngine } from "../src/game/engine.ts";
import { playerHeroGames, squadChemistryRows } from "../src/game/score.ts";
import type { PackPlayer } from "../src/types/data.ts";
import { loadGameData } from "./helpers/data.ts";
import { assignmentPairScoreTotal, greedyAssignmentPairScore, sigFromPack } from "./helpers/assignment.ts";
import { defaultRunConfig, rosterFromPack } from "./helpers/packs.ts";
import { runToEnd } from "./helpers/engine.ts";

/**
 * Named regression cases from real bugs (322-0 parity / session fixes).
 * Each `it` name documents the bug so failures are self-explanatory in CI.
 */
describe("regression: hero assignment prioritizes games on hero", () => {
  it("BUG-2026-07-12: Ghost с 1 game на Drow получает её, а не 33 с 0 games", () => {
    const ghostId = 206642367;
    const p33Id = 86698277;
    const drowId = 6;
    const enigmaId = 19;
    const experienceStats = {
      [String(ghostId)]: { [String(drowId)]: { games: 1, winrate: 0 } },
      [String(p33Id)]: {},
    };
    const experiencePlayers: PackPlayer[] = [
      { accountId: ghostId, nickname: "Ghost", role: "safelane", ovr: 57, impact: 50, economy: 50, reliability: 50, games: 10 },
      { accountId: p33Id, nickname: "33", role: "offlane", ovr: 65, impact: 50, economy: 50, reliability: 50, games: 10 },
    ];
    const assignment = bestAssignment(experiencePlayers, [drowId, enigmaId], experienceStats);
    expect(assignment.byPlayer[ghostId]).toBe(drowId);
    expect(assignmentPairScore(ghostId, drowId, experienceStats)).toBeGreaterThan(
      assignmentPairScore(p33Id, drowId, experienceStats),
    );
  });
});

describe("regression: hero assignment pro-only (no pub bleed)", () => {
  it("BUG-2026-07-15: support с TB только в pub-stats не получает Terrorblade из pro career", () => {
    const rueId = 847565596;
    const tb = 109;
    const bane = 3;
    const proCareer = {
      [String(rueId)]: { [String(bane)]: { games: 44, winrate: 0.5 } },
    };
    const player: PackPlayer = {
      accountId: rueId, nickname: "rue", role: "support",
      ovr: 84, impact: 50, economy: 50, reliability: 50, games: 10,
    };
    expect(bestAssignment([player], [tb, bane], proCareer).byPlayer[rueId]).toBe(bane);
    expect(proCareer[String(rueId)]?.[String(tb)]).toBeUndefined();
  });
});

describe("regression: squad chemistry UI не прячет пары", () => {
  it("BUG-2026-07-12: squadChemistryRows показывает все пары ростера (v1.5.0: сыгранные → bonus>0)", () => {
    const data = loadGameData();
    const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
    const roster = rosterFromPack(spirit);
    const rows = squadChemistryRows(roster, data.squadSynergy, data.teammates);
    expect(rows.length).toBeGreaterThanOrEqual(10); // все C(5,2) пары присутствуют, не фильтруются
    expect(rows.filter((r) => r.games > 0).every((r) => r.bonus > 0)).toBe(true); // games-driven химия
  });
});

describe("regression: assignment.total vs matching metric", () => {
  it("BUG-2026-07-12: assignment.total — pairScore (synergy), не assignmentPairScore", () => {
    const data = loadGameData();
    const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
    const phs = data.playerHeroStats;
    const sig = sigFromPack(spirit);
    const assignment = bestAssignment(spirit.players, spirit.signatureHeroes, phs, sig);
    const gamesMetric = assignmentPairScoreTotal(assignment.byPlayer, phs, sig);
    expect(assignment.total).toBeCloseTo(synergyTotalForAssignment(assignment.byPlayer, phs, sig), 5);
    expect(assignment.total).not.toBeCloseTo(gamesMetric, 0);
  });
});

describe("regression: manual hero swap", () => {
  const data = loadGameData();

  it("BUG-2026-07-12: automatic allocation блокирует swapHeroes", () => {
    const engine = new RunEngine(data, defaultRunConfig, "run-auto-swap");
    runToEnd(engine);
    const [a, b] = engine.players.map((p) => p.accountId);
    expect(() => engine.swapHeroes(a, b)).toThrow(/Manual/i);
  });

  it("BUG-2026-07-12: manual swap меняет assignment и score() пересчитывается", () => {
    const engine = new RunEngine(data, { ...defaultRunConfig, allocation: "manual" }, "run-manual-swap");
    runToEnd(engine);
    const swapA = engine.players[0].accountId;
    const swapB = engine.players[1].accountId;
    const before = { ...engine.score()!.assignment.byPlayer };
    engine.swapHeroes(swapA, swapB);
    const after = engine.score()!.assignment.byPlayer;
    expect(after[swapA]).toBe(before[swapB]);
    expect(after[swapB]).toBe(before[swapA]);
  });
});

describe("regression: playerHeroGames matches stats", () => {
  it("BUG-2026-07-12: games в breakdown = playerHeroGames из stats", () => {
    const data = loadGameData();
    const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
    const phs = data.playerHeroStats;
    for (const pl of spirit.players) {
      for (const hid of spirit.signatureHeroes.slice(0, 3)) {
        expect(playerHeroGames(phs, pl.accountId, hid)).toBe(
          phs[String(pl.accountId)]?.[String(hid)]?.games ?? 0,
        );
      }
    }
  });
});

describe("regression: matching ≥ greedy (CI failure 2026-07-12)", () => {
  it("BUG-2026-07-12: matching не хуже жадности на assignmentPairScore (Team Spirit)", () => {
    const data = loadGameData();
    const spirit = data.packs.find((p) => p.teamName === "Team Spirit")!;
    const phs = data.playerHeroStats;
    const sig = sigFromPack(spirit);
    const assignment = bestAssignment(spirit.players, spirit.signatureHeroes, phs, sig);
    const matching = assignmentPairScoreTotal(assignment.byPlayer, phs, sig);
    const greedy = greedyAssignmentPairScore(spirit.players, spirit.signatureHeroes, phs, sig);
    expect(matching).toBeGreaterThanOrEqual(greedy);
  });
});

describe("regression: chemistry только за реальные совместные pro-игры", () => {
  it("BUG-2026-07-16: пара без совместных игр не даёт бонуса и не показывается (v1.7.0)", () => {
    const data = loadGameData();
    // Кросс-командный фэнтези-ростер: берём по игроку из пяти РАЗНЫХ паков — большинство
    // пар вместе не играли. Раньше каждая такая пара набегала chemistryCurrentBaseline и
    // химия складывалась из фантомных +0.1; в 322-0 таких строк нет вовсе.
    const picks = data.packs.slice(0, 5).map((pack, i) => ({
      accountId: pack.players[i].accountId,
      teamId: pack.teamId,
      eventId: pack.eventId,
    }));
    const roster = picks.map((p, i) => ({
      candidate: {
        player: data.packs[i].players[i],
        teamId: p.teamId,
        eventId: p.eventId,
        signatureHeroes: data.packs[i].signatureHeroes,
      },
    }));
    const rows = squadChemistryRows(roster as never, data.squadSynergy, data.teammates);
    expect(rows.every((r) => r.games > 0)).toBe(true);
    expect(rows.every((r) => r.bonus > 0)).toBe(true);
  });
});
