import { describe, expect, it } from "vitest";
import { ArcadeSim, type ArcadeModal } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT, SHOP_ACT } from "../src/game/arcade/types.ts";
import { botInput } from "../scripts/sim_arcade.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { rollGear } from "../src/game/arcade/content/gear.ts";
import { Rng } from "../src/game/rng.ts";

// Окна держат мир на паузе: пока бот отвечает «не тому» окну или действием, которого окно не понимает, тик стоит и
// headless-прогон крутится вечно (аудит 2026-09-19). Порядок окон — один на сим и бота: `sim.activeModal()`.

/** Бот крутит сим, пока открыто окно; потолок шагов — чтобы красный тест падал, а не висел. */
const driveUntilWorldMoves = (sim: ArcadeSim, maxSteps = 200): number => {
  const tick0 = sim.tick;
  let steps = 0;
  while (sim.tick === tick0 && !sim.over && steps++ < maxSteps) sim.step(botInput(sim));
  return steps;
};

describe("окна сима и бот", () => {
  it("activeModal: порядок pending → shop → neutral → loot → pond → contract → forge → rift → build, и step слушает именно его", () => {
    const sim = new ArcadeSim("modal-order");
    expect(sim.activeModal()).toBeNull();
    const open: [ArcadeModal, () => void][] = [
      ["build", () => { sim.buildOpen = true; }],
      ["rift", () => { sim.riftOpen = true; }],
      ["forge", () => { sim.forgeOpen = true; }],
      ["contract", () => { sim.contractOpen = true; }],
      ["pond", () => { sim.pondOpen = true; }],
      ["neutral", () => { sim.neutralOpen = true; }],
      ["shop", () => { sim.shopOpen = true; }],
    ];
    // Открываем с конца порядка: каждое следующее окно перекрывает предыдущие.
    for (const [name, set] of open) { set(); expect(sim.activeModal()).toBe(name); }
    // «Закрыть» уходит верхнему окну (лавке), а не токену под ней.
    const tick0 = sim.tick;
    sim.step({ ...IDLE_INPUT, act: SHOP_ACT.close });
    expect(sim.shopOpen).toBe(false);
    expect(sim.neutralOpen).toBe(true);
    expect(sim.activeModal()).toBe("neutral");
    expect(sim.tick).toBe(tick0);
  });

  it("бот: лавка и токен открыты сразу — закрывает оба, мир идёт дальше", () => {
    const sim = new ArcadeSim("bot-shop-neutral");
    sim.shopOpen = true; sim.shopOffers = [];
    sim.neutralOpen = true; sim.neutralOffers = [];
    const steps = driveUntilWorldMoves(sim);
    expect(sim.activeModal()).toBeNull();
    expect(steps).toBeLessThan(20);
    expect(sim.tick).toBeGreaterThan(0);
  });

  it("бот: заражённый пруд порчу не снимает — бот не шлёт «снять порчу» вечно, а лечится или уходит", () => {
    const sim = new ArcadeSim("bot-tainted-pond", { act: "full", composition: "wilds" });
    expect(sim.pondTainted()).toBe(true);
    sim.player.curse = "withering";
    sim.pondOpen = true;
    const steps = driveUntilWorldMoves(sim);
    expect(sim.pondOpen).toBe(false);
    expect(steps).toBeLessThan(20);
    expect(sim.player.curse).toBe("withering"); // пруд заражён — порча осталась
  });

  it("бот не считает спящего чемпиона ни угрозой, ни целью: рядом только он — бот стоит, проснулся — идёт к нему", () => {
    const sim = new ArcadeSim("bot-dormant", { composition: "all" });
    const s = sim.centaur!, p = sim.player;
    for (const e of sim.enemies) if (e.alive && e !== s) e.alive = false;
    for (const sh of sim.shards) sh.alive = false;
    s.x = p.x + 200; s.y = p.y;
    expect(sim.isDormant(s)).toBe(true);
    expect(botInput(sim)).toMatchObject({ mx: 0, my: 0 });
    sim.grove!.engaged = true;
    expect(botInput(sim).mx).toBeGreaterThan(0);
  });

  it("ненужную добычу бот открывает один раз: не лучше надетой и сумка полна — оставил и больше не подбирает", () => {
    const sim = new ArcadeSim("bot-loot-decline");
    const p = sim.player;
    for (const e of sim.enemies) if (e.alive) e.alive = false;
    const rng = new Rng("bot-loot-decline:gear");
    // Надето сильное оружие, сумка забита, у ног — слабое того же слота.
    p.gear.weapon = rollGear(rng, 3, "arcana", "w-strong", "weapon");
    while (p.bag.length < ARCADE.loot.bagCap) p.bag.push(rollGear(rng, 1, "standard", `bag-${p.bag.length}`, "weapon"));
    const weak = rollGear(rng, 1, "standard", "w-weak", "weapon");
    sim.groundLoot.push({ x: p.x, y: p.y, item: weak, until: sim.tick + ARCADE.loot.lootLifetime });
    let opened = 0, wasOpen = false, steps = 0;
    while (sim.tick < 120 && !sim.over && steps++ < 2000) {
      p.hp = p.stats.maxHp;
      sim.step(botInput(sim));
      const open = sim.lootOpen === weak;
      if (open && !wasOpen) opened++;
      wasOpen = open;
    }
    expect(sim.tick).toBe(120);
    expect(opened).toBe(1); // было: «подобрать → оставить» каждые два тика (десятки раз за две секунды)
    expect(sim.groundLoot.some((g) => g.item === weak && g.until > 0)).toBe(true); // предмет по-прежнему лежит
  });
});
