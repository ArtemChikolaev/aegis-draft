import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

describe("питомцы школы «Зверинец» (T13.21)", () => {
  it("апгрейды создают питомцев: волк, стая добавляет волка, медведь и ястреб по одному", () => {
    const sim = new ArcadeSim("pets-1", { hero: "juggernaut" });
    const apply = (id: string) => (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id, rarity: "standard" });
    expect(sim.pets.length).toBe(0);
    apply("beast_wolf"); expect(sim.pets.filter((p) => p.kind === "wolf").length).toBe(1);
    apply("beast_pack"); expect(sim.pets.filter((p) => p.kind === "wolf").length).toBe(2);
    apply("beast_bear"); apply("beast_hawk");
    expect(sim.pets.length).toBe(4);
    expect(sim.player.schools).toContain("beast");
  });

  it("волк кусает врага рядом и следует за героем", () => {
    const sim = new ArcadeSim("pets-2", { hero: "juggernaut" });
    (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id: "beast_wolf", rarity: "standard" });
    sim.player.hp = 1e6;
    for (let i = 0; i < 60 * 15 && !sim.over; i++) sim.step(IDLE_INPUT);
    const wolf = sim.pets[0];
    const e = sim.enemies.find((x) => x.alive && !x.kind.elite);
    expect(e).toBeTruthy();
    e!.x = wolf.x + 20; e!.y = wolf.y; e!.hp = 1e6;
    const hp0 = e!.hp;
    for (let i = 0; i < 60 * 3; i++) { sim.player.hp = 1e6; e!.x = wolf.x + 20; e!.y = wolf.y; sim.step(IDLE_INPUT); }
    expect(e!.hp).toBeLessThan(hp0);
    expect(Math.hypot(wolf.x - sim.player.x, wolf.y - sim.player.y)).toBeLessThan(520);
  });
});

describe("питомцы: удар после подхода, а не после таймера погони (фидбэк владельца 2026-09-06)", () => {
  it("медведь с полной перезарядкой кусает новую цель не позже чем через половину периода после прошлого удара", () => {
    const sim = new ArcadeSim("pets-3", { hero: "juggernaut" });
    (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id: "beast_bear", rarity: "standard" });
    sim.player.hp = 1e6;
    for (let i = 0; i < 60 * 10 && !sim.over; i++) sim.step(IDLE_INPUT);
    const bear = sim.pets[0];
    const e = sim.enemies.find((x) => x.alive && !x.kind.elite)!;
    // Свежий удар только что был: перезарядка полная (1.6 с = 96 тиков).
    bear.cd = 96; bear.hitAt = sim.tick; bear.inReach = false;
    e.hp = 1e6;
    const t0 = sim.tick;
    let bit = -1;
    for (let i = 0; i < 120 && bit < 0; i++) {
      sim.player.hp = 1e6; e.x = bear.x + 10; e.y = bear.y; e.hp = 1e6;
      sim.step(IDLE_INPUT);
      if (bear.hitAt > t0) bit = sim.tick - t0;
    }
    expect(bit).toBeGreaterThan(0);
    expect(bit).toBeLessThanOrEqual(48 + 1);
  });

  it("готовый волк (без перезарядки) кусает сразу по подходу", () => {
    const sim = new ArcadeSim("pets-4", { hero: "juggernaut" });
    (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id: "beast_wolf", rarity: "standard" });
    sim.player.hp = 1e6;
    for (let i = 0; i < 60 * 10 && !sim.over; i++) sim.step(IDLE_INPUT);
    const wolf = sim.pets[0];
    const e = sim.enemies.find((x) => x.alive && !x.kind.elite)!;
    wolf.cd = 0; wolf.hitAt = -999; wolf.inReach = false;
    const t0 = sim.tick;
    let bit = -1;
    for (let i = 0; i < 60 && bit < 0; i++) {
      sim.player.hp = 1e6; e.x = wolf.x + 10; e.y = wolf.y; e.hp = 1e6;
      sim.step(IDLE_INPUT);
      if (wolf.hitAt > t0) bit = sim.tick - t0;
    }
    expect(bit).toBeGreaterThan(0);
    expect(bit).toBeLessThanOrEqual(2);
  });
});
