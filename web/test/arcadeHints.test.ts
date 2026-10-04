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

describe("справочник механик: встречи (M25)", () => {
  it("каст нейтрала и Древний в кадре, взятая руна и мульти-убийство открывают записи; аффиксы — только через подсказку", async () => {
    const { ArcadeSim } = await import("../src/game/arcade/sim.ts");
    const { ENEMY_KINDS } = await import("../src/game/arcade/content/enemies.ts");
    const { encounterKeys } = await import("../src/features/arcade/hints.ts");
    const sim = new ArcadeSim("codex-1", { rank: 0, hero: "juggernaut", act: "dire" });
    for (const e of sim.enemies) e.alive = false;
    expect(encounterKeys(sim)).toEqual([]);
    const spawn = (sim as unknown as { spawnEnemy(k: unknown, x: number, y: number): { castT: number; affix: number } }).spawnEnemy.bind(sim);
    const c = spawn(ENEMY_KINDS.centaur, sim.player.x + 100, sim.player.y);
    c.castT = 10; c.affix = AFFIX.haste;
    spawn(ENEMY_KINDS.granite_golem, sim.player.x - 150, sim.player.y);
    spawn(ENEMY_KINDS.black_dragon, sim.player.x + 5000, sim.player.y); // вне кадра — не считается
    (sim.runesTaken as Record<string, number>).arcane = 1;
    const keys = encounterKeys(sim).sort();
    expect(keys).toEqual(["ancient.granite_golem", "cast.stomp", "rune.arcane"]);
  });
});
