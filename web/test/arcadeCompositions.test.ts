import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { COMPOSITIONS, ROLLED_COMPOSITIONS, compositionFor } from "../src/game/arcade/content/compositions.ts";

// Композиции акта (T13.70): полный Radiant-акт собирается из одного из двух наборов мест по seed.
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.lootOpen || sim.pondOpen || sim.forgeOpen || sim.riftOpen || sim.neutralOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); } };

describe("композиции акта", () => {
  it("по seed: детерминированно, только для полного акта, оба набора встречаются", () => {
    expect(compositionFor("a", "full")).toBe(compositionFor("a", "full"));
    expect(compositionFor("a", "short")).toBe("all");
    expect(compositionFor("a", "dire")).toBe("all");
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(compositionFor(`seed-${i}`, "full"));
    expect([...seen].sort()).toEqual([...ROLLED_COMPOSITIONS].sort());
  });

  it("в каждой композиции есть пруд, аванпост и не меньше двух чемпионов — контракт есть кому предложить", () => {
    for (const def of Object.values(COMPOSITIONS)) {
      expect(def.places).toContain("pond");
      expect(def.places).toContain("outpost");
      const champions = def.places.filter((p) => p === "camp" || p === "grove" || p === "barrow" || p === "lair").length;
      expect(champions).toBeGreaterThanOrEqual(2);
    }
  });

  it("сим ставит только места композиции; явный option перекрывает seed", () => {
    const wilds = new ArcadeSim("comp-1", { act: "full", composition: "wilds" });
    expect(wilds.composition).toBe("wilds");
    expect(wilds.camp && wilds.grove && wilds.barrow && wilds.lair && wilds.pond && wilds.outpost).toBeTruthy();
    expect(wilds.forge).toBeNull(); expect(wilds.rift).toBeNull(); expect(wilds.caravan).toBeNull();
    const trade = new ArcadeSim("comp-1", { act: "full", composition: "trade" });
    expect(trade.forge && trade.rift && trade.caravan && trade.grove && trade.lair && trade.pond).toBeTruthy();
    expect(trade.camp).toBeNull(); expect(trade.barrow).toBeNull();
    const bySeed = new ArcadeSim("comp-1", { act: "full" });
    expect(bySeed.composition).toBe(compositionFor("comp-1", "full"));
    expect(new ArcadeSim("comp-1", { act: "short" }).composition).toBe("all");
  });

  it("контракт предлагается в обеих композициях; забег без лагеря/разлома доходит до расписания без ошибок", () => {
    for (const id of ROLLED_COMPOSITIONS) {
      // Разминка с явной композицией: option перекрывает seed, а контракт там на 3:30 — быстрее полного акта.
      const sim = new ArcadeSim("comp-contract", { act: "short", composition: id });
      step(sim, ARCADE.contract.at.short + 60);
      expect(sim.contractOpen).toBe(true);
      expect(sim.contractOffers).toHaveLength(2);
      expect(sim.contractOffers[0].target).not.toBe(sim.contractOffers[1].target);
    }
  }, 30_000);

  it("детерминизм: тот же seed и композиция — тот же дайджест", () => {
    const a = new ArcadeSim("comp-det", { act: "full" }), b = new ArcadeSim("comp-det", { act: "full" });
    step(a, 1800); step(b, 1800);
    expect(a.digest()).toBe(b.digest());
  }, 30_000);
});
