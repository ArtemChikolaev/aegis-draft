import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, PICKUP_ACT } from "../src/game/arcade/types.ts";
import { AFFIX_POOL, GEAR_SLOTS, affixMax, reforgeGear, rollGear, temperGear, type GearItem } from "../src/game/arcade/content/gear.ts";
import { Rng } from "../src/game/rng.ts";

// Древняя кузня (T13.52): один раз за забег — закалить, перековать или переплавить надетую вещь; остывает к поздней части акта.
const F = ARCADE.forge;
const act = (n: number) => ({ ...IDLE_INPUT, act: n });
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.contractOpen || sim.forgeOpen ? act(5) : IDLE_INPUT); } };
const atForge = (sim: ArcadeSim) => { sim.player.x = sim.forge!.x + 10; sim.player.y = sim.forge!.y; };

describe("древняя кузня", () => {
  it("закалить поднимает самый слабый аффикс до потолка; перековать меняет опциональные статы и хранит гарантированный", () => {
    const rng = new Rng("forge-gear");
    const item = rollGear(rng, 2, "exotic", "u1", "weapon");
    const t = temperGear(item);
    expect(t.forged).toBe(true);
    expect(t.affixes.length).toBe(item.affixes.length);
    let raised = 0;
    t.affixes.forEach((a, i) => { if (a.value !== item.affixes[i].value) { raised++; expect(a.value).toBe(affixMax(a.stat, item.tier, item.rarity)); expect(a.value).toBeGreaterThanOrEqual(item.affixes[i].value); } });
    expect(raised).toBeLessThanOrEqual(1);
    expect(t.affixes.every((a) => a.value <= affixMax(a.stat, item.tier, item.rarity))).toBe(true);
    const r = reforgeGear(new Rng("reforge"), item);
    expect(r.affixes.length).toBe(item.affixes.length);
    expect(r.affixes.filter((a) => AFFIX_POOL.weapon.guaranteed.includes(a.stat)).length).toBe(item.affixes.filter((a) => AFFIX_POOL.weapon.guaranteed.includes(a.stat)).length);
    for (const a of r.affixes) expect([...AFFIX_POOL.weapon.guaranteed, ...AFFIX_POOL.weapon.optional]).toContain(a.stat);
    expect(new Set(r.affixes.map((a) => a.stat)).size).toBe(r.affixes.length); // без дублей статов
  });

  it("стоит по seed вдали от других мест, не работает до времени акта, потом кнопка открывает выбор; одно использование, цена по минуте", () => {
    const sim = new ArcadeSim("forge-1", { act: "short" });
    for (const o of [sim.camp!, sim.outpost!, sim.pond!, sim.grove!, sim.barrow!]) expect(Math.hypot(sim.forge!.x - o.x, sim.forge!.y - o.y)).toBeGreaterThanOrEqual(F.minFromOthers - 60);
    expect(new ArcadeSim("forge-1", { act: "short" }).forge).toEqual(sim.forge);
    step(sim, 5);
    atForge(sim); step(sim, 1);
    expect(sim.nearForge).toBe(true);
    expect(sim.forgeReady()).toBe(false);
    sim.step(act(PICKUP_ACT));
    expect(sim.forgeOpen).toBe(false); // холодная
    sim.tick = F.fromTick.short; // «остыла»
    expect(sim.forgeReady()).toBe(true);
    sim.step(act(PICKUP_ACT));
    expect(sim.forgeOpen).toBe(true);
    const tick = sim.tick; sim.step(IDLE_INPUT); expect(sim.tick).toBe(tick); // мир стоит
    expect(sim.forgePrice("temper")).toBe(Math.round(F.temper.base + F.temper.perMin * sim.minutes));
    // Без надетой вещи выбрать нечего.
    sim.step(act(10)); expect(sim.forgeSlot).toBe(-1);
    sim.step(act(1)); expect(sim.forge!.used).toBe(false);
    // Надеваем оружие, выбираем, закаляем.
    const weapon = rollGear(new Rng("w"), 1, "refined", "w1", "weapon");
    sim.player.gear.weapon = weapon; (sim as unknown as { recomputeStats(): void }).recomputeStats();
    sim.player.gold = 10_000;
    sim.step(act(10)); expect(sim.forgeSlot).toBe(0);
    const gold = sim.player.gold, price = sim.forgePrice("temper");
    sim.step(act(1));
    expect(sim.forge!.used).toBe(true);
    expect(sim.forgeOpen).toBe(false);
    expect(sim.player.gold).toBe(gold - price);
    const worn = sim.player.gear.weapon as GearItem;
    expect(worn.uid).toBe("w1"); expect(worn.forged).toBe(true);
    expect(sim.loot.some((l) => l.uid === "w1" && l.forged)).toBe(true);
    // Повторно не работает.
    step(sim, 1); expect(sim.nearForge).toBe(false);
    sim.step(act(PICKUP_ACT)); expect(sim.forgeOpen).toBe(false);
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.forged).toBe(true);
  });

  it("переплавить: вещь становится предметом другого (сначала пустого) слота той же редкости и тира; старое из целевого слота — в сумку", () => {
    const sim = new ArcadeSim("forge-2", { act: "short" });
    step(sim, 5);
    sim.tick = F.fromTick.short;
    sim.player.gold = 10_000;
    const helm = rollGear(new Rng("h"), 2, "exotic", "h1", "helm");
    sim.player.gear.helm = helm;
    atForge(sim); step(sim, 1); if (sim.contractOpen) sim.step(act(5)); // на 4:30 уже висит контракт — закрываем
    sim.step(act(PICKUP_ACT));
    expect(sim.forgeOpen).toBe(true);
    sim.step(act(10 + GEAR_SLOTS.indexOf("helm"))); sim.step(act(3));
    expect(sim.player.gear.helm).toBeUndefined();
    const made = GEAR_SLOTS.map((s) => sim.player.gear[s] as GearItem | undefined).find((g) => g?.forged)!;
    expect(made).toBeTruthy();
    expect(made.slot).not.toBe("helm");
    expect(made.rarity).toBe("exotic"); expect(made.tier).toBe(2);
    expect(sim.loot.some((l) => l.uid === made.uid)).toBe(true);
    expect(sim.loot.some((l) => l.uid === "h1")).toBe(false);
    // Пожертвовать нечем: без денег действие не проходит.
    const sim2 = new ArcadeSim("forge-3", { act: "short" });
    sim2.tick = F.fromTick.short; sim2.player.gold = 0;
    sim2.player.gear.ring = rollGear(new Rng("r"), 1, "standard", "r1", "ring");
    atForge(sim2); step(sim2, 1); if (sim2.contractOpen) sim2.step(act(5));
    sim2.step(act(PICKUP_ACT)); sim2.step(act(10 + GEAR_SLOTS.indexOf("ring"))); sim2.step(act(2));
    expect(sim2.forge!.used).toBe(false);
    expect((sim2.player.gear.ring as GearItem).forged).toBeUndefined();
  });
});
