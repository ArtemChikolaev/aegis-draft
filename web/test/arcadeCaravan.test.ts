import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, SHOP_ACT } from "../src/game/arcade/types.ts";
import { ARCADE_ITEM_BY_ID, ITEM_PRICE_MULT } from "../src/game/arcade/content/items.ts";

// Караван лавочника (T13.59): ждёт героя, едет только под сопровождением, зовёт налёты, доехал — лавка на месте цели.
const C = ARCADE.caravan;
const act = (n: number) => ({ ...IDLE_INPUT, act: n });
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.contractOpen || sim.forgeOpen || sim.riftOpen ? act(5) : IDLE_INPUT); } };
/** Перевести часы акта к появлению каравана. */
const warp = (sim: ArcadeSim) => { sim.tick = C.at[sim.act]; step(sim, 1); };
/** Идти рядом с повозкой; после прибытия — стоп, иначе касание торговца откроет лавку, а `step` её закроет (торговец уйдёт). */
const follow = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over && sim.caravan!.state !== "arrived"; i++) { const c = sim.caravan!; sim.player.x = c.x + 20; sim.player.y = c.y; step(sim, 1); } };

describe("караван лавочника", () => {
  it("путь по seed: старт вдали от других мест, длина около length, детерминирован; скрыт до часов акта, потом ждёт", () => {
    for (const a of ["short", "full", "dire", "river"] as const) {
      const sim = new ArcadeSim("caravan-1", { act: a, composition: "all" });
      const c = sim.caravan!;
      for (const o of [sim.camp!, sim.outpost!, sim.pond!, sim.grove!, sim.barrow!, sim.forge!, sim.rift!]) expect(Math.hypot(c.sx - o.x, c.sy - o.y), a).toBeGreaterThanOrEqual(C.minFromOthers - 60);
      const length = Math.hypot(c.ex - c.sx, c.ey - c.sy);
      expect(length, a).toBeGreaterThan(C.length * 0.5);
      expect(length, a).toBeLessThanOrEqual(C.length + 40);
      expect(new ArcadeSim("caravan-1", { act: a, composition: "all" }).caravan).toEqual(c);
      expect(c.state).toBe("hidden");
    }
    const sim = new ArcadeSim("caravan-1", { act: "short" });
    step(sim, sec(2));
    expect(sim.caravan!.state).toBe("hidden");
    warp(sim);
    expect(sim.caravan!.state).toBe("waiting");
    expect(sim.caravan!.leaveAt).toBe(sim.tick + C.window);
  });

  it("без героя рядом стоит; рядом — едет со скоростью speed и зовёт налёты; герой отошёл — снова ждёт", () => {
    const sim = new ArcadeSim("caravan-2", { act: "short" });
    warp(sim);
    const c = sim.caravan!;
    sim.player.x = c.sx + C.escortRadius + 200; sim.player.y = c.sy;
    step(sim, sec(3));
    expect([c.x, c.y]).toEqual([c.sx, c.sy]);
    expect(c.state).toBe("waiting");
    expect(sim.playerEscorting()).toBe(false);
    const alive0 = sim.aliveEnemies();
    follow(sim, sec(2));
    expect(c.state).toBe("moving");
    expect(sim.playerEscorting()).toBe(true);
    const moved = Math.hypot(c.x - c.sx, c.y - c.sy);
    expect(moved).toBeGreaterThan(C.speed * 2 * 0.9);
    expect(moved).toBeLessThan(C.speed * 2 * 1.1);
    expect(sim.caravanProgress()).toBeGreaterThan(0.1);
    expect(c.raids).toBeGreaterThanOrEqual(1);
    expect(sim.aliveEnemies()).toBeGreaterThanOrEqual(alive0 + C.raidSize - 2); // налётчики (часть могла уже пасть)
    sim.player.x = c.x + C.escortRadius + 100; sim.player.y = c.y;
    const [x1, y1] = [c.x, c.y];
    step(sim, sec(2));
    expect(c.state).toBe("waiting");
    expect([c.x, c.y]).toEqual([x1, y1]);
  });

  it("доехал — торговец на месте цели, лавка открывается касанием, итог и счётчик помнят; дважды не едет", () => {
    const sim = new ArcadeSim("caravan-3", { act: "short" });
    warp(sim);
    const c = sim.caravan!;
    sim.shopkeeper.alive = false;
    follow(sim, sec(15));
    expect(c.state).toBe("arrived");
    expect([Math.round(c.x), Math.round(c.y)]).toEqual([Math.round(c.ex), Math.round(c.ey)]);
    expect(sim.caravanProgress()).toBe(1);
    expect(sim.events.caravans).toBe(1);
    expect(sim.shopkeeper.alive).toBe(true);
    expect([sim.shopkeeper.x, sim.shopkeeper.y]).toEqual([c.ex, c.ey]);
    sim.player.x = c.ex + 10; sim.player.y = c.ey;
    while (sim.pending) sim.step({ ...IDLE_INPUT, choose: 0 });
    sim.step(IDLE_INPUT); sim.step(IDLE_INPUT);
    expect(sim.shopOpen).toBe(true);
    expect(sim.shopOffers.length).toBe(ARCADE.shop.offers);
    // Лавка каравана — со скидкой на товары и реролл (владелец 2026-09-11); плановый торговец — по полной цене.
    expect(sim.shopPriceMult()).toBe(C.discount);
    for (const o of sim.shopOffers) expect(o.price).toBe(Math.round(ARCADE_ITEM_BY_ID[o.id].price * ITEM_PRICE_MULT[o.rarity] * C.discount));
    expect(sim.shopRerollPrice()).toBe(Math.round(ARCADE.shop.rerollBase * C.discount));
    const plain = new ArcadeSim("caravan-3", { act: "short" });
    plain.shopkeeper = { alive: true, x: plain.player.x + 10, y: plain.player.y, until: 1e9, value: 0 };
    plain.step(IDLE_INPUT); plain.step(IDLE_INPUT);
    expect(plain.shopOpen).toBe(true); expect(plain.shopPriceMult()).toBe(1);
    for (const o of plain.shopOffers) expect(o.price).toBe(Math.round(ARCADE_ITEM_BY_ID[o.id].price * ITEM_PRICE_MULT[o.rarity]));
    sim.step(act(5));
    expect(sim.shopOpen).toBe(false);
    expect(sim.shopkeeper.alive).toBe(false);
    expect(sim.playerEscorting()).toBe(false);
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.caravanDone).toBe(true);
  });

  it("не дождался за window — уходит без лавки; в разломе караван стоит; детерминизм", () => {
    const sim = new ArcadeSim("caravan-4", { act: "short" });
    warp(sim);
    sim.player.x = sim.caravan!.sx + 600; sim.player.y = sim.caravan!.sy;
    step(sim, C.window + sec(2)); // окна (контракт, лавка, уровни) съедают шаги без тика
    expect(sim.caravan!.state).toBe("gone");
    expect(sim.shopkeeper.alive === true && sim.shopkeeper.x === sim.caravan!.ex).toBe(false);
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.caravanDone).toBe(false);
    const run = () => { const x = new ArcadeSim("caravan-5", { act: "short" }); warp(x); follow(x, sec(6)); return x.digest(); };
    expect(run()).toBe(run());
  });

  it("везёт объявленное семейство: лавка каравана торгует только им, первый товар — подарок, или подъём редкости своего предмета (T13.71)", () => {
    const sim = new ArcadeSim("caravan-3", { act: "short" });
    const c = sim.caravan!;
    expect(["offense", "defense", "utility"]).toContain(c.family);
    expect(new ArcadeSim("caravan-3", { act: "short" }).caravan!.family).toBe(c.family);
    warp(sim);
    sim.shopkeeper.alive = false;
    follow(sim, sec(15));
    expect(c.state).toBe("arrived");
    expect(sim.caravanGift).toBe(true);
    sim.player.x = c.ex + 10; sim.player.y = c.ey;
    while (sim.pending) sim.step({ ...IDLE_INPUT, choose: 0 });
    sim.step(IDLE_INPUT); sim.step(IDLE_INPUT);
    expect(sim.shopOpen).toBe(true);
    expect(sim.caravanGiftAvailable()).toBe(true);
    for (const o of sim.shopOffers) expect(ARCADE_ITEM_BY_ID[o.id].family).toBe(c.family);
    expect(sim.shopBuyPrice(0)).toBe(0);
    sim.player.gold = 0;
    const gift = sim.shopOffers[0];
    sim.step(act(1));
    expect(sim.player.items.map((it) => it.id)).toEqual([gift.id]);
    expect(sim.player.gold).toBe(0);
    expect(sim.caravanGiftAvailable()).toBe(false);
    expect(sim.shopBuyPrice(0)).toBe(sim.shopOffers[0]?.price ?? 0);
    // Второй вариант подарка: подъём редкости своего предмета вместо товара.
    const up = new ArcadeSim("caravan-3", { act: "short" });
    warp(up); up.shopkeeper.alive = false; follow(up, sec(15));
    up.player.items.push({ id: "desolator", rarity: "standard" });
    up.player.x = up.caravan!.ex + 10; up.player.y = up.caravan!.ey;
    while (up.pending) up.step({ ...IDLE_INPUT, choose: 0 });
    up.step(IDLE_INPUT); up.step(IDLE_INPUT);
    expect(up.shopOpen).toBe(true);
    up.step(act(SHOP_ACT.upgradeBase));
    expect(up.player.items[0].rarity).toBe("refined");
    expect(up.caravanGiftAvailable()).toBe(false);
    up.step(act(SHOP_ACT.upgradeBase));
    expect(up.player.items[0].rarity).toBe("refined");
    // Плановый торговец подарка не даёт и торгует всем.
    const plain = new ArcadeSim("caravan-3", { act: "short" });
    plain.shopkeeper = { alive: true, x: plain.player.x + 10, y: plain.player.y, until: 1e9, value: 0 };
    plain.step(IDLE_INPUT); plain.step(IDLE_INPUT);
    expect(plain.shopOpen).toBe(true);
    expect(plain.caravanGiftAvailable()).toBe(false);
    expect(plain.shopBuyPrice(0)).toBe(plain.shopOffers[0].price);
  });
});
