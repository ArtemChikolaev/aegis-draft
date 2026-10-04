import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ceilLog2, dcos, datan2, dexp, dhypot, dlog, dpow, dsin, ipow } from "../src/game/dmath.ts";
import { Rng } from "../src/game/rng.ts";

// Детерминизм игровой логики между движками (M24 — сим Аркады, M25 — драфт и Manager): V8 (Chrome, Node) и JavaScriptCore
// (Safari, WebView iPhone) по-разному округляют `Math.sin/cos/atan2/hypot/pow/exp/log` — забег Аркады расходился за 2–5
// минут. Проверка движков — `scripts/cross_engine_digests.mts` (нужен WebKit Playwright); здесь — точность замены и запрет.

describe("детерминированная тригонометрия", () => {
  it("совпадает с Math до 1e-11 на всём диапазоне углов сима", () => {
    const rng = new Rng("dmath");
    let worst = 0;
    for (let i = 0; i < 20000; i++) {
      const x = (rng.float() - 0.5) * 40 * Math.PI;
      worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
      const y = (rng.float() - 0.5) * 4000, z = (rng.float() - 0.5) * 4000;
      worst = Math.max(worst, Math.abs(datan2(y, z) - Math.atan2(y, z)), Math.abs(dhypot(y, z) - Math.hypot(y, z)) / Math.max(1, Math.hypot(y, z)));
    }
    expect(worst).toBeLessThan(1e-11);
  });

  it("четверти atan2 и особые точки — как у Math.atan2", () => {
    for (const [y, x] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1], [3, 1e-9]]) {
      expect(datan2(y, x)).toBeCloseTo(Math.atan2(y, x), 11);
    }
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBeCloseTo(1, 12); // край ряда (sin π/2): остаток ~4e-14
  });
});

describe("логарифм, экспонента и степень", () => {
  it("совпадают с Math до 1e-12 относительно на диапазонах игровой логики", () => {
    const rng = new Rng("dmath-exp");
    let worst = 0;
    for (let i = 0; i < 20000; i++) {
      const u = 1e-9 + rng.float() * (1 - 1e-9);
      worst = Math.max(worst, Math.abs(dlog(u) - Math.log(u)) / Math.max(1, Math.abs(Math.log(u))));
      const x = (rng.float() - 0.5) * 60;
      worst = Math.max(worst, Math.abs(dexp(x) - Math.exp(x)) / Math.exp(x));
      const b = rng.float() * 45, y = 1 + rng.float();
      worst = Math.max(worst, Math.abs(dpow(b, y) - Math.pow(b, y)) / Math.max(1, Math.pow(b, y)));
      const z = (rng.float() - 0.5) * 4;
      worst = Math.max(worst, Math.abs(dpow(10, z) - Math.pow(10, z)) / Math.pow(10, z));
    }
    expect(worst).toBeLessThan(1e-12);
    expect(dpow(0, 1.5)).toBe(0);
    expect(dpow(7, 0)).toBe(1);
    expect(dlog(1)).toBe(0);
    // Целая степень — умножениями: отличие от Math.pow только в последних битах, зато одинаковое везде.
    for (const [x, n] of [[1.1, 10], [0.85, 7], [2, -3], [1.03, 0]]) expect(ipow(x, n)).toBeCloseTo(Math.pow(x, n), 12);
  });

  it("⌈log₂ n⌉ целочисленно: размер сетки и число раундов", () => {
    for (const [n, k] of [[1, 0], [2, 1], [3, 2], [8, 3], [9, 4], [16, 4], [32, 5]]) expect(ceilLog2(n)).toBe(k);
  });
});

describe("в игровой логике нет приблизительной математики JS", () => {
  it("sin/cos/tan/atan2/hypot/pow/exp/log и ** не используются в src/game — только dmath.ts", () => {
    const root = new URL("../src/game/", import.meta.url);
    const files: string[] = [];
    const walk = (dir: URL, rel: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) walk(new URL(`${ent.name}/`, dir), `${rel}${ent.name}/`);
        else if (ent.name.endsWith(".ts") && `${rel}${ent.name}` !== "dmath.ts") files.push(`${rel}${ent.name}`);
      }
    };
    walk(root, "");
    expect(files.length).toBeGreaterThan(40);
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(new URL(f, root), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const m of src.matchAll(/Math\.(sin|cos|tan|asin|acos|atan|atan2|hypot|pow|exp|expm1|log|log1p|log2|log10|cbrt|sinh|cosh|tanh)\(|[^*/]\*\*[^*/]/g)) bad.push(`${f}: ${m[0].trim()}`);
    }
    expect(bad).toEqual([]);
  });
});
