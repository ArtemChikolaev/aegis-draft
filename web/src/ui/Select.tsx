import type { ChangeEvent } from "react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

/** Пилюля-селект с подписью (переключатели темы/языка в топбаре).
 *  `keepLabel` — не прятать подпись на узких экранах: в топбаре она декоративна и уступает место,
 *  а у селекта-оси (событие Real Tournament) без подписи поле теряет смысл. */
export function Select({ label, value, options, onChange, keepLabel = false, ...rest }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  keepLabel?: boolean;
} & Record<string, unknown>) {
  return (
    <label className={keepLabel ? `${styles.field} ${styles.keepLabel}` : styles.field}>
      <span>{label}</span>
      <select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} {...rest}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
