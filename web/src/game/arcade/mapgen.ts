// Генерация карты Аркады — ЧИСТАЯ и общая для сима и рендера (T13.19, владелец 2026-09-06: «камни и деревья
// должны быть реальными препятствиями»). Раньше жила только в рендерере (features/arcade/terrain.ts); теперь
// сим строит из того же декора препятствия с коллизией, а рендерер — картинку. Один seed+act ⇒ одна карта.
import { Rng } from "../rng.ts";
import { ARCADE } from "./config.ts";
import type { ActId } from "./types.ts";

export const TILE = 64;

export interface Decor { x: number; y: number; kind: "tree" | "rock" | "tuft" | "flower"; s: number }
export interface Obstacle { x: number; y: number; r: number; kind: "tree" | "rock" }
export interface ArcadeMap { cols: number; rows: number; tiles: Uint8Array; decor: Decor[]; obstacles: Obstacle[] }

/** Коллизия: у дерева — ствол (меньше кроны), у камня — почти весь спрайт. */
export function obstacleRadius(d: Decor): number {
  return d.kind === "tree" ? 8 + d.s * 0.32 : 6 + d.s * 1.1;
}

export function generateMap(seed: string, act: ActId): ArcadeMap {
  const rng = new Rng(`terrain:${seed}:${act}`);
  const cols = Math.ceil(ARCADE.world.w / TILE);
  const rows = Math.ceil(ARCADE.world.h / TILE);
  const tiles = new Uint8Array(cols * rows);
  const decor: Decor[] = [];
    for (let i = 0; i < tiles.length; i++) tiles[i] = rng.float() < 0.3 ? 1 : 0;
    // Тропы: несколько случайных блужданий шириной 1–2 тайла.
    for (let p = 0; p < 4; p++) {
      let x = rng.int(cols), y = rng.int(rows);
      let dx = rng.float() < 0.5 ? 1 : -1, dy = rng.float() < 0.5 ? 1 : -1;
      for (let step = 0; step < 70; step++) {
        tiles[y * cols + x] = 2;
        if (rng.float() < 0.5 && x + dx >= 0 && x + dx < cols) x += dx; else if (y + dy >= 0 && y + dy < rows) y += dy;
        if (rng.float() < 0.08) dx = -dx;
        if (rng.float() < 0.08) dy = -dy;
      }
    }
    // Поляны земли — блобы.
    for (let b = 0; b < 8; b++) {
      const cx = rng.int(cols), cy = rng.int(rows), r = 1 + rng.int(2);
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && rng.float() < 0.85) tiles[y * cols + x] = 2;
      }
    }
    // Декор: рощи деревьев по кластерам, камни, пучки травы, цветы. Центр (старт) и река/яма чисты.
    const clear = (x: number, y: number) => {
      const dc = Math.hypot(x - ARCADE.world.w / 2, y - ARCADE.world.h / 2);
      if (dc < 360) return true;
      if (act === "river" && (Math.abs(y - ARCADE.river.y) < ARCADE.river.halfWidth + 40 || Math.hypot(x - ARCADE.pit.x, y - ARCADE.pit.y) < ARCADE.pit.radius + 60)) return true;
      return false;
    };
    for (let g = 0; g < 26; g++) {
      const cx = rng.float() * ARCADE.world.w, cy = rng.float() * ARCADE.world.h;
      const n = 3 + rng.int(6);
      for (let i = 0; i < n; i++) {
        const x = cx + (rng.float() - 0.5) * 260, y = cy + (rng.float() - 0.5) * 260;
        if (x < 30 || y < 30 || x > ARCADE.world.w - 30 || y > ARCADE.world.h - 30 || clear(x, y)) continue;
        decor.push({ x, y, kind: "tree", s: 26 + rng.float() * 18 });
      }
    }
    for (let i = 0; i < 70; i++) { const x = rng.float() * ARCADE.world.w, y = rng.float() * ARCADE.world.h; if (!clear(x, y)) decor.push({ x, y, kind: "rock", s: 6 + rng.float() * 9 }); }
    for (let i = 0; i < 700; i++) { const x = rng.float() * ARCADE.world.w, y = rng.float() * ARCADE.world.h; decor.push({ x, y, kind: rng.float() < 0.25 ? "flower" : "tuft", s: 3 + rng.float() * 4 }); }
    // Деревья рисуем позже пучков — сортировка по y даёт правильное перекрытие крон.
    decor.sort((a, b) => a.y - b.y);
  const obstacles: Obstacle[] = decor.filter((d) => d.kind === "tree" || d.kind === "rock").map((d) => ({ x: d.x, y: d.y, r: obstacleRadius(d), kind: d.kind as "tree" | "rock" }));
  return { cols, rows, tiles, decor, obstacles };
}

/** Сетка препятствий по ячейкам 256 px для быстрых проверок (≈200 объектов, сотни сущностей за тик). */
export class ObstacleGrid {
  private readonly cells = new Map<number, Obstacle[]>();
  private static readonly CELL = 256;
  constructor(readonly obstacles: readonly Obstacle[]) {
    for (const o of obstacles) {
      const c = ObstacleGrid.CELL;
      for (let gy = Math.floor((o.y - o.r) / c); gy <= Math.floor((o.y + o.r) / c); gy++)
        for (let gx = Math.floor((o.x - o.r) / c); gx <= Math.floor((o.x + o.r) / c); gx++) {
          const key = gy * 4096 + gx;
          const list = this.cells.get(key);
          if (list) list.push(o); else this.cells.set(key, [o]);
        }
    }
  }
  near(x: number, y: number): readonly Obstacle[] {
    return this.cells.get(Math.floor(y / ObstacleGrid.CELL) * 4096 + Math.floor(x / ObstacleGrid.CELL)) ?? [];
  }
  /** Вытолкнуть круг (x, y, r) из препятствий; два прохода хватает для углов между двумя объектами. */
  resolve(x: number, y: number, r: number): [number, number] {
    for (let pass = 0; pass < 2; pass++) {
      for (const o of this.near(x, y)) {
        const dx = x - o.x, dy = y - o.y;
        const min = o.r + r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-6) { x = o.x + min; continue; }
        x = o.x + dx / d * min; y = o.y + dy / d * min;
      }
    }
    return [x, y];
  }
  blocked(x: number, y: number, r: number): boolean {
    for (const o of this.near(x, y)) { const dx = x - o.x, dy = y - o.y, m = o.r + r; if (dx * dx + dy * dy < m * m) return true; }
    return false;
  }
}
