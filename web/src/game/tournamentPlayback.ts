import type { GroupMatch, SeriesResult, TournamentGroup, TournamentSnapshot, TournamentTeam } from "./tournament.ts";

export interface MatchFrame {
  scoreA: number;
  scoreB: number;
}

export type SimTick =
  | { kind: "group"; matchId: string; frameIndex: number }
  | { kind: "playoff"; seriesId: string; frameIndex: number };

export function findSeries(tournament: TournamentSnapshot, seriesId: string): SeriesResult | null {
  if (tournament.grandFinal.id === seriesId) return tournament.grandFinal;
  for (const round of tournament.playoffRounds) {
    const hit = round.series.find((series) => series.id === seriesId);
    if (hit) return hit;
  }
  return null;
}

export function buildGroupSimTicks(orderedMatches: GroupMatch[]): SimTick[] {
  const ticks: SimTick[] = [];
  for (const match of orderedMatches) {
    for (let frameIndex = 1; frameIndex < match.frames.length; frameIndex += 1) {
      ticks.push({ kind: "group", matchId: match.id, frameIndex });
    }
  }
  return ticks;
}

export function buildPlayoffSimTicks(tournament: TournamentSnapshot, seriesOrder: string[]): SimTick[] {
  const ticks: SimTick[] = [];
  for (const seriesId of seriesOrder) {
    const series = findSeries(tournament, seriesId);
    if (!series) continue;
    for (let frameIndex = 0; frameIndex < series.frames.length; frameIndex += 1) {
      ticks.push({ kind: "playoff", seriesId, frameIndex });
    }
  }
  return ticks;
}

/** Порядок жеребьёвки в группе (индексы из id матчей grp-{A|B}-{i}-{j}). */
export function groupDrawOrder(group: TournamentGroup, matches: GroupMatch[]): TournamentTeam[] {
  const teamById = new Map(group.standings.map((row) => [row.team.id, row.team]));
  const indexByTeam = new Map<string, number>();
  for (const match of matches) {
    if (match.group !== group.id) continue;
    const parts = match.id.split("-");
    const i = Number(parts[2]);
    const j = Number(parts[3]);
    for (const [teamId, idx] of [[match.teamA.id, i], [match.teamB.id, j]] as const) {
      const prev = indexByTeam.get(teamId);
      indexByTeam.set(teamId, prev == null ? idx : Math.min(prev, idx));
    }
  }
  return [...indexByTeam.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([id]) => teamById.get(id)!)
    .filter(Boolean);
}

function lastGroupTick(ticks: SimTick[], step: number, matchId: string): SimTick | null {
  let last: SimTick | null = null;
  for (let i = 0; i < step && i < ticks.length; i += 1) {
    const tick = ticks[i];
    if (tick.kind === "group" && tick.matchId === matchId) last = tick;
  }
  return last;
}

function lastPlayoffTick(ticks: SimTick[], step: number, seriesId: string): SimTick | null {
  let last: SimTick | null = null;
  for (let i = 0; i < step && i < ticks.length; i += 1) {
    const tick = ticks[i];
    if (tick.kind === "playoff" && tick.seriesId === seriesId) last = tick;
  }
  return last;
}

export function groupMatchFrame(match: GroupMatch, ticks: SimTick[], step: number): MatchFrame | null {
  const tick = lastGroupTick(ticks, step, match.id);
  if (!tick || tick.kind !== "group") return null;
  return match.frames[tick.frameIndex] ?? null;
}

export function groupMatchFinished(match: GroupMatch, ticks: SimTick[], step: number): boolean {
  const tick = lastGroupTick(ticks, step, match.id);
  if (!tick || tick.kind !== "group") return false;
  return tick.frameIndex === match.frames.length - 1;
}

/** Групповые матчи, уже полностью доигранные на текущем шаге симуляции. */
export function completedGroupMatches(orderedMatches: GroupMatch[], ticks: SimTick[], step: number): GroupMatch[] {
  return orderedMatches.filter((match) => groupMatchFinished(match, ticks, step)).map((match) => {
    const frame = match.frames[match.frames.length - 1];
    return { ...match, scoreA: frame.scoreA, scoreB: frame.scoreB };
  });
}

export function seriesFrame(series: SeriesResult, ticks: SimTick[], step: number): MatchFrame | null {
  const tick = lastPlayoffTick(ticks, step, series.id);
  if (!tick || tick.kind !== "playoff") return null;
  return series.frames[tick.frameIndex] ?? null;
}

export function seriesStarted(seriesId: string, ticks: SimTick[], step: number): boolean {
  return lastPlayoffTick(ticks, step, seriesId) != null;
}

export function seriesLive(series: SeriesResult, ticks: SimTick[], step: number): boolean {
  const tick = lastPlayoffTick(ticks, step, series.id);
  if (!tick || tick.kind !== "playoff") return false;
  return tick.frameIndex > 0 && tick.frameIndex < series.frames.length - 1;
}

export function seriesFinished(series: SeriesResult, ticks: SimTick[], step: number): boolean {
  const tick = lastPlayoffTick(ticks, step, series.id);
  if (!tick || tick.kind !== "playoff") return false;
  return tick.frameIndex === series.frames.length - 1;
}
