import type { CSSProperties, ReactNode } from "react";
import styles from "./Dealt.module.css";

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
  return (
    <div
      className={className ? `${styles.dealt} ${className}` : styles.dealt}
      style={{ "--deal-index": index } as CSSProperties}
    >
      {children}
    </div>
  );
}
