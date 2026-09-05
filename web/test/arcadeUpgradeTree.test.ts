import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { UPGRADE_BY_ID } from "../src/game/arcade/content/schools.ts";

describe("дерево школ: модификаторы только после источника (T13.6, фидбэк владельца 2026-09-06)", () => {
  it("на любом уровне предложенный модификатор имеет взятый источник", () => {
    for (const seed of ["tree-1", "tree-2", "tree-3"]) {
      const sim = new ArcadeSim(seed, { hero: "juggernaut" });
      sim.player.hp = 1e6;
      for (let round = 0; round < 25; round++) {
        (sim as unknown as { gainXp(n: number): void }).gainXp(sim.player.xpNext - sim.player.xp + 1);
        sim.step(IDLE_INPUT);
        for (const o of sim.pending ?? []) {
          if (o.kind !== "upgrade") continue;
          const def = UPGRADE_BY_ID[o.id];
          if (def.requires) expect(def.requires.some((id) => (sim.player.upgrades[id]?.rank ?? 0) > 0), `${seed}: ${o.id} без источника`).toBe(true);
        }
        if (sim.pending) sim.step({ ...IDLE_INPUT, choose: 0 });
      }
    }
  });
});
