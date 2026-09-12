import { describe, expect, it } from "vitest";
import { EXPEDITIONS, expeditionStepDone } from "../src/game/arcade/content/expeditions.ts";
import { emptyProgress, recordProgress, type ArcadeHistoryEntry } from "../src/state/arcadeStore.ts";

// Экспедиции (T13.77): три шага — три разных героя, порядок свободный, награда — титул.
const entry = (over: Partial<ArcadeHistoryEntry>): ArcadeHistoryEntry => ({
  seed: "s", outcome: "dead", seconds: 100, level: 5, kills: 50, gold: 10, schools: [], configVersion: "a", at: 1, hero: "juggernaut", act: "full", rank: 0, ...over,
});

describe("экспедиции", () => {
  it("предикаты шагов: победа/акт/события/композиция/клятва/порча; старые записи без полей не считаются", () => {
    expect(expeditionStepDone("win_short", entry({ outcome: "victory", act: "short" }))).toBe(true);
    expect(expeditionStepDone("win_short", entry({ outcome: "victory", act: "full" }))).toBe(false);
    expect(expeditionStepDone("win_full", entry({ outcome: "victory", act: "dire" }))).toBe(true);
    expect(expeditionStepDone("win_full", entry({ outcome: "dead", act: "full" }))).toBe(false);
    expect(expeditionStepDone("oath", entry({ oath: true }))).toBe(true);
    expect(expeditionStepDone("oath", entry({ contract: true }))).toBe(false);
    expect(expeditionStepDone("win_trade", entry({ outcome: "victory", composition: "trade" }))).toBe(true);
    expect(expeditionStepDone("win_wilds", entry({ outcome: "victory", composition: "trade" }))).toBe(false);
    expect(expeditionStepDone("win_cursed", entry({ outcome: "victory", cursesTaken: 1 }))).toBe(true);
    expect(expeditionStepDone("rift_no_revive", entry({ rift: true, revived: true }))).toBe(false);
    expect(expeditionStepDone("rift_no_revive", entry({ rift: true }))).toBe(true);
    expect(expeditionStepDone("flawless_dire", entry({ outcome: "victory", act: "dire" }))).toBe(true);
    for (const def of EXPEDITIONS) for (const s of def.steps) expect(expeditionStepDone(s, entry({}))).toBe(false);
  });

  it("в одной экспедиции герой закрывает один шаг; титул — когда все три закрыты разными героями; ничего не сбрасывается", () => {
    let p = recordProgress(emptyProgress(), entry({ outcome: "victory", act: "short", camp: true, hero: "axe" }));
    // Axe закрыл только первый открытый шаг («разминка»), хотя мог бы и лагерь.
    expect(p.expeditions.first_road).toEqual({ win_short: "axe" });
    p = recordProgress(p, entry({ outcome: "victory", act: "full", camp: true, hero: "axe" }));
    expect(p.expeditions.first_road).toEqual({ win_short: "axe" }); // тот же герой — второй шаг не берёт
    p = recordProgress(p, entry({ outcome: "dead", camp: true, hero: "lina" }));
    expect(p.expeditions.first_road).toEqual({ win_short: "axe", camp: "lina" }); // порядок свободный, смерть не мешает
    expect(p.titles).toEqual([]);
    p = recordProgress(p, entry({ outcome: "victory", act: "full", hero: "sniper" }));
    expect(p.expeditions.first_road).toEqual({ win_short: "axe", camp: "lina", win_full: "sniper" });
    expect(p.titles).toEqual(["first_road"]);
    // Повтор ничего не ломает и титул не дублируется.
    p = recordProgress(p, entry({ outcome: "victory", act: "full", hero: "sniper" }));
    expect(p.titles).toEqual(["first_road"]);
  });

  it("пустой профиль: экспедиции и титулы пустые", () => {
    expect(emptyProgress().expeditions).toEqual({});
    expect(emptyProgress().titles).toEqual([]);
  });
});
