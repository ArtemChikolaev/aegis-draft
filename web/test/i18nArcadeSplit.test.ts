import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dictionaries, loadArcadeMessages, translate } from "../src/i18n/core.ts";
import { arcadeEn, arcadeRu } from "../src/i18n/arcade.ts";

// Строки Аркады вынесены из стартового бандла (T22.3): ядро их не содержит, экраны Аркады, Штаба и Карьеры ждут чанк
// вместе со своим кодом. Порядок тестов важен: первый смотрит ядро до загрузки.
describe("i18n: строки Аркады — отдельный чанк", () => {
  it("в ядре нет ни одного ключа arcade.* — все в arcade.ts, в обеих локалях поровну", () => {
    const core = readFileSync(new URL("../src/i18n/core.ts", import.meta.url), "utf8");
    expect(core).not.toMatch(/^ {2}"arcade\./m);
    expect(Object.keys(arcadeRu).length).toBeGreaterThan(2000);
    expect(Object.keys(arcadeEn).sort()).toEqual(Object.keys(arcadeRu).sort());
    for (const key of Object.keys(arcadeRu)) expect(key.startsWith("arcade."), key).toBe(true);
  });

  it("ленивые экраны Аркады, Штаба и Карьеры ждут строки вместе с кодом", () => {
    const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
    for (const screen of ["ArcadeScreen", "HqScreen", "CareerScreen"]) {
      expect(app, screen).toMatch(new RegExp(`const ${screen} = lazyScreen\\(\\(\\) => withArcadeMessages\\(`));
    }
  });

  it("после loadArcadeMessages ключ переводится в обеих локалях; повторная загрузка — тот же промис", async () => {
    const first = loadArcadeMessages();
    expect(loadArcadeMessages()).toBe(first);
    await first;
    expect(dictionaries.ru["arcade.hud.gold"]).toBe(arcadeRu["arcade.hud.gold"]);
    expect(translate("en", "arcade.hud.gold")).toBe(arcadeEn["arcade.hud.gold"]);
  });
});
