import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Итог забега — самая длинная карточка в игре: статистика, лут (бывает 24 предмета), предметы лавки,
// школы, дропы косметики и только потом кнопки «Ещё раз / Новый сид / В меню». При `place-items:
// center` она вылезала за экран сверху и снизу, а оверлей не прокручивался — кнопки оказывались за
// краем, и выйти в меню было нельзя (владелец 2026-09-06, скриншот с 24 предметами лута).
const CSS = readFileSync(new URL("../src/features/arcade/arcade.css", import.meta.url), "utf8");
const rule = (selector: string) => {
  const m = CSS.match(new RegExp(`\\${selector} \\{([^}]*)\\}`));
  return m ? m[1] : "";
};

// Сломанный комментарий тише сломанного правила: браузер при мусоре на верхнем уровне доедает
// следующий блок целиком. Так у `.arcade-overlay` пропали position/scrim/z-index — оверлей паузы
// перестал накрывать сцену и уехал под кадр (владелец 2026-09-06: «при ESC ничего не видно»).
function stripComments(css: string): { code: string; broken: string | null } {
  let out = "", i = 0;
  while (i < css.length) {
    const open = css.indexOf("/*", i);
    if (open < 0) { out += css.slice(i); break; }
    out += css.slice(i, open);
    const close = css.indexOf("*/", open + 2);
    if (close < 0) return { code: out, broken: "незакрытый /*" };
    i = close + 2;
  }
  const stray = out.indexOf("*/");
  return { code: out, broken: stray >= 0 ? `лишний */ на позиции ${stray}` : null };
}

describe("оверлеи Аркады", () => {
  it("css без мусора вне правил: комментарии закрыты, лишних */ нет", () => {
    for (const file of ["arcade.css"]) {
      const css = readFileSync(new URL(`../src/features/arcade/${file}`, import.meta.url), "utf8");
      const { code, broken } = stripComments(css);
      expect(broken, `${file}: ${broken}`).toBeNull();
      // Вне блоков {...} на верхнем уровне может стоять только @-правило или селектор.
      // Схлопываем блоки изнутри наружу (@media/@keyframes вложены), пока есть что схлопывать.
      let flat = code;
      for (let prev = ""; prev !== flat; ) { prev = flat; flat = flat.replace(/\{[^{}]*\}/g, "|"); }
      const junk = flat.split("|").map((x) => x.trim())
        .filter((x) => x && !/^[@.#:*\[a-zA-Z][^;{}]*$/.test(x));
      expect(junk, `${file}: мусор вне правил — ${junk[0]?.slice(0, 60)}`).toHaveLength(0);
    }
  });

  it("оверлей прокручивается, а карточка центрируется автополями", () => {
    const overlay = rule(".arcade-overlay");
    expect(overlay, ".arcade-overlay не найден в css").not.toBe("");
    expect(overlay, "без overflow-y кнопки под длинным списком недостижимы").toContain("overflow-y: auto");
    // `place-items: center` в гриде срезает верх длинной карточки; автополя во flex так не делают.
    expect(overlay).not.toContain("place-items: center");
    // Автополя должны стоять у ВСЕГО прямого содержимого оверлея, а не у одной карточки: под ним
    // живут и `__card` (пауза, загрузка, итог), и `.arcade-levelup` (прокачка, лут, нейтралка,
    // лавка). Когда автополя были только у карточки, flexbox прижал остальные четыре экрана влево
    // (владелец 2026-09-06: «вся прокачка сдвинулась влево»).
    expect(CSS, "содержимое оверлея центрируется через margin: auto").toMatch(/\.arcade-overlay > \* \{[^}]*margin: auto/);
  });

  it("каждый экран под оверлеем — прямой потомок с автополями", () => {
    const screen = readFileSync(new URL("../src/features/arcade/ArcadeScreen.tsx", import.meta.url), "utf8");
    // Класс прямого потомка каждого оверлея: <div className="arcade-overlay …"><X className="…">
    const kids = [...screen.matchAll(/className="arcade-overlay[^"]*"[^>]*>\s*<[A-Za-z]+ className="([^"]+)"/g)]
      .map((m) => m[1].split(" ")[0]);
    expect(kids.length, "не нашёл ни одного оверлея в разметке").toBeGreaterThan(3);
    for (const cls of new Set(kids)) {
      expect(["arcade-overlay__card", "arcade-levelup"], `у .${cls} нет правила с автополями`).toContain(cls);
    }
  });
});
