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
