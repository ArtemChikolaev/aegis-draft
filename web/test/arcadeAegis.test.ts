import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT, type Offer } from "../src/game/arcade/types.ts";

// Воскрешение одно (флаг `p.aegis`), источников три: Aegis с Рошана, легендарка «Феникс», стартовый Aegis (M15, B7).
// Раньше второй источник поверх первого сгорал впустую.
type Internals = { rollOffers(): Offer[]; onLethal(): void };

describe("Аркада: Aegis и «Феникс» не сгорают впустую", () => {
  it("награда Рошана: при живом воскрешении Aegis в выборе недоступен и не сгорает; потратил — берётся", () => {
    const sim = new ArcadeSim("aegis-drop");
    for (const e of sim.enemies) if (e.alive) e.alive = false;
    const p = sim.player;
    p.aegis = true;
    sim.roshanDrops.push({ x: p.x, y: p.y });
    sim.step(IDLE_INPUT);
    expect(sim.roshanOpen).toBe(true); // Cheese и Shard взять можно
    expect(sim.roshanOptions().aegis).toBe(false);
    sim.step({ ...IDLE_INPUT, act: 1 }); // Aegis недоступен — окно ждёт
    expect(sim.roshanOpen).toBe(true);
    sim.step({ ...IDLE_INPUT, act: 5 }); // «Позже»: дроп лежит (было: подобран и потерян)
    expect(sim.roshanDrops.length).toBe(1);
    (sim as unknown as Internals).onLethal(); // воскрешение потрачено
    expect(p.aegis).toBe(false);
    expect(sim.over).toBeNull();
    const x0 = p.x;
    p.x = x0 + 200; sim.step(IDLE_INPUT); // отошёл — «Позже» снято
    p.x = x0; sim.step(IDLE_INPUT);
    expect(sim.roshanOpen).toBe(true);
    sim.step({ ...IDLE_INPUT, act: 1 });
    expect(p.aegis).toBe(true);
    expect(sim.roshanDrops.length).toBe(0);
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
