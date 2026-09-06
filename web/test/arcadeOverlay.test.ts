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

describe("оверлеи Аркады", () => {
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
