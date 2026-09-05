import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { UPGRADE_BY_ID } from "../src/game/arcade/content/schools.ts";

function levelUp(sim: ArcadeSim): void {
  (sim as unknown as { gainXp(n: number): void }).gainXp(sim.player.xpNext - sim.player.xp + 1);
  sim.step(IDLE_INPUT);
}

describe("прокачка: реролл и изгнание (T13.21), гибриды школ", () => {
  it("реролл меняет карты и берёт золото по растущей цене; без золота — ничего", () => {
    const sim = new ArcadeSim("lvl-1", { hero: "juggernaut" });
    sim.player.hp = 1e6;
    levelUp(sim);
    expect(sim.pending).toBeTruthy();
    const before = JSON.stringify(sim.pending);
    sim.player.gold = 0;
    sim.step({ ...IDLE_INPUT, choose: -2 });
    expect(JSON.stringify(sim.pending)).toBe(before);
    sim.player.gold = 1000;
    const price = sim.levelRerollPrice();
    sim.step({ ...IDLE_INPUT, choose: -2 });
    expect(sim.player.gold).toBe(1000 - price);
    expect(sim.levelRerollPrice()).toBeGreaterThan(price);
    expect(sim.pending).toBeTruthy();
  });

  it("изгнание убирает апгрейд из пула до конца забега", () => {
    const sim = new ArcadeSim("lvl-2", { hero: "juggernaut" });
    sim.player.hp = 1e6;
    levelUp(sim);
    const idx = sim.pending!.findIndex((o) => o.kind === "upgrade");
    expect(idx).toBeGreaterThanOrEqual(0);
    const id = (sim.pending![idx] as { id: string }).id;
    sim.step({ ...IDLE_INPUT, act: 30 + idx });
    expect(sim.banished.has(id)).toBe(true);
    expect(sim.banishesLeft).toBe(2);
    for (let i = 0; i < 20; i++) { if (sim.pending) sim.step({ ...IDLE_INPUT, choose: 0 }); levelUp(sim); for (const o of sim.pending ?? []) if (o.kind === "upgrade") expect(o.id).not.toBe(id); }
  });

  it("гибрид предлагается только при обеих школах", () => {
    const sim = new ArcadeSim("lvl-3", { hero: "juggernaut" });
    const apply = (id: string) => (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id, rarity: "standard" });
    const roll = () => (sim as unknown as { rollUpgradeOffer(x: string[]): { id: string } | null }).rollUpgradeOffer([]);
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) { const o = roll(); if (o) ids.add(o.id); }
    expect([...ids].some((id) => UPGRADE_BY_ID[id].requiresSchools)).toBe(false);
    apply("rad_aura"); apply("ska_bite");
    const ids2 = new Set<string>();
    for (let i = 0; i < 400; i++) { const o = roll(); if (o) ids2.add(o.id); }
    expect(ids2.has("hyb_steam")).toBe(true);
    expect(ids2.has("hyb_plasma")).toBe(false);
  });
});
