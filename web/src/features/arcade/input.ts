// Ввод Arcade: клавиатура (WASD/стрелки, QWER/1234 — ручной каст), геймпад (левый стик, A/B/X/Y)
// и тач-джойстик (палец в любом месте сцены задаёт центр). Всё сводится в один ArcadeInput на тик;
// направление квантуется в шестнадцатые — так лог компактен и одинаков на всех устройствах.
import type { ArcadeInput } from "../../game/arcade/types.ts";
import { PAD, PadNav, hasEdge, pickPad, readPad } from "./gamepad.ts";

const KEY_DIR: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
// KeyF / Digit5 — ручная атака (владелец 2026-09-06: «либо персонаж бьёт сам, либо мы бьём вручную»).
const KEY_CAST: Record<string, number> = { KeyQ: 1, Digit1: 1, KeyE: 2, Digit2: 2, KeyR: 8, Digit4: 8, Digit3: 4, KeyF: 16, Digit5: 16 };

/** Открыт модальный диалог (ui/Modal, подтверждение выхода): ввод принадлежит ему — ни клавиши, ни пад не трогают игру
 *  под ним. Иначе Escape, закрывающий подтверждение, заодно снимал паузу. */
function modalOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/** Поле ввода или элемент внутри диалога: клавиши игры туда не лезут. */
function typingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="dialog"]') !== null;
}

/**
 * Enter, Space и Tab на элементе управления вне HUD остаются браузеру: жмут кнопку и двигают фокус — так с клавиатуры
 * работают карточки уровня, лавка, окна мест, пауза и итог. HUD — часть игровой поверхности: после клика мышью по умению
 * фокус остаётся на его кнопке, и Space/Enter/Tab там по-прежнему пауза, подбор и сборка.
 */
function nativeControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest(".arcade-hud")) return false;
  return target.closest('.arcade-overlay, button, a[href], summary, [role="button"], [role="checkbox"], [tabindex]:not([tabindex="-1"])') !== null;
}

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
  /** Подобрать добычу (G / Enter) и экран сборки (Tab / I): экран решает, слать ли `act` в сим. */
  onPickup: (() => void) | null = null;
  /** true — сборка открывается/закрывается; false — сейчас нельзя (пауза, карточки, окна), и Tab остаётся фокусу. */
  onBuild: (() => boolean) | null = null;
  /** Вспышка свечения (T): чисто визуальная, в сим не идёт. */
  onFlare: (() => void) | null = null;
  /** Геймпад (T13.34): первый ввод с пада — экран переключает подсказки на глифы; навигация по меню — стик/D-pad, × и ○. */
  onGamepad: (() => void) | null = null;
  /** Обратный переход, как в Steam Input: клавиша или указатель — раскладка снова клавиатурная. */
  onKeyboard: (() => void) | null = null;
  onPadNav: ((what: "left" | "right" | "confirm" | "back") => void) | null = null;
  gamepadActive = false;
  private padHeld = 0;
  /** Кнопки умений, зажатые, пока было открыто окно: молчат до отпускания. */
  private padMenuHeld = 0;
  private padX = 0;
  private padY = 0;
  private padNav = new PadNav();

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

  /** Опрос геймпада — каждый кадр экрана, а не только на тике сима: кнопки меню (стик, ×, ○, Options)
   *  должны работать и пока мир стоит в окне карточек или лавки. В меню (`menu=true`) касты и движение
   *  не копятся, чтобы × на карточке не выстрелил умением после закрытия окна. */
  pollPad(menu: boolean): void {
    const raw = firstGamepad();
    // Пад отключился: вместе с движением забываем удержанные кнопки — иначе маска прошлого пада пережила бы
    // переподключение, и первое нажатие той же кнопки на новом паде не дало бы фронта.
    if (!raw) { this.padX = 0; this.padY = 0; this.padHeld = 0; this.padMenuHeld = 0; return; }
    const pad = readPad(raw, this.padHeld);
    this.padHeld = pad.held;
    if (pad.active && !this.gamepadActive) { this.gamepadActive = true; this.onGamepad?.(); }
    const nav = this.padNav.step(pad);
    // Под модальным диалогом пад молчит: × или Options не резюмят игру, пока висит подтверждение.
    // `pad.cast` — удержание, а не нажатие: × подтвердил карточку, окно закрылось, и на следующем кадре та же ещё
    // зажатая кнопка уходила умением. Кнопки, зажатые в меню, молчат до отпускания (аудит 2026-09-19).
    if (modalOpen()) { this.padX = 0; this.padY = 0; this.padMenuHeld |= pad.cast; return; }
    if (menu) { this.padX = 0; this.padY = 0; this.padMenuHeld |= pad.cast; }
    else {
      this.padX = pad.x; this.padY = pad.y;
      this.padMenuHeld &= pad.cast;
      this.castMask |= pad.cast & ~this.padMenuHeld;
      if (hasEdge(pad.edges, PAD.r1)) this.onPickup?.();
      if (hasEdge(pad.edges, PAD.l1)) this.onBuild?.();
      if (hasEdge(pad.edges, PAD.touch) || hasEdge(pad.edges, PAD.ps)) this.onFlare?.();
    }
    if (hasEdge(pad.edges, PAD.options)) this.onPause?.();
    if (nav) this.onPadNav?.(nav < 0 ? "left" : "right");
    if (hasEdge(pad.edges, PAD.cross)) this.onPadNav?.("confirm");
    if (hasEdge(pad.edges, PAD.circle)) this.onPadNav?.("back");
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
    if (this.padX !== 0 || this.padY !== 0) { dx = this.padX; dy = this.padY; }
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    const input: ArcadeInput = { mx: Math.round(dx * 16), my: Math.round(dy * 16), cast: this.castMask, choose: -1, act: this.pendingAct.shift() ?? 0 };
    this.castMask = 0;
    return input;
  }

  private markKeyboard(): void {
    if (this.gamepadActive) { this.gamepadActive = false; this.onKeyboard?.(); }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.markKeyboard();
    // Сочетания браузера и системы (Cmd/Ctrl+R, Alt+←) — не ввод игры: иначе Cmd+R кастовал ульт вместо перезагрузки.
    // На macOS при зажатом Cmd `keyup` остальных клавиш не приходит — направление залипало; снимаем удержания.
    if (e.metaKey || e.ctrlKey || e.altKey) { this.keys.clear(); return; }
    if (modalOpen() || typingTarget(e.target)) return;
    if (KEY_DIR[e.code]) { this.keys.add(e.code); e.preventDefault(); return; }
    const cast = KEY_CAST[e.code];
    if (cast) { this.castMask |= cast; e.preventDefault(); return; }
    if ((e.code === "Enter" || e.code === "Space" || e.code === "Tab") && nativeControl(e.target)) return;
    // Автоповтор удержанной клавиши не переключает паузу/сборку по многу раз (движение и каст выше — идемпотентны).
    if (e.repeat) { if (e.code !== "Tab") e.preventDefault(); return; }
    if (e.code === "Escape" || e.code === "Space") { this.onPause?.(); e.preventDefault(); return; }
    if (e.code === "KeyG" || e.code === "Enter") { this.onPickup?.(); e.preventDefault(); return; }
    if (e.code === "KeyI") { this.onBuild?.(); e.preventDefault(); return; }
    // Tab — хоткей сборки, только если она правда открылась или закрылась; на паузе, в карточках и окнах фокус идёт
    // дальше по кнопкам — иначе до окна поверх сцены с клавиатуры не дойти.
    if (e.code === "Tab") { if (this.onBuild?.()) e.preventDefault(); return; }
    if (e.code === "KeyT") { this.onFlare?.(); e.preventDefault(); }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onBlur = () => { this.keys.clear(); this.stick = null; };
  private onPointerDown = (e: PointerEvent) => {
    this.markKeyboard();
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

function firstGamepad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  try { return pickPad(navigator.getGamepads()); } catch { /* нет доступа к падам — клавиатура/тач */ }
  return null;
}
