import { describe, expect, it } from "vitest";
import { findPlayerMatches } from "../src/ui/PlayerPicker.tsx";
import type { PlayerProfile } from "../src/types/data.ts";

const player = (accountId: number, nickname: string): PlayerProfile => ({
  accountId,
  nickname,
  primaryRole: "mid",
});

const players = [
  player(1, "Boxi"),
  player(2, "MidOne"),
  player(3, "MieRo`"),
  player(4, "Aramis"),
  player(5, "NothingToSay"),
  player(6, "Topson"),
];

describe("findPlayerMatches", () => {
  it("не открывает бесполезный список по одной букве", () => {
    expect(findPlayerMatches(players, "m")).toEqual([]);
  });

  it("ставит совпадения с начала ника выше вхождений в середину", () => {
    expect(findPlayerMatches(players, "mi").map(({ nickname }) => nickname))
      .toEqual(["MidOne", "MieRo`", "Aramis"]);
  });

  it("игнорирует регистр, пробелы и соблюдает лимит", () => {
    expect(findPlayerMatches(players, "  TO  ", 2).map(({ nickname }) => nickname))
      .toEqual(["Topson", "NothingToSay"]);
  });
});
