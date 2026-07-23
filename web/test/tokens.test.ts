import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

/**
 * BUG-2026-07-18: сломанный CSS-комментарий молча съедает объявления.
 *
 * В комментарии перечислили классы через слэш — звёздочка глоба вплотную к слэшу дала
 * закрывающую последовательность, комментарий кончился раньше времени, остаток строки стал
 * мусором и убил идущие следом `--tier-<tier>-invert`. Сборка при этом ЗЕЛЁНАЯ:
 * невалидные объявления просто отбрасываются.
 * Наружу вылезло так: `var(--tier-elite)` стал пустым ⇒ градиент невалиден ⇒
 * `background-image: none`, а при `-webkit-text-fill-color: transparent` число OVR у
 * элитных игроков стало НЕВИДИМЫМ.
 *
 * Поэтому проверяем не текст, а РАЗОБРАННЫЙ AST (то же, что видит браузер): каждый
 * `var(--token)` без фолбэка обязан иметь объявление. Съеденное объявление в AST не попадёт.
 */

const SRC = new URL("../src/", import.meta.url).pathname;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith(".css") ? [full] : [];
  });
}

const files = cssFiles(SRC);

/** Токены, которые ставятся из JS/инлайн-стилей, а не объявляются в CSS. */
const SET_FROM_JS = new Set(["--modal-dim"]);

describe("design tokens", () => {
  it("каждый var(--token) без фолбэка объявлен в CSS (ловит съеденные комментарием)", () => {
    const declared = new Set<string>(SET_FROM_JS);
    const used = new Map<string, string>();

    for (const file of files) {
      const root = postcss.parse(readFileSync(file, "utf8"), { from: file });
      root.walkDecls((decl) => {
        if (decl.prop.startsWith("--")) declared.add(decl.prop);
        // var(--x) без второго аргумента: `var(--x)` или `var( --x )`.
        for (const match of decl.value.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
          used.set(match[1], `${file.replace(SRC, "")}: ${decl.prop}`);
        }
      });
    }

    const missing = [...used].filter(([token]) => !declared.has(token));
    expect(missing.map(([token, where]) => `${token} (${where})`)).toEqual([]);
  });

  it("парсер видит весь инвертный набор тиров (он и был съеден)", () => {
    const root = postcss.parse(readFileSync(join(SRC, "design/tokens.css"), "utf8"));
    const declared = new Set<string>();
    root.walkDecls((decl) => { if (decl.prop.startsWith("--")) declared.add(decl.prop); });

    for (const tier of ["immortal", "elite", "strong", "mid", "low", "weak"]) {
      expect(declared).toContain(`--tier-${tier}-invert`);
    }
    expect(declared).toContain("--tier-immortal-shine-invert");
    expect(declared).toContain("--tier-elite-shine-invert");
    expect(declared).toContain("--tier-liability-veil-invert");
  });

  it("всегда тёмная поверхность ремапит тема-зависимые тиры", () => {
    const root = postcss.parse(readFileSync(join(SRC, "design/base.css"), "utf8"));
    const remapped = new Map<string, string>();
    root.walkRules((rule) => {
      if (rule.selector !== ".on-invert-surface") return;
      rule.walkDecls((decl) => remapped.set(decl.prop, decl.value));
    });

    for (const tier of ["immortal", "elite", "strong", "mid", "low", "weak"]) {
      expect(remapped.get(`--tier-${tier}`)).toBe(`var(--tier-${tier}-invert)`);
    }
    expect(remapped.get("--tier-immortal-shine")).toBe("var(--tier-immortal-shine-invert)");
    expect(remapped.get("--tier-elite-shine")).toBe("var(--tier-elite-shine-invert)");
    expect(remapped.get("--tier-liability-veil")).toBe("var(--tier-liability-veil-invert)");
  });

  it("reduced-motion полностью гасит движение immortal, сохраняя статичный статус", () => {
    const root = postcss.parse(readFileSync(join(SRC, "design/base.css"), "utf8"));
    const reducedRules = new Map<string, Map<string, string>>();
    root.walkAtRules("media", (media) => {
      if (media.params !== "(prefers-reduced-motion: reduce)") return;
      media.walkRules((rule) => {
        const declarations = new Map<string, string>();
        rule.walkDecls((decl) => declarations.set(decl.prop, decl.value));
        for (const selector of rule.selectors) reducedRules.set(selector, declarations);
      });
    });

    for (const selector of [".card-tint--immortal::before", ".card-tint--immortal::after"]) {
      expect(reducedRules.get(selector)?.get("animation")).toBe("none");
      expect(reducedRules.get(selector)?.get("background")).toBe("none");
    }
    expect(reducedRules.get(".ovr-tier--immortal")?.get("animation")).toBe("none");
    expect(reducedRules.get(".ovr-tier--immortal")?.get("filter")).toContain("--tier-immortal");
  });

  it("camp-карточка контейнит absolute-фойл, не меняя позиционирование общего tier-словаря", () => {
    const campRoot = postcss.parse(readFileSync(join(SRC, "features/run/camp.css"), "utf8"));
    const baseRoot = postcss.parse(readFileSync(join(SRC, "design/base.css"), "utf8"));
    let campPosition: string | undefined;
    const tierPositions: string[] = [];

    campRoot.walkRules(".camp-player-card", (rule) => {
      rule.walkDecls("position", (decl) => { campPosition = decl.value; });
    });
    baseRoot.walkRules((rule) => {
      if (!rule.selector.includes(".card-tint--") || rule.selector.includes("::")) return;
      rule.walkDecls("position", (decl) => tierPositions.push(decl.value));
    });

    expect(campPosition).toBe("relative");
    expect(tierPositions).toEqual([]);
  });
});
