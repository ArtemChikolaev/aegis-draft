import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEROES, HERO_IDS, signatureVars, type HeroId, type SignatureKind } from "../src/game/arcade/content/heroes.ts";
import { arcadeEn, arcadeRu, type ArcadeKey } from "../src/i18n/arcade.ts";

// Описание умения обещает числа, а сим считает по таблице (T13.25). Тринадцать описаний отстали от
// баланса — Gust у Drow обещал 40–130 при 70–190, Hand of God у Chen 9–17% при 16–28%. Тест держит
// диапазоны синхронными: числа в тексте должны совпадать с `value` (как есть или в процентах) или с `count`.
// Строки Аркады живут в своём чанке `i18n/arcade.ts` (T22.3); счётчик ниже держит, что тест вообще нашёл описания.
const I18N = readFileSync(new URL("../src/i18n/arcade.ts", import.meta.url), "utf8");

describe("тексты умений Аркады", () => {
  it("диапазоны в описаниях совпадают с таблицей умений", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const m of I18N.matchAll(/"arcade\.ab\.([a-z_0-9]+)\.([qwer])\.desc": "([^"]*)"/g)) {
      const hero = HEROES[m[1]];
      const ab = hero?.abilities[m[2] as "q" | "w" | "e" | "r"];
      if (!ab) continue;
      seen++;
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
    expect(seen).toBeGreaterThan(800); // RU+EN × 4 умения × все герои: без этого пустой словарь молча проходит
    expect(bad).toEqual([]);
  });
});

// Честные подписи пассивок (M24): текст фирменной пассивки берёт числа героя — у Drow «Меткость +50%», у Windranger
// «+30%», — а не одного на всех. В шаблоне остаются только литералы сима, общие для всех героев вида.
describe("подписи фирменных пассивок", () => {
  const LITERALS: Partial<Record<SignatureKind, string[]>> = { souls: ["6"], aftershock: ["0.6"], quill: ["0.8"] };
  const fill = (tpl: string, vars: Record<string, number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
  const desc = (lang: "ru" | "en", kind: SignatureKind) => (lang === "ru" ? arcadeRu : arcadeEn)[`arcade.sig.${kind}.desc` as ArcadeKey];

  it("у каждого героя описание без пустых мест, а числа в шаблоне — только общие литералы сима", () => {
    const bad: string[] = [];
    for (const h of HERO_IDS) {
      const sig = HEROES[h].signature;
      if (!sig) continue;
      for (const lang of ["ru", "en"] as const) {
        const tpl = desc(lang, sig.kind);
        const text = fill(tpl, signatureVars(sig));
        if (/[{}]/.test(text)) bad.push(`${h} ${lang}: ${text}`);
        const digits = tpl.replace(/\{\w+\}/g, "").match(/\d+(?:\.\d+)?/g) ?? [];
        for (const d of digits) if (!(LITERALS[sig.kind] ?? []).includes(d)) bad.push(`${h} ${lang}: литерал ${d} в «${tpl}»`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("числа — героя и как в симе: доли, потолки шансов, скорость атаки и урон ауры в секунду", () => {
    const ru = (h: HeroId, scale = 1) => fill(desc("ru", HEROES[h].signature!.kind), signatureVars(HEROES[h].signature!, scale));
    expect(ru("drow_ranger")).toContain("+50%");
    expect(ru("windranger")).toContain("+30%");
    expect(ru("phantom_assassin")).toContain("22%");
    expect(ru("dark_willow")).toContain("10%");
    // Fiery Soul укорачивает интервал атаки на 30% — это на 43% больше ударов в секунду.
    expect(ru("lina")).toContain("на 43% быстрее");
    // Heartstopper бьёт 10 дважды в секунду.
    expect(ru("leshrac")).toContain("20 здоровья в секунду");
    expect(ru("chaos_knight")).toContain("×2.4");
    expect(ru("undying")).toContain("до +600");
    // Ранг пассивки: ×2.05 на 4-м — но не выше потолков сима.
    expect(ru("faceless_void", 2.05)).toContain("37% ударов");
    expect(ru("invoker", 2.05)).toContain("60% шанс");
    expect(ru("phantom_assassin", 2.05)).toContain("45%");
    expect(ru("bristleback", 2.05)).toContain("36.9");
  });
});
