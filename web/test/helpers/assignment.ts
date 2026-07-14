import { assignmentPairScore } from "../../src/game/assign.ts";
import type { Pack, PackPlayer, PlayerHeroStats } from "../../src/types/data.ts";
import type { ChemistryPlayer } from "../../src/game/score.ts";

export function chemFromPack(pack: Pack): ChemistryPlayer[] {
  return pack.players.map((p) => ({
    accountId: p.accountId,
    teamId: pack.teamId,
    eventId: pack.eventId,
  }));
}

export function sigFromPack(pack: Pack): Record<number, number[]> {
  return Object.fromEntries(pack.players.map((p) => [p.accountId, pack.signatureHeroes]));
}

export function assignmentPairScoreTotal(
  byPlayer: Record<number, number>,
  stats: PlayerHeroStats,
  signatures: Record<number, number[]> = {},
): number {
  return Object.entries(byPlayer).reduce(
    (sum, [accountId, heroId]) => sum + assignmentPairScore(Number(accountId), heroId, stats, signatures),
    0,
  );
}

/** Жадность по assignmentPairScore (games → winrate). */
export function greedyAssignmentPairScore(
  players: PackPlayer[],
  pool: number[],
  stats: PlayerHeroStats,
  signatures: Record<number, number[]> = {},
): number {
  const used = new Set<number>();
  let total = 0;
  for (const pl of players) {
    let bestH = -1;
    let bestV = -Infinity;
    for (const h of pool) {
      if (used.has(h)) continue;
      const v = assignmentPairScore(pl.accountId, h, stats, signatures);
      if (v > bestV) {
        bestV = v;
        bestH = h;
      }
    }
    if (bestH >= 0) {
      used.add(bestH);
      total += bestV;
    }
  }
  return total;
}
