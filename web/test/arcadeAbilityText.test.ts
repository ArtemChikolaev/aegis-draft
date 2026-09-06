import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEROES } from "../src/game/arcade/content/heroes.ts";

// Описание умения обещает числа, а сим считает по таблице (T13.25). Тринадцать описаний отстали от
// баланса — Gust у Drow обещал 40–130 при 70–190, Hand of God у Chen 9–17% при 16–28%. Тест держит
// диапазоны синхронными: числа в тексте должны совпадать с `value` (как есть или в процентах) или с `count`.
const I18N = readFileSync(new URL("../src/i18n/core.ts", import.meta.url), "utf8");

describe("тексты умений Аркады", () => {
  it("диапазоны в описаниях совпадают с таблицей умений", () => {
    const bad: string[] = [];
    for (const m of I18N.matchAll(/"arcade\.ab\.([a-z_0-9]+)\.([qwer])\.desc": "([^"]*)"/g)) {
      const hero = HEROES[m[1]];
      const ab = hero?.abilities[m[2] as "q" | "w" | "e" | "r"];
      if (!ab) continue;
      const vals = ab.value.filter((v) => v > 0);
      const counts = (ab.count ?? []).filter((v) => v > 0);
      if (vals.length === 0) continue;
      // Дробные числа берём целиком: «1.4–2.3 с» иначе читается как пара 4–2.
      for (const r of m[3].matchAll(/(?<![\d.])(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)(?![\d.])/g)) {
        const lo = Number(r[1]), hi = Number(r[2]);
        // Множитель крита («×2.6–3.8» у Coup de Grace) живёт в count, поэтому сверяем оба пула.
        const fits = ([pool, scale]: [number[], number]) =>
          pool.length > 0 && Math.abs(lo - Math.min(...pool) * scale) < 0.51 && Math.abs(hi - Math.max(...pool) * scale) < 0.51;
        const pools: [number[], number][] = [[vals, 1], [vals, 100], [counts, 1], [counts, 100]];
        if (!pools.some(fits)) bad.push(`${m[1]}.${m[2]}: текст ${lo}–${hi}, таблица ${Math.min(...vals)}–${Math.max(...vals)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
