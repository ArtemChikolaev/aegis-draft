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

// Остаток опыта после уровня не умножается заново (2026-09-11: с жадностью и xpMult бот доходил до уровня 1224).
describe("перенос опыта через уровень", () => {
  it("суммарно потрачено ровно столько, сколько дали с множителями один раз", async () => {
    const { ArcadeSim, xpToNext } = await import("../src/game/arcade/sim.ts");
    const { ARCADE } = await import("../src/game/arcade/config.ts");
    const { IDLE_INPUT } = await import("../src/game/arcade/types.ts");
    const sim = new ArcadeSim("carry-1");
    sim.greedUntil = 1e9; // множитель жадности активен при каждом начислении
    const raw = 20000;
    (sim as unknown as { gainXp(n: number): void }).gainXp(raw);
    let guard = 0;
    while (sim.pending && guard++ < 200) sim.step({ ...IDLE_INPUT, choose: 0 });
    const p = sim.player;
    let spent = 0;
    for (let l = 1; l < p.level; l++) spent += xpToNext(l);
    expect(spent + p.xp).toBeCloseTo(raw * ARCADE.greed.xpMult, 3);
    expect(p.level).toBeLessThan(60);
  });
});
