import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dcos, datan2, dhypot, dsin } from "../src/game/arcade/dmath.ts";
import { Rng } from "../src/game/rng.ts";

// Детерминизм сима между движками (M24): V8 (Chrome, Node) и JavaScriptCore (Safari, WebView iPhone) по-разному округляют
// `Math.sin/cos/atan2/hypot/pow/exp/log` — до правки забег расходился за 2–5 минут, реплей с iPhone не воспроизводился на
// десктопе. Проверка движков — `scripts/cross_engine_digests.mts` (нужен WebKit Playwright); здесь — точность замены и запрет.

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

describe("в симе нет приблизительной математики JS", () => {
  it("sin/cos/tan/atan2/hypot/pow/exp/log и ** не используются — только dmath.ts", () => {
    const dir = new URL("../src/game/arcade/", import.meta.url);
    const files = [...readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "dmath.ts").map((f) => `${f}`), ...readdirSync(new URL("content/", dir)).filter((f) => f.endsWith(".ts")).map((f) => `content/${f}`)];
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const m of src.matchAll(/Math\.(sin|cos|tan|asin|acos|atan|atan2|hypot|pow|exp|expm1|log|log1p|log2|log10|cbrt|sinh|cosh|tanh)\(|[^*/]\*\*[^*/]/g)) bad.push(`${f}: ${m[0].trim()}`);
    }
    expect(bad).toEqual([]);
  });
});
