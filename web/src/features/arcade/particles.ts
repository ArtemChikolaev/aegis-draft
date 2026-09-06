// Пиксельные частицы эффектов Аркады (владелец 2026-09-06: «у нас нет эффектов горения и прочих вещей»; ориентир — Death Must
// Die: огонь, лёд и искры из крупных квадратных пикселей, а не градиентов). Чисто визуально: сим и реплей ничего не знают.
// Случайность — хеш (семя, индекс), а фаза — от тика, поэтому частицы плавно живут, а не мерцают хаосом на каждом кадре.
// `px` — размер арт-пикселя в мировых единицах (фактор пиксельного режима): все квадраты кратны ему и прилипают к сетке.

export interface ParticlePalette { fire: string; ember: string; smoke: string; frost: string; ice: string; lightning: string; text: string }

function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, size: number, px: number): void {
  const s = Math.max(px, Math.round(size / px) * px);
  c.fillRect(Math.round(x / px) * px - s / 2, Math.round(y / px) * px - s / 2, s, s);
}

/** Горящий враг: языки пламени поднимаются от ног (x, y) на высоту `h` силуэта — ядро светлое, выше — оранжевое, у верха гаснет
 *  в дым. `h` — видимая высота спрайта (не радиус коллизии: у кобольда r = 12 при росте 60). */
export function drawBurning(c: CanvasRenderingContext2D, x: number, y: number, h: number, tick: number, seed: number, px: number, pal: ParticlePalette): void {
  const n = h > 90 ? 18 : 14;
  const life = 34;
  // Отсвет на земле: пламя освещает ноги — мерцающий эллипс под силуэтом.
  c.globalAlpha = 0.16 + 0.08 * hash(tick >> 2, seed);
  c.fillStyle = pal.fire;
  c.beginPath(); c.ellipse(x, y, h * 0.32, h * 0.12, 0, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < n; i++) {
    const t = (tick + hash(seed, i) * life) % life;
    const k = t / life;
    const ox = (hash(seed, i + 31) - 0.5) * h * 0.42 * (1 - k * 0.5) + Math.sin(k * 7 + i) * px;
    const py = y - k * h * 1.05;
    c.globalAlpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
    c.fillStyle = k < 0.3 ? pal.ember : k < 0.7 ? pal.fire : pal.smoke;
    dot(c, x + ox, py, px * (k < 0.3 ? 3 : k < 0.7 ? 2 : 1), px);
  }
  c.globalAlpha = 1;
}

/** Замороженный/охлаждённый враг: осколки льда кружат вокруг корпуса на середине роста `h`, изредка блик. */
export function drawChilled(c: CanvasRenderingContext2D, x: number, y: number, h: number, tick: number, seed: number, px: number, pal: ParticlePalette): void {
  for (let i = 0; i < 5; i++) {
    const a = hash(seed, i + 7) * Math.PI * 2 + tick * 0.015 * (i % 2 ? 1 : -1);
    const rr = h * (0.28 + 0.14 * hash(seed, i + 19));
    const glint = ((tick + i * 9) % 48) < 4;
    c.globalAlpha = glint ? 1 : 0.9;
    c.fillStyle = glint ? pal.text : i % 2 ? pal.ice : pal.frost;
    dot(c, x + Math.cos(a) * rr, y - h * 0.45 + Math.sin(a) * rr * 0.5, px * (glint ? 3 : 2), px);
  }
  c.globalAlpha = 1;
}

/** Аура Radiance у героя: кольцо тлеющих угольков, поднимающихся и гаснущих (плотность — от ранга). */
export function drawEmberRing(c: CanvasRenderingContext2D, x: number, y: number, radius: number, tick: number, px: number, pal: ParticlePalette, density: number): void {
  const life = 70;
  for (let i = 0; i < density; i++) {
    const t = (tick * 0.8 + hash(i, 3) * life) % life;
    const k = t / life;
    const a = hash(i, 5) * Math.PI * 2 + tick * 0.003;
    const rr = radius * (0.55 + 0.45 * hash(i, 9));
    c.globalAlpha = (1 - k) * 0.9;
    c.fillStyle = k < 0.3 ? pal.ember : k < 0.7 ? pal.fire : pal.smoke;
    dot(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6 - k * 22, px * (k < 0.5 ? 2 : 1), px);
  }
  c.globalAlpha = 1;
}

