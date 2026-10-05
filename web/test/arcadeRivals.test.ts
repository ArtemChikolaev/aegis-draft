import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS, spawnPool } from "../src/game/arcade/content/enemies.ts";
import { BLINK_MASK, IDLE_INPUT, RUNE_KINDS, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";

// Вражеские герои (M26): Pudge (Meat Hook), Axe (Berserker's Call) и Lina (Laguna Blade) приходят по расписанию акта
// мини-боссами — по одному и без повтора подряд; умения с телеграфом, контроль на них ограничен, убит — exotic-предмет.
// Руна мудрости (M26): с 7:00 раз в 7 минут — опыт на долю уровня без множителей. Как руны и лес, ждёт, пока жив Рошан
// (он приходит в те же 7:00), — тогда руна ложится сразу после его смерти.
type Priv = {
  spawnEnemy(k: EnemyKind, x: number, y: number): Enemy;
  spawnRival(): void;
  killEnemy(e: Enemy): void;
  castStolen(spell: string, dmg: number, lvl: number): void;
  rivalRetryAt: number;
};
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const NC = ARCADE.neutralCasts;
const RIVALS = ARCADE.rivals.pool as readonly string[];

function field(seed: string, act: "dire" | "short" | "full" = "dire", minute = 6, hero = "juggernaut"): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10, act, hero });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  sim.tick = sec(minute * 60);
  return sim;
}
const spawn = (sim: ArcadeSim, kind: EnemyKind, dx: number, dy = 0) => {
  const e = priv(sim).spawnEnemy(kind, sim.player.x + dx, sim.player.y + dy);
  e.hp = e.maxHp = 1e6;
  return e;
};
/** Шаги со «своими» врагами: остальной спавн глушим, окна закрываем, героя держим живым. */
function run(sim: ArcadeSim, n: number, keep: Enemy[] = []): void {
  for (let i = 0; i < n; i++) {
    for (const e of sim.enemies) if (e.alive && !keep.includes(e)) e.alive = false;
    sim.player.hp = sim.player.stats.maxHp;
    for (let k = 0; k < 6 && sim.activeModal(); k++) sim.step(sim.activeModal() === "pending" ? { ...IDLE_INPUT, choose: 0 } : { ...IDLE_INPUT, act: 5 });
    sim.step(IDLE_INPUT);
  }
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("вражеские герои", () => {
  it("приходит по расписанию акта; пока жив — следующий ждёт, второй разом не приходит; в пул спавна не входит", () => {
    const sim = field("rival-sched", "full", 5);
    sim.step(IDLE_INPUT);
    const first = sim.rival!;
    expect(first?.alive).toBe(true);
    expect(first.kind.rival).toBe(true);
    expect(sim.events.rivals).toBe(1);
    sim.rivalLeaveAt = 1e9; // проверяем ожидание при живом — отступление ниже, отдельным тестом
    // Живой Рошан (пришёл по часам на этом же скачке) глушит расписание мира, как руны и лес: `run` его снимает.
    sim.tick = ARCADE.rivals.at.full[1];
    run(sim, 3, [first]);
    expect(sim.events.rivals).toBe(1);
    expect(priv(sim).rivalRetryAt).toBeGreaterThan(sim.actTick);
    priv(sim).killEnemy(first);
    sim.tick = priv(sim).rivalRetryAt;
    run(sim, 2, [first]);
    expect(sim.events.rivals).toBe(2);
    expect(sim.rival!.kind.id).not.toBe(first.kind.id);
    for (const act of ["short", "full", "dire", "river"]) expect(spawnPool(30, act).some((k) => k.rival)).toBe(false);
  });

  it("порядок — по сиду и без повтора подряд; тот же сид — тот же порядок", () => {
    const order = (seed: string) => {
      const sim = field(seed);
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) { priv(sim).spawnRival(); ids.push(sim.rival!.kind.id); priv(sim).killEnemy(sim.rival!); }
      return ids;
    };
    const a = order("rival-order"), b = order("rival-order");
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
    expect(a.every((id) => RIVALS.includes(id))).toBe(true);
  });

  it("Meat Hook: задел — урон и рывок к Pudge; ушёл с линии или в неуязвимости Blink — мимо", () => {
    for (const mode of ["hit", "leave", "blink"] as const) {
      const sim = field(`rival-hook-${mode}`);
      const pu = spawn(sim, ENEMY_KINDS.hero_pudge, 300);
      pu.castAt = 0;
      run(sim, 1, [pu]);
      expect(pu.castT).toBe(NC.meatHook.tele);
      if (mode === "leave") sim.player.y += NC.meatHook.width + 40;
      if (mode === "blink") sim.player.invulnUntil = sim.tick + 1e4;
      const hurt0 = sim.events.hurt;
      run(sim, NC.meatHook.tele, [pu]);
      expect(pu.castT).toBe(0);
      expect(dist(sim.player, pu) < pu.kind.r + 40, mode).toBe(mode === "hit");
      expect(sim.events.hurt > hurt0, mode).toBe(mode === "hit");
    }
  });

  it("Berserker's Call: в круге — насмешка: ввод прочь не уводит, герой идёт к Axe, Blink молчит; Axe под бронёй", () => {
    const sim = field("rival-call");
    const ax = spawn(sim, ENEMY_KINDS.hero_axe, 150);
    sim.rival = ax; sim.rivalLeaveAt = 1e9;
    ax.castAt = 0;
    run(sim, 1, [ax]);
    expect(ax.castT).toBe(NC.berserkersCall.tele);
    run(sim, NC.berserkersCall.tele, [ax]);
    expect(sim.player.tauntUntil).toBeGreaterThan(sim.tick);
    expect(ax.armorUntil).toBeGreaterThan(sim.tick);
    const x0 = sim.player.x, charges = sim.player.blinkCharges;
    sim.step({ ...IDLE_INPUT, mx: -16, my: 0, cast: BLINK_MASK });
    expect(sim.player.x).toBeGreaterThan(x0); // Axe справа, ввод — влево
    expect(sim.player.blinkCharges).toBe(charges);
  });

  it("Laguna Blade: тяжёлый удар по линии; ушёл с линии — мимо", () => {
    for (const leave of [false, true]) {
      const sim = field(`rival-laguna-${leave}`);
      const li = spawn(sim, ENEMY_KINDS.hero_lina, 400);
      li.castAt = 0;
      run(sim, 1, [li]);
      expect(li.castT).toBe(NC.lagunaBlade.tele);
      if (leave) sim.player.y += NC.lagunaBlade.width + 40;
      run(sim, NC.lagunaBlade.tele - 1, [li]);
      const hp0 = sim.player.hp = sim.player.stats.maxHp;
      sim.step(IDLE_INPUT);
      expect(li.castT).toBe(0);
      if (leave) expect(sim.player.hp).toBe(hp0);
      else expect(hp0 - sim.player.hp).toBeGreaterThan(li.dmg * 2);
    }
  });

  it("контроль — не дольше ccCap, затем иммунитет", () => {
    const sim = field("rival-cc");
    const pu = spawn(sim, ENEMY_KINDS.hero_pudge, 500);
    pu.castAt = 1e9;
    pu.stunUntil = sim.tick + sec(5);
    run(sim, 1, [pu]);
    expect(pu.stunUntil).toBeLessThanOrEqual(sim.tick + ARCADE.rivals.ccCap);
    run(sim, ARCADE.rivals.ccCap + 2, [pu]);
    pu.stunUntil = sim.tick + sec(3);
    run(sim, 1, [pu]);
    expect(pu.stunUntil).toBeLessThanOrEqual(sim.tick);
  });

  it("не убит за `stay` по часам акта — отступает без награды, насмешка спадает", () => {
    const sim = field("rival-leave");
    priv(sim).spawnRival();
    const r = sim.rival!;
    r.hp = r.maxHp = 1e6;
    sim.player.tauntUntil = sim.tick + 1e4; sim.player.tauntBy = r.id;
    const loot0 = sim.groundLoot.length, kills0 = sim.player.kills;
    // Объект врага из пула переиспользуется следующим спавном — проверяем на том же шаге, где он ушёл.
    sim.tick = sim.rivalLeaveAt - 2;
    run(sim, 1, [r]);
    expect(r.alive).toBe(true);
    run(sim, 1, [r]);
    expect(r.alive).toBe(false);
    expect(sim.rival).toBeNull();
    expect(sim.player.tauntUntil).toBe(0);
    expect(sim.groundLoot.length).toBe(loot0);
    expect(sim.player.kills).toBe(kills0);
  });

  it("убит — exotic-предмет у его ног, ссылка снята, насмешка спадает", () => {
    const sim = field("rival-loot");
    const ax = spawn(sim, ENEMY_KINDS.hero_axe, 100);
    sim.rival = ax;
    sim.player.tauntUntil = sim.tick + 100; sim.player.tauntBy = ax.id;
    const loot0 = sim.groundLoot.length;
    priv(sim).killEnemy(ax);
    expect(sim.rival).toBeNull();
    expect(sim.player.tauntUntil).toBe(0);
    expect(sim.groundLoot.length).toBe(loot0 + 1);
    expect(sim.groundLoot[sim.groundLoot.length - 1].item.rarity).toBe("exotic");
  });

  it("Spell Steal: Hook тянет к Rubick первого в полосе, Laguna бьёт всех в линии", () => {
    const sim = field("rival-steal", "dire", 6, "rubick");
    const a = spawn(sim, ENEMY_KINDS.wildwing, 200), b = spawn(sim, ENEMY_KINDS.wildwing, 400);
    priv(sim).castStolen("meat_hook", 50, 1);
    expect(dist(a, sim.player)).toBeLessThan(a.kind.r + 40);
    expect(b.x).toBeCloseTo(sim.player.x + 400);
    a.x = sim.player.x + 200; a.y = sim.player.y;
    const hpA = a.hp, hpB = b.hp;
    priv(sim).castStolen("laguna_blade", 50, 1);
    expect(a.hp).toBeLessThan(hpA);
    expect(b.hp).toBeLessThan(hpB);
  });
});

