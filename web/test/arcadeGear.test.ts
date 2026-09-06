import { describe, expect, it } from "vitest";
import { Rng } from "../src/game/rng.ts";
import { GEAR_BASES, GEAR_SLOTS, UNIQUES, gearEffect, gearScore, rollGear, uniqueGear } from "../src/game/arcade/content/gear.ts";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, SHOP_ACT } from "../src/game/arcade/types.ts";
import { decodeReplay, encodeReplay } from "../src/game/arcade/replay.ts";
import { useArcade } from "../src/state/arcadeStore.ts";

describe("arcade gear", () => {
  it("бросок детерминирован, аффиксов — по редкости, слот и база согласованы", () => {
    const a = rollGear(new Rng("g1"), 2, "exotic", "u1");
    const b = rollGear(new Rng("g1"), 2, "exotic", "u1");
    expect(a).toEqual(b);
    expect(a.affixes.length).toBe(3);
    expect(rollGear(new Rng("g2"), 1, "standard", "u2").affixes.length).toBe(1);
    for (const slot of GEAR_SLOTS) expect(rollGear(new Rng(`g-${slot}`), 1, "refined", "u", slot).slot).toBe(slot);
    const t1 = rollGear(new Rng("t"), 1, "standard", "a", "weapon"), t3 = rollGear(new Rng("t"), 3, "standard", "b", "weapon");
    expect(gearScore(t3)).toBeGreaterThan(gearScore(t1));
    expect(gearEffect(uniqueGear("heart_of_the_ancient", "h", 3)).maxHp).toBe(400);
  });

  it("надетое на старте усиливает статы; Aegis of the Immortal даёт воскрешение", () => {
    const plain = new ArcadeSim("gear-1");
    const armed = new ArcadeSim("gear-1", { gear: [uniqueGear("heart_of_the_ancient", "h", 3), uniqueGear("aegis_of_the_immortal", "a", 3)] });
    expect(armed.player.stats.maxHp).toBe(plain.player.stats.maxHp + 400 + 150);
    expect(armed.player.aegis).toBe(true);
    expect(plain.player.aegis).toBe(false);
  });

  it("сундук открывает экран добычи (мир стоит), «надеть» меняет статы, «в сумку» кладёт в сумку", () => {
    const sim = new ArcadeSim("chest-1");
    // Цикл ограничен числом итераций, а не только тиком: экран добычи (lootOpen) и конец забега тик не двигают —
    // на f2f875d такой `while` завис в CI на 6 часов (2026-09-06). Чужой лут — в сумку, чтобы мир шёл дальше.
    for (let i = 0; i < sec(200) * 2 && !sim.chest.alive && sim.tick < sec(200) && !sim.over; i++) {
      sim.player.hp = 1e6;
      sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.lootOpen ? { ...IDLE_INPUT, act: 2 } : sim.shopOpen || sim.neutralOpen ? { ...IDLE_INPUT, act: SHOP_ACT.close } : IDLE_INPUT);
    }
    expect(sim.chest.alive).toBe(true);
    sim.player.x = sim.chest.x; sim.player.y = sim.chest.y;
    sim.step(IDLE_INPUT);
    expect(sim.lootOpen).not.toBeNull();
    const tick = sim.tick;
    sim.step(IDLE_INPUT);
    expect(sim.tick).toBe(tick);
    const item = sim.lootOpen!;
    const before = JSON.stringify(sim.player.stats);
    sim.step({ ...IDLE_INPUT, act: 1 });
    expect(sim.lootOpen).toBeNull();
    expect(sim.player.gear[item.slot]?.uid).toBe(item.uid);
    expect(JSON.stringify(sim.player.stats)).not.toBe(before);
    expect(sim.loot).toContain(item);
    // Второй предмет — в сумку.
    sim.lootOpen = { ...item, uid: "x2" };
    sim.step({ ...IDLE_INPUT, act: 2 });
    expect(sim.player.bag.length).toBe(1);
    expect(ARCADE.loot.bagCap).toBeGreaterThan(1);
  });

  it("реплей несёт экипировку старта", () => {
    const gear = [uniqueGear("tormentors_shard", "ts", 2)];
    const sim = new ArcadeSim("rep-gear", { gear });
    for (let i = 0; i < sec(30); i++) sim.step(IDLE_INPUT);
    const code = encodeReplay({ seed: sim.seed, hero: sim.hero.id, rank: 0, act: sim.act, version: "v", log: sim.log, gear });
    const rep = decodeReplay(code)!;
    expect(rep.gear).toEqual(gear);
    const replayed = ArcadeSim.replay(rep.seed, rep.log, sim.steps, { hero: rep.hero, rank: rep.rank, act: rep.act, gear: rep.gear });
    expect(replayed.digest()).toBe(sim.digest());
  });

  it("стор: экип, снятие, разбор в осколки", () => {
    const item = rollGear(new Rng("s"), 1, "refined", "st1", "helm");
    useArcade.setState({ gear: { items: [item], equipped: {} }, cosmetics: { owned: [], equipped: {}, shards: 0 } });
    useArcade.getState().equipGear("helm", "st1");
    expect(useArcade.getState().gear.equipped.helm).toBe("st1");
    useArcade.getState().equipGear("weapon", "st1"); // не тот слот — игнор
    expect(useArcade.getState().gear.equipped.weapon).toBeUndefined();
    useArcade.getState().salvageGear("st1");
    expect(useArcade.getState().gear.items.length).toBe(0);
    expect(useArcade.getState().gear.equipped.helm).toBeUndefined();
    expect(useArcade.getState().cosmetics.shards).toBe(8);
  });
});

describe("контент экипировки (T13.14, партия 2)", () => {
  it("у каждой базы и уникального есть локальная иконка и строки RU+EN", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const core = readFileSync(new URL("../src/i18n/core.ts", import.meta.url), "utf8");
    const check = (id: string, art: string) => {
      expect(existsSync(new URL(`../public/art/items_px/${art}.png`, import.meta.url)), `иконка ${art}`).toBe(true);
      expect((core.match(new RegExp(`"arcade.gearName.${id}"`, "g")) ?? []).length, `строки ${id}`).toBe(2);
    };
    for (const b of GEAR_BASES) check(b.id, b.art);
    for (const u of Object.values(UNIQUES)) check(u.base, u.art);
    expect(GEAR_BASES.length).toBeGreaterThanOrEqual(34);
    expect(Object.keys(UNIQUES).length).toBeGreaterThanOrEqual(6);
  });

  it("на каждом слоте есть база первого тира — иначе ранний лут не соберётся", () => {
    for (const slot of GEAR_SLOTS) {
      expect(GEAR_BASES.some((b) => b.slot === slot && b.minTier === 1), slot).toBe(true);
    }
  });
});
