import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { MARK_IDS, emptyProgress, masteryTitle, recordProgress, type ArcadeHistoryEntry } from "../src/state/arcadeStore.ts";

// Контракт охоты (T13.50): один из двух чемпионов с объявленной наградой; выполнение — награда сверх обычной; пропуск без штрафа.
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.forgeOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); } };
const untilOffer = (sim: ArcadeSim) => { let g = 0; while (!sim.contractOpen && g++ < ARCADE.contract.at[sim.act] + 60) step(sim, 1); expect(sim.contractOpen).toBe(true); };

describe("контракт охоты", () => {
  it("предлагается один раз по расписанию: две разные цели из живых чемпионов, награды разные; мир стоит; пропуск без следа", () => {
    const sim = new ArcadeSim("contract-1", { act: "short" });
    untilOffer(sim);
    expect(sim.tick).toBe(ARCADE.contract.at.short);
    expect(sim.contractOffers).toHaveLength(2);
    expect(sim.contractOffers[0].target).not.toBe(sim.contractOffers[1].target);
    expect(sim.contractOffers[0].reward).not.toBe(sim.contractOffers[1].reward);
    const tick = sim.tick; sim.step(IDLE_INPUT); expect(sim.tick).toBe(tick);
    sim.step({ ...IDLE_INPUT, act: 5 });
    expect(sim.contractOpen).toBe(false); expect(sim.contract).toBeNull();
    step(sim, 120);
    expect(sim.contractOpen).toBe(false); // второго предложения нет
    expect(sim.contractHome()).toBeNull();
    // Меньше двух чемпионов — предложения нет.
    const sim2 = new ArcadeSim("contract-2", { act: "short" });
    sim2.centaur!.alive = false; sim2.centaur = null; sim2.necromancer!.alive = false; sim2.necromancer = null;
    step(sim2, ARCADE.contract.at.short + 30);
    expect(sim2.contractOpen).toBe(false);
  });

  it("принятый контракт помечает дом цели; убийство цели даёт объявленную награду и отметку; чужой чемпион — нет", () => {
    const sim = new ArcadeSim("contract-3", { act: "short" });
    untilOffer(sim);
    // Форсируем известную пару: Кентавр за оружие, Некромант за карту школы.
    sim.contractOffers = [{ target: "centaur", reward: "weapon" }, { target: "necro", reward: "school" }];
    sim.step({ ...IDLE_INPUT, act: 1 });
    expect(sim.contract).toEqual({ target: "centaur", reward: "weapon", done: false });
    expect(sim.contractHome()).toMatchObject({ x: sim.grove!.x, y: sim.grove!.y });
    // Чужой чемпион не закрывает контракт.
    sim.barrow!.engaged = true; sim.damageEnemy(sim.necromancer!, 1e9, "hit");
    expect(sim.contract!.done).toBe(false);
    if (sim.pending) sim.step({ ...IDLE_INPUT, choose: 0 });
    // Цель: будим и убиваем — оружие exotic сверх брони и сапог.
    sim.grove!.engaged = true;
    const loot0 = sim.groundLoot.length;
    sim.damageEnemy(sim.centaur!, 1e9, "hit");
    expect(sim.contract!.done).toBe(true);
    expect(sim.events.contracts).toBe(1);
    const slots = sim.groundLoot.slice(loot0).map((l) => l.item.slot).sort();
    expect(slots).toEqual(["armor", "boots", "weapon"]);
    expect(sim.contractHome()).toBeNull();
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.contractDone).toBe(true);
    // Награда «карта школы»: одна exotic-карта через pending.
    const sim3 = new ArcadeSim("contract-4", { act: "short" });
    untilOffer(sim3);
    sim3.contractOffers = [{ target: "necro", reward: "school" }, { target: "centaur", reward: "armor" }];
    sim3.step({ ...IDLE_INPUT, act: 1 });
    sim3.barrow!.engaged = true;
    sim3.damageEnemy(sim3.necromancer!, 1e9, "hit");
    expect(sim3.contract!.done).toBe(true);
    // Награда Некроманта (три карты Зверинца) идёт первой, карта контракта — в очереди.
    expect(sim3.pending).toHaveLength(3);
    sim3.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim3.pending).toHaveLength(1);
    expect(sim3.pending![0]).toMatchObject({ kind: "upgrade", rarity: "exotic" });
    // Отметка мастерства.
    const entry: ArcadeHistoryEntry = { seed: "s", outcome: "dead", seconds: 100, level: 5, kills: 50, gold: 10, schools: [], configVersion: "a", at: 1, hero: "axe", act: "short", rank: 0, contract: true };
    const p = recordProgress(emptyProgress(), entry);
    expect(p.perHero.axe.marks).toEqual(["contract"]);
    expect(MARK_IDS).toHaveLength(9);
    expect(masteryTitle([...MARK_IDS])).toBe("legend");
  });
});
