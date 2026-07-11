import type { ElementType, ReactNode } from "react";
import styles from "./Surface.module.css";

/** Карточка-поверхность: рамка + радиус + фон из токенов. `as` — тег обёртки. */
export function Surface({ as: Tag = "section", className, children, ...rest }: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <Tag className={[styles.surface, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
}
