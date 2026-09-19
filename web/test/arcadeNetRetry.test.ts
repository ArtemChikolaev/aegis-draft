// Чтение JSON-индексов Аркады (features/arcade/netRetry.ts): единичный сбой сети не должен запоминаться как «нет файла» —
// раньше он глушил звуки Dota на всю сессию (soundscape.ts, heroSfx.ts), аудит 2026-09-19.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJsonRetry, LazyJson, RETRY_COOLDOWN } from "../src/features/arcade/netRetry.ts";

type Reply = { status: number; body?: unknown } | "network";
let queue: Reply[];
let calls: number;

beforeEach(() => {
  vi.useFakeTimers();
  queue = [];
  calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (reply === "network") throw new TypeError("Failed to fetch");
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body };
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const noWait = () => Promise.resolve();

describe("fetchJsonRetry", () => {
  it("404 — подтверждённое отсутствие, без повторов", async () => {
    queue = [{ status: 404 }];
    expect(await fetchJsonRetry("/x.json", [1, 1], noWait)).toEqual({ kind: "missing" });
    expect(calls).toBe(1);
  });

  it("сбой сети и 5xx повторяются; успех после них — значение", async () => {
    queue = ["network", { status: 503 }, { status: 200, body: { a: 1 } }];
    expect(await fetchJsonRetry("/x.json", [1, 1], noWait)).toEqual({ kind: "ok", value: { a: 1 } });
    expect(calls).toBe(3);
  });

  it("попытки исчерпаны — error, а не missing", async () => {
    queue = ["network"];
    expect(await fetchJsonRetry("/x.json", [1, 1], noWait)).toEqual({ kind: "error" });
    expect(calls).toBe(3);
  });
});

describe("LazyJson", () => {
  it("сбой сети не становится пустым индексом: после паузы чтение повторяется, ожидающие получают значение", async () => {
    queue = ["network"];
    const idx = new LazyJson<Record<string, number>>("/index.json", {});
    const ready = vi.fn();
    idx.whenReady(ready);
    await vi.advanceTimersByTimeAsync(5000);
    expect(idx.value).toBeNull();
    expect(ready).not.toHaveBeenCalled();
    const failed = calls;
    idx.load(); // пауза после сбоя ещё идёт — без запроса
    expect(calls).toBe(failed);
    queue = [{ status: 200, body: { axe: 1 } }];
    await vi.advanceTimersByTimeAsync(RETRY_COOLDOWN);
    idx.load();
    await vi.advanceTimersByTimeAsync(10);
    expect(idx.value).toEqual({ axe: 1 });
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("404 — индекса нет: пустое значение окончательно, запросов больше нет", async () => {
    queue = [{ status: 404 }];
    const idx = new LazyJson<Record<string, number>>("/index.json", {});
    idx.load();
    await vi.advanceTimersByTimeAsync(10);
    expect(idx.value).toEqual({});
    idx.load();
    expect(calls).toBe(1);
  });
});
