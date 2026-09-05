// Ландшафт Аркады (после фидбэка владельца 2026-09-06: «карта — пустота»): процедурная земля с
// травой, тропами, камнями и деревьями, детерминированная сидом, рисуется чанками 512×512 в
// кэш-канвасы (полная карта 3200² в одном канвасе — 41 МБ, на телефоне много). Декор не влияет
// на сим: это слой рендера. Когда появятся тайлсеты-спрайты, `paintChunk` меняется на блиттинг
// тайлов — интерфейс чанков остаётся.
import { Rng } from "../../game/rng.ts";
import { ARCADE } from "../../game/arcade/config.ts";
import type { ActId } from "../../game/arcade/types.ts";

export const CHUNK = 512;
const TILE = 64;

export interface TerrainPalette {
  grassA: string;
  grassB: string;
  dirt: string;
  rock: string;
  tree: string;
  treeDark: string;
  tuft: string;
}

interface Decor { x: number; y: number; kind: "tree" | "rock" | "tuft" | "flower"; s: number }

export class Terrain {
  private readonly rng: Rng;
  private readonly tiles: Uint8Array;
  private readonly cols: number;
  private readonly rows: number;
  private readonly decor: Decor[] = [];
  private cache = new Map<string, HTMLCanvasElement>();
  private paletteKey = "";

  constructor(seed: string, readonly act: ActId) {
    this.rng = new Rng(`terrain:${seed}:${act}`);
    this.cols = Math.ceil(ARCADE.world.w / TILE);
    this.rows = Math.ceil(ARCADE.world.h / TILE);
    this.tiles = new Uint8Array(this.cols * this.rows);
    this.generate();
  }

