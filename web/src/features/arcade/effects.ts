// Косметические эффекты героя (T13.31, владелец 2026-09-07: «эффекты мега бедные и никак не
// отображаются в превью; хочется красивые огненные эффекты, свечение под персонажем, как в Dota»).
// Один модуль на бой и гардероб: рендерер и превью облика зовут одни и те же функции, поэтому то,
// что выбрано в гардеробе, выглядит в бою ровно так же. Стиль — пиксельный, как particles.ts:
// крупные квадраты, детерминированные от тика и хеша, без градиентов.
//
// Слоты: `frame` — наземный эффект под ногами (кольцо огня/льда/золота/пустоты), `aura` — свечение
// самого героя (языки пламени, ледяная крошка, молнии, золотая пыльца), `trail` — след за героем,
// `death` — эффект смерти врагов, `tint` — оттенок умений (читает рендерер напрямую).
import { drawFrostMist, drawPixelRing, type ParticlePalette } from "./particles.ts";

export interface EffectPalette extends ParticlePalette { aegis: string; playerRing: string; heal: string; crit: string }

/** Цвета эффектов из токенов `--arcade-*`: canvas не наследует CSS-переменные. */
export function readEffectPalette(): EffectPalette {
  const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const get = (k: string, fallback: string) => (style?.getPropertyValue(`--arcade-${k}`).trim() || fallback);
  return {
    fire: get("fire", "#ff9a45"), ember: get("ember", "#ffd27a"), smoke: get("smoke", "#5a4a44"), frost: get("frost", "#8bd8ff"),
    ice: get("ice", "#e6f7ff"), lightning: get("lightning", "#d7bcff"), text: get("text", "#fff"), aegis: get("aegis", "#ffd48a"),
    playerRing: get("player-ring", "#ffd48a"), heal: get("heal", "#9ce77e"), crit: get("crit", "#ff6b6b"),
  };
}

function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, size: number, px: number): void {
  const s = Math.max(px, Math.round(size / px) * px);
  c.fillRect(Math.round(x / px) * px - s / 2, Math.round(y / px) * px - s / 2, s, s);
}

