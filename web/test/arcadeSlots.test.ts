import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { UPGRADE_BY_ID } from "../src/game/arcade/content/schools.ts";
import type { Offer } from "../src/game/arcade/types.ts";

// Слоты типов благословений (M25, как в Death Must Die): у активных типов — одно благословение за забег, ранги взятого —
// всегда; Сила и Пассивка без потолка; легендарки вне слотов.
type Priv = { applyOffer(o: Offer): void; rollUpgradeOffer(exclude: string[]): Offer | null };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const take = (sim: ArcadeSim, id: string) => priv(sim).applyOffer({ kind: "upgrade", id, rarity: "standard" });
const rolls = (sim: ArcadeSim, n = 400) => {
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) { const o = priv(sim).rollUpgradeOffer([]); if (o?.kind === "upgrade") seen.add(o.id); }
  return seen;
};

describe("слоты типов благословений", () => {
  it("взятая «Атака» закрывает новые атаки других школ, но её ранги и «Сила» с «Пассивкой» предлагаются", () => {
    expect(ARCADE.blessingSlots.attack).toBe(1);
    const sim = new ArcadeSim("slots-1", { rank: 0, hero: "juggernaut" });
    take(sim, "rad_strike");
    expect(UPGRADE_BY_ID.rad_strike.type).toBe("attack");
    expect(sim.slotUse().attack).toBe(1);
    const seen = rolls(sim);
    const attacks = [...seen].filter((id) => UPGRADE_BY_ID[id].type === "attack");
    expect(attacks).toEqual(["rad_strike"]); // только ранг взятой
    expect([...seen].some((id) => UPGRADE_BY_ID[id].type === "power")).toBe(true);
    expect([...seen].some((id) => UPGRADE_BY_ID[id].type === "passive")).toBe(true);
  });

  it("свободный тип предлагает благословения всех школ; легендарка слот не занимает", () => {
    const sim = new ArcadeSim("slots-2", { rank: 0, hero: "juggernaut" });
    const attacks = [...rolls(sim)].filter((id) => UPGRADE_BY_ID[id].type === "attack");
    expect(attacks.length).toBeGreaterThan(1);
    sim.player.upgrades.leg_moonshard = { rank: 1, power: 1, cap: 1 };
    expect(sim.slotUse()).toEqual({});
  });
});
