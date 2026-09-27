import type { ReactNode } from "react";
import styles from "./Chip.module.css";

/** Пилюля-чип (пул героев и т.п.). `invert` — поверх тёмной сцены (HUD Аркады): тёмная пилюля со светлым текстом в обеих темах. */
export function Chip({ children, invert = false, "data-testid": testId }: { children: ReactNode; invert?: boolean; "data-testid"?: string }) {
  return <span className={invert ? `${styles.chip} ${styles.invert}` : styles.chip} data-testid={testId}>{children}</span>;
}