/** Пиксельное кольцо-эллипс у ног: точки по окружности с шагом в арт-пиксель. */
function pixelEllipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, px: number, fill: string, gap = 1): void {
  c.fillStyle = fill;
  const n = Math.max(12, Math.round((rx * 2 * Math.PI) / (px * gap)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    dot(c, x + Math.cos(a) * rx, y + Math.sin(a) * ry, px, px);
  }
}

export type GroundEffect = "ember" | "frost" | "gold" | "void";
export type AuraEffect = "fire" | "frost" | "lightning" | "aegis";
export type TrailEffect = "fire" | "frost" | "lightning" | "aegis";
export type DeathEffect = "ring" | "shatter" | "nova";

/**
 * Наземный эффект под героем (слот `frame`): кольцо у ног радиуса `R` (радиус коллизии героя).
 * Рисуется ДО спрайта — это наклейка на земле, иначе кольцо ложится поверх ног.
 */
export function drawGroundEffect(c: CanvasRenderingContext2D, x: number, y: number, R: number, kind: GroundEffect, tick: number, px: number, pal: EffectPalette, flare = 0): void {
  const rx = R * 1.35, ry = R * 0.58;
  const boost = 1 + flare * 1.5;
  switch (kind) {
    case "ember": {
      // Тлеющее кольцо: угольки по окружности, каждый пятый вспыхивает, и языки огня поднимаются.
      c.globalAlpha = 0.35; pixelEllipse(c, x, y, rx, ry, px, pal.smoke, 2); c.globalAlpha = 1;
      const n = Math.round(14 * boost);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + tick * 0.01;
        const life = 40, t = (tick + hash(i, 5) * life) % life, k = t / life;
        c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        c.fillStyle = k < 0.35 ? pal.ember : k < 0.7 ? pal.fire : pal.smoke;
        dot(c, x + Math.cos(a) * rx, y + Math.sin(a) * ry - k * R * 0.9 * boost, px * (k < 0.5 ? 2 : 1), px);
      }
      c.globalAlpha = 1;
      break;
    }
    case "frost": {
      // Ледяное кольцо: инеевый обод и стоящие кристаллы, изредка блик.
      c.globalAlpha = 0.6; pixelEllipse(c, x, y, rx, ry, px, pal.frost, 2); c.globalAlpha = 1;
      const n = Math.round(8 * boost);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        const gx = x + Math.cos(a) * rx, gy = y + Math.sin(a) * ry;
        const glint = ((tick + i * 11) % 60) < 5;
        c.fillStyle = glint ? pal.text : i % 2 ? pal.ice : pal.frost;
        dot(c, gx, gy - px, px, px); dot(c, gx, gy - px * 2.5, px, px); dot(c, gx, gy - px * 4, px, px);
        if (glint) dot(c, gx + px, gy - px * 3, px, px);
      }
      drawFrostMist(c, x, y, R * 1.4, tick, px, pal, Math.round(6 * boost));
      break;
    }
    case "gold": {
      // Золотое кольцо Aegis: двойной обод, между ободами кружат искры, вверх уходит золотая пыльца.
      c.globalAlpha = 0.9; pixelEllipse(c, x, y, rx, ry, px, pal.aegis, 1.5);
      c.globalAlpha = 0.5; pixelEllipse(c, x, y, rx * 1.25, ry * 1.25, px, pal.aegis, 2.5); c.globalAlpha = 1;
      const n = Math.round(6 * boost);
      for (let i = 0; i < n; i++) {
        const a = tick * 0.02 + (i / n) * Math.PI * 2;
        const rr = 1.12 + 0.06 * Math.sin(tick * 0.07 + i);
        c.fillStyle = i % 2 ? pal.text : pal.aegis;
        dot(c, x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr, px, px);
      }
      const life = 50;
      for (let i = 0; i < Math.round(8 * boost); i++) {
        const t = (tick + hash(i, 9) * life) % life, k = t / life;
        const a = hash(i, 3) * Math.PI * 2;
        c.globalAlpha = 1 - k;
        c.fillStyle = k < 0.5 ? pal.aegis : pal.text;
        dot(c, x + Math.cos(a) * rx * 0.8, y + Math.sin(a) * ry * 0.8 - k * R * 1.2, px, px);
      }
      c.globalAlpha = 1;
      break;
    }
    case "void": {
      // Пустотный вихрь: две спирали фиолетовых искр закручиваются к центру, кольцо пульсирует.
      c.globalAlpha = 0.45 + 0.35 * Math.abs(Math.sin(tick / 18)); pixelEllipse(c, x, y, rx, ry, px, pal.lightning, 2); c.globalAlpha = 1;
      const n = Math.round(18 * boost);
      for (let i = 0; i < n; i++) {
        const k = ((tick * 0.02 + i / n) % 1);
        const a = k * Math.PI * 4 + (i % 2 ? Math.PI : 0);
        const rr = 1.3 - k * 1.1;
        c.globalAlpha = 0.5 + 0.5 * (1 - k);
        c.fillStyle = k > 0.8 ? pal.text : pal.lightning;
        dot(c, x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr - k * R * 0.3, px * (k > 0.6 ? 1 : 2), px);
      }
      c.globalAlpha = 1;
      break;
    }
  }
}

/**
 * Геометрия силуэта героя в мировых координатах — чтобы свечение шло ПО контуру и вокруг него, а не
 * сыпалось внутри спрайта (владелец 2026-09-07: «эффект должен окружать персонажа, как гем
 * Terrorblade или горящий Undying»; «корона не на месте»). `outline` — точки контура кадра
 * (sprites.ts frameGeometry), `silhouette` рисует кадр сплошным цветом со сдвигом — из него
 * складывается ореол за спиной героя.
 */
export interface AuraGeo {
  left: number; top: number; right: number; bottom: number;
  outline: readonly { x: number; y: number }[];
  silhouette?: (color: string, alpha: number, dx: number, dy: number) => void;
}

/** Геометрия по коробке (герой без листа Dota): контур — эллипс вокруг ног (x, y) высотой h. */
export function auraGeoFromBox(x: number, y: number, h: number, w = h * 0.5): AuraGeo {
  const outline: { x: number; y: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    outline.push({ x: x + Math.cos(a) * w * 0.5, y: y - h * 0.5 + Math.sin(a) * h * 0.5 });
  }
  return { left: x - w / 2, top: y - h, right: x + w / 2, bottom: y, outline };
}

