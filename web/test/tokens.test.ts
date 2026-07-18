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

    for (const tier of ["elite", "strong", "mid", "low", "weak"]) {
      expect(declared).toContain(`--tier-${tier}-invert`);
    }
    expect(declared).toContain("--tier-elite-shine-invert");
    expect(declared).toContain("--tier-liability-veil-invert");
  });
});
