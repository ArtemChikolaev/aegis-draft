import type { ReactNode } from "react";
import styles from "./Eyebrow.module.css";

/** Мелкий акцентный надзаголовок (uppercase). `tone="invert"` — на всегда-тёмной подложке (сцена Аркады под окнами):
 *  тема-зависимый акцент в светлой теме глубокий и на тёмном тонет, там — яркий brand-акцент режима. */
export function Eyebrow({ className, tone, children }: { className?: string; tone?: "invert"; children: ReactNode }) {
  return <p className={[styles.eyebrow, tone === "invert" && styles.invert, className].filter(Boolean).join(" ")}>{children}</p>;
}
