import { describe, expect, it } from "vitest";
import {
  buildGroupSimTicks,
  buildPlayoffFeeders,
  buildPlayoffSimTicks,
  completedGroupMatches,
  groupDrawOrder,
  groupMatchFrame,
  groupMatchFinished,
  groupSeriesRounds,
  orderGroupMatchesBySeries,
  seriesFrame,
  seriesFinished,
  seriesLive,
  seriesSlotsVisible,
  userPlayoffCameraTarget,
} from "../src/game/tournamentPlayback.ts";
import { advanceToEnd, createTournament } from "./helpers/tournament.ts";
import { loadGameData } from "./helpers/data.ts";

describe("tournamentPlayback", () => {
  const data = loadGameData();

  it("групповой тик проигрывает карты по очереди", () => {
    const snapshot = createTournament(data, "playback-groups").snapshot;
    const a = snapshot.groupMatches.filter((m) => m.group === "A");
    const b = snapshot.groupMatches.filter((m) => m.group === "B");
    const ordered = [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i]) ordered.push(a[i]);
      if (b[i]) ordered.push(b[i]);
    }
    const ticks = buildGroupSimTicks(ordered);
    expect(ticks.length).toBeGreaterThan(ordered.length);

    const first = ordered[0];
    expect(groupMatchFrame(first, ticks, 0)).toBeNull();
    expect(groupMatchFrame(first, ticks, 1)).toEqual(first.frames[1]);
    expect(groupMatchFinished(first, ticks, ticks.length)).toBe(true);
    expect(completedGroupMatches(ordered, ticks, ticks.length).length).toBe(ordered.length);
  });

  it("groupDrawOrder возвращает все 9 команд", () => {
    const snapshot = createTournament(data, "draw-order").snapshot;
    for (const group of snapshot.groups) {
      expect(groupDrawOrder(group, snapshot.groupMatches)).toHaveLength(9);
    }
  });

  it("групповые серии: не больше одного матча на команду за серию", () => {
    const snapshot = createTournament(data, "group-series").snapshot;
    for (const groupId of ["A", "B"] as const) {
      const rounds = groupSeriesRounds(groupId, snapshot.groupMatches);
      expect(rounds).toHaveLength(9);
      for (const round of rounds) {
        expect(round).toHaveLength(4);
        const teams = new Set<string>();
        for (const match of round) {
          expect(teams.has(match.teamA.id)).toBe(false);
          expect(teams.has(match.teamB.id)).toBe(false);
          teams.add(match.teamA.id);
          teams.add(match.teamB.id);
        }
      }
    }
  });

  it("порядок симуляции чередует серии A и B", () => {
    const snapshot = createTournament(data, "group-order").snapshot;
    const ordered = orderGroupMatchesBySeries(snapshot.groupMatches);
    expect(ordered).toHaveLength(72);
    expect(ordered.slice(0, 4).every((match) => match.group === "A")).toBe(true);
    expect(ordered.slice(4, 8).every((match) => match.group === "B")).toBe(true);
    expect(ordered.slice(8, 12).every((match) => match.group === "A")).toBe(true);
  });

  it("плей-офф тики покрывают все кадры серий (включая старт 0-0)", () => {
    const snapshot = advanceToEnd(createTournament(data, "playback-playoffs"));
    const order = [
      ...snapshot.playoffRounds.flatMap((round) => round.series.map((series) => series.id)),
      snapshot.grandFinal.id,
    ];
    const ticks = buildPlayoffSimTicks(snapshot, order);
    const frameCount = [
      ...snapshot.playoffRounds.flatMap((round) => round.series),
      snapshot.grandFinal,
    ].reduce((sum, series) => sum + series.frames.length, 0);
    expect(ticks).toHaveLength(frameCount);
  });

  it("серия открывается с 0-0", () => {
    const snapshot = advanceToEnd(createTournament(data, "playback-open"));
    const firstId = snapshot.playoffRounds[0].series[0].id;
    const ticks = buildPlayoffSimTicks(snapshot, [firstId]);
    const series = snapshot.playoffRounds[0].series[0];
    expect(seriesFrame(series, ticks, 1)).toEqual({ scoreA: 0, scoreB: 0 });
    expect(seriesFrame(series, ticks, 2)).toEqual(series.frames[1]);
  });

  it("плей-офф скрывает участников, пока не доиграны фидеры", () => {
    const snapshot = advanceToEnd(createTournament(data, "playback-feeders"));
    const feeders = buildPlayoffFeeders(snapshot);
    const order = [
      ...snapshot.playoffRounds.flatMap((round) => round.series.map((series) => series.id)),
      snapshot.grandFinal.id,
    ];
    const ticks = buildPlayoffSimTicks(snapshot, order);

    expect(seriesSlotsVisible("ub-qf-1", snapshot, feeders, ticks, 0, false)).toBe(true);
    expect(seriesSlotsVisible("ub-sf-1", snapshot, feeders, ticks, 0, false)).toBe(false);
    expect(seriesSlotsVisible("grand-final", snapshot, feeders, ticks, 0, false)).toBe(false);
    expect(seriesSlotsVisible("ub-sf-1", snapshot, feeders, ticks, 0, true)).toBe(true);

    const lastUbQf = snapshot.playoffRounds[0].series[3];
    let stepAfterUbQf = 0;
    for (let step = 1; step <= ticks.length; step += 1) {
      if (seriesFinished(lastUbQf, ticks, step)) {
        stepAfterUbQf = step;
        break;
      }
    }
    expect(stepAfterUbQf).toBeGreaterThan(0);
    expect(seriesSlotsVisible("ub-sf-1", snapshot, feeders, ticks, stepAfterUbQf, false)).toBe(true);
    expect(seriesSlotsVisible("grand-final", snapshot, feeders, ticks, stepAfterUbQf, false)).toBe(false);
  });

  it("камера плей-офф следит за сериями юзера (включая LB)", () => {
    const snapshot = advanceToEnd(createTournament(data, "playback-camera-lb", 88));
    const userSeries = [
      ...snapshot.playoffRounds.flatMap((round) => round.series),
      snapshot.grandFinal,
    ].filter((series) => series.teamA.isUser || series.teamB.isUser);
    expect(userSeries.some((series) => series.id.startsWith("lb-"))).toBe(true);

    const feeders = buildPlayoffFeeders(snapshot);
    const order = [
      ...snapshot.playoffRounds.flatMap((round) => round.series.map((series) => series.id)),
      snapshot.grandFinal.id,
    ];
    const ticks = buildPlayoffSimTicks(snapshot, order);

    for (const series of userSeries) {
      let liveStep = 0;
      for (let step = 1; step <= ticks.length; step += 1) {
        if (seriesLive(series, ticks, step)) {
          liveStep = step;
          break;
        }
      }
      if (!liveStep) continue;
      expect(userPlayoffCameraTarget(snapshot, feeders, ticks, liveStep, false)).toBe(series.id);
    }

    expect(userPlayoffCameraTarget(snapshot, feeders, ticks, ticks.length, true)).toBe(
      userSeries[userSeries.length - 1].id,
    );
  });

  it("камера плей-офф возвращается к Grand Final", () => {
    const snapshot = advanceToEnd(createTournament(data, "playback-camera-gf-b", 98));
    expect(snapshot.grandFinal.teamA.isUser || snapshot.grandFinal.teamB.isUser).toBe(true);

    const feeders = buildPlayoffFeeders(snapshot);
    const order = [
      ...snapshot.playoffRounds.flatMap((round) => round.series.map((series) => series.id)),
      snapshot.grandFinal.id,
    ];
    const ticks = buildPlayoffSimTicks(snapshot, order);

    let gfLive = 0;
    for (let step = 1; step <= ticks.length; step += 1) {
      if (seriesLive(snapshot.grandFinal, ticks, step)) {
        gfLive = step;
        break;
      }
    }
    expect(gfLive).toBeGreaterThan(0);
    expect(userPlayoffCameraTarget(snapshot, feeders, ticks, gfLive, false)).toBe("grand-final");
    expect(userPlayoffCameraTarget(snapshot, feeders, ticks, ticks.length, true)).toBe("grand-final");
  });
});
