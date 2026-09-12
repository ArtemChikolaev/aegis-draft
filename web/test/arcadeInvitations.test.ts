import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Приглашения у края экрана (T13.60): необязательных не больше max до захвата аванпоста; угрозы и выбранные цели — всегда.
const MAX = ARCADE.invitations.max;
const optional = (sim: ArcadeSim) => sim.invitations().filter((i) => !i.committed);
const kinds = (sim: ArcadeSim) => sim.invitations().map((i) => i.kind);
/** Перемотка часов тянет за собой плановую лавку и караван — убираем их, когда тест не про них. */
const quiet = (sim: ArcadeSim) => { sim.shopkeeper.alive = false; if (sim.caravan) sim.caravan.state = "gone"; };

describe("приглашения у края", () => {
  it("на старте — лагерь и аванпост, не больше max; разлом/кузня ждут свободного места", () => {
    const sim = new ArcadeSim("inv-1", { act: "full", composition: "all" });
    sim.step(IDLE_INPUT);
    expect(kinds(sim)).toEqual(["camp", "outpost"]);
    sim.tick = ARCADE.rift.fromTick.full + ARCADE.forge.fromTick.full; sim.step(IDLE_INPUT); quiet(sim);
    expect(sim.riftReady() && sim.forgeReady()).toBe(true);
    expect(optional(sim).length).toBe(MAX);
    expect(kinds(sim)).not.toContain("rift");
    sim.camp!.cleared = true;
    expect(kinds(sim)).toEqual(["outpost", "rift"]);
  });

  it("срочное впереди: караван ждёт и торговец вытесняют базовые цели; пруд при порче — перед ними", () => {
    const sim = new ArcadeSim("inv-2", { act: "full", composition: "all" });
    sim.tick = ARCADE.caravan.at.full; sim.step(IDLE_INPUT); sim.step(IDLE_INPUT);
    expect(sim.caravan!.state).toBe("waiting");
    sim.shopkeeper.alive = false;
    expect(kinds(sim).filter((k) => k !== "contract")).toEqual(["caravan", "camp"]);
    sim.shopkeeper = { alive: true, x: 10, y: 10, until: 1e9, value: 0 };
    expect(optional(sim).map((i) => i.kind)).toEqual(["caravan", "shop"]);
    sim.player.curse = "withering";
    sim.caravan!.state = "gone"; sim.shopkeeper.alive = false;
    expect(optional(sim).map((i) => i.kind)).toEqual(["pond", "camp"]);
  });

  it("угрозы и выбранные цели всегда: охотник, контракт, лагерь в бою, аванпост с прогрессом, караван в пути — сверх лимита", () => {
    const sim = new ArcadeSim("inv-3", { act: "full", composition: "all" });
    sim.step(IDLE_INPUT);
    sim.camp!.engaged = true;
    sim.outpost!.progress = 10;
    sim.hunter = sim.centaur;
    const inv = sim.invitations();
    expect(inv.filter((i) => i.committed).map((i) => i.kind)).toEqual(["hunter", "camp", "outpost"]);
    expect(inv.find((i) => i.kind === "camp")!.label).toBe(String(ARCADE.camp.totems));
    expect(inv.find((i) => i.kind === "outpost")!.label).toMatch(/%$/);
    sim.tick = ARCADE.rift.fromTick.full; sim.step(IDLE_INPUT); quiet(sim);
    sim.camp!.engaged = true; // шаг снял агро (герой далеко) — возвращаем «в бою»
    expect(optional(sim).map((i) => i.kind)).toEqual(["rift"]); // базовые цели уже «выбраны», место свободно
  });

  it("после захвата аванпоста — обзор: все активные точки без лимита", () => {
    const sim = new ArcadeSim("inv-4", { act: "full", composition: "all" });
    sim.tick = ARCADE.rift.fromTick.full + ARCADE.forge.fromTick.full; sim.step(IDLE_INPUT);
    sim.outpost!.captured = true;
    sim.chest.alive = true;
    const k = kinds(sim);
    expect(k.length).toBeGreaterThan(MAX + 2);
    for (const want of ["camp", "rift", "forge", "grove", "barrow", "lair", "pond", "chest"]) expect(k).toContain(want);
  });
});
