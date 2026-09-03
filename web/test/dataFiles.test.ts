import { describe, expect, it } from "vitest";
import { DEFERRED_DATA_FILES, REQUIRED_DATA_FILES, squadSynergyOf } from "../src/data/dataFiles.ts";

describe("dataFiles: отложенные файлы", () => {
  it("тяжёлые файлы не грузятся на старте, но входят в офлайн-набор через DEFERRED", () => {
    expect(REQUIRED_DATA_FILES).not.toContain("squadSynergy");
    expect(REQUIRED_DATA_FILES).not.toContain("eventHeroStats");
    expect(DEFERRED_DATA_FILES).toEqual(["squadSynergy", "eventHeroStats"]);
  });

  it("squadSynergyOf падает громко до барьера и отдаёт массив после", () => {
    expect(() => squadSynergyOf({})).toThrow(/ensureSquadSynergy/);
    const groups = [{ ids: [1, 2], games: 3, winrate: 0.5 }];
    expect(squadSynergyOf({ squadSynergy: groups })).toBe(groups);
  });
});