describe("руна мудрости", () => {
  it("с 7:00 по часам акта; опыт — доля уровня без множителей; в случайный пул рун не входит", () => {
    expect(RUNE_KINDS).not.toContain("wisdom");
    const sim = field("wisdom-1", "short", 7);
    sim.step(IDLE_INPUT);
    expect(sim.roshan?.alive).toBe(true);
    expect(sim.wisdom.alive).toBe(false);
    priv(sim).killEnemy(sim.roshan!);
    sim.step(IDLE_INPUT);
    expect(sim.wisdom.alive).toBe(true);
    sim.player.xp = 0;
    const need = sim.player.xpNext;
    sim.greedUntil = sim.tick + sec(60); // щедрость удвоила бы обычный опыт — руне всё равно
    sim.player.x = sim.wisdom.x; sim.player.y = sim.wisdom.y;
    for (const e of sim.enemies) e.alive = false;
    sim.step(IDLE_INPUT);
    expect(sim.wisdom.alive).toBe(false);
    expect(sim.runesTaken.wisdom).toBe(1);
    expect(sim.events.wisdoms).toBe(1);
    expect(sim.player.xp).toBeCloseTo(need * ARCADE.wisdom.levelFrac, 0);
  });

  it("не подобрана — гаснет по сроку; следующая — через `every`", () => {
    const sim = field("wisdom-2", "full", 7);
    sim.step(IDLE_INPUT);
    priv(sim).killEnemy(sim.roshan!);
    sim.step(IDLE_INPUT);
    expect(sim.wisdom.alive).toBe(true);
    sim.player.x = sim.wisdom.x + 1000;
    sim.tick = sim.wisdom.until;
    sim.player.hp = sim.player.stats.maxHp;
    sim.step(IDLE_INPUT);
    expect(sim.wisdom.alive).toBe(false);
    // На 14:00 приходит второй Рошан — `run` снимает его, и расписание идёт дальше.
    sim.tick = ARCADE.wisdom.first + ARCADE.wisdom.every;
    run(sim, 3);
    expect(sim.wisdom.alive).toBe(true);
  });
});
