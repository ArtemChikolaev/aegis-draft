import { afterEach, describe, expect, it } from "vitest";
import { densePixel, pixelScale } from "../src/features/arcade/pixelMode.ts";

// Окружение тестов — node: `window` подменяем минимальной заглушкой (pixelScale читает только DPR и строку запроса).
const fakeWindow = (dpr: number, search = "") => { (globalThis as { window?: unknown }).window = { devicePixelRatio: dpr, location: { search } }; };

describe("пиксельный режим: фактор по плотности экрана (владелец 2026-09-06: «вдвое выше качество, но пиксельно»)", () => {
  afterEach(() => { delete (globalThis as { window?: unknown }).window; });

  it("без window (SSR/тесты) режим выключен", () => {
    expect(pixelScale()).toBe(0);
  });

  it("Retina/телефон (DPR ≥ 1.5) → фактор 1 и плотные листы; обычный монитор → фактор 2", () => {
    fakeWindow(2); expect(pixelScale()).toBe(1); expect(densePixel(pixelScale())).toBe(true);
    fakeWindow(3); expect(pixelScale()).toBe(1);
    fakeWindow(1); expect(pixelScale()).toBe(2); expect(densePixel(pixelScale())).toBe(false);
  });

  it("?pixel=0 выключает режим, ?pixel=1..6 задаёт фактор явно, мусор → выключено", () => {
    fakeWindow(2, "?pixel=0"); expect(pixelScale()).toBe(0);
    fakeWindow(2, "?pixel=1"); expect(pixelScale()).toBe(1);
    fakeWindow(2, "?pixel=3"); expect(pixelScale()).toBe(3);
    fakeWindow(2, "?pixel=9"); expect(pixelScale()).toBe(0);
    fakeWindow(2, "?pixel=abc"); expect(pixelScale()).toBe(0);
  });
});
