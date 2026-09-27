import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { ARCADE, sec } from "../src/game/arcade/config.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";
import type { Enemy, EnemyKind } from "../src/game/arcade/types.ts";

// Мульти-убийства (T21.1): много убийств в скользящем окне 2 с — Double Kill … Rampage с голосом комментатора Dota;
// Ultra Kill возвращает заряд Blink, Rampage снимает секунду со всех перезарядок умений.
type Priv = { spawnEnemy(k: EnemyKind, x: number, y: number): Enemy; killEnemy(e: Enemy): void };
const priv = (sim: ArcadeSim) => sim as unknown as Priv;
const M = ARCADE.multiKill;

function field(seed: string): ArcadeSim {
  const sim = new ArcadeSim(seed, { rank: 10 });
  for (const e of sim.enemies) e.alive = false;
  sim.tick = sec(60);
  return sim;
}
/** n убийств, по одному в `every` тиков. */
function kills(sim: ArcadeSim, n: number, every = 0): void {
  for (let i = 0; i < n; i++) {
    const e = priv(sim).spawnEnemy(ENEMY_KINDS.kobold, sim.player.x + 300, sim.player.y);
    priv(sim).killEnemy(e);
    sim.tick += every;
  }
}

describe("мульти-убийства", () => {
  it("всплеск: ступени объявляются по мере роста — Double, Triple, Ultra, Rampage — по разу", () => {
    const sim = field("mk-burst");
    kills(sim, M.tiers[3], 1);
    expect(sim.events.multiKills).toBe(4);
    expect(sim.multiKillShown).toBe(4);
  });

  it("Ultra Kill возвращает заряд Blink, Rampage снимает перезарядку умений", () => {
    const sim = field("mk-reward");
    sim.player.blinkCharges = 0; sim.player.blinkCd = 300;
    sim.player.cooldowns.q = sec(5);
    kills(sim, M.tiers[2], 1);
    expect(sim.player.blinkCharges).toBe(1);
    const q0 = sim.player.cooldowns.q;
    kills(sim, M.tiers[3] - M.tiers[2], 1);
    expect(sim.player.cooldowns.q).toBe(Math.max(0, q0 - M.rampageCd));
  });

  it("медленные убийства — не мульти; новый всплеск — не раньше паузы после прошлого объявления", () => {
    const slow = field("mk-slow");
    kills(slow, 60, sec(0.5)); // 4 в окне 2 с
    expect(slow.events.multiKills).toBe(0);

    const sim = field("mk-gap");
    kills(sim, M.tiers[0], 1);
    expect(sim.events.multiKills).toBe(1);
    sim.tick += M.window + 1; // всплеск кончился
    kills(sim, 1);
    kills(sim, M.tiers[0], 1); // новый всплеск в пределах паузы — молча
    expect(sim.events.multiKills).toBe(1);
    sim.tick += M.gap;
    kills(sim, M.tiers[0] + 2, 1);
    expect(sim.events.multiKills).toBe(2);
  });
});
