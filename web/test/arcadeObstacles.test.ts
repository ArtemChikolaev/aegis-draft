import { describe, expect, it } from "vitest";
import { ArcadeSim } from "../src/game/arcade/sim.ts";
import { IDLE_INPUT } from "../src/game/arcade/types.ts";
import { ARCADE } from "../src/game/arcade/config.ts";
import { generateMap, ObstacleGrid } from "../src/game/arcade/mapgen.ts";

describe("препятствия карты (T13.19)", () => {
  it("генератор детерминирован и даёт деревья и камни вне стартовой зоны", () => {
    const a = generateMap("obst-1", "short"), b = generateMap("obst-1", "short");
    expect(a.obstacles.length).toBe(b.obstacles.length);
    expect(a.obstacles.length).toBeGreaterThan(50);
    expect(a.obstacles.every((o) => Math.hypot(o.x - ARCADE.world.w / 2, o.y - ARCADE.world.h / 2) >= 360)).toBe(true);
    expect(a.obstacles.some((o) => o.kind === "tree")).toBe(true);
    expect(a.obstacles.some((o) => o.kind === "rock")).toBe(true);
  });

  it("герой не проходит сквозь препятствие: после шагов в него дистанция не меньше суммы радиусов", () => {
    const sim = new ArcadeSim("obst-2", { hero: "juggernaut" });
    const o = sim.obstacles.obstacles[0];
    sim.player.hp = 1e6;
    // Ставим героя слева от препятствия и толкаем вправо 90 тиков.
    sim.player.x = o.x - o.r - ARCADE.player.r - 30; sim.player.y = o.y;
    for (let i = 0; i < 90; i++) sim.step({ ...IDLE_INPUT, mx: 16, my: 0 });
    const d = Math.hypot(sim.player.x - o.x, sim.player.y - o.y);
    expect(d).toBeGreaterThanOrEqual(o.r + ARCADE.player.r - 0.01);
  });

  it("resolve выталкивает круг наружу, blocked видит пересечение", () => {
    const grid = new ObstacleGrid([{ x: 100, y: 100, r: 20, kind: "rock" }]);
    expect(grid.blocked(105, 100, 10)).toBe(true);
    const [x, y] = grid.resolve(105, 100, 10);
    expect(Math.hypot(x - 100, y - 100)).toBeCloseTo(30, 5);
    expect(grid.blocked(x, y, 10)).toBe(false);
  });

  it("препятствие у границы ячейки сетки видно и из соседней ячейки (радиус сущности учтён при регистрации)", () => {
    // Камень целиком в ячейке 0 (x 230..250), сущность r=16 стоит в ячейке 1 (x=262) и пересекается с ним на 4 px.
    const grid = new ObstacleGrid([{ x: 240, y: 100, r: 10, kind: "rock" }]);
    expect(grid.blocked(262, 100, 16)).toBe(true);
    const [x, y] = grid.resolve(262, 100, 16);
    expect([x, y]).toEqual([266, 100]);
    expect(grid.near(262, 100).length).toBe(1);
    // То же по вертикали и по диагонали, с самым большим радиусом запроса сима (40).
    const g2 = new ObstacleGrid([{ x: 250, y: 250, r: 5, kind: "tree" }]);
    expect(g2.blocked(250, 290, 40)).toBe(true);
    expect(g2.blocked(280, 280, 40)).toBe(true);
    expect(g2.blocked(250, 300, 40)).toBe(false);
  });
});
