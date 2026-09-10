import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT, PICKUP_ACT, RIFT_RULES, SHOP_ACT } from "../src/game/arcade/types.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { emptyProgress, recordProgress } from "../src/state/arcadeStore.ts";

// Разлом (T13.58): испытание по правилу, часы акта стоят, выход за кольцо — провал, выжил — усиленный апгрейд.
const R = ARCADE.rift;
const act = (n: number) => ({ ...IDLE_INPUT, act: n });
const step = (sim: ArcadeSim, n: number, heal = true) => { for (let i = 0; i < n && !sim.over; i++) { if (heal) sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.contractOpen || sim.forgeOpen || sim.riftOpen ? act(5) : IDLE_INPUT); } };
const atRift = (sim: ArcadeSim) => { sim.player.x = sim.rift!.x + 10; sim.player.y = sim.rift!.y; };
/** Прокрутить часы акта до открытия разлома без ожидания: `tick` = расписание, разлома ещё нет. */
const warp = (sim: ArcadeSim) => { const t = R.fromTick[sim.act]; sim.tick = t; step(sim, 1); };
const regular = (sim: ArcadeSim) => sim.enemies.filter((e) => e.alive && !e.kind.boss && !e.kind.structure && !e.kind.totem && !e.kind.elite).length;
/** Войти в разлом по правилу, не дожидаясь расписания. */
const enter = (sim: ArcadeSim, rule: (typeof RIFT_RULES)[number]) => { warp(sim); atRift(sim); step(sim, 1); sim.rift!.offered = [rule, sim.rift!.offered.find((r) => r !== rule)!]; sim.step(act(PICKUP_ACT)); expect(sim.riftOpen).toBe(true); sim.step(act(1)); expect(sim.rift!.state).toBe("active"); };

