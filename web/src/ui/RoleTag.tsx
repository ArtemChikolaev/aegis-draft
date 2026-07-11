import type { ReactNode } from "react";
import type { Role } from "../types/data.ts";
import styles from "./RoleTag.module.css";

/** Цветной бейдж роли. Презентационный: label передаёт вызывающий (локализация — снаружи). */
export function RoleTag({ role, children }: { role: Role; children: ReactNode }) {
  return <span className={`${styles.tag} ${styles[role]}`}>{children}</span>;
}
