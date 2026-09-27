import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import { BLINK_MASK, IDLE_INPUT, type Enemy, type EnemyKind } from "../src/game/arcade/types.ts";

// Новый паттерн Рошана (T21.2): Wave of Force — телеграфированная линия с отбросом, и Bash — удар в упор с шансом оглушает.
// Только у второго Рошана акта и у любого с ранга Legend: раньше второй отличался лишь числами.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; roshanIdx: number; rng: { float(): number } };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const W = ARCADE.roshanWave;

function arena(seed: string, second: boolean, rank = 0): { sim: ArcadeSim; r: Enemy } {
  const sim = new ArcadeSim(seed, { act: "full", rank });
  sim.obstacles.remove(() => true);
  for (const e of sim.enemies) e.alive = false;
  if (sim.camp) sim.camp.nextGuardAt = 1e9;
  sim.player.autoAttack = false;
  sim.player.autoCast = { q: false, w: false, e: false, r: false };
  const r = priv(sim).spawnEnemy(ENEMY_KINDS.roshan, sim.player.x + 250, sim.player.y);
  r.hp = r.maxHp = 1e7;
  sim.roshan = r;
  priv(sim).roshanIdx = second ? 2 : 1;
  return { sim, r };
}
const step = (sim: ArcadeSim, input = IDLE_INPUT) => { sim.player.invulnUntil = Math.min(sim.player.invulnUntil, sim.tick); sim.step(input); };

describe("второй Рошан: Wave of Force и Bash", () => {
  it("волна — у второго Рошана и с ранга Legend; у первого на низком ранге её нет", () => {
    expect(arena("rw-first", false).sim.roshanWaves()).toBe(false);
    expect(arena("rw-second", true).sim.roshanWaves()).toBe(true);
    expect(arena("rw-legend", false, W.fromRank).sim.roshanWaves()).toBe(true);
    const { sim, r } = arena("rw-first-idle", false);
    for (let i = 0; i < sec(3); i++) step(sim);
    expect(r.castT).toBe(0);
  });

  it("герой на линии: урон и отброс вдоль линии после телеграфа", () => {
    const { sim, r } = arena("rw-hit", true);
    step(sim);
    expect(r.castT).toBe(W.tele);
    const x0 = sim.player.x, hp0 = sim.player.hp;
    for (let i = 0; i < W.tele; i++) step(sim);
    expect(r.castT).toBe(0);
    expect(sim.player.hp).toBeLessThan(hp0);
    expect(x0 - sim.player.x).toBeGreaterThan(W.push * 0.9); // Рошан справа — отбросило влево
  });

  it("Blink во время телеграфа спасает: ни урона, ни отброса", () => {
    const { sim } = arena("rw-blink", true);
    step(sim);
    for (let i = 0; i < W.tele - 2; i++) step(sim);
    sim.step({ ...IDLE_INPUT, my: 16, cast: BLINK_MASK }); // вбок с линии и неуязвимость
    const hp0 = sim.player.hp;
    for (let i = 0; i < 3; i++) sim.step(IDLE_INPUT);
    expect(sim.player.hp).toBe(hp0);
  });

  it("стан сбивает волну", () => {
    const { sim, r } = arena("rw-stun", true);
    step(sim);
    expect(r.castT).toBeGreaterThan(0);
    r.stunUntil = sim.tick + sec(1);
    const hp0 = sim.player.hp;
    step(sim);
    expect(r.castT).toBe(0);
    for (let i = 0; i < W.tele; i++) step(sim);
    expect(sim.player.hp).toBe(hp0);
  });

  it("Bash: удар второго Рошана в упор с шансом оглушает", () => {
    const { sim, r } = arena("rw-bash", true);
    r.x = sim.player.x + r.kind.r + ARCADE.player.r; r.castAt = 1e9;
    priv(sim).rng.float = () => 0; // шанс срабатывает всегда
    // Удар по телеграфу держим на откате, но вне «восстановления» (тогда Рошан стоит и контактом не бьёт).
    const B = ARCADE.boss;
    for (let i = 0; i < sec(1) && sim.player.stunUntil <= sim.tick; i++) { r.slamCd = B.slamCooldown - B.slamRecovery; step(sim); }
    expect(sim.player.stunUntil).toBeGreaterThan(sim.tick);
  });
});
