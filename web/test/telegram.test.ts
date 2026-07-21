import { afterEach, describe, expect, it } from "vitest";
import { isTelegramLaunch, tgHaptic, tgSafe, telegramInsetVars, toHexColor, watchTelegramColorScheme, type TelegramWebApp } from "../src/tma/telegram.ts";

/** Тесты идут в Node без DOM: window подставляем ровно на время кейса. */
function withWindow(value: Record<string, unknown>): void {
  Object.defineProperty(globalThis, "window", { value, configurable: true, writable: true });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("toHexColor", () => {
  it("разворачивает короткую запись: Telegram принимает только #rrggbb", () => {
    expect(toHexColor("#000")).toBe("#000000");
    expect(toHexColor(" #8ff ")).toBe("#88ffff");
  });

  it("оставляет полную запись, приводя регистр", () => {
    expect(toHexColor("#F1EFE8")).toBe("#f1efe8");
  });

  it("переводит rgb()/rgba(), как их отдаёт getComputedStyle", () => {
    expect(toHexColor("rgb(0, 0, 0)")).toBe("#000000");
    expect(toHexColor("rgba(241, 239, 232, 0.5)")).toBe("#f1efe8");
  });

  it("на непонятном значении отдаёт null, а не мусорный цвет", () => {
    expect(toHexColor("color-mix(in srgb, red, blue)")).toBeNull();
    expect(toHexColor("")).toBeNull();
  });
});

describe("telegramInsetVars", () => {
  const app = (over: Partial<TelegramWebApp>) => over as TelegramWebApp;

  it("складывает вырез устройства и контролы Telegram по каждой стороне", () => {
    const vars = telegramInsetVars(app({
      safeAreaInset: { top: 44, right: 0, bottom: 34, left: 0 },
      contentSafeAreaInset: { top: 46, right: 0, bottom: 0, left: 0 },
    }));
    // top = 44 (вырез) + 46 (плавающие кнопки Telegram) = 90.
    expect(vars["--tg-safe-top"]).toBe("90px");
    expect(vars["--tg-safe-bottom"]).toBe("34px");
    expect(vars["--tg-safe-left"]).toBe("0px");
  });

  it("отсутствующие инсеты (Fullsize / старый клиент) → 0px, а не NaN", () => {
    const vars = telegramInsetVars(app({}));
    expect(vars).toEqual({
      "--tg-safe-top": "0px",
      "--tg-safe-right": "0px",
      "--tg-safe-bottom": "0px",
      "--tg-safe-left": "0px",
    });
  });

  it("дробные значения округляет (px без хвоста)", () => {
    const vars = telegramInsetVars(app({ contentSafeAreaInset: { top: 45.6, right: 0, bottom: 0, left: 0 } }));
    expect(vars["--tg-safe-top"]).toBe("46px");
  });
});

describe("isTelegramLaunch", () => {
  it("без window — false (SSR/тесты)", () => {
    expect(isTelegramLaunch()).toBe(false);
  });

  it("узнаёт параметры запуска в фрагменте URL", () => {
    withWindow({ location: { hash: "#tgWebAppData=abc&tgWebAppPlatform=ios" } });
    expect(isTelegramLaunch()).toBe(true);
  });

  it("узнаёт мост мобильного webview", () => {
    withWindow({ location: { hash: "" }, TelegramWebviewProxy: {} });
    expect(isTelegramLaunch()).toBe(true);
  });

  it("обычный веб (в т.ч. наш собственный hash-роут) — false", () => {
    withWindow({ location: { hash: "#/teammates" }, sessionStorage: { getItem: () => null } });
    expect(isTelegramLaunch()).toBe(false);
  });

  it("запрещённый sessionStorage не считается признаком Telegram", () => {
    withWindow({
      location: { hash: "" },
      sessionStorage: { getItem: () => { throw new Error("denied"); } },
    });
    expect(isTelegramLaunch()).toBe(false);
  });
});

describe("watchTelegramColorScheme", () => {
  it("вне Telegram не зовёт колбэк вовсе — режим system остаётся на matchMedia", async () => {
    withWindow({ location: { hash: "#/settings" }, sessionStorage: { getItem: () => null } });
    const seen: boolean[] = [];
    const stop = watchTelegramColorScheme((dark) => seen.push(dark));
    await Promise.resolve();
    stop();
    expect(seen).toEqual([]);
  });

  it("во встроенном браузере Telegram молчит: там colorScheme всегда light по умолчанию", async () => {
    // Ссылка из чата, а не мини-приложение: WebApp есть, параметров запуска нет.
    const webApp = { platform: "unknown", colorScheme: "light", onEvent: () => {}, offEvent: () => {} };
    withWindow({ location: { hash: "" }, Telegram: { WebApp: webApp } });

    const seen: boolean[] = [];
    const stop = watchTelegramColorScheme((dark) => seen.push(dark));
    await Promise.resolve();
    stop();
    expect(seen).toEqual([]); // системную тему не трогаем — её знает matchMedia
  });

  it("отдаёт тему Telegram и переподписывается на её смену", async () => {
    const listeners: Array<() => void> = [];
    const webApp = {
      platform: "ios",
      colorScheme: "dark" as "light" | "dark",
      onEvent: (_: string, cb: () => void) => listeners.push(cb),
      offEvent: (_: string, cb: () => void) => listeners.splice(listeners.indexOf(cb), 1),
    };
    withWindow({ location: { hash: "" }, Telegram: { WebApp: webApp } });

    const seen: boolean[] = [];
    const stop = watchTelegramColorScheme((dark) => seen.push(dark));
    await Promise.resolve();
    expect(seen).toEqual([true]);

    webApp.colorScheme = "light";
    listeners.forEach((cb) => cb());
    expect(seen).toEqual([true, false]);

    stop();
    expect(listeners).toHaveLength(0);
  });
});

describe("tgSafe / tgHaptic", () => {
  it("глушит WebAppMethodUnsupported: старый клиент не должен ронять эффект", () => {
    expect(() => tgSafe(() => { throw new Error("WebAppMethodUnsupported"); })).not.toThrow();
  });

  it("хаптика вне Telegram — тихий no-op", () => {
    withWindow({ location: { hash: "" } });
    expect(() => tgHaptic()).not.toThrow();
  });

  it("внутри Telegram зовёт impactOccurred", () => {
    const calls: string[] = [];
    withWindow({
      location: { hash: "" },
      Telegram: { WebApp: { HapticFeedback: { impactOccurred: (style: string) => calls.push(style) } } },
    });
    tgHaptic("light");
    expect(calls).toEqual(["light"]);
  });
});
