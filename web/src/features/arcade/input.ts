// Ввод Arcade: клавиатура (WASD/стрелки, QWER/1234 — ручной каст), геймпад (левый стик, A/B/X/Y)
// и тач-джойстик (палец в любом месте сцены задаёт центр). Всё сводится в один ArcadeInput на тик;
// направление квантуется в шестнадцатые — так лог компактен и одинаков на всех устройствах.
import type { ArcadeInput } from "../../game/arcade/types.ts";

const KEY_DIR: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
// KeyF / Digit5 — ручная атака (владелец 2026-09-06: «либо персонаж бьёт сам, либо мы бьём вручную»).
const KEY_CAST: Record<string, number> = { KeyQ: 1, Digit1: 1, KeyE: 2, Digit2: 2, KeyR: 8, Digit4: 8, Digit3: 4, KeyF: 16, Digit5: 16 };

export class ArcadeInputController {
  private keys = new Set<string>();
  private castMask = 0;
  /** Очередь `act` для мира (переключатели автокаста): по одному на тик, чтобы каждое попало в input-лог. */
  private pendingAct: number[] = [];
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  /** Для рендера джойстика на тач-экране. */
  get joystick(): { ox: number; oy: number; x: number; y: number } | null {
    return this.stick;
  }
  onPause: (() => void) | null = null;

  constructor(private readonly surface: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    surface.addEventListener("pointerdown", this.onPointerDown);
    surface.addEventListener("pointermove", this.onPointerMove);
    surface.addEventListener("pointerup", this.onPointerUp);
    surface.addEventListener("pointercancel", this.onPointerUp);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.surface.removeEventListener("pointerdown", this.onPointerDown);
    this.surface.removeEventListener("pointermove", this.onPointerMove);
    this.surface.removeEventListener("pointerup", this.onPointerUp);
    this.surface.removeEventListener("pointercancel", this.onPointerUp);
  }

  /** Кнопка способности на тач-панели: каст буферизуется до следующего тика. */
  /** Поставить `act` в очередь на ближайшие тики (переключатель автокаста из HUD). Дубликаты не копятся:
   *  экран зовёт это каждый кадр, пока сим не догнал настройку, а применить нужно ровно один раз. */
  queueAct(act: number): void {
    if (!this.pendingAct.includes(act)) this.pendingAct.push(act);
  }

  cast(mask: number): void {
    this.castMask |= mask;
  }

  /** Снять ввод на текущий тик (каст-буфер при этом сбрасывается). */
  read(): ArcadeInput {
    let dx = 0, dy = 0;
    for (const code of this.keys) {
      const dir = KEY_DIR[code];
      if (dir) { dx += dir[0]; dy += dir[1]; }
    }
    if (this.stick) {
      const sx = (this.stick.x - this.stick.ox) / 56, sy = (this.stick.y - this.stick.oy) / 56;
      const l = Math.hypot(sx, sy);
      if (l > 0.12) { dx = l > 1 ? sx / l : sx; dy = l > 1 ? sy / l : sy; }
    }
    const pad = readGamepad();
    if (pad) {
      if (Math.hypot(pad.x, pad.y) > 0.2) { dx = pad.x; dy = pad.y; }
      this.castMask |= pad.cast;
    }
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    const input: ArcadeInput = { mx: Math.round(dx * 16), my: Math.round(dy * 16), cast: this.castMask, choose: -1, act: this.pendingAct.shift() ?? 0 };
    this.castMask = 0;
    return input;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (KEY_DIR[e.code]) { this.keys.add(e.code); e.preventDefault(); return; }
    const cast = KEY_CAST[e.code];
    if (cast) { this.castMask |= cast; e.preventDefault(); return; }
    if (e.code === "Escape" || e.code === "Space") { this.onPause?.(); e.preventDefault(); }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onBlur = () => { this.keys.clear(); this.stick = null; };
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.stick) return;
    // Кнопки HUD и оверлеи (карточки уровня, пауза) — не джойстик: захват указателя сценой
    // иначе съедает click по карточке (поймано headless-прогоном 2026-09-05).
    if (e.target instanceof Element && e.target.closest("button, a, input, .arcade-overlay")) return;
    this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    this.surface.setPointerCapture?.(e.pointerId);
  };
  private onPointerMove = (e: PointerEvent) => {
    if (this.stick?.id !== e.pointerId) return;
    this.stick.x = e.clientX;
    this.stick.y = e.clientY;
  };
  private onPointerUp = (e: PointerEvent) => {
    if (this.stick?.id === e.pointerId) this.stick = null;
  };
}

function readGamepad(): { x: number; y: number; cast: number } | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (!pad) continue;
    const cast = (pad.buttons[0]?.pressed ? 1 : 0) | (pad.buttons[1]?.pressed ? 2 : 0) | (pad.buttons[2]?.pressed ? 4 : 0) | (pad.buttons[3]?.pressed ? 8 : 0);
    return { x: pad.axes[0] ?? 0, y: pad.axes[1] ?? 0, cast };
  }
  return null;
}
