import type { ReactNode } from "react";
import styles from "./Banner.module.css";

/** Информ-плашка. tone задаёт цвет; сейчас есть error, легко расширить. */
export function Banner({ tone = "error", title, children }: {
  tone?: "error";
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${styles.banner} ${styles[tone]}`} role="alert">
      {title && <strong>{title}</strong>}
      {children && <span>{children}</span>}
    </div>
  );
}
