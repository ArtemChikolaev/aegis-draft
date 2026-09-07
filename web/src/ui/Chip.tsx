import type { ReactNode } from "react";
import styles from "./Chip.module.css";

/** Пилюля-чип (пул героев и т.п.). */
export function Chip({ children, "data-testid": testId }: { children: ReactNode; "data-testid"?: string }) {
  return <span className={styles.chip} data-testid={testId}>{children}</span>;
}
