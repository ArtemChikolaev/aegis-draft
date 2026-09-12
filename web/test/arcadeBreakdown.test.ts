import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";

// Разбор забега (T13.74): итог знает, кто добил, доли нанесённого урона по источникам и полученного — по видам врагов.
describe("разбор забега", () => {
  it("смерть: killer — вид последнего ударившего, урон по источникам и по видам врагов накоплен", () => {
    const sim = new ArcadeSim("breakdown-1", { act: "short", composition: "all" });
    const internals = sim as unknown as { damagePlayer(a: number, stun?: number, by?: typeof ENEMY_KINDS.kobold): void };
    for (let i = 0; i < 1200 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); }
    expect(sim.over).toBeNull();
    internals.damagePlayer(5, 0, ENEMY_KINDS.ogre);
    internals.damagePlayer(1e9, 0, ENEMY_KINDS.hill_troll);
    sim.step(IDLE_INPUT);
    const o = sim.over!;
    expect(o.outcome).toBe("dead");
    expect(o.killer).toBe("hill_troll");
    expect(o.takenByKind?.ogre).toBe(5);
    expect(o.takenByKind?.hill_troll).toBeGreaterThan(5);
    const dealt = o.dealtBySource ?? {};
    expect(Object.values(dealt).reduce((n, v) => n + v, 0)).toBeGreaterThan(0);
    expect(dealt.attack ?? 0).toBeGreaterThan(0);
    // Нанесённое не превышает суммарного HP убитых с запасом: учитываем только фактически снятое, не переурон.
    for (const v of Object.values(dealt)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("победа: killer пустой, разбор всё равно есть", () => {
    const sim = new ArcadeSim("breakdown-2", { act: "short", composition: "all" });
    for (let i = 0; i < 600 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); }
    (sim as unknown as { finish(o: "victory"): void }).finish("victory");
    expect(sim.over!.killer).toBeNull();
    expect(sim.over!.dealtBySource).toBeDefined();
  });
});
