import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { UPGRADE_BY_ID } from "../src/game/arcade/content/schools.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Потолок ранга в applyOffer (аудит 2026-09-19): карта Q уже висит в pending при Q=3, в том же тике Клятва охотника даёт
// +1 → выбор карты давал Q=5 → `ab.value[5]` undefined → NaN-урон → у врага hp=NaN, он бессмертен.
describe("потолок ранга при выборе карты и NaN-урон", () => {
  it("карта умения сверх последнего ранга ранг не поднимает, значение умения остаётся числом", () => {
    const sim = new ArcadeSim("offer-cap-1");
    const p = sim.player, max = sim.hero.abilities.q.value.length - 1;
    p.abilities.q = max; // клятва успела поднять ранг, пока карта висела
    sim.pending = [{ kind: "ability", key: "q" }];
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.pending).toBeNull(); // окно закрылось — забег не завис
    expect(p.abilities.q).toBe(max);
    expect(Number.isFinite(sim.hero.abilities.q.value[p.abilities.q])).toBe(true);
  });

  it("карта апгрейда сверх его потолка ранг не поднимает", () => {
    const sim = new ArcadeSim("offer-cap-2");
    const p = sim.player, def = UPGRADE_BY_ID.rad_strike;
    p.upgrades[def.id] = { rank: def.maxRank, power: def.maxRank, cap: def.maxRank };
    sim.pending = [{ kind: "upgrade", id: def.id, rarity: "standard" }];
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.pending).toBeNull();
    expect(p.upgrades[def.id].rank).toBe(def.maxRank);
    expect(p.upgrades[def.id].power).toBe(def.maxRank);
  });

  it("damageEnemy не пропускает NaN: hp врага остаётся числом", () => {
    const sim = new ArcadeSim("offer-cap-3");
    for (let i = 0; i < 600 && !sim.enemies.some((e) => e.alive && !e.kind.elite && !e.kind.totem); i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); }
    const e = sim.enemies.find((x) => x.alive && !x.kind.elite && !x.kind.totem)!;
    const hp0 = e.hp;
    expect(sim.damageEnemy(e, NaN, "hit")).toBe(false);
    expect(e.hp).toBe(hp0);
  });
});
