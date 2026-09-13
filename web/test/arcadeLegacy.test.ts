import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { LEGACY_MAX_RANK, LEGACY_NONE, LEGACY_PER_RANK, clampLegacy, legacyBonus, legacySpentTotal } from "../src/game/arcade/content/legacy.ts";
import { decodeReplay, encodeReplay } from "../src/game/arcade/replay.ts";
import { emptyProgress, getArcadeSim, legacyClaimKey, progressFromHistory, recordProgress, useArcade, type ArcadeHistoryEntry } from "../src/state/arcadeStore.ts";

// «Наследие Aegis» (T13.44, этап 2 аудита 2026-09-08): печати за победы в полных актах → ограниченная общая прокачка.
const entry = (over: Partial<ArcadeHistoryEntry>): ArcadeHistoryEntry => ({
  seed: "s", outcome: "dead", seconds: 100, level: 5, kills: 50, gold: 10, schools: [], configVersion: "a", at: 1, hero: "juggernaut", act: "full", rank: 0, ...over,
});

describe("Наследие Aegis", () => {
  it("бонусы: линейно по пунктам, потолок 4, кривые значения обрезаются", () => {
    expect(legacyBonus(null)).toEqual(LEGACY_NONE);
    expect(legacyBonus({ reach: 4, swift: 4, thrift: 4, insight: 4, provisions: 4 })).toEqual({ pickup: 1 + 4 * LEGACY_PER_RANK.reach, speed: 1 + 4 * LEGACY_PER_RANK.swift, shop: 1 - 4 * LEGACY_PER_RANK.thrift, rerolls: 4 * LEGACY_PER_RANK.insight, gold: 4 * LEGACY_PER_RANK.provisions });
    expect(clampLegacy({ reach: 9, swift: -2, thrift: 1.7 })).toEqual({ reach: LEGACY_MAX_RANK, swift: 0, thrift: 1, insight: 0, provisions: 0 });
    expect(legacySpentTotal(clampLegacy({ reach: 2, swift: 1, insight: 1 }))).toBe(4);
    // Профиль до T13.88 (Стойкость/Сила): чужие ветки отбрасываются — печати возвращаются в свободные.
    expect(clampLegacy({ vitality: 3, might: 2, reach: 1 })).toEqual({ reach: 1, swift: 0, thrift: 0, insight: 0, provisions: 0 });
  });

  it("печати: победа в полном акте = 1, первая полная победа героем = ещё 1; та же комбинация — один раз; разминка и смерть — 0", () => {
    let p = recordProgress(emptyProgress(), entry({ outcome: "victory", act: "full", rank: 0, seed: "a" }));
    expect(p.legacy.seals).toBe(2); // победа + первая полная победа Juggernaut
    p = recordProgress(p, entry({ outcome: "victory", act: "full", rank: 0, seed: "a" })); // повтор того же seed/hero/act/rank
    expect(p.legacy.seals).toBe(2);
    p = recordProgress(p, entry({ outcome: "victory", act: "full", rank: 1, seed: "a" })); // другая ступень — новая награда
    expect(p.legacy.seals).toBe(3);
    p = recordProgress(p, entry({ outcome: "victory", act: "dire", rank: 0, seed: "b", hero: "axe" })); // первый Axe
    expect(p.legacy.seals).toBe(5);
    p = recordProgress(p, entry({ outcome: "victory", act: "short", rank: 5, seed: "c" }));
    p = recordProgress(p, entry({ outcome: "dead", act: "full", rank: 3, seed: "d" }));
    expect(p.legacy.seals).toBe(5);
    expect(p.legacy.claimed).toContain(legacyClaimKey({ seed: "a", hero: "juggernaut", act: "full", rank: 1 }));
    // Свёртка старой истории даёт те же печати и идемпотентна.
    const history = [entry({ outcome: "victory", act: "full", seed: "x" }), entry({ outcome: "dead", act: "short" }), entry({ outcome: "victory", act: "full", seed: "x" })];
    expect(progressFromHistory(history).legacy.seals).toBe(2);
    expect(progressFromHistory(history)).toEqual(progressFromHistory(history));
  });

  it("стор: вложение только при свободных печатях и до потолка; сброс бесплатный; старый профиль без наследия читается нулями", () => {
    const p = emptyProgress();
    p.legacy.seals = 5;
    useArcade.setState({ progress: p });
    const st = useArcade.getState();
    for (let i = 0; i < 6; i++) st.legacySpend("swift");
    expect(useArcade.getState().progress.legacy.spent.swift).toBe(LEGACY_MAX_RANK);
    st.legacySpend("thrift");
    expect(useArcade.getState().progress.legacy.spent.thrift).toBe(1);
    st.legacySpend("reach"); // печатей больше нет
    expect(useArcade.getState().progress.legacy.spent.reach).toBe(0);
    expect(legacySpentTotal(useArcade.getState().progress.legacy.spent)).toBe(5);
    st.legacyReset();
    expect(useArcade.getState().progress.legacy.spent).toEqual({ reach: 0, swift: 0, thrift: 0, insight: 0, provisions: 0 });
    expect(useArcade.getState().progress.legacy.seals).toBe(5);
    // Профиль до T13.44 (без поля legacy) — нули, ничего не ломается.
    localStorage.setItem("aegis-draft.arcade.progress", JSON.stringify({ v: 1, acts: ["full"], perHero: {}, runs: 3, victories: 1, fullVictories: 1, bestRank: 0, bestSeconds: 1200 }));
    localStorage.setItem("aegis-draft.arcade.history", "[]");
    return import("vitest").then(async ({ vi }) => {
      vi.resetModules();
      const fresh = (await import("../src/state/arcadeStore.ts")).useArcade.getState();
      expect(fresh.progress.legacy).toEqual({ seals: 0, spent: { reach: 0, swift: 0, thrift: 0, insight: 0, provisions: 0 }, claimed: [] });
    });
  });

  it("сим применяет снимок один раз: радиус сбора и скорость в статах, цены лавки, бесплатные рероллы, стартовое золото; урон и HP не трогает", () => {
    const full = legacyBonus({ reach: 4, swift: 4, thrift: 4, insight: 4, provisions: 4 });
    const base = new ArcadeSim("legacy-1"), boosted = new ArcadeSim("legacy-1", { legacy: full });
    expect(boosted.player.stats.pickup).toBeCloseTo(base.player.stats.pickup * (1 + 4 * LEGACY_PER_RANK.reach), 6);
    expect(boosted.player.stats.speed).toBeCloseTo(base.player.stats.speed * (1 + 4 * LEGACY_PER_RANK.swift), 6);
    expect(boosted.player.stats.maxHp).toBe(base.player.stats.maxHp);
    expect(boosted.player.stats.damage).toBe(base.player.stats.damage);
    expect(boosted.player.gold).toBe(base.player.gold + 4 * LEGACY_PER_RANK.provisions);
    expect(boosted.shopPriceMult()).toBeCloseTo(base.shopPriceMult() * (1 - 4 * LEGACY_PER_RANK.thrift), 6);
    expect(boosted.levelRerollPrice()).toBe(0);
    expect(base.levelRerollPrice()).toBeGreaterThan(0);
    // Урон одинаковый: наследие больше не множитель исходящего.
    for (const s of [base, boosted]) for (let i = 0; i < sec(6); i++) { s.player.hp = 1e6; s.step(IDLE_INPUT); }
    const target = (s: ArcadeSim) => { const e = s.enemies.find((x) => x.alive && !x.kind.totem && x.kind.id !== "satyr_defiler")!; e.hp = e.maxHp = 1e6; return e; };
    const a = target(base), b = target(boosted);
    base.damageEnemy(a, 100, "burst"); boosted.damageEnemy(b, 100, "burst");
    expect(1e6 - b.hp).toBeCloseTo(1e6 - a.hp, 6);
    // Кривой снимок игнорируется.
    expect(new ArcadeSim("legacy-1", { legacy: { pickup: 9, speed: 1, shop: 1, rerolls: 0, gold: 0 } }).legacy).toEqual(LEGACY_NONE);
  });

  it("реплей несёт снимок пунктов и не читает прокачку зрителя; старые коды без поля читаются", () => {
    const rep = { seed: "r", hero: "juggernaut" as const, rank: 0, act: "full" as const, version: "a0.45.0", log: [], gear: [], legacy: { reach: 2, swift: 0, thrift: 3, insight: 0, provisions: 1 } };
    const code = encodeReplay(rep);
    expect(code.split("~")).toHaveLength(9);
    expect(decodeReplay(code)?.legacy).toEqual({ reach: 2, swift: 0, thrift: 3, insight: 0, provisions: 1 });
    const plain = encodeReplay({ ...rep, legacy: undefined });
    expect(plain.split("~")).toHaveLength(8);
    expect(decodeReplay(plain)?.legacy).toBeUndefined();
    expect(decodeReplay(encodeReplay({ ...rep, legacy: { reach: 0, swift: 0, thrift: 0, insight: 0, provisions: 0 } }))?.legacy).toBeUndefined(); // нули не пишем
    expect(decodeReplay(code.replace(/2\.0\.3\.0\.1$/, "x.0.3.0.1"))).toBeNull();
    // Просмотр реплея с наследием даёт ту же силу, что у автора, а не у зрителя.
    const p = emptyProgress(); p.legacy.seals = 4; p.legacy.spent = { reach: 0, swift: 4, thrift: 0, insight: 0, provisions: 0 };
    useArcade.setState({ progress: p });
    useArcade.getState().startReplay({ ...rep, legacy: { reach: 0, swift: 1, thrift: 0, insight: 0, provisions: 0 } });
    expect(getArcadeSim()!.legacy.speed).toBeCloseTo(1 + LEGACY_PER_RANK.swift, 6);
    useArcade.getState().quit();
  });

  it("первая победа героем — по постоянной отметке, а не по обрезанному списку claimed (аудит 2026-09-12)", () => {
    const win = (seed: string, hero = "juggernaut"): ArcadeHistoryEntry => entry({ outcome: "victory", seed, hero, act: "full", rank: 0 });
    let p = recordProgress(emptyProgress(), win("original", "axe"));
    expect(p.legacy.seals).toBe(2);
    for (let i = 0; i < 200; i++) p = recordProgress(p, win(`later-${i}`));
    expect(p.legacy.claimed).toHaveLength(200);
    const before = p.legacy.seals;
    // Та же победа Axe снова: ключ вытеснен из claimed, но бонус «первой победы» не возвращается — только обычная печать.
    p = recordProgress(p, win("original", "axe"));
    expect(p.legacy.seals - before).toBe(1);
    // Новый сид Axe — тоже одна печать, без бонуса первой победы.
    p = recordProgress(p, win("fresh", "axe"));
    expect(p.legacy.seals - before).toBe(2);
  });
});
