import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, PICKUP_ACT } from "../src/game/arcade/types.ts";

// Порчи «Долг лавочнику» и «Кровавая охота» (T13.51): вторая и третья порчи поверх системы T13.43, не больше одной активной.
const C = ARCADE.curse;
const act = (n: number) => ({ ...IDLE_INPUT, act: n });
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.contractOpen ? act(5) : IDLE_INPUT); } };
/** Вскрыть проклятый сундук у ног с заданной порчей и взять предмет в сумку. */
function takeCursed(sim: ArcadeSim, curse: "withering" | "debt" | "bloodhunt", expectCurse = curse) {
  sim.chest = { alive: true, x: sim.player.x + 20, y: sim.player.y, until: sim.tick + sec(60), value: 1 };
  step(sim, 1);
  sim.step(act(PICKUP_ACT));
  expect(sim.lootCursed).toBe(true);
  sim.lootCurse = curse;
  sim.step(act(2));
  expect(sim.player.curse).toBe(expectCurse);
}

describe("порчи: долг и кровавая охота", () => {
  it("долг: сумма по минуте, доля дохода гасит его, выплатил — порча снята; пруд прощает", () => {
    const sim = new ArcadeSim("curse-1");
    step(sim, 5);
    takeCursed(sim, "debt");
    const debt = Math.round(C.debt.base + C.debt.perMin * sim.tick / 3600);
    expect(sim.player.debtLeft).toBe(debt);
    const gold0 = sim.player.gold;
    (sim as unknown as { gainGold(n: number): void }).gainGold(20);
    expect(sim.player.debtLeft).toBe(debt - Math.ceil(20 * C.debt.share));
    expect(sim.player.gold).toBe(gold0 + 20 - Math.ceil(20 * C.debt.share));
    (sim as unknown as { gainGold(n: number): void }).gainGold(10_000);
    expect(sim.player.debtLeft).toBe(0);
    expect(sim.player.curse).toBeNull();
    // Пруд прощает долг.
    const sim2 = new ArcadeSim("curse-2");
    step(sim2, 5);
    takeCursed(sim2, "debt");
    sim2.player.x = sim2.pond!.x + 10; sim2.player.y = sim2.pond!.y; step(sim2, 1);
    sim2.step(act(PICKUP_ACT)); sim2.step(act(2));
    expect(sim2.player.curse).toBeNull(); expect(sim2.player.debtLeft).toBe(0);
  });

  it("кровавая охота: ближайший чемпион покидает дом и идёт за героем куда угодно; его смерть снимает порчу; без чемпиона — увядание", () => {
    const sim = new ArcadeSim("curse-3");
    step(sim, 5);
    sim.camp!.nextGuardAt = 1e9;
    takeCursed(sim, "bloodhunt");
    const h = sim.hunter!;
    expect(h).toBeTruthy();
    expect(["centaur_warden", "troll_necromancer"]).toContain(h.kind.id);
    expect(sim.isDormant(h)).toBe(false);
    // Герой в противоположном углу от дома охотника — он всё равно приближается.
    sim.player.x = 300; sim.player.y = 300;
    const d0 = Math.hypot(h.x - 300, h.y - 300);
    for (let i = 0; i < sec(6); i++) { sim.player.x = 300; sim.player.y = 300; sim.player.hp = 1e6; sim.step(IDLE_INPUT); }
    expect(Math.hypot(h.x - 300, h.y - 300)).toBeLessThan(d0 - 200);
    sim.damageEnemy(h, 1e9, "hit");
    expect(sim.hunter).toBeNull();
    expect(sim.player.curse).toBeNull();
    // Без живых чемпионов Кровавая охота в пуле не появляется, а форс превращается в увядание.
    const sim2 = new ArcadeSim("curse-4");
    step(sim2, 5);
    sim2.centaur!.alive = false; sim2.centaur = null; sim2.necromancer!.alive = false; sim2.necromancer = null;
    for (let i = 0; i < 30; i++) expect((sim2 as unknown as { rollCurse(): string }).rollCurse()).not.toBe("bloodhunt");
    takeCursed(sim2, "bloodhunt", "withering"); // форс без чемпионов → увядание
  });

  it("не больше одной порчи: пока порча активна, проклятые сундуки не появляются; охота не предлагается при активном контракте", () => {
    const sim = new ArcadeSim("curse-5");
    step(sim, 5);
    takeCursed(sim, "withering");
    let cursedSeen = 0;
    for (let i = 0; i < 6; i++) {
      let guard = 0;
      while (!sim.chest.alive && guard++ < sec(200)) { sim.player.x = 1600; sim.player.y = 1600; step(sim, 1); }
      if (!sim.chest.alive) break;
      if (sim.chest.value === 1) cursedSeen++;
      sim.chest.alive = false; (sim as unknown as { nextChestAt: number }).nextChestAt = sim.tick + 1;
    }
    expect(cursedSeen).toBe(0);
    const sim2 = new ArcadeSim("curse-6");
    sim2.contract = { target: "centaur", reward: "weapon", done: false };
    for (let i = 0; i < 30; i++) expect((sim2 as unknown as { rollCurse(): string }).rollCurse()).not.toBe("bloodhunt");
    (sim2 as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim2.over?.lastCurse).toBeNull();
  });
});
