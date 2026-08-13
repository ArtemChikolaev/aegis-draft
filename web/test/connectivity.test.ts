import { describe, expect, it, vi } from "vitest";
import { PROBE_TIMEOUT_MS, probeConnectivity } from "../src/state/connectivity.ts";

/** Пробник, который никогда не отвечает сам — вердикт даёт только таймаут (молчащий сервер). */
function silentProbe(signal: AbortSignal): Promise<boolean> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
}

describe("probeConnectivity", () => {
  it("navigator.onLine === false — офлайн без единого запроса", async () => {
    const probe = vi.fn(async () => true);
    await expect(probeConnectivity({ onLine: () => false, probe })).resolves.toBe("offline");
    expect(probe).not.toHaveBeenCalled();
  });

  it("онлайн-флаг врёт (самолётный Wi-Fi): пробник не отвечает — вердикт офлайн", async () => {
    // Тот самый случай, ради которого модуль и существует: браузер говорит «сеть есть».
    const verdict = probeConnectivity({ onLine: () => true, probe: silentProbe, timeoutMs: 20 });
    await expect(verdict).resolves.toBe("offline");
  });

  it("пробник ответил успехом — онлайн", async () => {
    await expect(probeConnectivity({ onLine: () => true, probe: async () => true })).resolves.toBe("online");
  });

  it("пробник ответил отказом (сервер жив, но не ок) — офлайн", async () => {
    await expect(probeConnectivity({ onLine: () => true, probe: async () => false })).resolves.toBe("offline");
  });

  it("сетевой сбой в пробнике — офлайн, а не исключение наружу", async () => {
    const probe = async () => { throw new Error("network"); };
    await expect(probeConnectivity({ onLine: () => true, probe })).resolves.toBe("offline");
  });

  it("проверять нечем (API не сконфигурен) — unknown, а не обещание связи", async () => {
    await expect(probeConnectivity({ onLine: () => true, probe: null })).resolves.toBe("unknown");
  });

  it("успевший пробник не оставляет висящий таймер", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    await probeConnectivity({ onLine: () => true, probe: async () => true });
    expect(clear).toHaveBeenCalled();
  });

  it("таймаут по умолчанию — 3с (потолок ожидания вердикта)", () => {
    expect(PROBE_TIMEOUT_MS).toBe(3000);
  });
});
