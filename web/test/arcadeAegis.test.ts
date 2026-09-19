import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT, type Offer } from "../src/game/arcade/types.ts";

// Воскрешение одно (флаг `p.aegis`), источников три: Aegis с Рошана, легендарка «Феникс», стартовый Aegis (M15, B7).
// Раньше второй источник поверх первого сгорал впустую.
type Internals = { rollOffers(): Offer[]; onLethal(): void };

describe("Аркада: Aegis и «Феникс» не сгорают впустую", () => {
  it("Aegis с Рошана лежит, пока воскрешение уже есть, и подбирается, когда оно потрачено", () => {
    const sim = new ArcadeSim("aegis-drop");
    for (const e of sim.enemies) if (e.alive) e.alive = false;
    const p = sim.player;
    p.aegis = true;
    sim.aegisDrop = { x: p.x, y: p.y };
    sim.step(IDLE_INPUT);
    expect(sim.aegisDrop).not.toBeNull(); // было: подобран и потерян
    expect(p.aegis).toBe(true);
    (sim as unknown as Internals).onLethal(); // воскрешение потрачено
    expect(p.aegis).toBe(false);
    expect(sim.over).toBeNull();
    sim.aegisDrop!.x = p.x; sim.aegisDrop!.y = p.y;
    sim.step(IDLE_INPUT);
    expect(sim.aegisDrop).toBeNull();
    expect(p.aegis).toBe(true);
  });

  it("«Феникс» не предлагается, пока воскрешение есть, и возвращается в пул, когда его нет", () => {
    const offered = (aegis: boolean): boolean => {
      const sim = new ArcadeSim("aegis-phoenix");
      const p = sim.player;
      p.level = 12; // гарантированный легендарный слот
      p.schools = ["radiance"];
      let seen = false;
      for (let i = 0; i < 40 && !seen; i++) {
        p.aegis = aegis;
        seen = (sim as unknown as Internals).rollOffers().some((o) => o.kind === "upgrade" && o.id === "leg_rad_phoenix");
      }
      return seen;
    };
    expect(offered(false)).toBe(true);
    expect(offered(true)).toBe(false); // было: предлагался и при взятии ничего не давал
  });
});
