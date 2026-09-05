// Ландшафт Аркады (после фидбэка владельца 2026-09-06: «карта — пустота»): процедурная земля с
// травой, тропами, камнями и деревьями, детерминированная сидом, рисуется чанками 512×512 в
// кэш-канвасы (полная карта 3200² в одном канвасе — 41 МБ, на телефоне много). Декор не влияет
// на сим: это слой рендера. Когда появятся тайлсеты-спрайты, `paintChunk` меняется на блиттинг
// тайлов — интерфейс чанков остаётся.
import { ARCADE } from "../../game/arcade/config.ts";
import type { ActId } from "../../game/arcade/types.ts";
import { TILE, generateMap, type Decor } from "../../game/arcade/mapgen.ts";
import { dotaSheet, dotaTerrain, drawDotaFrame, pixelSheetsOn, tileImage } from "./sprites.ts";

export const CHUNK = 512;

export interface TerrainPalette {
  grassA: string;
  grassB: string;
  dirt: string;
  rock: string;
  tree: string;
  treeDark: string;
  tuft: string;
}


export class Terrain {
  private readonly tiles: Uint8Array;
  private readonly cols: number;
  private readonly rows: number;
  private readonly decor: Decor[];
  private cache = new Map<string, HTMLCanvasElement>();
  private paletteKey = "";
  /** Версия загрузки спрайтов: выросла — тайлы могли подгрузиться, кэш чанков сбрасываем. */
  spriteVersion = 0;

  constructor(seed: string, readonly act: ActId) {
    // Карта — из общего генератора (game/arcade/mapgen.ts): те же деревья и камни, что сим считает препятствиями.
    const map = generateMap(seed, act);
    this.cols = map.cols; this.rows = map.rows; this.tiles = map.tiles; this.decor = map.decor;
  }

  /** Нарисовать видимую область. Смена палитры (тема/акт) сбрасывает кэш чанков. */
  draw(c: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, pal: TerrainPalette): void {
    const key = Object.values(pal).join("|") + `#${this.spriteVersion}`;
    if (key !== this.paletteKey) { this.cache.clear(); this.paletteKey = key; }
    const cx0 = Math.floor(camX / CHUNK), cy0 = Math.floor(camY / CHUNK);
    const cx1 = Math.floor((camX + w) / CHUNK), cy1 = Math.floor((camY + h) / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= ARCADE.world.w || cy * CHUNK >= ARCADE.world.h) continue;
      // В пиксельном проходе чанк уменьшается вдвое: со сглаживанием край чанка подмешивает прозрачное — тонкие светлые швы.
      c.imageSmoothingEnabled = !pixelSheetsOn();
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
    // Пока текстуры земли не загрузились, чанк — плейсхолдер: не кэшируем, чтобы он не пережил загрузку.
    if (dotaTerrain("grass") || (tileImage("grass") && tileImage("dirt"))) this.cache.set(key, canvas);
    return canvas;
  }

  private tileAt(gx: number, gy: number): number {
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return 0;
    return this.tiles[gy * this.cols + gx];
  }

