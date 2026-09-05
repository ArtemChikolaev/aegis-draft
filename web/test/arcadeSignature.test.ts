import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { HEROES } from "../src/game/arcade/content/heroes.ts";

function warm(sim: ArcadeSim, ticks: number): void {
  for (let i = 0; i < ticks && !sim.over; i++) sim.step(IDLE_INPUT);
}
const alive = (sim: ArcadeSim) => sim.enemies.filter((e) => e.alive && !e.kind.elite && !e.kind.boss);

describe("фирменные пассивки героев (T13.15)", () => {
  it("Shadow Fiend копит души за убийства, элита даёт 6, есть потолок", () => {
    const sim = new ArcadeSim("sig-sf", { hero: "shadow_fiend" });
    sim.player.hp = 1e6;
    warm(sim, 60 * 20);
    const sig = HEROES.shadow_fiend.signature!;
    expect(sig.kind).toBe("souls");
    const before = sim.player.stacks;
    const victims = alive(sim).slice(0, 3);
    expect(victims.length).toBe(3);
    for (const e of victims) sim.damageEnemy(e, 1e6, "hit");
    expect(sim.player.stacks).toBe(before + 3);
    sim.player.stacks = sig.cap! - 1;
    sim.damageEnemy(alive(sim)[0], 1e6, "hit");
    expect(sim.player.stacks).toBe(sig.cap);
  });

  it("Clinkz лечится за убийство, не выше максимума", () => {
    const sim = new ArcadeSim("sig-clinkz", { hero: "clinkz" });
    sim.player.hp = 1e6;
    warm(sim, 60 * 20);
    const max = sim.player.stats.maxHp;
    sim.player.hp = max - 100;
    sim.damageEnemy(alive(sim)[0], 1e6, "hit");
    expect(sim.player.hp).toBe(max - 100 + 6);
    sim.player.hp = max - 2;
    sim.damageEnemy(alive(sim)[0], 1e6, "hit");
    expect(sim.player.hp).toBe(max);
  });

  it("Ursa: ярость копится по одной цели и сбрасывается при смене", () => {
    const sim = new ArcadeSim("sig-ursa", { hero: "ursa" });
    sim.player.hp = 1e6;
    warm(sim, 60 * 20);
    const [a, b] = alive(sim);
    a.hp = b.hp = 1e9;
    const hit = (e: typeof a) => (sim as unknown as { onAttackHit(e: typeof a): void }).onAttackHit(e);
    hit(a); hit(a); hit(a);
    expect(sim.player.stacks).toBe(3);
    expect(sim.player.stackTarget).toBe(a.id);
    hit(b);
    expect(sim.player.stacks).toBe(1);
    for (let i = 0; i < 30; i++) hit(b);
    expect(sim.player.stacks).toBe(HEROES.ursa.signature!.cap);
  });

  it("у героев без фирменной пассивки стаки не растут; сим детерминирован с пассивкой", () => {
    const sim = new ArcadeSim("sig-jugg", { hero: "juggernaut" });
    warm(sim, 60 * 20);
    sim.damageEnemy(alive(sim)[0], 1e6, "hit");
    expect(sim.player.stacks).toBe(0);
    const a = new ArcadeSim("sig-det", { hero: "sven" }); warm(a, 60 * 40);
    const b = new ArcadeSim("sig-det", { hero: "sven" }); warm(b, 60 * 40);
    expect(a.digest()).toBe(b.digest());
  });
});

