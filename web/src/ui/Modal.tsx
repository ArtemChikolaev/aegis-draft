import type { ReactNode } from "react";
import styles from "./Modal.module.css";

/** Модальное окно с затемнением. Клик по фону закрывает. */
export function Modal({ mark, title, description, labelledBy, onClose, children, layout = "actions" }: {
  mark?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  labelledBy?: string;
  onClose: () => void;
  children: ReactNode;
  layout?: "actions" | "content";
}) {
  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`${styles.panel} ${layout === "content" ? styles.contentPanel : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {mark && <span className={styles.mark} aria-hidden="true">{mark}</span>}
        <h2 id={labelledBy}>{title}</h2>
        {description && <p>{description}</p>}
        <div className={layout === "content" ? styles.content : styles.actions}>{children}</div>
      </section>
    </div>
  );
}
