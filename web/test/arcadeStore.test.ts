import { describe, expect, it } from "vitest";
import { arcadeTrophies, bestArcadeEntry, hasFullActVictory, maxUnlockedRank, useArcade, type ArcadeHistoryEntry } from "../src/state/arcadeStore.ts";
import { SHARD_PRICE } from "../src/game/arcade/content/cosmetics.ts";

const entry = (over: Partial<ArcadeHistoryEntry>): ArcadeHistoryEntry => ({
  seed: "s", outcome: "dead", seconds: 100, level: 5, kills: 50, gold: 10, schools: [], configVersion: "a", at: 1, hero: "juggernaut", act: "full", rank: 0, ...over,
});

describe("arcadeStore: витрина и открытие рангов", () => {
  it("ступень открывает только победа в полном акте", () => {
    expect(maxUnlockedRank([])).toBe(0);
    expect(maxUnlockedRank([entry({ outcome: "victory", act: "short", rank: 0 })])).toBe(0);
    expect(maxUnlockedRank([entry({ outcome: "victory", act: "full", rank: 0 })])).toBe(1);
    expect(maxUnlockedRank([entry({ outcome: "victory", act: "full", rank: 7 })])).toBe(8);
    expect(maxUnlockedRank([entry({ outcome: "victory", act: "dire", rank: 2 })])).toBe(3);
    expect(hasFullActVictory([entry({ outcome: "victory", act: "short" })])).toBe(false);
    expect(hasFullActVictory([entry({ outcome: "victory", act: "full" })])).toBe(true);
    useArcade.setState({ history: [], act: "full" });
    useArcade.getState().setAct("dire");
    expect(useArcade.getState().act).toBe("full");
  });

  it("трофеи считают забеги, победы, лучший ранг и разбивку по героям", () => {
    const history = [
      entry({ hero: "zeus", seconds: 300, level: 12 }),
      entry({ hero: "zeus", outcome: "victory", seconds: 1230, level: 22, rank: 2 }),
      entry({ hero: "axe", outcome: "victory", act: "short", seconds: 540, level: 15 }),
    ];
    const tr = arcadeTrophies(history);
    expect(tr.runs).toBe(3);
    expect(tr.victories).toBe(2);
    expect(tr.fullVictories).toBe(1);
    expect(tr.bestRank).toBe(2);
    expect(tr.bestSeconds).toBe(1230);
    expect(tr.perHero.zeus).toEqual({ runs: 2, victories: 1, bestSeconds: 1230, bestLevel: 22 });
    expect(tr.perHero.axe?.victories).toBe(1);
    expect(bestArcadeEntry(history)?.rank).toBe(2);
  });

  it("покупка косметики за осколки: не хватает — отказ, хватает — списание и владение, повторно — отказ", () => {
    useArcade.setState({ cosmetics: { owned: [], equipped: {}, shards: SHARD_PRICE.refined - 1 } });
    expect(useArcade.getState().buyCosmetic("frame_silver")).toBe(false);
    useArcade.setState({ cosmetics: { owned: [], equipped: {}, shards: SHARD_PRICE.refined } });
    expect(useArcade.getState().buyCosmetic("frame_silver")).toBe(true);
    expect(useArcade.getState().cosmetics.owned).toEqual(["frame_silver"]);
    expect(useArcade.getState().cosmetics.shards).toBe(0);
    expect(useArcade.getState().buyCosmetic("frame_silver")).toBe(false);
    useArcade.getState().equip("frame", "frame_silver");
    expect(useArcade.getState().cosmetics.equipped.frame).toBe("frame_silver");
    useArcade.getState().equip("trail", "trail_ember"); // не куплен — игнор
    expect(useArcade.getState().cosmetics.equipped.trail).toBeUndefined();
  });
});
