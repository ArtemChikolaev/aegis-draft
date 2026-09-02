import { describe, expect, it } from "vitest";
import { formatBytes, shortHash, summarizeOfflineState } from "../src/state/offlineStatus.ts";

const facts = (over: Partial<Parameters<typeof summarizeOfflineState>[0]> = {}) => ({
  supported: true,
  shellCached: false,
  datasetComplete: false,
  hasActiveDataset: false,
  ...over,
});

describe("состояние офлайн-копии", () => {
  it("готово — только когда есть И оболочка, И полный датасет", () => {
    expect(summarizeOfflineState(facts({ shellCached: true, datasetComplete: true }))).toBe("ready");
  });

  it("оболочка без данных — это ещё не готовность (игра откроется и упрётся в пустой пул)", () => {
    expect(summarizeOfflineState(facts({ shellCached: true }))).toBe("partial");
  });

  it("данные качаются, оболочки нет — тоже неполная копия", () => {
    expect(summarizeOfflineState(facts({ hasActiveDataset: true }))).toBe("partial");
  });

  it("пусто — копии нет", () => {
    expect(summarizeOfflineState(facts())).toBe("none");
  });

  it("нет поддержки (dev, приватный режим) — отдельное состояние, а не «копии нет»", () => {
    // Иначе игрок в dev-режиме читал бы «копии нет» и жал кнопки, которые ничего не делают.
    expect(summarizeOfflineState(facts({ supported: false, shellCached: true, datasetComplete: true }))).toBe("unsupported");
  });
});

describe("форматирование", () => {
  it("объём — в мегабайтах, с десятыми до сотни", () => {
    expect(formatBytes(1024 * 1024 * 3.14, "MB")).toBe("3.1 MB");
    expect(formatBytes(1024 * 1024 * 250, "MB")).toBe("250 MB");
  });

  it("нет оценки — нет строки (пустое место лучше выдуманного нуля)", () => {
    expect(formatBytes(null)).toBeNull();
  });

  it("хеш укорачивается до 8 знаков без префикса алгоритма", () => {
    expect(shortHash("sha256:4f5e032c9b898a646077")).toBe("4f5e032c");
    expect(shortHash(null)).toBeNull();
  });
});
