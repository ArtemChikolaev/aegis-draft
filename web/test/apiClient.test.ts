import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  authenticateTelegram,
  clearSession,
  fetchSave,
  isApiConfigured,
  pushSave,
  readSession,
  writeSession,
} from "../src/data/api/index.ts";

const BASE = "https://api.test";

/** Мок глобального fetch: очередь заготовленных ответов + запись вызовов. */
function mockFetch(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error("нет заготовленного ответа");
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("config", () => {
  it("isApiConfigured отражает VITE_API_BASE", () => {
    expect(isApiConfigured()).toBe(true);
    vi.stubEnv("VITE_API_BASE", "");
    expect(isApiConfigured()).toBe(false);
  });

  it("без базы apiFetch бросает not_configured", async () => {
    vi.stubEnv("VITE_API_BASE", "");
    await expect(fetchSave("run", "t")).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("authenticateTelegram", () => {
  it("POST initData → токен", async () => {
    const fixtureToken = "jwt";
    const calls = mockFetch([json(200, { token: fixtureToken, user: { id: "u1" }, created: true })]);
    const res = await authenticateTelegram("init-xyz");

    expect(res.token).toBe("jwt");
    expect(res.created).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/api/auth/telegram`);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ initData: "init-xyz" });
  });

  it("401 → ApiError с кодом", async () => {
    mockFetch([json(401, { code: "bad_init_data", message: "invalid" })]);
    await expect(authenticateTelegram("bad")).rejects.toMatchObject({
      status: 401,
      code: "bad_init_data",
    });
  });
});

describe("fetchSave", () => {
  it("200 → сейв, Bearer проставлен", async () => {
    const calls = mockFetch([json(200, { kind: "run", payload: { a: 1 }, rev: 3, schemaVersion: "s", ratingModelVersion: "r", updatedAt: "2026-01-01T00:00:00Z" })]);
    const save = await fetchSave("run", "tok123");

    expect(save?.rev).toBe(3);
    expect(calls[0].url).toBe(`${BASE}/api/saves/run`);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("404 → null", async () => {
    mockFetch([json(404, { code: "no_save", message: "not found" })]);
    expect(await fetchSave("career", "tok")).toBeNull();
  });
});

describe("pushSave", () => {
  it("200 → ok с сейвом", async () => {
    const calls = mockFetch([json(200, { kind: "run", payload: {}, rev: 2, schemaVersion: "", ratingModelVersion: "", updatedAt: "" })]);
    const res = await pushSave("run", "tok", { payload: { step: 2 }, baseRev: 1 });

    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.save.rev).toBe(2);
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body)).baseRev).toBe(1);
  });

  it("409 → conflict с актуальным сейвом", async () => {
    mockFetch([json(409, { error: { code: "rev_conflict", message: "conflict" }, current: { kind: "run", payload: {}, rev: 7, schemaVersion: "", ratingModelVersion: "", updatedAt: "" } })]);
    const res = await pushSave("run", "tok", { payload: {}, baseRev: 1 });

    expect(res.status).toBe("conflict");
    if (res.status === "conflict") expect(res.current.rev).toBe(7);
  });
});

describe("session storage", () => {
  it("write → read → clear через persist", async () => {
    expect(await readSession()).toBeNull();
    await writeSession("my-token");
    expect(await readSession()).toBe("my-token");
    await clearSession();
    expect(await readSession()).toBeNull();
  });
});
