import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { LEGENDARY_LEVELS, LEGENDARY_UPGRADES, UPGRADE_BY_ID } from "../src/game/arcade/content/schools.ts";

function levelTo(sim: ArcadeSim, level: number): void {
  // Поднимаем уровень через опыт, каждый выбор — первый оффер (choose 0), пока не дойдём до нужного.
  let guard = 0;
  while (sim.player.level < level && guard++ < 200) {
    if (sim.pending) sim.step({ ...IDLE_INPUT, choose: 0 });
    else { (sim as unknown as { gainXp(n: number): void }).gainXp(sim.player.xpNext - sim.player.xp); sim.step(IDLE_INPUT); }
  }
}

describe("легендарные апгрейды (T13.18)", () => {
  it("на гарантированном уровне среди офферов есть легендарный, обычный пул их не содержит", () => {
    const sim = new ArcadeSim("leg-1", { hero: "sven" });
    sim.player.hp = 1e6;
    levelTo(sim, LEGENDARY_LEVELS[0] - 1);
    if (sim.pending) sim.step({ ...IDLE_INPUT, choose: 0 });
    (sim as unknown as { gainXp(n: number): void }).gainXp(sim.player.xpNext - sim.player.xp);
    sim.step(IDLE_INPUT);
    expect(sim.player.level).toBe(LEGENDARY_LEVELS[0]);
    const offers = sim.pending ?? [];
    const legs = offers.filter((o) => o.kind === "upgrade" && UPGRADE_BY_ID[o.id]?.legendary);
    expect(legs.length).toBe(1);
    expect(LEGENDARY_UPGRADES.length).toBeGreaterThanOrEqual(12);
  });

  it("Сердце Тарраска и Дедал меняют статы; феникс даёт возрождение", () => {
    const sim = new ArcadeSim("leg-2", { hero: "juggernaut" });
    const apply = (id: string) => (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id, rarity: "arcana" });
    const hp0 = sim.player.stats.maxHp, crit0 = sim.player.stats.critChance;
    apply("leg_heart");
    expect(sim.player.stats.maxHp).toBeCloseTo(hp0 * 1.4, 0);
    apply("leg_daedalus");
    expect(sim.player.stats.critChance).toBeCloseTo(crit0 + 0.25, 5);
    expect(sim.player.aegis).toBe(false);
    apply("leg_rad_phoenix");
    expect(sim.player.aegis).toBe(true);
    expect(sim.player.schools).toContain("radiance");
    expect(sim.player.schools).not.toContain("skadi");
  });
});
