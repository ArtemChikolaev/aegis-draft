import { describe, expect, it } from "vitest";
import { detectLocale, dictionaries, roleMessageKey, translate } from "../src/i18n/core.ts";
import { isThemeMode, resolveTheme } from "../src/design/theme/core.ts";

describe("i18n dictionaries", () => {
  it("ru и en имеют одинаковый набор ключей", () => {
    expect(Object.keys(dictionaries.ru).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });
});

describe("detectLocale", () => {
  it("предпочитает сохранённый locale", () => {
    expect(detectLocale("ru", "en-US")).toBe("ru");
  });

  it("берёт язык из navigator при отсутствии сохранённого", () => {
    expect(detectLocale(null, "ru-RU")).toBe("ru");
    expect(detectLocale(null, "de-DE")).toBe("en");
  });
});

describe("translate", () => {
  it("подставляет параметры в шаблон", () => {
    expect(translate("en", "draft.progress", { current: 2, total: 5 })).toBe("Pick 2 of 5");
  });

  it("roleMessageKey → локализованная роль", () => {
    expect(translate("ru", roleMessageKey("offlane"))).toBe("ХАРД");
  });
});

describe("theme resolution", () => {
  it("isThemeMode принимает только system/light/dark", () => {
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("sepia")).toBe(false);
  });

  it("resolveTheme учитывает system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
