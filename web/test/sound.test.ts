import { afterEach, describe, expect, it } from "vitest";
import {
  initSoundUnlock,
  setSoundEnabled,
  sfxBuy,
  sfxCashTick,
  sfxDeal,
  sfxReroll,
  sfxSting,
  sfxVerdict,
  soundEnabled,
} from "../src/ui/sound.ts";
import { existsSync, readFileSync } from "node:fs";
import { HEROES } from "../src/game/arcade/content/heroes.ts";
import { ENEMY_KINDS } from "../src/game/arcade/content/enemies.ts";

// Node без DOM/WebAudio — ровно окружение headless e2e: слой обязан молчать, а не падать.
afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("sound (R15.5)", () => {
  it("все sfx — тихие no-op без AudioContext (headless/старый webview)", () => {
    expect(() => {
      sfxDeal(3, 135);
      sfxBuy();
      sfxReroll();
      sfxSting("win");
      sfxSting("loss");
      sfxSting("boss");
      sfxCashTick(1, 120);
      sfxVerdict("won");
      sfxVerdict("lost");
    }).not.toThrow();
  });

  it("initSoundUnlock без window — no-op (SSR/тесты)", () => {
    expect(() => initSoundUnlock()).not.toThrow();
  });

  it("тумблер: включён по умолчанию, off персистится тем же слоем, что тема", () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
      configurable: true,
    });
    expect(soundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(store.get("aegis-draft.sound")).toBe("off");
    expect(soundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
  });
});

// Звук героя (T13.16): у каждого героя Аркады должны быть и удары, и реплики, а индексы не должны
// ссылаться на несуществующие файлы. Дыры были не «нет звуков в Dota», а несовпадение имён папок
// Valve с нашими id: удары KotL лежат в `keeper`, у Lifestealer — в `lifestealer` (озвучка,
// наоборот, в `life_stealer`); у Phoenix, Marci и Io файлы реплик вообще без номера в имени.
describe("звук героев Аркады", () => {
  // В индексе ударов рядом со списками лежат одиночные имена (`spinLoop` у Juggernaut) — учитываем оба вида.
  const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")) as Record<string, Record<string, string[] | string>>;

  it("у каждого героя есть звуки умений, и все файлы пака на месте", () => {
    const pack = read("../public/art/sfx/dota/pack/index.json") as unknown as Record<string, Record<string, Record<string, string[]>>>;
    expect(Object.keys(HEROES).filter((h) => !pack.abilities?.[h]), "герои без звуков умений").toEqual([]);
    expect(Object.keys(ENEMY_KINDS).filter((k) => !pack.enemies?.[k]), "виды врагов без звуков").toEqual([]);
    for (const [section, entries] of Object.entries(pack)) {
      for (const [hid, cats] of Object.entries(entries)) {
        for (const v of Object.values(cats)) {
          for (const n of Array.isArray(v) ? v : [v]) {
            expect(existsSync(new URL(`../public/art/sfx/dota/pack/${section}/${n}`, import.meta.url)), `${hid}/${n}`).toBe(true);
          }
        }
      }
    }
  });

  it("у каждого героя есть удары и реплики, и все файлы на месте", () => {
    const sfx = read("../public/art/sfx/dota/index.json");
    const voice = read("../public/art/sfx/dota/voice/index.json");
    const ids = Object.keys(HEROES);
    expect(ids.filter((h) => !sfx[h]), "герои без звуков удара").toEqual([]);
    expect(ids.filter((h) => !voice[h]), "герои без реплик").toEqual([]);
    for (const [idx, root] of [[sfx, "../public/art/sfx/dota"], [voice, "../public/art/sfx/dota/voice"]] as const) {
      for (const [hid, cats] of Object.entries(idx)) {
        for (const v of Object.values(cats)) {
          for (const n of Array.isArray(v) ? v : [v]) expect(existsSync(new URL(`${root}/${hid}/${n}`, import.meta.url)), `${hid}/${n}`).toBe(true);
        }
      }
    }
  });
});
