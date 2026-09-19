import { afterEach, describe, expect, it, vi } from "vitest";
import { DEADZONE, PAD, PadNav, hasEdge, pickPad, readPad } from "../src/features/arcade/gamepad.ts";

// Геймпад (T13.34): мёртвая зона, D-pad, раскладка кнопок в маску каста, фронты нажатий, навигация по меню.
const pad = (axes: number[], pressed: number[] = []) => ({ axes, buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: pressed.includes(i) })) });

describe("readPad", () => {
  it("стик: мёртвая зона, плавный разгон после неё, нормировка за единицей; D-pad — как стик", () => {
    expect(readPad(pad([0.1, -0.1]), 0)).toMatchObject({ x: 0, y: 0, active: false });
    const half = readPad(pad([0.6, 0]), 0);
    expect(half.x).toBeCloseTo((0.6 - DEADZONE) / (1 - DEADZONE), 5);
    const diag = readPad(pad([1, 1]), 0);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 5);
    const d = readPad(pad([0, 0], [PAD.up, PAD.right]), 0);
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 5); expect(d.y).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(d.active).toBe(true);
  });

  it("кнопки: ×○□△ → Q/W/E/R, R2 — атака; фронт только при новом нажатии", () => {
    const a = readPad(pad([0, 0], [PAD.cross, PAD.triangle, PAD.r2]), 0);
    expect(a.cast).toBe(1 | 8 | 16);
    expect(hasEdge(a.edges, PAD.cross)).toBe(true);
    const b = readPad(pad([0, 0], [PAD.cross, PAD.r1]), a.held);
    expect(hasEdge(b.edges, PAD.cross)).toBe(false); // удержана — не фронт
    expect(hasEdge(b.edges, PAD.r1)).toBe(true);
    expect(b.cast).toBe(1);
    const c = readPad(pad([0, 0]), b.held);
    expect(c.edges).toBe(0); expect(c.held).toBe(0); expect(c.active).toBe(false);
  });

  it("PadNav: один наклон стика — один шаг, повтор только после возврата к центру; D-pad — по фронту", () => {
    const nav = new PadNav();
    expect(nav.step(readPad(pad([0.9, 0]), 0))).toBe(1);
    expect(nav.step(readPad(pad([0.9, 0]), 0))).toBe(0);
    expect(nav.step(readPad(pad([0.1, 0]), 0))).toBe(0);
    expect(nav.step(readPad(pad([-0.8, 0]), 0))).toBe(-1);
    let held = 0;
    const l = readPad(pad([0, 0], [PAD.left]), held); held = l.held;
    expect(nav.step(l)).toBe(-1);
    expect(nav.step(readPad(pad([0, 0], [PAD.left]), held))).toBe(0);
  });
});

// Аудит 2026-09-19: читался первый попавшийся пад с любой раскладкой, а маска удержанных кнопок переживала отключение.
describe("выбор пада и отключение", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("берётся только подключённый пад со стандартной раскладкой", () => {
    const wheel = { ...pad([0, 0], [PAD.cross]), mapping: "", connected: true };
    const gone = { ...pad([0, 0]), mapping: "standard", connected: false };
    const dual = { ...pad([0, 0]), mapping: "standard", connected: true };
    expect(pickPad([null, wheel, gone, dual])).toBe(dual);
    expect(pickPad([wheel])).toBeNull(); // руль с «нажатой» кнопкой 0 не кастует Q
    expect(pickPad([])).toBeNull();
  });

  it("пад отключился с зажатой кнопкой: после переподключения то же нажатие снова даёт фронт", async () => {
    const listeners = { addEventListener: () => {}, removeEventListener: () => {} };
    let pads: unknown[] = [];
    vi.stubGlobal("window", listeners);
    vi.stubGlobal("navigator", { getGamepads: () => pads });
    const { ArcadeInputController } = await import("../src/features/arcade/input.ts");
    const controller = new ArcadeInputController(listeners as unknown as HTMLElement);
    let pauses = 0;
    controller.onPause = () => { pauses++; };
    const options = { ...pad([0, 0], [PAD.options]), mapping: "standard", connected: true };
    pads = [options]; controller.pollPad(false);
    expect(pauses).toBe(1);
    controller.pollPad(false); // удержание — не фронт
    expect(pauses).toBe(1);
    pads = [null]; controller.pollPad(false); // отключился с зажатой Options
    pads = [options]; controller.pollPad(false); // подключился новый, Options уже нажата
    expect(pauses).toBe(2);
    // Пад с нестандартной раскладкой ввода не даёт вовсе.
    pads = [{ ...options, mapping: "" }]; controller.pollPad(false);
    pads = [null]; controller.pollPad(false);
    pads = [{ ...options, mapping: "" }]; controller.pollPad(false);
    expect(pauses).toBe(2);
  });
});
