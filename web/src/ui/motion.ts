import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { readCached, writePersisted } from "../state/persist.ts";

/** Пользователь просит меньше движения. Единственный источник — до этого проверка была
 *  скопирована в BracketConnectors и TournamentScreen; третья копия и подтолкнула вынести. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/* ─── Тряска экрана (R15.4) ───
 * Только кульминации забега (Aegis взят / смерть) и с собственным тумблером — как в Balatro.
 * prefers-reduced-motion гасит саму анимацию глобальным правилом, но тумблер отдельный:
 * не хотеть тряску ≠ не хотеть движение вообще. Персист — тот же слой, что тема/язык. */
const SHAKE_KEY = "aegis-draft.screenShake";
const shakeListeners = new Set<() => void>();

export function screenShakeEnabled(): boolean {
  return readCached(SHAKE_KEY) !== "off";
}

function setScreenShakeEnabled(enabled: boolean): void {
  void writePersisted(SHAKE_KEY, enabled ? "on" : "off");
  for (const listener of shakeListeners) listener();
}

/** Подписка для Settings: значение + сеттер, синхронно с другими вкладками этого модуля. */
export function useScreenShakeSetting(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(
    (listener) => {
      shakeListeners.add(listener);
      return () => shakeListeners.delete(listener);
    },
    screenShakeEnabled,
    () => true,
  );
  return [enabled, setScreenShakeEnabled];
}

/* ─── Hover-tilt карточек (R15.6) ───
 * Лёгкий 3D-наклон за курсором, синергирует с фольгой редких карт. Делегирование с корня
 * экрана: карточки постоянно перемонтируются раздачей, вешать слушатели на каждую — утечка
 * логики в список. Только мышь (у touch нет hover), только transform (без re-layout),
 * reduced-motion выключает целиком. */
export function useCardTilt(ref: RefObject<HTMLElement | null>, selector = ".camp-inspectable-card"): void {
  useEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion()) return;
    const cardOf = (target: EventTarget | null): HTMLElement | null =>
      (target as Element | null)?.closest?.(selector) ?? null;
    const reset = (card: HTMLElement) => {
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const card = cardOf(event.target);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = (event.clientX - rect.left) / rect.width - 0.5;
      const dy = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty("--tilt-x", `${(-dy * 5).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(dx * 7).toFixed(2)}deg`);
    };
    const onOut = (event: PointerEvent) => {
      const card = cardOf(event.target);
      if (!card) return;
      const to = event.relatedTarget as Node | null;
      if (to && card.contains(to)) return;
      reset(card);
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerout", onOut);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerout", onOut);
    };
  }, [ref, selector]);
}

/** Число из токена движения (`--motion-count` и т.п.) в миллисекундах.
 *  Читаем CSS-переменную, а не дублируем константу в JS: токен остаётся единственным
 *  источником, и правка в tokens.css меняет и CSS-, и JS-анимации разом. */
export function motionMs(token: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!raw) return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith("ms") ? value : value * 1000;
}

/** Куда поехало число: вверх — рост, вниз — падение, null — покой/первое появление. */
export type CountDirection = "up" | "down" | null;

/** Набег числа к target + направление последнего изменения.
 *  В конце ставится РОВНО target (иначе округление оставит 87 вместо 88, и golden поймает).
 *  Направление держится --motion-flash после набега и гаснет: цвет — вспышка-сигнал, а не
 *  постоянное состояние, иначе радар будет вечно красным после одного слабого пика.
 *  prefers-reduced-motion ⇒ число прыгает, но направление всё равно сообщается: цвет не
 *  вестибулярный раздражитель, и лишать его смысла нет. */
export function useCountUp(target: number | null): { value: number | null; direction: CountDirection } {
  const [display, setDisplay] = useState(target);
  const [direction, setDirection] = useState<CountDirection>(null);
  const fromRef = useRef(target);
  const frameRef = useRef(0);
  const flashRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (target == null) {
      setDisplay(null);
      setDirection(null);
      fromRef.current = null;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;

    // Первое появление числа — не «рост», сигналить нечего.
    const dir: CountDirection = from == null ? null : target > from ? "up" : "down";
    setDirection(dir);
    if (dir) {
      clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setDirection(null), motionMs("--motion-count", 420) + motionMs("--motion-flash", 900));
    }

    if (from == null || prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const duration = motionMs("--motion-count", 420);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out: быстрый старт, мягкое торможение — та же кривая, что у --ease-out.
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (target - from) * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else {
        setDisplay(target);
        fromRef.current = target;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  useEffect(() => () => clearTimeout(flashRef.current), []);

  return { value: display, direction };
}