  private paintChunk(c: CanvasRenderingContext2D, ox: number, oy: number, pal: TerrainPalette): void {
    const t0x = Math.floor(ox / TILE), t0y = Math.floor(oy / TILE);
    const n = CHUNK / TILE;
    const grass = tileImage("grass"), dirt = tileImage("dirt"), water = tileImage("water");
    const treetop = tileImage("treetop"), rock = tileImage("rock");
    c.imageSmoothingEnabled = false;
    const night = this.act === "dire";
    // Текстуры земли Dota (docs/arcade-dota-sprites.md §4): бесшовный паттерн важнее тайлов LPC.
    const dGrass = dotaTerrain(night ? "grass_dire" : "grass") ?? dotaTerrain("grass");
    const dDirt = dotaTerrain("dirt"), dWater = dotaTerrain("water");
    if (dGrass) {
      c.imageSmoothingEnabled = true;
      // Обычные текстуры 512 px кладём в 256 мировых px (×0.5); пиксельные 256 px — ×2, чтобы 1 тексель = 1 внутренний пиксель при ?pixel=2.
      const texScale = pixelSheetsOn() ? 4 : 0.5; // пиксельная земля 128 px: тексель = 2 внутренних пикселя, читается как пиксель-арт, а не шум
      const pat = (im: HTMLImageElement) => { const pt = c.createPattern(im, "repeat")!; pt.setTransform(new DOMMatrix().translate(-ox, -oy).scale(texScale)); return pt; };
      c.fillStyle = pat(dGrass);
      c.fillRect(0, 0, CHUNK, CHUNK);
      // Тропы и вода — слоем с размытой маской, а не квадратами тайлов: у текстур Dota нет кромок автотайла,
      // и жёсткая сетка 32 px читалась как «плитка». Маска строится с запасом за границу чанка, чтобы размытие
      // на стыке чанков совпадало и швов не было.
      const layer = (im: HTMLImageElement, hit: (gx: number, gy: number) => boolean, blur: number) => {
        // Маска и заливка с запасом M по краям: размытие у границы холста спадает в прозрачность, и без запаса
        // на стыках чанков оставались светлые линии (фидбэк владельца 2026-09-06 — «квадраты и швы»).
        const pad = 3, M = pad * TILE;
        const size = CHUNK + 2 * M;
        const mask = document.createElement("canvas"); mask.width = mask.height = size;
        const mc = mask.getContext("2d")!;
        let any = false;
        mc.fillStyle = "#fff";
        for (let ty = -pad; ty < n + pad; ty++) for (let tx = -pad; tx < n + pad; tx++) {
          if (!hit(t0x + tx, t0y + ty)) continue;
          any = true;
          mc.fillRect(M + tx * TILE, M + ty * TILE, TILE, TILE);
        }
        if (!any) return;
        const fill = document.createElement("canvas"); fill.width = fill.height = size;
        const fc = fill.getContext("2d")!;
        const pt = fc.createPattern(im, "repeat")!; pt.setTransform(new DOMMatrix().translate(M - ox, M - oy).scale(texScale));
        fc.fillStyle = pt; fc.fillRect(0, 0, size, size);
        // Размытие без ctx.filter: Safari/старые webview его не знают и рисовали жёсткие квадраты (фидбэк владельца).
        // Маску уменьшаем в `blur` раз со сглаживанием и растягиваем обратно — мягкий край на всех движках одинаково.
        const step = Math.max(2, Math.round(blur));
        const small = document.createElement("canvas"); small.width = small.height = Math.ceil(size / step);
        const sc = small.getContext("2d")!;
        sc.imageSmoothingEnabled = true; sc.drawImage(mask, 0, 0, small.width, small.height);
        fc.globalCompositeOperation = "destination-in";
        fc.imageSmoothingEnabled = true;
        fc.drawImage(small, 0, 0, small.width, small.height, 0, 0, size, size);
        c.drawImage(fill, M, M, CHUNK, CHUNK, 0, 0, CHUNK, CHUNK);
      };
      if (dDirt) layer(dDirt, (gx, gy) => this.tileAt(gx, gy) === 2, 7);
      if (dWater && this.act === "river") layer(dWater, (_gx, gy) => Math.abs(gy * TILE + TILE / 2 - ARCADE.river.y) < ARCADE.river.halfWidth, 4);
      if (night) { c.fillStyle = pal.grassA; c.globalAlpha = 0.5; c.fillRect(0, 0, CHUNK, CHUNK); c.globalAlpha = 1; }
      this.paintDecor(c, ox, oy, pal, treetop, rock, night);
      return;
    }
    for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
      const gx = t0x + tx, gy = t0y + ty;
      const v = this.tileAt(gx, gy);
      const px = tx * TILE, py = ty * TILE;
      const wy = gy * TILE + TILE / 2;
      const inRiver = this.act === "river" && Math.abs(wy - ARCADE.river.y) < ARCADE.river.halfWidth;
      if (grass && dirt) {
        // LPC-автотайл 3×6 (32 px): центр (32,96), кромки вокруг; варианты травы — нижний ряд.
        const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        if (inRiver && water) c.drawImage(water, 32, 96, 32, 32, px, py, TILE, TILE);
        else if (v === 2) {
          const up = this.tileAt(gx, gy - 1) === 2, down = this.tileAt(gx, gy + 1) === 2, left = this.tileAt(gx - 1, gy) === 2, right = this.tileAt(gx + 1, gy) === 2;
          c.drawImage(grass, 32, 96, 32, 32, px, py, TILE, TILE);
          const sx = !left ? 0 : !right ? 64 : 32, sy = !up ? 64 : !down ? 128 : 96;
          c.drawImage(dirt, sx, sy, 32, 32, px, py, TILE, TILE);
        } else {
          const variant = h % 7 === 0 ? (h >> 3) % 3 : -1;
          if (variant >= 0) c.drawImage(grass, variant * 32, 160, 32, 32, px, py, TILE, TILE);
          else c.drawImage(grass, 32, 96, 32, 32, px, py, TILE, TILE);
        }
        if (night) { c.fillStyle = pal.grassA; c.globalAlpha = 0.6; c.fillRect(px, py, TILE, TILE); c.globalAlpha = 1; }
      } else {
        // Плейсхолдер до загрузки текстур: ровная заливка без «уголков» на тропах (они оставались на экране светлыми L-линиями).
        c.fillStyle = v === 2 ? pal.dirt : v === 1 ? pal.grassB : pal.grassA;
        c.fillRect(px, py, TILE, TILE);
      }
    }
    if (grass && treetop && rock) { this.paintDecor(c, ox, oy, pal, treetop, rock, night); return; }
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

