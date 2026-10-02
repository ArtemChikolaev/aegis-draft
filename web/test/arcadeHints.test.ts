import { afterEach, describe, expect, it } from "vitest";
import { AFFIX } from "../src/game/arcade/content/enemies.ts";
import { hintKeys, loadSeenHints, nextHint, saveSeenHints } from "../src/features/arcade/hints.ts";

// Подсказки механик при первой встрече (M24): аффиксы элиты и серия убийств объяснялись только hover-подсказкой —
// на телефоне и с пада её нет. Подсказка показывается один раз на устройство, новый аффикс — даже после знакомых.
afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

function fakeStorage(): Map<string, string> {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    configurable: true,
  });
  return store;
}

describe("подсказки механик Аркады", () => {
  it("аффиксы элиты — все новые сразу, знакомые не повторяются; серия — после аффиксов", () => {
    const seen = new Set<string>();
    const both = AFFIX.haste | AFFIX.frost;
    const first = nextHint(seen, both, 1);
    expect(first).toEqual({ kind: "affix", ids: ["haste", "frost"] });
    for (const k of hintKeys(first!)) seen.add(k);
    // Та же элита ещё на экране — объяснять нечего, очередь за серией.
    expect(nextHint(seen, both, 1)).toEqual({ kind: "streak" });
    seen.add("streak");
    expect(nextHint(seen, both, 3)).toBeNull();
    // Новый аффикс в паре со знакомым — только он.
    expect(nextHint(seen, AFFIX.haste | AFFIX.splitter, 0)).toEqual({ kind: "affix", ids: ["splitter"] });
    // Без элиты и серии — тишина.
    expect(nextHint(new Set(), 0, 0)).toBeNull();
  });

  it("увиденное помнится на устройстве; битая запись и приватный режим — как пустая", () => {
    expect(loadSeenHints().size).toBe(0); // нет localStorage (приватный режим / тесты)
    const store = fakeStorage();
    saveSeenHints(new Set(["affix.haste", "streak"]));
    expect(loadSeenHints()).toEqual(new Set(["affix.haste", "streak"]));
    store.set("aegis-draft.arcade.hints", "{oops");
    expect(loadSeenHints().size).toBe(0);
    store.set("aegis-draft.arcade.hints", JSON.stringify(["streak", 7, null]));
    expect(loadSeenHints()).toEqual(new Set(["streak"]));
  });
});
