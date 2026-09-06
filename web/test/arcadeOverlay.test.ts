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
    expect(rule(".arcade-overlay__card"), "карточка центрируется через margin: auto").toContain("margin: auto");
  });
});
