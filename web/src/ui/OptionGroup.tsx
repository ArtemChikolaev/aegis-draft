import { SoonBadge } from "./SoonBadge.tsx";
import styles from "./OptionGroup.module.css";

export interface Option<T> {
  value: T;
  label: string;
  hint?: string;
  soon?: boolean;
  /** Недоступна при текущих настройках — в отличие от `soon` («будет позже»), бейджа нет. */
  disabled?: boolean;
}

/** Группа выбора одной опции (draft style, формат, сложность …). Презентационная. */
export function OptionGroup<T>({ title, options, value, onChange, soonLabel }: {
  title: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  soonLabel: string;
}) {
  return (
    <fieldset className={styles.group}>
      <legend>{title}</legend>
      <div className={styles.grid}>
        {options.map((option) => (
          <button
            type="button"
            key={String(option.value)}
            className={`${styles.option} ${option.value === value ? styles.active : ""}`}
            disabled={option.soon || option.disabled}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            <span className={styles.label}>{option.label}{option.soon && <SoonBadge>{soonLabel}</SoonBadge>}</span>
            {option.hint && <span className={styles.hint}>{option.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
