// Загрузчик листов Dota (features/arcade/sprites.ts): индекс набора вместо пробы 404, сетевой сбой ≠ «листа нет»,
// смена набора листов не принимает ответы прошлого поколения (аудит 2026-09-19).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Reply = { status: number; body?: unknown } | "network";
const META = (frame: number) => ({ name: "x", frame, dirs: 8, fps: 12, world: 64, anchor: { x: 0.5, y: 0.9 }, anims: { idle: { row: 0, frames: 1 } } });

let replies: Map<string, Reply[] | ((url: string) => Reply | Promise<Reply>)>;
let requested: string[];
let imagesFail: Set<string>;

/** Ответ по адресу без `?v=`: очередь ответов (последний повторяется) или функция. Нет записи — 404. */
function stubNet(): void {
  vi.stubGlobal("fetch", async (input: string) => {
    const url = String(input).replace(/\?v=.*$/, "");
    requested.push(url);
    const rule = replies.get(url);
    const reply: Reply = typeof rule === "function" ? await rule(url) : rule ? (rule.length > 1 ? rule.shift()! : rule[0]) : { status: 404 };
    if (reply === "network") throw new TypeError("Failed to fetch");
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  });
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    complete = false;
    naturalWidth = 0;
    private url = "";
    get src(): string { return this.url; }
    set src(v: string) {
      this.url = v;
      requested.push(v);
      setTimeout(() => { this.complete = true; if (imagesFail.has(v)) this.onerror?.(); else { this.naturalWidth = 8; this.onload?.(); } }, 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

const index = (sheets: string[], terrain: string[] = []) => [{ status: 200, body: { sheets, terrain } }];
const load = () => import("../src/features/arcade/sprites.ts");
const settle = (ms = 50) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  replies = new Map();
  requested = [];
  imagesFail = new Set();
  stubNet();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("индекс листов набора", () => {
  it("лист, которого нет в индексе набора, не запрашивается: сразу следующий набор", async () => {
    replies.set("/art/sprites/dota_px2/index.json", index(["other"]));
    replies.set("/art/sprites/dota_px/index.json", index(["x"]));
    replies.set("/art/sprites/dota_px/x.json", [{ status: 200, body: META(80) }]);
    const s = await load();
    expect(s.dotaSheet("x")).toBeNull();
    await settle();
    expect(s.dotaSheetState("x")).toBe("ready");
    expect(s.dotaSheet("x")?.meta.frame).toBe(80);
    expect(requested).not.toContain("/art/sprites/dota_px2/x.json");
    expect(requested).not.toContain("/art/sprites/dota_px2/x.webp");
  });

  it("листа нет ни в одном индексе — «missing» без единого запроса меты, после загрузки индексов — синхронно", async () => {
    replies.set("/art/sprites/dota_px2/index.json", index(["a"]));
    replies.set("/art/sprites/dota_px/index.json", index(["a"]));
    const s = await load();
    s.dotaSheet("tormentor");
    await settle();
    expect(s.dotaSheetState("tormentor")).toBe("missing");
    // Индексы уже прочитаны: про лист, который ещё никто не запрашивал, ответ известен сразу.
    expect(s.dotaSheetState("skeleton_warrior")).toBe("missing");
    expect(s.dotaSheet("skeleton_warrior")).toBeNull();
    expect(requested.filter((u) => !u.endsWith("/index.json"))).toEqual([]);
  });

  it("индекс читается один раз на набор", async () => {
    replies.set("/art/sprites/dota_px2/index.json", index(["a", "b"]));
    replies.set("/art/sprites/dota_px2/a.json", [{ status: 200, body: META(160) }]);
    replies.set("/art/sprites/dota_px2/b.json", [{ status: 200, body: META(160) }]);
    const s = await load();
    s.dotaSheet("a"); s.dotaSheet("b");
    await settle();
    expect(requested.filter((u) => u.endsWith("/index.json"))).toEqual(["/art/sprites/dota_px2/index.json"]);
  });

  it("индекс не загрузился — прежняя проба: 404 плотного набора, затем редкий", async () => {
    replies.set("/art/sprites/dota_px/x.json", [{ status: 200, body: META(80) }]);
    const s = await load();
    s.dotaSheet("x");
    await settle();
    expect(s.dotaSheet("x")?.meta.frame).toBe(80);
    expect(requested).toContain("/art/sprites/dota_px2/x.json");
  });

  it("текстуры земли, которой нет в индексе, не запрашиваются", async () => {
    replies.set("/art/sprites/dota_px/index.json", index([], ["grass"]));
    const s = await load();
    expect(s.dotaTerrain("water")).toBeNull();
    await settle();
    expect(s.dotaTerrain("water")).toBeNull();
    s.dotaTerrain("grass");
    await settle();
    expect(s.dotaTerrain("grass")).not.toBeNull();
    expect(requested).not.toContain("/art/sprites/dota_px/terrain/water.webp");
    expect(requested).toContain("/art/sprites/dota_px/terrain/grass.webp");
  });
});

describe("первый существующий лист из кандидатов (форма облика → базовая форма)", () => {
  it("с прочитанным индексом ответ синхронный и без запросов к отсутствующему кандидату", async () => {
    replies.set("/art/sprites/dota_px2/index.json", index(["tb@meta"]));
    replies.set("/art/sprites/dota_px/index.json", index(["tb@meta"]));
    replies.set("/art/sprites/dota_px2/tb@meta.json", [{ status: 200, body: META(160) }]);
    const s = await load();
    await s.preloadSheetIndexes();
    const first = s.resolveSheet(["tb@fractal@meta", "tb@meta"], false);
    expect(first).toEqual({ sheet: "tb@meta", settled: false });
    expect(requested.filter((u) => !u.endsWith("/index.json"))).toEqual([]); // «только посмотреть» ничего не грузит
    s.resolveSheet(["tb@fractal@meta", "tb@meta"]);
    await settle();
    expect(s.resolveSheet(["tb@fractal@meta", "tb@meta"])).toEqual({ sheet: "tb@meta", settled: true });
    expect(requested.some((u) => u.includes("tb@fractal@meta"))).toBe(false);
  });

  it("без индекса кандидаты пробуются по одному: 404 первого — переход ко второму", async () => {
    replies.set("/art/sprites/dota_px2/tb@meta.json", [{ status: 200, body: META(160) }]);
    const s = await load();
    expect(s.resolveSheet(["tb@fractal@meta", "tb@meta"])).toEqual({ sheet: "tb@fractal@meta", settled: false });
    expect(requested.some((u) => u.includes("/tb@meta."))).toBe(false); // второй кандидат ещё не запрошен
    await settle();
    expect(s.resolveSheet(["tb@fractal@meta", "tb@meta"]).sheet).toBe("tb@meta");
    await settle();
    expect(s.resolveSheet(["tb@fractal@meta", "tb@meta"])).toEqual({ sheet: "tb@meta", settled: true });
  });

  it("ни одного кандидата нет — последний, окончательно", async () => {
    replies.set("/art/sprites/dota_px2/index.json", index([]));
    replies.set("/art/sprites/dota_px/index.json", index([]));
    const s = await load();
    await s.preloadSheetIndexes();
    expect(s.resolveSheet(["a@meta", "b@meta"])).toEqual({ sheet: "b@meta", settled: true });
  });
});

describe("сетевая ошибка — не «листа нет»", () => {
  it("сбой меты повторяется с бэк-оффом, лист в итоге загружен", async () => {
    replies.set("/art/sprites/dota_px2/index.json", index(["x"]));
    replies.set("/art/sprites/dota_px2/x.json", ["network", { status: 200, body: META(160) }]);
    const s = await load();
    s.dotaSheet("x");
    await settle(5000);
    expect(s.dotaSheetState("x")).toBe("ready");
    expect(requested.filter((u) => u === "/art/sprites/dota_px2/x.json")).toHaveLength(2);
  });

  it("сбой картинки листа повторяется", async () => {
    replies.set("/art/sprites/dota_px2/index.json", index(["x"]));
    replies.set("/art/sprites/dota_px2/x.json", [{ status: 200, body: META(160) }]);
    imagesFail.add("/art/sprites/dota_px2/x.webp");
    const s = await load();
    s.dotaSheet("x");
    await settle(300);
    imagesFail.clear();
    await settle(5000);
    expect(s.dotaSheetState("x")).toBe("ready");
  });

  it("сеть лежит дольше повторов: лист не записан как отсутствующий и запрашивается снова после паузы", async () => {
    replies.set("/art/sprites/dota_px2/index.json", index(["x"]));
    replies.set("/art/sprites/dota_px/index.json", index(["x"]));
    replies.set("/art/sprites/dota_px2/x.json", ["network"]);
    const s = await load();
    s.dotaSheet("x");
    await settle(5000);
    expect(s.dotaSheetState("x")).toBe("loading");
    // Редкий набор при сбое сети плотный не подменяет.
    expect(requested).not.toContain("/art/sprites/dota_px/x.json");
    replies.set("/art/sprites/dota_px2/x.json", [{ status: 200, body: META(160) }]);
    const before = requested.length;
    s.dotaSheet("x"); // пауза ещё не вышла — нового запроса нет
    expect(requested.length).toBe(before);
    await settle(10_000);
    s.dotaSheet("x");
    await settle(100);
    expect(s.dotaSheet("x")?.meta.frame).toBe(160);
  });

  it("404 меты — подтверждённое отсутствие: без повторов", async () => {
    const s = await load();
    s.dotaSheet("ghost");
    await settle(5000);
    expect(s.dotaSheetState("ghost")).toBe("missing");
    expect(requested.filter((u) => u.endsWith("/ghost.json"))).toEqual(["/art/sprites/dota_px2/ghost.json", "/art/sprites/dota_px/ghost.json"]);
  });
});

describe("смена набора листов (setPixelSheets)", () => {
  it("ответ прошлого поколения не ложится в очищенный кэш", async () => {
    let release: (r: Reply) => void = () => {};
    replies.set("/art/sprites/dota_px2/index.json", index(["x"]));
    replies.set("/art/sprites/dota_px/index.json", index(["x"]));
    replies.set("/art/sprites/dota_px2/x.json", () => new Promise<Reply>((resolve) => { release = resolve; }));
    replies.set("/art/sprites/dota_px/x.json", [{ status: 200, body: META(80) }]);
    const s = await load();
    s.dotaSheet("x"); // плотный набор: мета зависла в сети
    await settle();
    s.setPixelSheets(true, false); // смена DPR: теперь только редкий набор
    s.dotaSheet("x");
    await settle();
    expect(s.dotaSheet("x")?.meta.frame).toBe(80);
    release({ status: 200, body: META(160) }); // опоздавший ответ старого набора
    await settle();
    expect(s.dotaSheet("x")?.meta.frame).toBe(80);
  });
});