  /** 0/1 — два оттенка травы, 2 — земля/тропа. */
  private generate(): void {
    const { rng, cols, rows, tiles } = this;
    for (let i = 0; i < tiles.length; i++) tiles[i] = rng.float() < 0.3 ? 1 : 0;
    // Тропы: несколько случайных блужданий шириной 1–2 тайла.
    for (let p = 0; p < 6; p++) {
      let x = rng.int(cols), y = rng.int(rows);
      let dx = rng.float() < 0.5 ? 1 : -1, dy = rng.float() < 0.5 ? 1 : -1;
      for (let step = 0; step < 90; step++) {
        tiles[y * cols + x] = 2;
        if (rng.float() < 0.5 && x + dx >= 0 && x + dx < cols) x += dx; else if (y + dy >= 0 && y + dy < rows) y += dy;
        if (rng.float() < 0.08) dx = -dx;
        if (rng.float() < 0.08) dy = -dy;
      }
    }
    // Поляны земли — блобы.
    for (let b = 0; b < 14; b++) {
      const cx = rng.int(cols), cy = rng.int(rows), r = 2 + rng.int(3);
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && rng.float() < 0.85) tiles[y * cols + x] = 2;
      }
    }
    // Декор: рощи деревьев по кластерам, камни, пучки травы, цветы. Центр (старт) и река/яма чисты.
    const clear = (x: number, y: number) => {
      const dc = Math.hypot(x - ARCADE.world.w / 2, y - ARCADE.world.h / 2);
      if (dc < 360) return true;
      if (this.act === "river" && (Math.abs(y - ARCADE.river.y) < ARCADE.river.halfWidth + 40 || Math.hypot(x - ARCADE.pit.x, y - ARCADE.pit.y) < ARCADE.pit.radius + 60)) return true;
      return false;
    };
    for (let g = 0; g < 26; g++) {
      const cx = rng.float() * ARCADE.world.w, cy = rng.float() * ARCADE.world.h;
      const n = 3 + rng.int(6);
      for (let i = 0; i < n; i++) {
        const x = cx + (rng.float() - 0.5) * 260, y = cy + (rng.float() - 0.5) * 260;
        if (x < 30 || y < 30 || x > ARCADE.world.w - 30 || y > ARCADE.world.h - 30 || clear(x, y)) continue;
        this.decor.push({ x, y, kind: "tree", s: 26 + rng.float() * 18 });
      }
    }
    for (let i = 0; i < 70; i++) { const x = rng.float() * ARCADE.world.w, y = rng.float() * ARCADE.world.h; if (!clear(x, y)) this.decor.push({ x, y, kind: "rock", s: 6 + rng.float() * 9 }); }
    for (let i = 0; i < 700; i++) { const x = rng.float() * ARCADE.world.w, y = rng.float() * ARCADE.world.h; this.decor.push({ x, y, kind: rng.float() < 0.25 ? "flower" : "tuft", s: 3 + rng.float() * 4 }); }
    // Деревья рисуем позже пучков — сортировка по y даёт правильное перекрытие крон.
    this.decor.sort((a, b) => a.y - b.y);
  }

  /** Нарисовать видимую область. Смена палитры (тема/акт) сбрасывает кэш чанков. */
  draw(c: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, pal: TerrainPalette): void {
    const key = Object.values(pal).join("|");
    if (key !== this.paletteKey) { this.cache.clear(); this.paletteKey = key; }
    const cx0 = Math.floor(camX / CHUNK), cy0 = Math.floor(camY / CHUNK);
    const cx1 = Math.floor((camX + w) / CHUNK), cy1 = Math.floor((camY + h) / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= ARCADE.world.w || cy * CHUNK >= ARCADE.world.h) continue;
      c.drawImage(this.chunk(cx, cy, pal), cx * CHUNK, cy * CHUNK);
    }
    // Кэш не растёт бесконечно: держим ~30 чанков (видимая область + запас).
    if (this.cache.size > 36) { const first = this.cache.keys().next().value; if (first) this.cache.delete(first); }
  }

  private chunk(cx: number, cy: number, pal: TerrainPalette): HTMLCanvasElement {
    const key = `${cx}:${cy}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = CHUNK; canvas.height = CHUNK;
    const c = canvas.getContext("2d")!;
    this.paintChunk(c, cx * CHUNK, cy * CHUNK, pal);
    this.cache.set(key, canvas);
    return canvas;
  }

  private paintChunk(c: CanvasRenderingContext2D, ox: number, oy: number, pal: TerrainPalette): void {
    const t0x = Math.floor(ox / TILE), t0y = Math.floor(oy / TILE);
    const n = CHUNK / TILE;
    for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
      const gx = t0x + tx, gy = t0y + ty;
      const v = gx < this.cols && gy < this.rows ? this.tiles[gy * this.cols + gx] : 0;
      c.fillStyle = v === 2 ? pal.dirt : v === 1 ? pal.grassB : pal.grassA;
      c.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      // Мягкие края тропы: полупрозрачная кромка травы поверх земли.
      if (v === 2) {
        c.globalAlpha = 0.35; c.fillStyle = pal.grassA;
        c.fillRect(tx * TILE, ty * TILE, TILE, 3); c.fillRect(tx * TILE, ty * TILE, 3, TILE);
        c.globalAlpha = 1;
      }
    }
    const x1 = ox + CHUNK + 40, y1 = oy + CHUNK + 40;
    for (const d of this.decor) {
      if (d.x < ox - 40 || d.y < oy - 40 || d.x > x1 || d.y > y1) continue;
      const x = d.x - ox, y = d.y - oy;
      switch (d.kind) {
        case "tuft":
          c.strokeStyle = pal.tuft; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(x - d.s, y); c.lineTo(x - d.s * 0.4, y - d.s * 1.6); c.moveTo(x, y); c.lineTo(x + d.s * 0.2, y - d.s * 2); c.moveTo(x + d.s, y); c.lineTo(x + d.s * 1.2, y - d.s * 1.4); c.stroke();
          break;
        case "flower":
          c.fillStyle = pal.tuft; c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
          break;
        case "rock":
          c.fillStyle = pal.rock; c.beginPath(); c.ellipse(x, y, d.s, d.s * 0.7, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = pal.grassA; c.globalAlpha = 0.25; c.beginPath(); c.ellipse(x - d.s * 0.25, y - d.s * 0.2, d.s * 0.5, d.s * 0.3, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
          break;
        case "tree":
          c.fillStyle = pal.treeDark; c.globalAlpha = 0.35; c.beginPath(); c.ellipse(x + 6, y + 8, d.s * 0.9, d.s * 0.45, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
          c.fillStyle = pal.treeDark; c.beginPath(); c.arc(x, y, d.s, 0, Math.PI * 2); c.fill();
          c.fillStyle = pal.tree; c.beginPath(); c.arc(x - d.s * 0.2, y - d.s * 0.25, d.s * 0.7, 0, Math.PI * 2); c.fill();
          break;
        default: break;
      }
    }
  }
}
