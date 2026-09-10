import { describe, expect, it } from "vitest";
import { MARK_IDS, anyHeroHasMark, emptyProgress, masteryTitle, progressFromHistory, recordProgress, useArcade, type ArcadeHistoryEntry } from "../src/state/arcadeStore.ts";
import { COSMETICS, rollCosmeticDrops } from "../src/game/arcade/content/cosmetics.ts";
import type { ArcadeOutcome } from "../src/game/arcade/types.ts";

// Мастерство героев и трофеи за отметки (T13.48, этап 3 аудита: «после потолка победы развивают трофеи и мастерство»).
const entry = (over: Partial<ArcadeHistoryEntry>): ArcadeHistoryEntry => ({
  seed: "s", outcome: "dead", seconds: 100, level: 5, kills: 50, gold: 10, schools: [], configVersion: "a", at: 1, hero: "juggernaut", act: "full", rank: 0, ...over,
});

describe("мастерство героя", () => {
  it("отметки копятся по событиям забега независимо от исхода; победы по актам и «без смерти» — только за победу; звание по числу", () => {
    let p = recordProgress(emptyProgress(), entry({ outcome: "dead", camp: true, centaur: true }));
    expect(p.perHero.juggernaut.marks).toEqual(["camp", "centaur"]);
    p = recordProgress(p, entry({ outcome: "victory", act: "full", revived: true, outpost: true }));
    expect(p.perHero.juggernaut.marks).toEqual(["camp", "centaur", "outpost", "win_full"]);
    p = recordProgress(p, entry({ outcome: "victory", act: "dire", revived: false, necro: true, seed: "b" }));
    expect(p.perHero.juggernaut.marks).toEqual(["camp", "centaur", "outpost", "win_full", "necro", "win_dire", "flawless"]);
    p = recordProgress(p, entry({ outcome: "victory", act: "short", revived: false, seed: "c" })); // разминка отметок не даёт
    expect(p.perHero.juggernaut.marks).toHaveLength(7);
    expect(masteryTitle(p.perHero.juggernaut.marks)).toBe("master"); // легенда — с 8 отметок из 9 (T13.50 добавил контракт)
    expect(masteryTitle([...p.perHero.juggernaut.marks, "contract"])).toBe("legend");
    expect(masteryTitle([])).toBe("novice"); expect(masteryTitle(["camp"])).toBe("veteran"); expect(masteryTitle(["camp", "necro", "outpost", "centaur"])).toBe("master");
    expect(anyHeroHasMark(p, "necro")).toBe(true); expect(anyHeroHasMark(p, "win_river")).toBe(false);
    // Свёртка старой истории без полей отметок — только победы по актам; профиль без marks читается пустым списком.
    const old = progressFromHistory([entry({ outcome: "victory", act: "full" })]);
    expect(old.perHero.juggernaut.marks).toEqual(["win_full", "flawless"]);
    expect(MARK_IDS).toHaveLength(12);
  });

  it("трофеи за отметки не выпадают и не покупаются, а выдаются один раз при появлении отметки у любого героя", () => {
    const trophies = COSMETICS.filter((c) => c.unlock);
    expect(trophies.map((c) => c.id).sort()).toEqual(["death_bones", "trail_hoofprints", "trail_spores"]);
    const outcome = (over: Partial<ArcadeOutcome>): ArcadeOutcome => ({ outcome: "victory", tick: 60 * 600, level: 20, kills: 900, gold: 100, schools: [], upgrades: [], roshanKilled: true, rank: 20, greedStacks: 0, items: [], hero: "axe", act: "full", neutral: null, loot: [], campsCleared: 0, outpostCaptured: false, cursesTaken: 0, cursed: false, centaurSlain: false, necromancerSlain: false, revived: false, ...over });
    for (let i = 0; i < 40; i++) for (const d of rollCosmeticDrops(`t${i}`, outcome({}), [])) expect(trophies.some((c) => c.id === d.id), d.id).toBe(false);
    const p = emptyProgress(); p.perHero.axe = { runs: 1, victories: 0, bestSeconds: 1, bestLevel: 1, marks: ["camp"] };
    useArcade.setState({ progress: p, cosmetics: { owned: [], equipped: {}, shards: 999, styles: {}, skins: {} } });
    expect(useArcade.getState().buyCosmetic("trail_spores")).toBe(false); // трофей не покупается
    expect(useArcade.getState().cosmetics.owned).toEqual([]);
  });
});
