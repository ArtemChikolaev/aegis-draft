import { useEffect, useRef, useState } from "react";

/** Пользователь просит меньше движения. Единственный источник — до этого проверка была
 *  скопирована в BracketConnectors и TournamentScreen; третья копия и подтолкнула вынести. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
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

/** Набег числа к target. Возвращает промежуточное значение; в конце — РОВНО target
 *  (иначе округление оставит 87 вместо 88, и golden-тесты поймают расхождение).
 *  prefers-reduced-motion ⇒ мгновенный скачок. */
export function useCountUp(target: number | null): number | null {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (target == null) {
      setDisplay(null);
      fromRef.current = null;
      return;
    }
    const from = fromRef.current;
    // Первое появление числа и reduced-motion — без набега.
    if (from == null || prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    if (from === target) return;

    const duration = motionMs("--motion-count", 320);
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

  return display;
}
