import { TournamentEngine, type TournamentSnapshot } from "../../src/game/tournament.ts";
import type { GameData } from "../../src/types/data.ts";

export function createTournament(
  data: GameData,
  seed = "tournament-contract",
  teamOvr = 61.5,
  teamName = "Test Five",
) {
  return new TournamentEngine(data, "last_2y", seed, teamOvr, teamName);
}

export function advanceToEnd(engine: TournamentEngine): TournamentSnapshot {
  while (engine.advance()) { /* terminal */ }
  return engine.snapshot;
}

/** Compact deterministic summary for golden fixture comparison. */
export function tournamentGoldenSummary(snapshot: TournamentSnapshot) {
  return {
    fieldSize: snapshot.field.length,
    fieldTeamIds: snapshot.field.map((t) => t.id).sort(),
    userPlacement: snapshot.userPlacement,
    championId: snapshot.champion.id,
    grandFinalWinnerId: snapshot.grandFinal.winnerId,
    grandFinalBestOf: snapshot.grandFinal.bestOf,
    playoffRoundCount: snapshot.playoffRounds.length,
    standingsPlacements: snapshot.standings.map((row) => ({
      teamId: row.team.id,
      placement: row.placement,
      isUser: row.team.isUser,
    })),
    groupRoutes: snapshot.groups.map((group) => ({
      id: group.id,
      upper: group.standings.filter((r) => r.route === "upper").map((r) => r.team.id),
      lower: group.standings.filter((r) => r.route === "lower").map((r) => r.team.id),
      out: group.standings.filter((r) => r.route === "out").map((r) => r.team.id),
      mapsPlayed: group.standings.map((r) => r.wins + r.losses),
    })),
  };
}

export function collectStages(engine: TournamentEngine): string[] {
  const stages = [engine.snapshot.stage];
  while (engine.advance()) stages.push(engine.snapshot.stage);
  return stages;
}
