import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { CONTRACT_OATH_ACT, IDLE_INPUT } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS, type EnemyKind } from "../src/game/arcade/content/enemies.ts";
import type { Enemy } from "../src/game/arcade/types.ts";
import { MARK_IDS, emptyProgress, masteryTitle, recordProgress, type ArcadeHistoryEntry } from "../src/state/arcadeStore.ts";

// Контракт охоты (T13.50): один из двух чемпионов с объявленной наградой; выполнение — награда сверх обычной; пропуск без штрафа.
const step = (sim: ArcadeSim, n: number) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.forgeOpen ? { ...IDLE_INPUT, act: 5 } : IDLE_INPUT); } };
const spawn = (s: ArcadeSim, k: EnemyKind, x: number, y: number) => (s as unknown as { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy }).spawnEnemy(k, x, y);
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
    sim2.centaur!.alive = false; sim2.centaur = null; sim2.necromancer!.alive = false; sim2.necromancer = null; sim2.thunder!.alive = false; sim2.thunder = null;
    step(sim2, ARCADE.contract.at.short + 30);
    expect(sim2.contractOpen).toBe(false);
  });

  it("принятый контракт помечает дом цели; убийство цели даёт объявленную награду и отметку; чужой чемпион — нет", () => {
    const sim = new ArcadeSim("contract-3", { act: "short" });
    untilOffer(sim);
    // Форсируем известную пару: Кентавр за оружие, Некромант за карту школы.
    sim.contractOffers = [{ target: "centaur", reward: "weapon" }, { target: "necro", reward: "school" }];
    sim.step({ ...IDLE_INPUT, act: 1 });
    expect(sim.contract).toEqual({ target: "centaur", reward: "weapon", done: false, oath: false });
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
    expect(masteryTitle([...MARK_IDS])).toBe("legend");
  });

  it("выдачи не сливаются: при висящем выборе уровня награда чемпиона и карта контракта приходят отдельными экранами (T13.68)", () => {
    const sim = new ArcadeSim("audit-reward-queue", { act: "full", composition: "all" });
    sim.contract = { target: "necro", reward: "school", done: false };
    sim.barrow!.engaged = true;
    sim.pending = [{ kind: "ability", key: "q" }]; sim.pendingSource = "level";
    sim.damageEnemy(sim.necromancer!, 1e9, "hit");
    expect(sim.contract.done).toBe(true);
    sim.step({ ...IDLE_INPUT, choose: 0 });
    // Сначала выбор чемпиона (три карточки), потом отдельная карта контракта — не «одна из четырёх».
    expect(sim.pending?.length).toBe(3);
    expect(sim.pendingSource).toBe("camp");
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.pending?.length).toBe(1);
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.pending).toBeNull();
  });

  it("Клятва охотника: act 6/7 берёт цель с клятвой; пока цель жива — толпе меньше, цели больше; выполнил — +1 ранг умению (T13.72)", () => {
    const sim = new ArcadeSim("contract-1", { act: "short", composition: "all" });
    untilOffer(sim);
    const target = sim.contractOffers[0].target;
    sim.step({ ...IDLE_INPUT, act: 1 + CONTRACT_OATH_ACT });
    expect(sim.contractOpen).toBe(false);
    expect(sim.contract).toMatchObject({ target, oath: true, done: false });
    const O = ARCADE.contract.oath;
    // Урон по обычному врагу — ниже, по цели контракта — выше, по чужому чемпиону — как обычно.
    const kobold = spawn(sim, ENEMY_KINDS.kobold, sim.player.x + 400, sim.player.y);
    const hp0 = kobold.hp; sim.damageEnemy(kobold, 10, "zap");
    expect(hp0 - kobold.hp).toBeCloseTo(10 * O.trashMult, 5);
    const champ = target === "centaur" ? sim.centaur! : target === "necro" ? sim.necromancer! : target === "thunder" ? sim.thunder! : sim.defiler!;
    const other = target === "centaur" ? sim.necromancer! : sim.centaur!;
    // Спящие чемпионы урон не берут — будим все места.
    sim.barrow!.engaged = true; sim.grove!.engaged = true; sim.lair!.engaged = true; if (sim.camp) sim.camp.engaged = true;
    const ch0 = champ.hp; sim.damageEnemy(champ, 10, "zap");
    expect(ch0 - champ.hp).toBeCloseTo(10 * O.targetMult, 5);
    const ot0 = other.hp; sim.damageEnemy(other, 10, "zap");
    expect(ot0 - other.hp).toBeCloseTo(10, 5);
    // Выполнение: самому прокачанному из Q/W/E +1 ранг, множители сняты.
    const before = { ...sim.player.abilities };
    sim.damageEnemy(champ, 1e9, "hit");
    expect(sim.contract!.done).toBe(true);
    const sum = (a: typeof before) => a.q + a.w + a.e;
    expect(sum(sim.player.abilities)).toBe(sum(before) + 1);
    const k1 = kobold.alive ? kobold : spawn(sim, ENEMY_KINDS.kobold, sim.player.x + 400, sim.player.y);
    const h1 = k1.hp; sim.damageEnemy(k1, 10, "zap");
    expect(h1 - k1.hp).toBeCloseTo(10, 5);
    // Без клятвы (act 1) множителей нет.
    const plain = new ArcadeSim("contract-1", { act: "short", composition: "all" });
    untilOffer(plain);
    plain.step({ ...IDLE_INPUT, act: 1 });
    expect(plain.contract?.oath).toBe(false);
    const k2 = spawn(plain, ENEMY_KINDS.kobold, plain.player.x + 400, plain.player.y);
    const h2 = k2.hp; plain.damageEnemy(k2, 10, "zap");
    expect(h2 - k2.hp).toBeCloseTo(10, 5);
  });
});