describe("разлом", () => {
  it("стоит по seed вдали от других мест, предлагает два разных правила, открывается по часам акта, кнопка рядом открывает выбор", () => {
    for (const a of ["short", "full", "dire", "river"] as const) {
      const sim = new ArcadeSim("rift-1", { act: a });
      const r = sim.rift!;
      for (const o of [sim.camp!, sim.outpost!, sim.pond!, sim.grove!, sim.barrow!, sim.forge!]) expect(Math.hypot(r.x - o.x, r.y - o.y), a).toBeGreaterThanOrEqual(R.minFromOthers - 60);
      expect(new ArcadeSim("rift-1", { act: a }).rift).toEqual(r);
      expect(r.offered.length).toBe(2);
      expect(r.offered[0]).not.toBe(r.offered[1]);
      for (const x of r.offered) expect(RIFT_RULES).toContain(x);
    }
    const sim = new ArcadeSim("rift-1", { act: "short" });
    step(sim, 5);
    atRift(sim); step(sim, 1);
    expect(sim.nearRift).toBe(true);
    expect(sim.riftReady()).toBe(false);
    sim.step(act(PICKUP_ACT));
    expect(sim.riftOpen).toBe(false); // рано
    warp(sim); atRift(sim); step(sim, 1);
    expect(sim.riftReady()).toBe(true);
    sim.step(act(PICKUP_ACT));
    expect(sim.riftOpen).toBe(true);
    const tick = sim.tick;
    sim.step(act(SHOP_ACT.close));
    expect(sim.riftOpen).toBe(false);
    expect(sim.tick).toBe(tick); // окно ставит мир на паузу
    expect(sim.rift!.state).toBe("idle");
  });

  it("вход: рядовые враги втянуты без награды, часы акта стоят, обычное расписание не идёт, разлом зовёт своих", () => {
    const sim = new ArcadeSim("rift-2", { act: "short" });
    warp(sim); atRift(sim); step(sim, 1);
    for (let i = 0; i < 6; i++) (sim as unknown as { spawnEnemy(k: unknown, x: number, y: number): unknown }).spawnEnemy(ENEMY_KINDS.kobold, sim.rift!.x + 500, sim.rift!.y);
    const kills = sim.player.kills, gold = sim.player.gold;
    expect(regular(sim)).toBeGreaterThanOrEqual(6);
    sim.rift!.offered = ["surge", "brittle"];
    sim.step(act(PICKUP_ACT)); sim.step(act(1));
    expect(sim.rift!.state).toBe("active");
    expect(sim.events.rifts).toBe(1);
    expect(regular(sim)).toBe(0);
    expect(sim.player.kills).toBe(kills); expect(sim.player.gold).toBe(gold);
    const actTick = sim.actTick, tick = sim.tick;
    step(sim, sec(5));
    expect(sim.tick).toBe(tick + sec(5));
    expect(sim.actTick).toBe(actTick); // часы стоят
    expect(sim.riftLeft()).toBe(R.duration - sec(5));
    expect(regular(sim)).toBeGreaterThan(0); // разлом зовёт лес
    // Рошан не приходит по реальному тику, только по часам акта: перевод «tick» за roshanAt внутри разлома его не вызывает.
    const sim2 = new ArcadeSim("rift-2b", { act: "short" });
    enter(sim2, "surge");
    const roshanAt = ARCADE.acts.short.roshanAt[0];
    sim2.pausedTicks = sim2.tick - roshanAt; // часы акта ровно на Рошане, но стоят
    step(sim2, sec(2));
    expect(sim2.actTick).toBe(roshanAt);
    expect(sim2.roshan).toBeNull();
  });

  it("правила: «Стекло» усиливает входящий урон и режет HP врагов; «Безмолвие» глушит умения и усиливает автоатаку; «Прилив» ускоряет; «Мгла» сжимает обзор", () => {
    const hit = (sim: ArcadeSim) => { sim.player.hp = sim.player.stats.maxHp; (sim as unknown as { damagePlayer(a: number): void }).damagePlayer(50); return sim.player.stats.maxHp - sim.player.hp; };
    const base = new ArcadeSim("rift-3", { act: "short" }); step(base, 2);
    const brittle = new ArcadeSim("rift-3", { act: "short" }); enter(brittle, "brittle");
    expect(hit(brittle)).toBeCloseTo(hit(base) * R.rules.brittle.takenMult, 3);
    step(brittle, sec(3));
    const woods = (x: ArcadeSim) => x.enemies.filter((e) => e.alive && !e.kind.elite && !e.kind.totem && !e.kind.structure && !e.kind.boss);
    const hpMults = woods(brittle).map((e) => e.maxHp / e.kind.hp);
    expect(hpMults.length).toBeGreaterThan(0);
    const plain = new ArcadeSim("rift-3", { act: "short" }); enter(plain, "surge"); step(plain, sec(3));
    const plainMults = woods(plain).map((e) => e.maxHp / e.kind.hp);
    expect(Math.max(...hpMults)).toBeLessThan(Math.min(...plainMults));
    expect(plain.riftSpeedMult()).toBe(R.rules.surge.speedMult);
    expect(brittle.riftSpeedMult()).toBe(1);
    const silence = new ArcadeSim("rift-3", { act: "short" }); enter(silence, "silence");
    expect(silence.riftSilenced()).toBe(true);
    expect(silence.riftAttackMult()).toBe(R.rules.silence.attackMult);
    const casts = silence.events.casts;
    for (let i = 0; i < sec(4); i++) { silence.player.hp = silence.player.stats.maxHp; silence.step({ ...IDLE_INPUT, cast: 15 }); }
    expect(silence.events.casts).toBe(casts);
    const gloom = new ArcadeSim("rift-3", { act: "short" }); enter(gloom, "gloom");
    expect(gloom.riftVisionMult()).toBe(R.rules.gloom.visionMult);
    expect(base.riftVisionMult()).toBe(1);
  });

  it("выход за кольцо — провал: без награды, разлом закрыт, передышка без спавна, потом часы идут", () => {
    const sim = new ArcadeSim("rift-4", { act: "short" });
    enter(sim, "surge");
    step(sim, sec(3));
    sim.player.x = sim.rift!.x + R.arena + 40; sim.player.y = sim.rift!.y;
    step(sim, 1);
    expect(sim.rift!.state).toBe("done");
    expect(sim.rift!.won).toBe(false);
    expect(sim.pending).toBeNull();
    expect(regular(sim)).toBe(0);
    expect(sim.respiteUntil).toBe(sim.tick + R.respite);
    const actTick = sim.actTick;
    step(sim, R.respite - 2);
    expect(regular(sim)).toBe(0); // тишина
    expect(sim.actTick).toBe(actTick + R.respite - 2); // часы снова идут
    step(sim, sec(12));
    expect(regular(sim)).toBeGreaterThan(0);
    expect(sim.riftReady()).toBe(false); expect(sim.nearRift).toBe(false);
    atRift(sim); step(sim, 1); sim.step(act(PICKUP_ACT));
    expect(sim.riftOpen).toBe(false); // второй раз не войти
  });

  it("выжил — один апгрейд редкости награды без реролла; итог и профиль помнят разлом; детерминизм", () => {
    const sim = new ArcadeSim("rift-5", { act: "short" });
    enter(sim, "brittle");
    let guard = 0;
    while (sim.rift!.state === "active" && guard++ < R.duration + 50) { sim.player.hp = sim.player.stats.maxHp; sim.player.x = sim.rift!.x; sim.player.y = sim.rift!.y; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : IDLE_INPUT); }
    expect(sim.rift!.state).toBe("done");
    while (sim.pending && sim.pendingSource === "level") sim.step({ ...IDLE_INPUT, choose: 0 }); // уровни за бой — награда разлома ждёт в очереди
    expect(sim.rift!.won).toBe(true);
    expect(sim.pending?.length).toBe(1);
    expect(sim.pending![0]).toMatchObject({ kind: "upgrade", rarity: R.rewardRarity });
    expect(sim.pendingSource).toBe("camp");
    expect(sim.respiteUntil).toBeGreaterThan(sim.tick);
    sim.step({ ...IDLE_INPUT, choose: 0 });
    expect(sim.pending).toBeNull();
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.riftDone).toBe(true);
    expect(sim.over?.riftRule).toBe("brittle");
    expect(sim.over?.tick).toBe(sim.actTick);
    const p = recordProgress(emptyProgress(), { seed: "s", outcome: "dead", seconds: 10, level: 3, kills: 1, gold: 0, schools: [], configVersion: "x", at: 0, hero: "juggernaut", act: "short", rift: true });
    expect(p.perHero.juggernaut.marks).toContain("rift");
    const run = () => { const x = new ArcadeSim("rift-6", { act: "short" }); enter(x, "surge"); step(x, sec(20)); return x.digest(); };
    expect(run()).toBe(run());
  });
});
