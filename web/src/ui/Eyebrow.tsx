import type { ReactNode } from "react";
import styles from "./Eyebrow.module.css";

/** Мелкий акцентный надзаголовок (uppercase). */
export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={[styles.eyebrow, className].filter(Boolean).join(" ")}>{children}</p>;
}