/**
 * Погода ночью (T13.22): редкие искры пепла сносит ветром через весь экран. Рисуется в мировых
 * координатах поверх земли, поэтому «летит» относительно карты, а не приклеена к камере; сетка
 * частиц привязана к экранному прямоугольнику, чтобы их число не росло с размером мира.
 */
export function drawWeather(c: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, tick: number, px: number, pal: ParticlePalette, count: number): void {
  const life = 260;
  for (let i = 0; i < count; i++) {
    const t = (tick + hash(i, 71) * life) % life;
    const k = t / life;
    // Каждая искра живёт в своей колонке; за жизнь сносит вправо и вниз на пол-экрана.
    const x = camX + hash(i, 13) * w + k * w * 0.45;
    const y = camY + ((hash(i, 29) * h + k * h * 0.8) % h);
    // Дым на ночной земле не виден вовсе — основная масса светлая, каждая пятая искра тлеет угольком.
    c.globalAlpha = (k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1) * 0.5;
    c.fillStyle = i % 5 === 0 ? pal.ember : pal.text;
    dot(c, x, y, px * (i % 5 === 0 ? 3 : 2), px);
  }
  c.globalAlpha = 1;
}

/**
 * Дым и угольки на месте сгоревшего врага (T13.22): столб поднимается и гаснет за время эффекта.
 * `k` — доля прожитого (0…1), `r` — радиус врага: от него зависит ширина столба.
 */
export function drawAsh(c: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, seed: number, px: number, pal: ParticlePalette): void {
  const n = 10;
  for (let i = 0; i < n; i++) {
    // Каждая частица стартует со своей задержкой, поэтому столб не гаснет разом.
    const t = Math.max(0, Math.min(1, (k - hash(seed, i) * 0.35) / 0.65));
    if (t <= 0) continue;
    const ox = (hash(seed, i + 11) - 0.5) * r * 2 * (0.4 + t);
    const py = y - t * r * 3.4;
    c.globalAlpha = (1 - t) * 0.85;
    c.fillStyle = t < 0.3 ? pal.ember : t < 0.6 ? pal.fire : pal.smoke;
    dot(c, x + ox, py, px * (t < 0.3 ? 2 : 1), px);
  }
  c.globalAlpha = 1;
}

/** Пыль из-под ног при рывке: короткий шлейф квадратов позади точки прыжка. */
export function drawDust(c: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, k: number, px: number, pal: ParticlePalette): void {
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  for (let i = 0; i < 8; i++) {
    const along = (i / 8) * d;
    const spread = (hash(i, 47) - 0.5) * 14;
    c.globalAlpha = (1 - k) * (1 - i / 10) * 0.75;
    c.fillStyle = i % 3 === 0 ? pal.smoke : pal.text;
    dot(c, x - ux * along - uy * spread, y - uy * along + ux * spread * 0.5 + k * 6, px * (i % 3 === 0 ? 2 : 1), px);
  }
  c.globalAlpha = 1;
}

/** Аура Skadi: ледяная крошка оседает вокруг героя. */
export function drawFrostMist(c: CanvasRenderingContext2D, x: number, y: number, radius: number, tick: number, px: number, pal: ParticlePalette, density: number): void {
  const life = 90;
  for (let i = 0; i < density; i++) {
    const t = (tick * 0.6 + hash(i, 13) * life) % life;
    const k = t / life;
    const a = hash(i, 17) * Math.PI * 2;
    const rr = radius * (0.5 + 0.5 * hash(i, 23));
    c.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    c.fillStyle = i % 3 === 0 ? pal.text : i % 2 ? pal.ice : pal.frost;
    dot(c, x + Math.cos(a) * rr + Math.sin(k * 9 + i) * px, y + Math.sin(a) * rr * 0.6 - 18 + k * 24, px * 1.5, px);
  }
  c.globalAlpha = 1;
}

/** Искры Maelstrom: короткие электрические штрихи, меняющие положение раз в несколько тиков. */
export function drawSparks(c: CanvasRenderingContext2D, x: number, y: number, radius: number, tick: number, px: number, pal: ParticlePalette, count: number): void {
  const step = tick >> 2;
  c.fillStyle = pal.lightning;
  for (let i = 0; i < count; i++) {
    if (hash(step, i + 41) > 0.45) continue;
    const a = hash(step, i + 43) * Math.PI * 2, rr = radius * (0.4 + 0.6 * hash(step, i + 47));
    const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr * 0.6;
    c.globalAlpha = 0.9;
    dot(c, sx, sy, px * 2, px);
    c.fillStyle = pal.text; dot(c, sx + px, sy - px, px, px); c.fillStyle = pal.lightning;
  }
  c.globalAlpha = 1;
}

