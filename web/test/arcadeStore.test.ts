import { describe, expect, it, vi } from "vitest";
import { arcadeTrophies, bestArcadeEntry, emptyProgress, hasActVictory, hasFullActVictory, maxUnlockedRank, progressFromHistory, recordProgress, useArcade, type ArcadeHistoryEntry } from "../src/state/arcadeStore.ts";
import { readCached, writePersisted } from "../src/state/persist.ts";
import { SHARD_PRICE } from "../src/game/arcade/content/cosmetics.ts";

const entry = (over: Partial<ArcadeHistoryEntry>): ArcadeHistoryEntry => ({
  seed: "s", outcome: "dead", seconds: 100, level: 5, kills: 50, gold: 10, schools: [], configVersion: "a", at: 1, hero: "juggernaut", act: "full", rank: 0, ...over,
});

describe("arcadeStore: витрина и открытие рангов", () => {
  it("ступень открывает только победа в полном акте", () => {
    const of = (...h: ArcadeHistoryEntry[]) => progressFromHistory(h);
    expect(maxUnlockedRank(of())).toBe(0);
    expect(maxUnlockedRank(of(entry({ outcome: "victory", act: "short", rank: 0 })))).toBe(0);
    expect(maxUnlockedRank(of(entry({ outcome: "victory", act: "full", rank: 0 })))).toBe(1);
    expect(maxUnlockedRank(of(entry({ outcome: "victory", act: "full", rank: 7 })))).toBe(8);
    expect(maxUnlockedRank(of(entry({ outcome: "victory", act: "dire", rank: 2 })))).toBe(3);
    expect(hasFullActVictory(of(entry({ outcome: "victory", act: "short" })))).toBe(false);
    expect(hasFullActVictory(of(entry({ outcome: "victory", act: "full" })))).toBe(true);
    expect(hasActVictory(of(entry({ outcome: "victory", act: "dire" })), "dire")).toBe(true);
    expect(maxUnlockedRank(of(entry({ outcome: "victory", act: "river", rank: 4 })))).toBe(5);
    useArcade.setState({ progress: emptyProgress(), act: "full" });
    useArcade.getState().setAct("dire");
    expect(useArcade.getState().act).toBe("full");
  });

  it("трофеи считают забеги, победы, лучший ранг и разбивку по героям", () => {
    const history = [
      entry({ hero: "zeus", seconds: 300, level: 12 }),
      entry({ hero: "zeus", outcome: "victory", seconds: 1230, level: 22, rank: 2 }),
      entry({ hero: "axe", outcome: "victory", act: "short", seconds: 540, level: 15 }),
    ];
    const tr = arcadeTrophies(progressFromHistory(history));
    expect(tr.runs).toBe(3);
    expect(tr.victories).toBe(2);
    expect(tr.fullVictories).toBe(1);
    expect(tr.bestRank).toBe(2);
    expect(tr.bestSeconds).toBe(1230);
    expect(tr.perHero.zeus).toEqual({ runs: 2, victories: 1, bestSeconds: 1230, bestLevel: 22, marks: ["win_full", "flawless"] });
    expect(tr.perHero.axe?.victories).toBe(1);
    expect(bestArcadeEntry(history)?.rank).toBe(2);
  });

  it("T13.37: открытия и трофеи переживают вытеснение победы из ленты 50 забегов", () => {
    // Победа full/rank:7, затем 50 поражений поверх — лента обрезается до 50, победы в ней больше нет.
    let progress = recordProgress(emptyProgress(), entry({ outcome: "victory", act: "full", rank: 7, seconds: 1300 }));
    let history = [entry({ outcome: "victory", act: "full", rank: 7, seconds: 1300 })];
    for (let i = 0; i < 50; i++) {
      const loss = entry({ outcome: "dead", act: "short", rank: 0, seconds: 40 + i });
      history = [loss, ...history].slice(0, 50);
      progress = recordProgress(progress, loss);
    }
    expect(history.some((e) => e.outcome === "victory")).toBe(false);
    expect(maxUnlockedRank(progressFromHistory(history))).toBe(0); // так терялось раньше
    expect(maxUnlockedRank(progress)).toBe(8);
    expect(hasFullActVictory(progress)).toBe(true);
    expect(progress.runs).toBe(51);
    expect(progress.fullVictories).toBe(1);
    expect(progress.bestSeconds).toBe(1300);
    // Round trip через хранилище: профиль читается из своего ключа, а не сворачивается из ленты.
    void writePersisted("aegis-draft.arcade.progress", JSON.stringify(progress));
    void writePersisted("aegis-draft.arcade.history", JSON.stringify(history));
    expect(JSON.parse(readCached("aegis-draft.arcade.progress") ?? "{}").acts).toEqual(["full"]);
  });

  it("T13.37: миграция старого сейва сворачивает ленту, идемпотентна и не выдумывает потерянные победы", () => {
    const history = [
      entry({ outcome: "dead", act: "short", seconds: 30 }),
      entry({ outcome: "victory", act: "dire", rank: 3, seconds: 1250, hero: "axe" }),
      entry({ outcome: "victory", act: "full", rank: 1, seconds: 1210 }),
    ];
    const a = progressFromHistory(history);
    expect(a).toEqual(progressFromHistory(history));
    expect(a.acts).toEqual(["full", "dire"]);
    expect(maxUnlockedRank(a)).toBe(4);
    expect(a.perHero.axe?.victories).toBe(1);
    // Свёртка по одному завершению даёт тот же профиль, что и вся лента разом (лента — новейшими вперёд).
    let b = emptyProgress();
    for (const e of [...history].reverse()) b = recordProgress(b, e);
    expect(b).toEqual(a);
    expect(progressFromHistory([])).toEqual(emptyProgress());
  });

  it("T13.37: разминка и повторное завершение не открывают ступень и не удваивают счёт", () => {
    const p = recordProgress(emptyProgress(), entry({ outcome: "victory", act: "short", rank: 5 }));
    expect(maxUnlockedRank(p)).toBe(0);
    expect(p.acts).toEqual([]);
    expect(p.victories).toBe(1);
    const same = entry({ outcome: "victory", act: "full", rank: 2 });
    const once = recordProgress(emptyProgress(), same);
    const twice = recordProgress(once, same);
    expect(twice.acts).toEqual(["full"]); // акт не дублируется в списке
    expect(twice.fullVictories).toBe(2); // счётчик — забота finish(): второй вызов отсекается статусом over
  });

  it("T13.37: после перезагрузки профиль читается из своего ключа; без него или при битой записи — сворачивается из ленты", async () => {
    const reload = async () => { vi.resetModules(); return (await import("../src/state/arcadeStore.ts")).useArcade; };
    const victory = entry({ outcome: "victory", act: "full", rank: 7, seconds: 1300 });
    const losses = Array.from({ length: 50 }, (_, i) => entry({ outcome: "dead", act: "short", seconds: 40 + i }));
    // Старый сейв (до T13.37): только лента, победа ещё в ней — миграция её подхватывает.
    localStorage.setItem("aegis-draft.arcade.history", JSON.stringify([...losses.slice(0, 10), victory]));
    let store = await reload();
    let st = store.getState();
    expect(maxUnlockedRank(st.progress)).toBe(8);
    expect(st.progress.runs).toBe(11);
    // Профиль записан, лента с тех пор обрезана и победы не содержит — открытия остаются.
    localStorage.setItem("aegis-draft.arcade.progress", JSON.stringify(st.progress));
    localStorage.setItem("aegis-draft.arcade.history", JSON.stringify(losses));
    store = await reload();
    st = store.getState();
    expect(maxUnlockedRank(st.progress)).toBe(8);
    expect(hasFullActVictory(st.progress)).toBe(true);
    st.setAct("dire");
    expect(store.getState().act).toBe("dire");
    // Битая запись профиля не обнуляет молча: берём то, что осталось в ленте.
    localStorage.setItem("aegis-draft.arcade.progress", "{not json");
    st = (await reload()).getState();
    expect(st.progress.runs).toBe(50);
    expect(maxUnlockedRank(st.progress)).toBe(0);
    // Запись будущей версии с лишними полями читается по известным полям, а не отбрасывается.
    localStorage.setItem("aegis-draft.arcade.progress", JSON.stringify({ v: 2, acts: ["full", "swamp"], bestRank: 3, perHero: {}, runs: "x", legacy: { seals: 4 } }));
    st = (await reload()).getState();
    expect(st.progress.acts).toEqual(["full"]);
    expect(maxUnlockedRank(st.progress)).toBe(4);
    expect(st.progress.runs).toBe(0);
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
