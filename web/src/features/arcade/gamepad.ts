// Геймпад Аркады (T13.34, владелец 2026-09-07: DualSense). Чистый разбор состояния пада без DOM — тестируется
// без браузера. Стандартная раскладка Gamepad API: 0 ×, 1 ○, 2 □, 3 △, 4 L1, 5 R1, 6 L2, 7 R2, 8 Share, 9 Options,
// 10 L3, 11 R3, 12–15 D-pad, 16 PS, 17 тач-пад. Левый стик/D-pad — движение; ×○□△ — Q/W/E/R; R2 — атака;
// R1 — подобрать; L1 — сборка; Options — пауза; тач-пад/PS — вспышка. В меню: стик/D-pad — выбор, × — подтвердить, ○ — назад.
export const PAD = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, share: 8, options: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15, ps: 16, touch: 17 } as const;
export const DEADZONE = 0.2;

export interface PadLike { axes: readonly number[]; buttons: readonly { pressed: boolean }[] }
export interface PadRead {
  /** Движение −1..1 после мёртвой зоны (стик или D-pad). */
  x: number;
  y: number;
  /** Маска каста для ArcadeInput (1 Q, 2 W, 4 E, 8 R, 16 атака) — пока кнопка удержана. */
  cast: number;
  /** Кнопки, нажатые в этом чтении впервые (битовая маска по номерам PAD). */
  edges: number;
  /** Все удержанные кнопки (битовая маска). */
  held: number;
  /** Был ли какой-то ввод с пада (для автопереключения подсказок HUD). */
  active: boolean;
}

const bit = (i: number) => 1 << i;
export const hasEdge = (edges: number, button: number) => (edges & bit(button)) !== 0;

/** Разобрать состояние пада; `prevHeld` — маска удержанных кнопок из прошлого чтения (для фронтов). */
export function readPad(pad: PadLike, prevHeld: number): PadRead {
  let x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
  const l = Math.hypot(x, y);
  if (l < DEADZONE) { x = 0; y = 0; } else if (l > 1) { x /= l; y /= l; } else { const k = (l - DEADZONE) / (1 - DEADZONE) / l; x *= k; y *= k; }
  const p = (i: number) => pad.buttons[i]?.pressed === true;
  if (x === 0 && y === 0) { x = (p(PAD.right) ? 1 : 0) - (p(PAD.left) ? 1 : 0); y = (p(PAD.down) ? 1 : 0) - (p(PAD.up) ? 1 : 0); if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; } }
  let held = 0;
  for (let i = 0; i < 18; i++) if (p(i)) held |= bit(i);
  const edges = held & ~prevHeld;
  const cast = (p(PAD.cross) ? 1 : 0) | (p(PAD.circle) ? 2 : 0) | (p(PAD.square) ? 4 : 0) | (p(PAD.triangle) ? 8 : 0) | (p(PAD.r2) ? 16 : 0);
  return { x, y, cast, edges, held, active: held !== 0 || x !== 0 || y !== 0 };
}

/** Навигация по меню от стика: фронт «ушёл за порог» с гистерезисом, чтобы один наклон давал один шаг. */
export class PadNav {
  private armed = true;
  /** Вернёт −1/1 при новом наклоне влево/вправо (или D-pad), 0 — иначе. */
  step(read: PadRead): -1 | 0 | 1 {
    const dpad = hasEdge(read.edges, PAD.left) ? -1 : hasEdge(read.edges, PAD.right) ? 1 : 0;
    if (dpad) return dpad;
    if (Math.abs(read.x) < 0.35) { this.armed = true; return 0; }
    if (!this.armed) return 0;
    this.armed = false;
    return read.x < 0 ? -1 : 1;
  }
}

/** Глифы кнопок для подсказок HUD (текст, без i18n: символы одинаковы на всех языках). */
export const PAD_GLYPH = { cross: "✕", circle: "○", square: "□", triangle: "△", r1: "R1", l1: "L1", r2: "R2", options: "≡", touch: "▭" } as const;
