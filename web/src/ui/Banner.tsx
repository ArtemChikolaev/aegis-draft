import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Banner.module.css";

/** Информ-плашка. tone задаёт цвет; error — сбой, locked — недоступно по правилам режима.
 *  Остальные атрибуты (data-testid, aria-*) пробрасываются на корень — плашку надо уметь
 *  находить в e2e, не заводя ради этого обёртку в экране. */
export function Banner({ tone = "error", title, children, ...rest }: {
  tone?: "error" | "locked";
  title?: ReactNode;
  children?: ReactNode;
  // `title` у нас ReactNode (заголовок плашки), а у HTML-атрибутов это строка тултипа —
  // без Omit пересечение типов схлопнулось бы в `ReactNode & string` и запретило разметку.
} & Omit<HTMLAttributes<HTMLDivElement>, "title">) {
  return (
    // role=alert только для сбоя: у постоянной плашки «закрыто» нечего срочно объявлять.
    <div className={`${styles.banner} ${styles[tone]}`} role={tone === "error" ? "alert" : "note"} {...rest}>
      {title && <strong>{title}</strong>}
      {children && <span>{children}</span>}
    </div>
  );
}
