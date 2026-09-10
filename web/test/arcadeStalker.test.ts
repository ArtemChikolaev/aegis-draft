import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";

// Охотник Dire (T13.55, только Dire): скрыт, метка на будущей позиции героя, прыжок и удар, окно уязвимости.
const S = ARCADE.stalker;
const step = (sim: ArcadeSim, n: number, input = IDLE_INPUT) => { for (let i = 0; i < n && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(sim.pending ? { ...IDLE_INPUT, choose: 0 } : sim.shopOpen || sim.neutralOpen || sim.lootOpen || sim.pondOpen || sim.contractOpen || sim.forgeOpen ? { ...IDLE_INPUT, act: 5 } : input); } };
const quiet = (sim: ArcadeSim) => { for (const e of sim.enemies) if (e.alive && e !== sim.stalker && !e.kind.totem) e.alive = false; sim.defiler = null; sim.centaur = null; sim.necromancer = null; sim.thunder = null; sim.camp!.nextGuardAt = 1e9; };

describe("Охотник Dire", () => {
  it("есть только в Dire; скрыт — не цель и неуязвим; в угодьях ставит метку по направлению движения и бьёт по ней; стоящего — под ноги", () => {
    expect(new ArcadeSim("den-1", { act: "full" }).den).toBeNull();
    const sim = new ArcadeSim("den-1", { act: "dire" });
    expect(new ArcadeSim("den-1", { act: "dire" }).den).toEqual(sim.den);
    quiet(sim);
    const st = sim.stalker!, den = sim.den!;
    expect(sim.stalkerHidden()).toBe(true); expect(sim.isDormant(st)).toBe(true);
    const hp = st.hp; sim.damageEnemy(st, 100, "hit"); expect(st.hp).toBe(hp);
    expect(sim.nearestEnemy(st.x, st.y, 50)).toBeNull();
    // Герой стоит в угодьях: метка под ноги, звук-счётчик, удар после телеграфа.
    sim.player.x = den.x + 200; sim.player.y = den.y;
    step(sim, 2);
    expect(sim.playerAtDen()).toBe(true);
    expect(den.markUntil).toBeGreaterThan(0);
    expect(sim.events.ambushes).toBe(1);
    expect(Math.hypot(den.markX - sim.player.x, den.markY - sim.player.y)).toBeLessThan(S.leadSec * sim.player.stats.speed + 1);
    const h0 = sim.events.hurt;
    step(sim, S.telegraph + 1);
    expect(sim.events.hurt).toBeGreaterThanOrEqual(h0 + 1); // удар с прыжка; появившись вплотную, может добавить контакт
    expect(sim.stalkerHidden()).toBe(false); // открыт после прыжка
    expect(Math.hypot(st.x - den.markX, st.y - den.markY)).toBeLessThan(120);
    step(sim, sec(S.exposedSec) + 2);
    expect(sim.stalkerHidden()).toBe(true); // снова скрыт
  });

  it("метка ставится вперёд по движению: идущий дальше по курсу попадает, свернувший — нет; в окне уязвимости берёт урон", () => {
    const sim = new ArcadeSim("den-2", { act: "dire" });
    quiet(sim);
    const den = sim.den!;
    sim.player.x = den.x + 120; sim.player.y = den.y;
    // Идём вправо: метка справа от героя.
    step(sim, 3, { ...IDLE_INPUT, mx: 16, my: 0 });
    expect(den.markUntil).toBeGreaterThan(0);
    expect(den.markX).toBeGreaterThan(sim.player.x + 20);
    // Резко уходим вниз — удар мимо.
    const h0 = sim.events.hurt;
    step(sim, S.telegraph + 2, { ...IDLE_INPUT, mx: 0, my: 16 });
    expect(sim.events.hurt).toBe(h0);
    // Открыт: урон проходит, добиваем — награда: карты attack и passive/power exotic.
    expect(sim.stalkerHidden()).toBe(false);
    const st = sim.stalker!;
    const hp = st.hp; sim.damageEnemy(st, 100, "hit"); expect(st.hp).toBeLessThan(hp);
    sim.damageEnemy(st, 1e9, "hit");
    expect(sim.stalker).toBeNull();
    expect(sim.pending).toHaveLength(2);
    const ids = sim.pending!.map((o) => (o.kind === "upgrade" ? o.id : ""));
    expect(sim.pending!.every((o) => o.kind === "upgrade" && o.rarity === "exotic")).toBe(true);
    expect(new Set(ids).size).toBe(2);
    (sim as unknown as { finish(o: "dead"): void }).finish("dead");
    expect(sim.over?.stalkerSlain).toBe(true);
  });

  it("вне угодий возвращается в логово и лечится, метка снята; цель контракта; Кровавая охота делает его видимым", () => {
    const sim = new ArcadeSim("den-3", { act: "dire" });
    quiet(sim);
    const st = sim.stalker!, den = sim.den!;
    sim.player.x = den.x + 200; sim.player.y = den.y; step(sim, 2);
    expect(den.markUntil).toBeGreaterThan(0);
    st.hp = st.maxHp * 0.5;
    sim.player.x = den.x + S.leash + 300; sim.player.y = den.y; step(sim, sec(2));
    expect(sim.playerAtDen()).toBe(false);
    expect(den.markUntil).toBe(0);
    expect(st.hp).toBeGreaterThan(st.maxHp * 0.5);
    expect((sim as unknown as { contractTargets(): string[] }).contractTargets()).toContain("stalker");
    sim.hunter = st;
    expect(sim.stalkerHidden()).toBe(false);
    expect(sim.isDormant(st)).toBe(false);
  });
});