describe("волна 2 героев (2026-09-06): Reincarnation и Vampiric Spirit у Wraith King", () => {
  it("Reincarnation: смертельный урон с изученным R поднимает героя с долей HP и уходит в перезарядку; без R — смерть", () => {
    const sim = new ArcadeSim("wk-reinc", { hero: "wraith_king" });
    const p = sim.player;
    p.abilities.r = 1;
    p.hp = 1;
    (sim as unknown as { damagePlayer(a: number, s: number): void }).damagePlayer(9999, 0);
    if (p.hp <= 0) sim.step(IDLE_INPUT);
    expect(sim.over).toBeFalsy();
    expect(p.hp).toBeGreaterThanOrEqual(p.stats.maxHp * 0.4 - 1);
    expect(p.reincAt).toBeGreaterThan(sim.tick);
    // Вторая смерть до конца перезарядки — настоящая (неуязвимость после подъёма снимаем, иначе урон игнорируется).
    p.invulnUntil = 0;
    p.hp = 1;
    (sim as unknown as { damagePlayer(a: number, s: number): void }).damagePlayer(9999, 0);
    for (let i = 0; i < 3 && !sim.over; i++) sim.step(IDLE_INPUT);
    expect(sim.over).toBeTruthy();
  });

  it("Vampiric Spirit: автоатака лечит долю урона, множитель растёт с уровнем W", () => {
    const sim = new ArcadeSim("wk-vamp", { hero: "wraith_king" });
    for (let i = 0; i < 60 * 6 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
    const e = sim.enemies.find((x) => x.alive)!;
    e.hp = 1e6;
    sim.player.hp = 100;
    sim.damageEnemy(e, 200, "hit");
    expect(sim.player.hp).toBeCloseTo(100 + 200 * 0.14, 3);
    sim.player.abilities.w = 4; // SIG ×2.05
    sim.player.hp = 100;
    sim.damageEnemy(e, 200, "hit");
    expect(sim.player.hp).toBeCloseTo(100 + 200 * 0.14 * 2.05, 3);
    sim.player.hp = 100;
    sim.damageEnemy(e, 200, "burst"); // умения не вампирят
    expect(sim.player.hp).toBe(100);
  });
});

describe("волна 3 героев (2026-09-06): Rupture, Corrosive Haze, Berserker's Blood, Aftershock, Multicast, Backstab, Thirst", () => {
  const warm = (hero: string, seed: string) => {
    const sim = new ArcadeSim(seed, { hero: hero as never });
    for (let i = 0; i < 60 * 6 && !sim.over; i++) { sim.player.hp = sim.player.stats.maxHp; sim.step(IDLE_INPUT); }
    return sim;
  };
  const cast = (sim: ArcadeSim, key: "q" | "w" | "e" | "r") => (sim as unknown as { castAbility(k: string, ab: unknown): void }).castAbility(key, sim.hero.abilities[key]);

  it("Rupture: помеченный враг теряет HP пропорционально пройденному пути и ничего — стоя на месте", () => {
    const sim = warm("bloodseeker", "bs-rupture");
    const e = sim.enemies.find((x) => x.alive)!;
    e.hp = 1e5; e.maxHp = 1e5;
    e.ruptureUntil = sim.tick + 600; e.ruptureDps = 50; e.lastX = e.x; e.lastY = e.y;
    const hp0 = e.hp;
    e.x += 100; // шаг на 100 px → 50 урона
    (sim as unknown as { tickRupture(): void }).tickRupture();
    expect(hp0 - e.hp).toBeCloseTo(50, 0);
    const hp1 = e.hp;
    (sim as unknown as { tickRupture(): void }).tickRupture(); // без движения — без урона
    expect(e.hp).toBe(hp1);
  });

  it("Corrosive Haze: цель с меткой получает больше урона на ampMult", () => {
    const sim = warm("slardar", "sl-haze");
    const e = sim.enemies.find((x) => x.alive)!;
    e.hp = 1e5; e.maxHp = 1e5;
    sim.damageEnemy(e, 100, "burst"); const plain = 1e5 - e.hp;
    e.hp = 1e5; e.ampUntil = sim.tick + 600; e.ampMult = 0.5;
    sim.damageEnemy(e, 100, "burst"); const amped = 1e5 - e.hp;
    expect(amped).toBeCloseTo(plain * 1.5, 3);
  });

  it("Berserker's Blood: при потерянном HP включается frenzy пропорционально потере", () => {
    const sim = warm("huskar", "hu-blood");
    const p = sim.player;
    p.abilities.e = 2; // value 0.5
    p.hp = p.stats.maxHp * 0.25;
    (sim as unknown as { heroPassives(): void }).heroPassives();
    expect(p.frenzyUntil).toBeGreaterThan(sim.tick);
    expect(p.frenzyMult).toBeCloseTo(0.5 * 0.75, 3);
  });

  it("Aftershock: каст умения бьёт и оглушает врагов рядом с Earthshaker", () => {
    const sim = warm("earthshaker", "es-shock");
    const p = sim.player;
    const e = sim.enemies.find((x) => x.alive && !x.kind.unstoppable)!;
    e.x = p.x + 60; e.y = p.y; e.hp = 1e5; e.maxHp = 1e5; e.stunUntil = 0;
    p.abilities.w = 1; p.cooldowns.w = 0;
    cast(sim, "w");
    expect(e.hp).toBeLessThan(1e5);
    expect(e.stunUntil).toBeGreaterThan(sim.tick);
  });

  it("Backstab: автоатака Riki по оглушённой цели бьёт сильнее, чем по свободной", () => {
    const sim = warm("riki", "rk-stab");
    const e = sim.enemies.find((x) => x.alive)!;
    e.hp = 1e5; e.maxHp = 1e5; e.stunUntil = 0; e.chillUntil = 0; e.freezeUntil = 0;
    sim.damageEnemy(e, 100, "hit"); const plain = 1e5 - e.hp;
    e.hp = 1e5; e.stunUntil = sim.tick + 60;
    sim.damageEnemy(e, 100, "hit"); const stab = 1e5 - e.hp;
    expect(stab).toBeCloseTo(plain * 1.8, 3);
  });

  it("Thirst: враг с малым HP рядом даёт ускорение; Multicast сбрасывает перезарядку до 1 тика при удачном броске", () => {
    const sim = warm("bloodseeker", "bs-thirst");
    const p = sim.player;
    const e = sim.enemies.find((x) => x.alive)!;
    e.x = p.x + 100; e.y = p.y; e.hp = e.maxHp * 0.1;
    p.hasteUntil = 0;
    // heroPassives проверяет жажду раз в 10 тиков — дожимаем до кратного.
    while (sim.tick % 10 !== 0) sim.step(IDLE_INPUT);
    (sim as unknown as { heroPassives(): void }).heroPassives();
    expect(p.hasteUntil).toBeGreaterThan(sim.tick);
    const og = warm("ogre_magi", "og-multi");
    og.player.abilities.q = 1;
    let doubled = 0;
    for (let i = 0; i < 40; i++) {
      og.player.cooldowns.q = 0;
      const t = og.enemies.find((x) => x.alive)!; t.x = og.player.x + 80; t.y = og.player.y; t.hp = 1e5; t.maxHp = 1e5;
      cast(og, "q");
      if (og.player.cooldowns.q === 1) doubled++;
    }
    expect(doubled).toBeGreaterThan(2);
    expect(doubled).toBeLessThan(30);
  });
});
