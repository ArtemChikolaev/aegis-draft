import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ARCADE_ITEM_BY_ID, ITEM_PRICE_MULT } from "../src/game/arcade/content/items.ts";
import { IDLE_INPUT, SHOP_ACT } from "../src/game/arcade/types.ts";

// Поздние лавки (T20.4): окна Secret Shop на 11:00 и 16:30 в полных актах и подъём редкости своего предмета за золото —
// раньше после 6:00 золоту было некуда деться, а подъём давал только подарок каравана.
type Priv = { shopIdx: number; roshanIdx: number; openShop(): void };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const act = (sim: ArcadeSim, a: number) => sim.step({ ...IDLE_INPUT, act: a });

function shopWith(items: { id: string; rarity: "standard" | "refined" | "exotic" | "arcana" }[], gold: number): ArcadeSim {
  const sim = new ArcadeSim("late-shop", { act: "full" });
  for (const e of sim.enemies) e.alive = false;
  sim.player.items.push(...items);
  sim.player.gold = gold;
  priv(sim).openShop();
  return sim;
}

describe("поздние лавки", () => {
  it("в полном акте торговец приходит и на 11:00, и на 16:30", () => {
    expect(ARCADE.shop.at).toEqual([sec(180), sec(360), sec(660), sec(990)]);
    for (const [idx, at] of [[2, 660], [3, 990]] as const) {
      const sim = new ArcadeSim(`late-shop-${idx}`, { act: "full" });
      for (const e of sim.enemies) e.alive = false;
      priv(sim).shopIdx = idx;
      priv(sim).roshanIdx = 99; // живой Рошан глушит расписание леса и лавки — здесь он не нужен
      sim.tick = sec(at);
      sim.step(IDLE_INPUT);
      expect(sim.shopkeeper.alive, `окно ${at} с`).toBe(true);
    }
  });

  it("подъём редкости за золото: разница цен ступеней × наценка; редкость растёт, золото уходит", () => {
    const sim = shopWith([{ id: "desolator", rarity: "standard" }], 1000);
    const price = sim.shopUpgradePrice(0)!;
    expect(price).toBe(Math.round(ARCADE_ITEM_BY_ID.desolator.price * (ITEM_PRICE_MULT.refined - ITEM_PRICE_MULT.standard) * ARCADE.shop.upgradeMarkup));
    act(sim, SHOP_ACT.upgradeBase);
    expect(sim.player.items[0].rarity).toBe("refined");
    expect(sim.player.gold).toBe(1000 - price);
  });

  it("выше arcana некуда, а без золота подъём не проходит", () => {
    const top = shopWith([{ id: "desolator", rarity: "arcana" }], 5000);
    expect(top.shopUpgradePrice(0)).toBeNull();
    act(top, SHOP_ACT.upgradeBase);
    expect(top.player.gold).toBe(5000);
    const poor = shopWith([{ id: "heart", rarity: "exotic" }], 10);
    act(poor, SHOP_ACT.upgradeBase);
    expect(poor.player.items[0].rarity).toBe("exotic");
    expect(poor.player.gold).toBe(10);
  });
});
