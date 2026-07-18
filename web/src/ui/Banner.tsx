import type { ReactNode } from "react";
import styles from "./Banner.module.css";

/** Информ-плашка. tone задаёт цвет; error — сбой, locked — недоступно по правилам режима. */
export function Banner({ tone = "error", title, children }: {
  tone?: "error" | "locked";
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    // role=alert только для сбоя: у постоянной плашки «закрыто» нечего срочно объявлять.
    <div className={`${styles.banner} ${styles[tone]}`} role={tone === "error" ? "alert" : "note"}>
      {title && <strong>{title}</strong>}
      {children && <span>{children}</span>}
    </div>
  );
}
