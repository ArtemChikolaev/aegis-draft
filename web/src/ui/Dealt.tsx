import type { CSSProperties, ReactNode } from "react";
import styles from "./Dealt.module.css";

interface DealtProps {
  /** Позиция в раздаче: задержка = index × --motion-deal-stagger. Сквозная по паку —
   *  герои продолжают нумерацию игроков, иначе две группы стартуют разом и раздача рвётся. */
  index: number;
  /** Ключ раздачи (id пака). Меняется ⇒ React пересоздаёт узел ⇒ анимация играет заново.
   *  Без этого второй пак въехал бы без движения: те же DOM-узлы, CSS-анимация не рестартует. */
  dealKey: string | number;
  className?: string;
  children: ReactNode;
}

/** Обёртка раздачи: карта пака приезжает со сдвигом по index (см. design-language §Движение).
 *  Презентационная — ни i18n, ни темы; вид задают токены. Гасится глобальным
 *  prefers-reduced-motion в design/base.css. */
export function Dealt({ index, dealKey, className, children }: DealtProps) {
  return (
    <div
      key={dealKey}
      className={className ? `${styles.dealt} ${className}` : styles.dealt}
      style={{ "--deal-index": index } as CSSProperties}
    >
      {children}
    </div>
  );
}
