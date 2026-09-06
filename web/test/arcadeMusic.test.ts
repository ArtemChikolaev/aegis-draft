import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureMusic, stopMusic } from "../src/features/arcade/music.ts";
import { setSoundEnabled } from "../src/ui/sound.ts";

// Боевые темы идут по кругу с кроссфейдом. Раньше следующая заводилась по событию `ended`, то есть
// кроссфейд начинался уже на тишине и между треками провисала пауза. Теперь следующая тема
// заводится за полторы секунды до конца текущей — проверяем именно это.
class FakeAudio {
  static made: FakeAudio[] = [];
  loop = false; preload = ""; volume = 0; paused = true; currentTime = 0; duration = 100;
  constructor(public src: string) { FakeAudio.made.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
}

describe("музыка Аркады", () => {
  beforeEach(() => {
    FakeAudio.made = [];
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    setSoundEnabled(true);
    stopMusic();
  });
  afterEach(() => { stopMusic(); vi.unstubAllGlobals(); });

  it("боевая тема заводит следующую ЗА полторы секунды до конца, а не после", () => {
    ensureMusic("battle");
    expect(FakeAudio.made.length, "первая тема").toBe(1);
    const first = FakeAudio.made[0];
    expect(first.src).toContain("battle_");
    // Середина трека — ничего нового не заводим.
    first.currentTime = 50;
    ensureMusic("battle");
    expect(FakeAudio.made.length).toBe(1);
    // Полторы секунды до конца — заводим следующую.
    first.currentTime = first.duration - 1;
    ensureMusic("battle");
    expect(FakeAudio.made.length, "следующая тема до конца текущей").toBe(2);
    expect(FakeAudio.made[1].src).not.toBe(first.src);
  });

  it("тема Рошана зациклена, боевая — нет (её сменяет следующая)", () => {
    ensureMusic("roshan");
    expect(FakeAudio.made.at(-1)?.loop).toBe(true);
    stopMusic();
    ensureMusic("battle");
    expect(FakeAudio.made.at(-1)?.loop).toBe(false);
  });

  it("выключенный звук глушит музыку", () => {
    setSoundEnabled(false);
    ensureMusic("battle");
    expect(FakeAudio.made.length).toBe(0);
  });
});
