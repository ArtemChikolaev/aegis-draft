import { describe, expect, it, vi } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { emptyProgress, recordProgress, type ArcadeHistoryEntry } from "../src/state/arcadeStore.ts";

// Бестиарий (T13.56): убийства по видам за забег → суммарно в постоянном профиле → список в Штабе.
const entry = (over: Partial<ArcadeHistoryEntry>): ArcadeHistoryEntry => ({
  seed: "s", outcome: "dead", seconds: 100, level: 5, kills: 50, gold: 10, schools: [], configVersion: "a", at: 1, hero: "juggernaut", act: "full", rank: 0, ...over,
});

describe("бестиарий", () => {
  it("сим считает убийства по видам и кладёт их в итог", () => {
    const sim = new ArcadeSim("bestiary-1");
    for (let i = 0; i < sec(60) && !sim.over; i++) { sim.player.hp = 1e6; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); }
    const total = Object.values(sim.killsByKind).reduce((a, b) => a + b, 0);
    expect(total).toBe(sim.player.kills);
    expect(sim.killsByKind.kobold ?? 0).toBeGreaterThan(0);
    for (const k of Object.keys(sim.killsByKind)) expect(k in ENEMY_KINDS).toBe(true);
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.killsByKind).toEqual(sim.killsByKind);
  });

  it("профиль суммирует по видам за все забеги; старый профиль без поля читается пустым", async () => {
    let p = recordProgress(emptyProgress(), entry({ killsByKind: { kobold: 12, satyr: 2 } }));
    p = recordProgress(p, entry({ killsByKind: { kobold: 3, centaur_warden: 1 } }));
    p = recordProgress(p, entry({})); // запись до бестиария — без поля
    expect(p.bestiary).toEqual({ kobold: 15, satyr: 2, centaur_warden: 1 });
    localStorage.setItem("aegis-draft.arcade.progress", JSON.stringify({ v: 1, acts: [], perHero: {}, runs: 1, victories: 0, fullVictories: 0, bestRank: null, bestSeconds: 10 }));
    localStorage.setItem("aegis-draft.arcade.history", "[]");
    vi.resetModules();
    const fresh = (await import("../src/state/arcadeStore.ts")).useArcade.getState();
    expect(fresh.progress.bestiary).toEqual({});
    localStorage.setItem("aegis-draft.arcade.progress", JSON.stringify({ v: 1, acts: [], perHero: {}, runs: 1, victories: 0, fullVictories: 0, bestRank: null, bestSeconds: 10, bestiary: { kobold: 7, ghost: "x", ogre: -2 } }));
    vi.resetModules();
    const fresh2 = (await import("../src/state/arcadeStore.ts")).useArcade.getState();
    expect(fresh2.progress.bestiary).toEqual({ kobold: 7 }); // кривые записи отброшены
  });
});
