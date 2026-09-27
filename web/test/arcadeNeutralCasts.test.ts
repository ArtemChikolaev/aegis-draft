import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";

// Умения нейтралов Dota у обычных врагов (T20.3): раньше виды толпы отличались только числами и просто шли на героя.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; damageEnemy(e: Enemy, amount: number, fx: string): boolean };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const NC = ARCADE.neutralCasts;

function field(seed: string, minute = 5): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10 });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  sim.tick = sec(minute * 60);
  return sim;
}
const spawn = (sim: ArcadeSim, kind: EnemyKind, dx: number, dy = 0) => priv(sim).spawnEnemy(kind, sim.player.x + dx, sim.player.y + dy);
/** Шаги, пока каст врага не закончится (или n шагов); спавн леса глушим — считаем только своих врагов. */
function run(sim: ArcadeSim, n: number, keep: Enemy[] = []): void {
  for (let i = 0; i < n; i++) {
    for (const e of sim.enemies) if (e.alive && !keep.includes(e)) e.alive = false;
    sim.player.invulnUntil = 0;
    // Окна (контракт, лавка, карточки) держат мир — закрываем, чтобы тик шёл.
    for (let k = 0; k < 6 && sim.activeModal(); k++) sim.step(sim.activeModal() === "pending" ? { ...IDLE_INPUT, choose: 0 } : { ...IDLE_INPUT, act: 5 });
    sim.step(IDLE_INPUT);
  }
}

describe("умения нейтралов", () => {
  it("War Stomp: кентавр стоит в телеграфе, затем оглушает героя внутри кольца; вне кольца — мимо", () => {
    const sim = field("nc-stomp");
    const c = spawn(sim, ENEMY_KINDS.centaur, 80);
    run(sim, 1, [c]);
    expect(c.castT).toBe(NC.stomp.tele);
    const x0 = c.x;
    run(sim, NC.stomp.tele - 1, [c]);
    expect(c.castT).toBe(1);
    expect(c.x).toBe(x0); // во время телеграфа не ходит
    expect(sim.player.stunUntil).toBeLessThanOrEqual(sim.tick); // удара ещё не было
    run(sim, 1, [c]);
    expect(c.castT).toBe(0);
    expect(sim.player.stunUntil).toBeGreaterThan(sim.tick);
    expect(sim.events.hurt).toBeGreaterThan(0);

    const far = field("nc-stomp-far");
    const c2 = spawn(far, ENEMY_KINDS.centaur, 80);
    run(far, 1, [c2]);
    far.player.x -= NC.stomp.radius + 100; // вышел из кольца до удара
    run(far, NC.stomp.tele + 1, [c2]);
    expect(far.player.stunUntil).toBeLessThanOrEqual(far.tick);
  });

  it("стан сбивает каст: удара нет, перезарядка — половина", () => {
    const sim = field("nc-interrupt");
    const c = spawn(sim, ENEMY_KINDS.centaur, 80);
    run(sim, 2, [c]);
    expect(c.castT).toBeGreaterThan(0);
    c.stunUntil = sim.tick + sec(2);
    run(sim, 1, [c]);
    expect(c.castT).toBe(0);
    run(sim, NC.stomp.tele + 2, [c]);
    expect(sim.player.stunUntil).toBeLessThanOrEqual(sim.tick);
  });

  it("одновременно не больше maxActive телеграфов, и до fromMin никто не колдует", () => {
    const sim = field("nc-cap");
    const cs = [0, 1, 2, 3].map((i) => spawn(sim, ENEMY_KINDS.centaur, 90 + i * 25, (i % 2) * 40));
    for (let i = 0; i < sec(3); i++) {
      run(sim, 1, cs);
      expect(cs.filter((c) => c.castT > 0).length).toBeLessThanOrEqual(NC.maxActive);
    }
    const early = field("nc-early", NC.fromMin - 1);
    const c = spawn(early, ENEMY_KINDS.centaur, 80);
    run(early, sec(2), [c]);
    expect(c.castT).toBe(0);
    expect(early.player.stunUntil).toBeLessThanOrEqual(early.tick);
  });

  it("Purge: линия от сатира задевает героя — замедление и снятие рун; вне линии — ничего", () => {
    const sim = field("nc-purge");
    const s = spawn(sim, ENEMY_KINDS.satyr, 120);
    sim.player.ddUntil = sim.tick + sec(30);
    run(sim, NC.purge.tele + 2, [s]);
    expect(sim.player.frostUntil).toBeGreaterThan(sim.tick);
    expect(sim.player.ddUntil).toBeLessThanOrEqual(sim.tick);

    const side = field("nc-purge-side");
    const s2 = spawn(side, ENEMY_KINDS.satyr, 120);
    side.player.ddUntil = side.tick + sec(30);
    run(side, 1, [s2]);
    side.player.y += 120; // ушёл с линии вбок
    run(side, NC.purge.tele + 1, [s2]);
    expect(side.player.ddUntil).toBeGreaterThan(side.tick);
  });

  it("Frost Armor: огр ставит броню соседу — урон по нему ниже", () => {
    const sim = field("nc-armor");
    const o = spawn(sim, ENEMY_KINDS.ogre, 150);
    const k = spawn(sim, ENEMY_KINDS.kobold_foreman, 180);
    k.hp = k.maxHp = 1e6; k.stunUntil = 1e9;
    run(sim, 2, [o, k]);
    expect(k.armorUntil).toBeGreaterThan(sim.tick);
    const hp0 = k.hp;
    priv(sim).damageEnemy(k, 100, "hit");
    expect(hp0 - k.hp).toBeLessThan(100);
  });
});
