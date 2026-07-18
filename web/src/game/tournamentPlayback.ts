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

function groupMatchByPair(matches: GroupMatch[], groupId: "A" | "B"): Map<string, GroupMatch> {
  const byPair = new Map<string, GroupMatch>();
  for (const match of matches) {
    if (match.group !== groupId) continue;
    const parts = match.id.split("-");
    const i = Number(parts[2]);
    const j = Number(parts[3]);
    byPair.set(`${i}-${j}`, match);
  }
  return byPair;
}

/**
 * Серии группового этапа (как TI): в каждой серии команда играет не больше одного BO2.
 * Круговой алгоритм с фиксированным pivot и ротацией остальных.
 */
export function groupSeriesRounds(groupId: "A" | "B", matches: GroupMatch[]): GroupMatch[][] {
  const byPair = groupMatchByPair(matches, groupId);
  const teamIndices = [...byPair.keys()]
    .flatMap((key) => key.split("-").map(Number))
    .reduce((set, index) => set.add(index), new Set<number>());
  const teams = [...teamIndices].sort((a, b) => a - b);
  if (teams.length < 2) return [];

  const slots: (number | null)[] = teams.length % 2 === 0 ? teams : [...teams, null];
  const rounds: GroupMatch[][] = [];

  for (let round = 0; round < slots.length - 1; round += 1) {
    const series: GroupMatch[] = [];
    for (let i = 0; i < slots.length / 2; i += 1) {
      const a = slots[i];
      const b = slots[slots.length - 1 - i];
      if (a == null || b == null) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const match = byPair.get(`${lo}-${hi}`);
      if (match) series.push(match);
    }
    rounds.push(series);
    slots.splice(1, 0, slots.pop()!);
  }

  return rounds;
}

/** Порядок проигрывания: серия A → серия B → следующая серия (синхронно, как на TI). */
export function orderGroupMatchesBySeries(matches: GroupMatch[]): GroupMatch[] {
  const out: GroupMatch[] = [];
  const roundsA = groupSeriesRounds("A", matches);
  const roundsB = groupSeriesRounds("B", matches);
  const roundCount = Math.max(roundsA.length, roundsB.length);
  for (let round = 0; round < roundCount; round += 1) {
    for (const match of roundsA[round] ?? []) out.push(match);
    for (const match of roundsB[round] ?? []) out.push(match);
  }
  return out;
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

const seriesId = (roundId: string, index: number) => `${roundId}-${index + 1}`;

/** Зависимости слота: серия показывает участников только после финала всех фидеров. */
export function buildPlayoffFeeders(tournament: TournamentSnapshot): Map<string, string[]> {
  const feeders = new Map<string, string[]>();

  for (let i = 0; i < 4; i += 1) {
    feeders.set(seriesId("lb-r2", i), [seriesId("lb-r1", i), seriesId("ub-qf", i)]);
  }
  feeders.set(seriesId("ub-sf", 0), [seriesId("ub-qf", 0), seriesId("ub-qf", 1)]);
  feeders.set(seriesId("ub-sf", 1), [seriesId("ub-qf", 2), seriesId("ub-qf", 3)]);
  for (let i = 0; i < 2; i += 1) {
    feeders.set(seriesId("lb-r3", i), [seriesId("lb-r2", i * 2), seriesId("lb-r2", i * 2 + 1)]);
    feeders.set(seriesId("lb-r4", i), [seriesId("lb-r3", i), seriesId("ub-sf", i)]);
  }
  feeders.set(seriesId("ub-final", 0), [seriesId("ub-sf", 0), seriesId("ub-sf", 1)]);
  feeders.set(seriesId("lb-r5", 0), [seriesId("lb-r4", 0), seriesId("lb-r4", 1)]);
  feeders.set(seriesId("lb-final", 0), [seriesId("lb-r5", 0), seriesId("ub-final", 0)]);
  feeders.set(tournament.grandFinal.id, [seriesId("ub-final", 0), seriesId("lb-final", 0)]);

  return feeders;
}

/** Участники слота видны, когда все фидеры доиграны (или симуляция завершена / скип). */
export function seriesSlotsVisible(
  seriesId: string,
  tournament: TournamentSnapshot,
  feeders: Map<string, string[]>,
  ticks: SimTick[],
  step: number,
  revealComplete: boolean,
): boolean {
  if (revealComplete) return true;
  const deps = feeders.get(seriesId);
  if (!deps?.length) return true;
  return deps.every((depId) => {
    const dep = findSeries(tournament, depId);
    return dep != null && seriesFinished(dep, ticks, step);
  });
}

function seriesHasUser(series: SeriesResult): boolean {
  return series.teamA.isUser || series.teamB.isUser;
}

/**
 * Серия для «камеры» плей-офф: живой матч юзера → идущий → следующий открытый →
 * последний доигранный (в т.ч. Grand Final после выхода из LB).
 */
export function userPlayoffCameraTarget(
  tournament: TournamentSnapshot,
  feeders: Map<string, string[]>,
  ticks: SimTick[],
  step: number,
  revealComplete: boolean,
): string | null {
  const userSeries = [
    ...tournament.playoffRounds.flatMap((round) => round.series),
    tournament.grandFinal,
  ].filter(seriesHasUser);
  if (!userSeries.length) return null;

  const live = userSeries.find((series) => seriesLive(series, ticks, step));
  if (live) return live.id;

  const inProgress = userSeries.find(
    (series) => seriesStarted(series.id, ticks, step) && !seriesFinished(series, ticks, step),
  );
  if (inProgress) return inProgress.id;

  const upcoming = userSeries.find(
    (series) =>
      !seriesStarted(series.id, ticks, step)
      && seriesSlotsVisible(series.id, tournament, feeders, ticks, step, revealComplete),
  );
  if (upcoming) return upcoming.id;

  for (let i = userSeries.length - 1; i >= 0; i -= 1) {
    if (seriesFinished(userSeries[i], ticks, step)) return userSeries[i].id;
  }
  return userSeries[0]?.id ?? null;
}