/** Ореол за спрайтом: силуэт цветом свечения, сдвинутый в восемь сторон на `d` арт-пикселей. */
function rim(geo: AuraGeo, color: string, alpha: number, d: number): void {
  if (!geo.silhouette) return;
  for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]] as const) geo.silhouette(color, alpha, dx, dy);
}

/** Точка контура с индексом i (по кругу) — детерминированно, чтобы частица жила на своей точке. */
function edgePoint(geo: AuraGeo, i: number): { x: number; y: number } {
  const n = geo.outline.length || 1;
  return geo.outline[((i % n) + n) % n] ?? { x: (geo.left + geo.right) / 2, y: geo.bottom };
}

/**
 * Свечение героя (слот `aura`). Два слоя: `back` — до спрайта (ореол по контуру и крупные языки
 * за спиной), `front` — после спрайта (редкие искры/кристаллы на самом контуре, чтобы герой
 * оставался читаемым). `flare` (0…1) — вспышка по T: эффект разгорается втрое.
 */
export function drawAuraEffect(c: CanvasRenderingContext2D, geo: AuraGeo, kind: AuraEffect, tick: number, seed: number, px: number, pal: EffectPalette, flare: number, layer: "back" | "front"): void {
  const boost = 1 + flare * 2;
  const h = Math.max(px * 4, geo.bottom - geo.top);
  const cx = (geo.left + geo.right) / 2;
  const n = geo.outline.length;
  if (n === 0) return;
  switch (kind) {
    case "fire": {
      if (layer === "back") {
        // Ореол: тёплый контур мерцает; за спиной — языки пламени от нижних двух третей контура вверх.
        rim(geo, pal.fire, 0.28 + 0.12 * hash(tick >> 2, seed) + flare * 0.3, px);
        rim(geo, pal.ember, 0.12 + flare * 0.2, px * 2);
        const life = 36, count = Math.round(n * 0.7 * boost);
        for (let i = 0; i < count; i++) {
          const pt = edgePoint(geo, Math.floor(hash(seed, i + 100) * n));
          if (pt.y < geo.top + h * 0.3) continue;
          const t = (tick * 1.1 + hash(seed, i) * life) % life, k = t / life;
          const out = (pt.x < cx ? -1 : 1) * k * px * 3;
          c.globalAlpha = k < 0.75 ? 0.95 : 1 - (k - 0.75) / 0.25;
          c.fillStyle = k < 0.3 ? pal.ember : k < 0.65 ? pal.fire : pal.smoke;
          dot(c, pt.x + out + Math.sin(k * 8 + i) * px, pt.y - k * h * 0.55 * boost, px * (k < 0.5 ? 2 : 1), px);
        }
      } else {
        // Перед героем — только редкие угольки, всплывающие с контура.
        const life = 40, count = Math.round(6 * boost);
        for (let i = 0; i < count; i++) {
          const pt = edgePoint(geo, Math.floor(hash(seed, i + 300) * n));
          const t = (tick + hash(seed, i + 7) * life) % life, k = t / life;
          c.globalAlpha = (1 - k) * 0.9;
          c.fillStyle = k < 0.4 ? pal.ember : pal.fire;
          dot(c, pt.x + Math.sin(k * 9 + i) * px, pt.y - k * h * 0.35, px, px);
        }
      }
      c.globalAlpha = 1;
      break;
    }
    case "frost": {
      if (layer === "back") {
        rim(geo, pal.frost, 0.3 + flare * 0.3, px);
        rim(geo, pal.ice, 0.1 + flare * 0.15, px * 2);
        // Холодный пар стелется от ног и поднимается вдоль контура.
        const life = 70, count = Math.round(n * 0.35 * boost);
        for (let i = 0; i < count; i++) {
          const pt = edgePoint(geo, Math.floor(hash(seed, i + 120) * n));
          const t = (tick * 0.7 + hash(seed, i + 11) * life) % life, k = t / life;
          c.globalAlpha = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.8;
          c.fillStyle = i % 3 === 0 ? pal.text : pal.ice;
          dot(c, pt.x + (pt.x < cx ? -1 : 1) * k * px * 4, pt.y - k * h * 0.3, px * 1.5, px);
        }
      } else {
        // Кристаллы инея сидят на контуре нижней половины и изредка блестят.
        const count = Math.round(10 * boost);
        for (let i = 0; i < count; i++) {
          const pt = edgePoint(geo, Math.floor(hash(seed, i + 200) * n));
          if (pt.y < geo.top + h * 0.4) continue;
          const glint = ((tick + i * 13) % 70) < 6;
          c.globalAlpha = 0.95;
          c.fillStyle = glint ? pal.text : i % 2 ? pal.ice : pal.frost;
          dot(c, pt.x, pt.y, px, px); dot(c, pt.x, pt.y - px * 1.5, px, px);
          if (glint) dot(c, pt.x + px, pt.y - px, px, px);
        }
      }
      c.globalAlpha = 1;
      break;
    }
    case "lightning": {
      if (layer === "back") {
        // Контур вспыхивает фиолетовым, когда бьёт дуга.
        const step = tick >> 2;
        const strike = hash(step, seed + 77) < 0.5 * boost;
        rim(geo, pal.lightning, (strike ? 0.45 : 0.18) + flare * 0.25, px);
        if (strike) {
          // Дуга между двумя точками контура — снаружи силуэта, ломаной.
          const a = edgePoint(geo, Math.floor(hash(step, seed + 1) * n)), b = edgePoint(geo, Math.floor(hash(step, seed + 2) * n));
          const segs = 6;
          c.fillStyle = pal.text;
          for (let i = 0; i <= segs; i++) {
            const k = i / segs;
            const j = i === 0 || i === segs ? 0 : (hash(step, seed + 10 + i) - 0.5) * px * 5;
            dot(c, a.x + (b.x - a.x) * k + j, a.y + (b.y - a.y) * k + j, px, px);
          }
        }
      } else {
        // Искры на контуре: короткие штрихи, меняющие место каждые несколько тиков.
        const step = tick >> 2, count = Math.round(6 * boost);
        for (let i = 0; i < count; i++) {
          if (hash(step, i + 41) > 0.55) continue;
          const pt = edgePoint(geo, Math.floor(hash(step, i + 43) * n));
          c.globalAlpha = 0.95; c.fillStyle = pal.lightning; dot(c, pt.x, pt.y, px * 2, px);
          c.fillStyle = pal.text; dot(c, pt.x + px, pt.y - px, px, px);
        }
      }
      c.globalAlpha = 1;
      break;
    }
    case "aegis": {
      if (layer === "back") {
        rim(geo, pal.aegis, 0.3 + 0.1 * Math.sin(tick / 9) + flare * 0.3, px);
        // Золотая пыльца поднимается с контура и гаснет белым.
        const life = 54, count = Math.round(n * 0.4 * boost);
        for (let i = 0; i < count; i++) {
          const pt = edgePoint(geo, Math.floor(hash(seed, i + 140) * n));
          const t = (tick * 0.9 + hash(seed, i + 90) * life) % life, k = t / life;
          c.globalAlpha = k < 0.15 ? k / 0.15 : 1 - k;
          c.fillStyle = i % 3 === 0 ? pal.text : pal.aegis;
          dot(c, pt.x + (pt.x < cx ? -1 : 1) * k * px * 3 + Math.sin(k * 6 + i) * px, pt.y - k * h * 0.4, px * (k < 0.4 ? 2 : 1), px);
        }
      } else {
        // Нимб — на макушке силуэта, чуть выше верхней точки; пульсирует.
        const hx = cx, hy = geo.top - px * 2 - h * 0.03, hr = h * 0.16 * boost;
        c.globalAlpha = 0.75 + 0.25 * Math.sin(tick / 9);
        pixelEllipse(c, hx, hy, hr, hr * 0.4, px, pal.aegis, 1.2);
        c.globalAlpha = 0.5;
        pixelEllipse(c, hx, hy, hr * 0.7, hr * 0.28, px, pal.text, 2);
      }
      c.globalAlpha = 1;
      break;
    }
  }
}

