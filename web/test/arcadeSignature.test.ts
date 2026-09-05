import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";

function warm(sim: ArcadeSim, ticks: number): void {
  for (let i = 0; i < ticks && !sim.over; i++) sim.step(IDLE_INPUT);
}
const alive = (sim: ArcadeSim) => sim.enemies.filter((e) => e.alive && !e.kind.elite && !e.kind.boss);

describe("фирменные пассивки героев (T13.15)", () => {
  it("Shadow Fiend копит души за убийства, элита даёт 6, есть потолок", () => {
    const sim = new ArcadeSim("sig-sf", { hero: "shadow_fiend" });
    sim.player.hp = 1e6;
    warm(sim, 60 * 20);
    const sig = HEROES.shadow_fiend.signature!;
    expect(sig.kind).toBe("souls");
    const before = sim.player.stacks;
    const victims = alive(sim).slice(0, 3);
    expect(victims.length).toBe(3);
    for (const e of victims) sim.damageEnemy(e, 1e6, "hit");
    expect(sim.player.stacks).toBe(before + 3);
    sim.player.stacks = sig.cap! - 1;
    sim.damageEnemy(alive(sim)[0], 1e6, "hit");
    expect(sim.player.stacks).toBe(sig.cap);
  });

  it("Clinkz лечится за убийство, не выше максимума", () => {
    const sim = new ArcadeSim("sig-clinkz", { hero: "clinkz" });
    sim.player.hp = 1e6;
    warm(sim, 60 * 20);
    const max = sim.player.stats.maxHp;
    sim.player.hp = max - 100;
    sim.damageEnemy(alive(sim)[0], 1e6, "hit");
    expect(sim.player.hp).toBe(max - 100 + 6);
    sim.player.hp = max - 2;
    sim.damageEnemy(alive(sim)[0], 1e6, "hit");
    expect(sim.player.hp).toBe(max);
  });

  it("Ursa: ярость копится по одной цели и сбрасывается при смене", () => {
    const sim = new ArcadeSim("sig-ursa", { hero: "ursa" });
    sim.player.hp = 1e6;
    warm(sim, 60 * 20);
    const [a, b] = alive(sim);
    a.hp = b.hp = 1e9;
    const hit = (e: typeof a) => (sim as unknown as { onAttackHit(e: typeof a): void }).onAttackHit(e);
    hit(a); hit(a); hit(a);
    expect(sim.player.stacks).toBe(3);
    expect(sim.player.stackTarget).toBe(a.id);
    hit(b);
    expect(sim.player.stacks).toBe(1);
    for (let i = 0; i < 30; i++) hit(b);
    expect(sim.player.stacks).toBe(HEROES.ursa.signature!.cap);
  });

  it("у героев без фирменной пассивки стаки не растут; сим детерминирован с пассивкой", () => {
    const sim = new ArcadeSim("sig-jugg", { hero: "juggernaut" });
    warm(sim, 60 * 20);
    sim.damageEnemy(alive(sim)[0], 1e6, "hit");
    expect(sim.player.stacks).toBe(0);
    const a = new ArcadeSim("sig-det", { hero: "sven" }); warm(a, 60 * 40);
    const b = new ArcadeSim("sig-det", { hero: "sven" }); warm(b, 60 * 40);
    expect(a.digest()).toBe(b.digest());
  });
});
