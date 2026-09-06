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
    expect(LEGENDARY_UPGRADES.length).toBeGreaterThanOrEqual(18);
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

  it("партия 2: скорость атаки, лечение с умений, звери (T13.18)", () => {
    const sim = new ArcadeSim("leg-3", { hero: "sven" });
    const apply = (id: string) => (sim as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id, rarity: "arcana" });
    const interval0 = sim.player.stats.attackInterval;
    apply("leg_moonshard");
    expect(sim.player.stats.attackInterval).toBeLessThan(interval0);

    // Кровавик лечит с урона умениями и не лечит с автоатаки.
    const sim2 = new ArcadeSim("leg-4", { hero: "sven" });
    const apply2 = (id: string) => (sim2 as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id, rarity: "arcana" });
    for (let i = 0; i < 60 * 12 && !sim2.over; i++) sim2.step(IDLE_INPUT);
    const target = sim2.enemies.find((e) => e.alive);
    expect(target).toBeTruthy();
    apply2("leg_bloodstone");
    sim2.player.hp = 100;
    sim2.damageEnemy(target!, 200, "hit");
    expect(sim2.player.hp).toBe(100);
    const victim = sim2.enemies.find((e) => e.alive);
    sim2.damageEnemy(victim!, 200, "burst");
    expect(sim2.player.hp).toBeGreaterThan(100);

    // Псарня добавляет по зверю сверх уже призванных, но не призывает с нуля.
    const sim3 = new ArcadeSim("leg-5", { hero: "sven" });
    const apply3 = (id: string) => (sim3 as unknown as { applyOffer(o: unknown): void }).applyOffer({ kind: "upgrade", id, rarity: "arcana" });
    apply3("leg_beast_kennel");
    expect(sim3.pets.length).toBe(0);
    apply3("beast_wolf");
    expect(sim3.pets.filter((q) => q.kind === "wolf").length).toBe(2);
  });
});
