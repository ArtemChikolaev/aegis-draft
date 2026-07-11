import type { ChangeEvent } from "react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

/** Пилюля-селект с подписью (переключатели темы/языка в топбаре). */
export function Select({ label, value, options, onChange, ...rest }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
} & Record<string, unknown>) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} {...rest}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