  /** Деревья, камни и цветы поверх земли (тайлы LPC; на текстурах Dota — те же, пока нет своих). */
  private paintDecor(c: CanvasRenderingContext2D, ox: number, oy: number, pal: TerrainPalette, treetop: HTMLImageElement | null, rock: HTMLImageElement | null, night: boolean): void {
    const x1 = ox + CHUNK + 120, y1 = oy + CHUNK + 120;
    c.imageSmoothingEnabled = false;
    // Пропсы из моделей Dota (деревья/камни, docs/arcade-dota-sprites.md) — приоритет над LPC-кронами.
    const dOak = dotaSheet("tree_oak"), dPine = dotaSheet("tree_pine"), dRock = dotaSheet("rock");
    for (const d of this.decor) {
      if (d.x < ox - 120 || d.y < oy - 120 || d.x > x1 || d.y > y1) continue;
      const x = d.x - ox, y = d.y - oy;
      if (d.kind === "tree" && (treetop || dOak || dPine)) {
        const sz = d.s * 2.6;
        const pine = (Math.floor(d.x * 7 + d.y * 3) & 1) === 1;
        c.globalAlpha = 0.3; c.fillStyle = pal.treeDark; c.beginPath(); c.ellipse(x + 4, y + sz * 0.12, sz * 0.42, sz * 0.18, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
        const ds = (pine ? dPine : dOak) ?? dOak ?? dPine;
        if (ds) { c.imageSmoothingEnabled = true; drawDotaFrame(c, ds, "idle", 0, 0, x, y, 1, sz / 110, night ? "rgba(30,55,50,0.6)" : pine ? "rgba(40,95,50,0.55)" : "rgba(60,120,45,0.55)"); c.imageSmoothingEnabled = false; }
        else if (pine) c.drawImage(treetop!, (Math.floor(d.x) & 1) * 96, 96, 96, 128, x - sz / 2, y - sz * 1.1, sz, sz * 1.33);
        else c.drawImage(treetop!, (Math.floor(d.x) & 1) * 96, 0, 96, 96, x - sz / 2, y - sz * 0.85, sz, sz);
        if (night) { c.fillStyle = pal.treeDark; c.globalAlpha = 0.45; c.beginPath(); c.arc(x, y - sz * 0.35, sz * 0.5, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
      } else if (d.kind === "rock" && (rock || dRock)) {
        const sz = d.s * 3;
        if (dRock) { c.imageSmoothingEnabled = true; drawDotaFrame(c, dRock, "idle", 0, 0, x, y + sz * 0.3, 1, sz / 40, night ? "rgba(40,45,55,0.6)" : "rgba(95,90,75,0.55)"); c.imageSmoothingEnabled = false; }
        else c.drawImage(rock!, (Math.floor(d.x) & 1) * 32, 0, 32, 32, x - sz / 2, y - sz / 2, sz, sz);
      } else if (d.kind === "flower") {
        c.fillStyle = pal.tuft; c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill();
      }
    }
  }
}