/** Хвост снаряда: три угасающих квадрата позади по вектору скорости. */
export function drawProjectileTrail(c: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, r: number, kind: "fire" | "shard" | "zap" | "siege", tick: number, px: number, pal: ParticlePalette): void {
  const l = Math.hypot(vx, vy) || 1;
  const ux = vx / l, uy = vy / l;
  for (let i = 1; i <= 3; i++) {
    const back = r * 1.2 * i + px;
    const wob = kind === "zap" ? (hash(tick >> 1, i) - 0.5) * r * 1.5 : kind === "fire" ? Math.sin(tick * 0.5 + i) * px : 0;
    c.globalAlpha = 0.75 - i * 0.2;
    c.fillStyle = kind === "fire" ? (i === 1 ? pal.ember : i === 2 ? pal.fire : pal.smoke) : kind === "shard" ? (i === 1 ? pal.text : pal.frost) : kind === "zap" ? pal.lightning : pal.smoke;
    dot(c, x - ux * back - uy * wob, y - uy * back + ux * wob, px * Math.max(1, 2.5 - i * 0.5), px);
  }
  c.globalAlpha = 1;
}

/** Искры попадания: несколько квадратов разлетаются от точки удара (крит — больше и дальше). */
export function drawHitSparks(c: CanvasRenderingContext2D, x: number, y: number, k: number, crit: boolean, seed: number, px: number, pal: ParticlePalette): void {
  const n = crit ? 7 : 4, dist = crit ? 26 : 14;
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i + 61) * Math.PI * 2, d = dist * (0.4 + 0.6 * hash(seed, i + 67)) * k;
    c.globalAlpha = 1 - k;
    c.fillStyle = crit ? (i % 2 ? pal.ember : pal.text) : i % 3 === 0 ? pal.text : pal.ember;
    dot(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7 - k * 6, px * (crit && i % 2 ? 2 : 1), px);
  }
  c.globalAlpha = 1;
}

/** Кольцо взрыва/новы из отдельных пикселей (вместо гладкой окружности): основной цвет `main` и светлое ядро `core`. */
export function drawPixelRing(c: CanvasRenderingContext2D, x: number, y: number, radius: number, k: number, seed: number, px: number, main: string, core: string): void {
  const n = Math.max(8, Math.round(radius / (px * 2)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed, i) * 0.3;
    const rr = radius * (0.92 + 0.16 * hash(seed, i + 71));
    c.globalAlpha = (1 - k) * (0.6 + 0.4 * hash(seed, i + 73));
    c.fillStyle = hash(seed, i + 79) < 0.3 ? core : main;
    dot(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7, px * (hash(seed, i + 83) < 0.5 ? 2 : 1), px);
  }
  c.globalAlpha = 1;
}

/** Вид снаряда автоатаки героя (владелец 2026-09-06: «не один и тот же шарик у всех — у Мираны стрела,
 *  у Shadow Fiend красный сгусток»). Рисуем пиксельными квадратами вдоль вектора скорости. */
export type ProjectileArt = "arrow" | "bolt" | "knife" | "bullet";

export function drawHeroProjectile(c: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, art: ProjectileArt, color: string, core: string, px: number): void {
  const l = Math.hypot(vx, vy) || 1;
  const ux = vx / l, uy = vy / l;      // вдоль полёта
  const nx = -uy, ny = ux;             // поперёк
  const at = (along: number, across: number, size: number, fill: string) => {
    c.fillStyle = fill;
    dot(c, x + ux * along + nx * across, y + uy * along + ny * across, size, px);
  };
  switch (art) {
    case "arrow":
      // Древко назад, наконечник вперёд, оперение по бокам.
      at(px * 2, 0, px * 2, core);
      at(0, 0, px, color);
      at(-px * 2, 0, px, color);
      at(-px * 3, px, px, color);
      at(-px * 3, -px, px, color);
      break;
    case "knife":
      // Клинок вдоль полёта и короткая гарда поперёк.
      at(px, 0, px * 2, core);
      at(-px, 0, px, color);
      at(-px, px, px, color);
      at(-px, -px, px, color);
      break;
    case "bullet":
      at(px, 0, px * 2, core);
      at(-px, 0, px, color);
      break;
    default:
      // Сгусток: светлое ядро и ореол.
      at(0, 0, px * 2, core);
      at(-px, px, px, color);
      at(-px, -px, px, color);
      at(-px * 2, 0, px, color);
      break;
  }
}
