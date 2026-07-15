import { describe, expect, it } from "vitest";
import {
  buildGroupSimTicks,
  buildPlayoffSimTicks,
  completedGroupMatches,
  groupDrawOrder,
  groupMatchFrame,
  groupMatchFinished,
  seriesFrame,
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
});
