import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import styles from "./Dealt.module.css";
import { prefersReducedMotion } from "./motion.ts";
import { sfxDeal } from "./sound.ts";

interface DealtProps {
  /** Позиция в раздаче: задержка = index × --motion-deal-stagger. Сквозная по паку —
   *  герои продолжают нумерацию игроков, иначе две группы стартуют разом и раздача рвётся. */
  index: number;
  className?: string;
  children: ReactNode;
}

/** Обёртка раздачи: карта пака приезжает со сдвигом по index (см. design-language §Движение).
 *  Презентационная — ни i18n, ни темы; вид задают токены. Гасится глобальным
 *  prefers-reduced-motion в design/base.css.
 *
 *  ВАЖНО: CSS-анимация играет только при МОНТИРОВАНИИ узла. Чтобы раздача повторялась на
 *  новом паке, вызывающий обязан включить номер пака во ВНЕШНИЙ key:
 *      <Dealt key={`${packSerial}:${id}`} index={i}>
 *  Внутренний key на корневом div для этого ненадёжен — React сверяет массив по внешнему. */
export function Dealt({ index, className, children }: DealtProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Звук раздачи (R15.5): пип на карту с питчем по индексу, задержка = реальный CSS-стаггер
  // этого места (камп плотнее драфта — токен читаем с узла, а не дублируем константой).
  // Под reduced-motion карты появляются без каскада — и озвучивать нечего: пип принадлежит
  // движению, а не данным. В dev StrictMode эффект дублируется — прод не затронут.
  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;
    const raw = getComputedStyle(ref.current).getPropertyValue("--motion-deal-stagger").trim();
    const stepMs = raw.endsWith("ms") ? Number.parseFloat(raw) : Number.parseFloat(raw) * 1000;
    sfxDeal(index, index * (Number.isFinite(stepMs) ? stepMs : 80));
    // Играем ровно при монтировании — как CSS-анимация раздачи (см. комментарий о key выше).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className={className ? `${styles.dealt} ${className}` : styles.dealt}
      style={{ "--deal-index": index } as CSSProperties}
    >
      {children}
    </div>
  );
}
