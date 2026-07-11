import type { ReactNode } from "react";
import styles from "./SoonBadge.module.css";

/** Инлайновый бейдж «СКОРО». */
export function SoonBadge({ children }: { children: ReactNode }) {
  return <em className={styles.soon}>{children}</em>;
}