/** След за героем (слот `trail`): точки пути с возрастом в мс (свежие — в конце массива). */
export function drawTrailEffect(c: CanvasRenderingContext2D, pts: readonly { x: number; y: number; t: number }[], now: number, kind: TrailEffect, px: number, pal: EffectPalette): void {
  const maxAge = 520;
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const age = now - pt.t;
    if (age > maxAge) continue;
    const k = 1 - age / maxAge;                // 1 — свежая точка, 0 — гаснет
    const seed = Math.round(pt.x * 3 + pt.y * 7);
    switch (kind) {
      case "fire": {
        // Языки пламени от следа: угольки в начале, огонь, потом дым, поднимаются вверх.
        const rise = (1 - k) * 18;
        c.globalAlpha = 0.9 * k;
        c.fillStyle = k > 0.7 ? pal.ember : k > 0.35 ? pal.fire : pal.smoke;
        dot(c, pt.x + (hash(seed, 1) - 0.5) * px * 3, pt.y - rise, px * (k > 0.5 ? 2 : 1), px);
        if (k > 0.5) { c.fillStyle = pal.fire; dot(c, pt.x + (hash(seed, 2) - 0.5) * px * 5, pt.y - rise - px * 2, px, px); }
        break;
      }
      case "frost": {
        // Ледяная крошка остаётся лежать на земле и изредка блестит.
        const glint = ((now >> 5) + seed) % 7 === 0;
        c.globalAlpha = 0.85 * k;
        c.fillStyle = glint ? pal.text : i % 2 ? pal.ice : pal.frost;
        dot(c, pt.x + (hash(seed, 3) - 0.5) * px * 4, pt.y + (hash(seed, 4) - 0.5) * px * 2, px * (glint ? 2 : 1), px);
        break;
      }
      case "lightning": {
        // Ломаная молния между соседними точками пути: дрожит каждый кадр.
        const prev = pts[i - 1];
        if (!prev) break;
        c.globalAlpha = 0.9 * k;
        c.fillStyle = (now >> 4) % 2 ? pal.lightning : pal.text;
        const segs = 3;
        for (let s = 0; s <= segs; s++) {
          const q = s / segs;
          const j = s === 0 || s === segs ? 0 : (hash(seed + (now >> 4), s) - 0.5) * px * 6;
          dot(c, prev.x + (pt.x - prev.x) * q + j, prev.y + (pt.y - prev.y) * q + j, px, px);
        }
        break;
      }
      case "aegis": {
        // Золотые искры всплывают и гаснут белым.
        c.globalAlpha = k;
        c.fillStyle = k > 0.5 ? pal.aegis : pal.text;
        dot(c, pt.x + (hash(seed, 5) - 0.5) * px * 4, pt.y - (1 - k) * 14, px * (k > 0.6 ? 2 : 1), px);
        break;
      }
    }
  }
  c.globalAlpha = 1;
}

/** Эффект смерти врага (слот `death`): `k` — доля прожитого, `r` — радиус врага. Кольцо без косметики — тонкое белое. */
export function drawDeathEffect(c: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, kind: DeathEffect | null, seed: number, px: number, pal: EffectPalette): void {
  if (kind === "nova") {
    drawPixelRing(c, x, y, r * (1 + k * 4), k, seed, px, pal.lightning, pal.text);
    return;
  }
  c.globalAlpha = (1 - k) * 0.7; c.strokeStyle = pal.text; c.lineWidth = kind ? 2 : 1.5;
  const rr = r + k * r * (kind === "ring" ? 3 : 1.6);
  c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.stroke();
  if (kind === "shatter") {
    // Осколки льда разлетаются и падают, кристаллы из двух точек.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + hash(seed, i) * 0.5;
      const d = r * (0.6 + k * 3);
      c.globalAlpha = 1 - k;
      c.fillStyle = i % 2 ? pal.ice : pal.frost;
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d * 0.6 - Math.sin(k * Math.PI) * r * 1.2;
      dot(c, sx, sy, px * 2, px); c.fillStyle = pal.text; dot(c, sx + px, sy - px, px, px);
    }
  }
  c.globalAlpha = 1;
}
