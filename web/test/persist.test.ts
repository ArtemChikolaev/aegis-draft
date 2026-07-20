import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudKey, readCached, readPersisted, removePersisted, writePersisted } from "../src/state/persist.ts";

/** Ключи, которые реально живут в приложении: их маппинг обязан оставаться однозначным. */
const REAL_KEYS = [
  "aegis-draft.theme",
  "aegis-draft.locale",
  "aegis:run:v1",
  "aegis:teamName:v1",
  "aegis:career:v1",
];

/** Фейковый CloudStorage: тот же callback-API, что у клиента, плюс заглядывание внутрь. */
function fakeCloud(options: { silent?: boolean } = {}) {
  const data = new Map<string, string>();
  const call = (cb: (() => void) | undefined) => {
    if (options.silent) return; // клиент, который не зовёт колбэк — проверяем таймаут
    cb?.();
  };
  return {
    data,
    api: {
      getItem(key: string, cb: (err: string | null, value?: string) => void) {
        call(() => cb(null, data.get(key) ?? ""));
      },
      getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void) {
        call(() => {
          const found: Record<string, string> = {};
          for (const key of keys) if (data.has(key)) found[key] = data.get(key)!;
          cb(null, found);
        });
      },
      setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void) {
        call(() => { data.set(key, value); cb?.(null, true); });
      },
      removeItems(keys: string[], cb?: (err: string | null, ok?: boolean) => void) {
        call(() => { for (const key of keys) data.delete(key); cb?.(null, true); });
      },
    },
  };
}

function inTelegram(cloud?: ReturnType<typeof fakeCloud>): void {
  Object.defineProperty(globalThis, "window", {
    value: { location: { hash: "" }, Telegram: { WebApp: { CloudStorage: cloud?.api } } },
    configurable: true,
    writable: true,
  });
}

function onWeb(): void {
  Object.defineProperty(globalThis, "window", {
    value: { location: { hash: "#/settings" }, sessionStorage: { getItem: () => null } },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  vi.useRealTimers();
});

describe("cloudKey", () => {
  it("приводит наши ключи к разрешённому CloudStorage алфавиту", () => {
    for (const key of REAL_KEYS) expect(cloudKey(key)).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
  });

  it("не схлопывает разные ключи в один — иначе тема затирала бы язык", () => {
    const mapped = REAL_KEYS.map(cloudKey);
    expect(new Set(mapped).size).toBe(REAL_KEYS.length);
  });
});

describe("вне Telegram", () => {
  it("работает как обычный localStorage", async () => {
    onWeb();
    await writePersisted("aegis:run:v1", "{\"v\":1}");
    expect(readCached("aegis:run:v1")).toBe("{\"v\":1}");
    await expect(readPersisted("aegis:run:v1")).resolves.toBe("{\"v\":1}");
  });
});

describe("в Telegram", () => {
  it("пишет в оба хранилища и читает из облака, когда кэш webview очищен", async () => {
    const cloud = fakeCloud();
    inTelegram(cloud);
    await writePersisted("aegis-draft.theme", "dark");
    expect(readCached("aegis-draft.theme")).toBe("dark");
    expect(cloud.data.get("aegis-draft_theme")).toBe("dark");

    localStorage.clear(); // ровно то, что делает webview между запусками
    await expect(readPersisted("aegis-draft.theme")).resolves.toBe("dark");
  });

  it("длинное значение разбивает на чанки и склеивает обратно без потерь", async () => {
    const cloud = fakeCloud();
    inTelegram(cloud);
    // ~40 KB: карьера примерно такого размера на полусотне забегов.
    const career = JSON.stringify({ v: 1, entries: Array.from({ length: 50 }, (_, i) => ({ i, pad: "x".repeat(800) })) });
    expect(career.length).toBeGreaterThan(4096);

    await writePersisted("aegis:career:v1", career);
    expect(cloud.data.get("aegis_career_v1")).toMatch(/^__chunks__:\d+$/);
    expect([...cloud.data.keys()].filter((k) => k.startsWith("aegis_career_v1_c")).length).toBeGreaterThan(1);
    for (const [key, value] of cloud.data) {
      if (key !== "aegis_career_v1") expect(value.length).toBeLessThanOrEqual(4096);
    }

    localStorage.clear();
    await expect(readPersisted("aegis:career:v1")).resolves.toBe(career);
  });

  it("после укорачивания не отдаёт хвост прошлой записи", async () => {
    const cloud = fakeCloud();
    inTelegram(cloud);
    await writePersisted("aegis:career:v1", "y".repeat(9000));
    await writePersisted("aegis:career:v1", "short");

    localStorage.clear();
    await expect(readPersisted("aegis:career:v1")).resolves.toBe("short");
    // Именно `_c<цифры>` на конце: подстрока `_c` встречается и в самом `aegis_career_v1`.
    expect([...cloud.data.keys()].filter((k) => /_c\d+$/.test(k))).toEqual([]);
  });

  it("потерянный чанк не склеивается в обрывок — отдаём кэш", async () => {
    const cloud = fakeCloud();
    inTelegram(cloud);
    const value = "z".repeat(9000);
    await writePersisted("aegis:career:v1", value);
    cloud.data.delete("aegis_career_v1_c1");

    await expect(readPersisted("aegis:career:v1")).resolves.toBe(value); // кэш ещё цел
    localStorage.clear();
    await expect(readPersisted("aegis:career:v1")).resolves.toBeNull();
  });

  it("молчащий клиент не подвешивает загрузку — падаем на кэш по таймауту", async () => {
    const cloud = fakeCloud({ silent: true });
    inTelegram(cloud);
    localStorage.setItem("aegis:run:v1", "cached");

    vi.useFakeTimers();
    const pending = readPersisted("aegis:run:v1");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe("cached");
  });

  it("удаление чистит и кэш, и облако вместе с чанками", async () => {
    const cloud = fakeCloud();
    inTelegram(cloud);
    await writePersisted("aegis:run:v1", "w".repeat(9000));
    await removePersisted("aegis:run:v1");

    expect(readCached("aegis:run:v1")).toBeNull();
    expect([...cloud.data.keys()]).toEqual([]);
  });
});
