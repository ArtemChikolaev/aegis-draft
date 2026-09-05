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
