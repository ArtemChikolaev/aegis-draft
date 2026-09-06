import { describe, expect, it } from "vitest";
import { drawAsh, drawBurning, drawChilled, drawDust, drawEmberRing, drawHealAura, drawHeroProjectile, drawHitSparks, drawPixelRing, drawProjectileTrail, drawWeather } from "../src/features/arcade/particles.ts";

// Заглушка 2D-контекста: собираем прямоугольники, чтобы проверить количество, размер и привязку к сетке арт-пикселя.
function stub() {
  const rects: { x: number; y: number; w: number; h: number; alpha: number; fill: string }[] = [];
  const c = { globalAlpha: 1, fillStyle: "", fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h, alpha: this.globalAlpha, fill: String(this.fillStyle) }); }, beginPath() {}, ellipse() {}, fill() {} };
  return { c: c as unknown as CanvasRenderingContext2D, rects };
}
const pal = { fire: "fire", ember: "ember", smoke: "smoke", frost: "frost", ice: "ice", lightning: "lightning", text: "text" };

describe("пиксельные частицы эффектов (particles.ts)", () => {
  it("горение: несколько квадратов кратных зерну, над ногами врага, огненных цветов; детерминировано от тика", () => {
    const a = stub(); drawBurning(a.c, 100, 100, 60, 500, 7, 2, pal);
    const b = stub(); drawBurning(b.c, 100, 100, 60, 500, 7, 2, pal);
    expect(a.rects.length).toBeGreaterThanOrEqual(8);
    expect(Math.min(...a.rects.map((r) => r.y))).toBeLessThan(100 - 30); // пламя поднимается по силуэту, а не только у ног
    expect(a.rects).toEqual(b.rects);
    for (const r of a.rects) {
      expect(r.w % 2).toBe(0); expect(r.w).toBeGreaterThanOrEqual(2);
      expect(r.y).toBeLessThanOrEqual(100 + 2);
      expect(["fire", "ember", "smoke"]).toContain(r.fill);
      expect(r.alpha).toBeGreaterThan(0);
    }
    const c2 = stub(); drawBurning(c2.c, 100, 100, 60, 501, 7, 2, pal);
    expect(c2.rects).not.toEqual(a.rects);
    expect((a.c as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
  });

  it("холод: ледяные осколки вокруг корпуса; кольцо угольков и хвост снаряда масштабируются зерном", () => {
    const s = stub(); drawChilled(s.c, 0, 0, 60, 10, 3, 4, pal);
    expect(s.rects.length).toBe(5);
    for (const r of s.rects) { expect(r.w % 4).toBe(0); expect(["frost", "ice", "text"]).toContain(r.fill); }
    const ring = stub(); drawEmberRing(ring.c, 0, 0, 110, 30, 2, pal, 12);
    expect(ring.rects.length).toBe(12);
    for (const r of ring.rects) expect(Math.hypot(r.x, r.y)).toBeLessThan(110 + 30);
    const trail = stub(); drawProjectileTrail(trail.c, 50, 50, 260, 0, 6, "fire", 10, 2, pal);
    expect(trail.rects.length).toBe(3);
    for (const r of trail.rects) expect(r.x).toBeLessThan(50); // хвост позади по направлению полёта
  });

  it("искры попадания разлетаются со временем и гаснут; кольцо взрыва из отдельных пикселей", () => {
    const early = stub(); drawHitSparks(early.c, 0, 0, 0.1, true, 42, 2, pal);
    const late = stub(); drawHitSparks(late.c, 0, 0, 0.9, true, 42, 2, pal);
    expect(early.rects.length).toBe(7);
    const spread = (rs: typeof early.rects) => rs.reduce((m, r) => Math.max(m, Math.hypot(r.x, r.y)), 0);
    expect(spread(late.rects)).toBeGreaterThan(spread(early.rects));
    expect(late.rects[0].alpha).toBeLessThan(early.rects[0].alpha);
    const ring = stub(); drawPixelRing(ring.c, 0, 0, 60, 0.5, 1, 2, "fire", "ember");
    expect(ring.rects.length).toBeGreaterThanOrEqual(8);
    for (const r of ring.rects) expect(["fire", "ember"]).toContain(r.fill);
  });
});

describe("снаряд автоатаки по герою (владелец 2026-09-06: «у Мираны стрела, у Shadow Fiend сгусток»)", () => {
  const stub = () => {
    const rects: { x: number; y: number; w: number; fill: string }[] = [];
    const c = { globalAlpha: 1, fillStyle: "", fillRect(x: number, y: number, w: number) { rects.push({ x, y, w, fill: String(this.fillStyle) }); }, beginPath() {}, ellipse() {}, fill() {} };
    return { c: c as unknown as CanvasRenderingContext2D, rects };
  };
  it("стрела длиннее сгустка и вытянута вдоль полёта", () => {
    const arrow = stub(); drawHeroProjectile(arrow.c, 0, 0, 100, 0, "arrow", "tint", "core", 2);
    const bolt = stub(); drawHeroProjectile(bolt.c, 0, 0, 100, 0, "bolt", "tint", "core", 2);
    const spanX = (rs: typeof arrow.rects) => Math.max(...rs.map((r) => r.x)) - Math.min(...rs.map((r) => r.x));
    const spanY = (rs: typeof arrow.rects) => Math.max(...rs.map((r) => r.y)) - Math.min(...rs.map((r) => r.y));
    expect(spanX(arrow.rects)).toBeGreaterThan(spanX(bolt.rects));
    expect(spanX(arrow.rects)).toBeGreaterThan(spanY(arrow.rects));
  });
  it("поворачивается вслед за вектором скорости", () => {
    const right = stub(); drawHeroProjectile(right.c, 0, 0, 100, 0, "arrow", "tint", "core", 2);
    const down = stub(); drawHeroProjectile(down.c, 0, 0, 0, 100, "arrow", "tint", "core", 2);
    const spanX = (rs: typeof right.rects) => Math.max(...rs.map((r) => r.x)) - Math.min(...rs.map((r) => r.x));
    const spanY = (rs: typeof right.rects) => Math.max(...rs.map((r) => r.y)) - Math.min(...rs.map((r) => r.y));
    expect(spanX(right.rects)).toBeGreaterThan(spanY(right.rects));
    expect(spanY(down.rects)).toBeGreaterThan(spanX(down.rects));
  });
  it("клинок и пуля рисуются своими наборами квадратов", () => {
    const knife = stub(); drawHeroProjectile(knife.c, 0, 0, 100, 0, "knife", "tint", "core", 2);
    const bullet = stub(); drawHeroProjectile(bullet.c, 0, 0, 100, 0, "bullet", "tint", "core", 2);
    expect(knife.rects.length).toBe(4);
    expect(bullet.rects.length).toBe(2);
    expect(knife.rects.some((r) => r.fill === "core")).toBe(true);
  });
});

describe("погода и пыль рывка (T13.22)", () => {
  it("пепел ночью держится в прямоугольнике камеры и детерминирован тиком", () => {
    const a = stub(); drawWeather(a.c, 1000, 2000, 800, 600, 300, 2, pal, 40);
    const b = stub(); drawWeather(b.c, 1000, 2000, 800, 600, 300, 2, pal, 40);
    expect(a.rects.length).toBe(40);
    expect(a.rects).toEqual(b.rects);
    for (const r of a.rects) {
      // Искру сносит вправо почти на пол-экрана — правая граница с запасом.
      expect(r.x).toBeGreaterThanOrEqual(1000 - 8);
      expect(r.x).toBeLessThanOrEqual(1000 + 800 * 1.5);
      expect(r.y).toBeGreaterThanOrEqual(2000 - 8);
      expect(r.y).toBeLessThanOrEqual(2000 + 600 + 8);
      expect(["text", "ember"]).toContain(r.fill);
      expect(r.w % 2).toBe(0);
    }
    const c2 = stub(); drawWeather(c2.c, 1000, 2000, 800, 600, 301, 2, pal, 40);
    expect(c2.rects).not.toEqual(a.rects);
  });

  it("пыль рывка ложится позади героя и гаснет к концу", () => {
    const near = stub(); drawDust(near.c, 500, 500, 120, 0, 0.1, 2, pal);
    expect(near.rects.length).toBe(8);
    // Рывок был слева направо — шлейф остаётся слева от героя.
    expect(Math.max(...near.rects.map((r) => r.x))).toBeLessThanOrEqual(500 + 8);
    expect(Math.min(...near.rects.map((r) => r.x))).toBeLessThan(500 - 50);
    const late = stub(); drawDust(late.c, 500, 500, 120, 0, 0.95, 2, pal);
    expect(Math.max(...late.rects.map((r) => r.alpha))).toBeLessThan(Math.max(...near.rects.map((r) => r.alpha)));
  });
});

describe("дым сгоревшего врага (T13.22)", () => {
  it("столб поднимается над точкой смерти и гаснет к концу", () => {
    const early = stub(); drawAsh(early.c, 300, 300, 16, 0.5, 5, 2, pal);
    expect(early.rects.length).toBeGreaterThan(2);
    for (const r of early.rects) {
      expect(r.y).toBeLessThanOrEqual(300 + 2); // только вверх от точки смерти
      expect(["ember", "fire", "smoke"]).toContain(r.fill);
    }
    // В самом начале частицы ещё не стартовали, в конце — почти прозрачны.
    const start = stub(); drawAsh(start.c, 300, 300, 16, 0, 5, 2, pal);
    expect(start.rects.length).toBe(0);
    const late = stub(); drawAsh(late.c, 300, 300, 16, 0.97, 5, 2, pal);
    expect(Math.max(...late.rects.map((r) => r.alpha))).toBeLessThan(Math.max(...early.rects.map((r) => r.alpha)));
    // Детерминировано семенем.
    const again = stub(); drawAsh(again.c, 300, 300, 16, 0.5, 5, 2, pal);
    expect(again.rects).toEqual(early.rects);
  });

  // Лечащая зона без своей модели рисовалась «шариком» на полу; теперь это пыльца, всплывающая
  // внутри радиуса (T13.27). Проверяем: частиц тем больше, чем шире радиус; они поднимаются вверх
  // и детерминированы от тика.
  it("лечащая аура: пыльца по радиусу, поднимается вверх, детерминирована", () => {
    const a = stub(); drawHealAura(a.c, 100, 100, 170, 300, 2, "heal", "text");
    const b = stub(); drawHealAura(b.c, 100, 100, 170, 300, 2, "heal", "text");
    expect(a.rects).toEqual(b.rects);
    expect(a.rects.length).toBeGreaterThanOrEqual(12);
    const small = stub(); drawHealAura(small.c, 100, 100, 60, 300, 2, "heal", "text");
    expect(small.rects.length).toBeLessThan(a.rects.length);
    expect(Math.min(...a.rects.map((r) => r.y))).toBeLessThan(100);
    for (const r of a.rects) { expect(r.w % 2).toBe(0); expect(["heal", "text"]).toContain(r.fill); }
  });
});
