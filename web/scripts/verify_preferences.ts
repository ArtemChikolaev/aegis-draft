import assert from "node:assert/strict";
import { detectLocale, dictionaries, roleMessageKey, translate } from "../src/i18n/core.ts";
import { isThemeMode, resolveTheme } from "../src/design/theme/core.ts";

assert.deepEqual(Object.keys(dictionaries.ru).sort(), Object.keys(dictionaries.en).sort());
assert.equal(detectLocale("ru", "en-US"), "ru");
assert.equal(detectLocale(null, "ru-RU"), "ru");
assert.equal(detectLocale(null, "de-DE"), "en");
assert.equal(translate("en", "draft.progress", { current: 2, total: 5 }), "Pick 2 of 5");
assert.equal(translate("ru", roleMessageKey("offlane")), "ХАРД");
assert.equal(isThemeMode("system"), true);
assert.equal(isThemeMode("sepia"), false);
assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");
assert.equal(resolveTheme("dark", false), "dark");

console.log("preferences: dictionaries, locale detection and theme resolution OK");
