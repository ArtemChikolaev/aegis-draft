import styles from "./TagChips.module.css";

export interface TagChip {
  /** Стабильный ключ для React и для тестов (сам тег: `illusion`, `dark`, `agi`). */
  key: string;
  /** Уже переведённая подпись: локализация — снаружи, как у RoleTag. */
  label: string;
  /** Тег участвует в условии какой-то из экипированных карточек. */
  active?: boolean;
  /** Объективный слой (атрибут) — факт о герое, а не подбираемая ось. */
  attr?: boolean;
}

/** Чипы тегов героя (R11.7). Презентационный примитив: решение «какие теги показывать» принимает
 *  вызывающий, потому что оно зависит от экрана — в справочнике уместен весь набор, а на узкой
 *  карточке Буткемпа только то, что сейчас во что-то играет. */
export function TagChips({ chips, testId }: { chips: readonly TagChip[]; testId?: string }) {
  if (!chips.length) return null;
  return (
    <span className={styles.chips} data-testid={testId}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className={`${styles.chip}${chip.active ? ` ${styles.active}` : ""}${chip.attr ? ` ${styles.attr}` : ""}`}
          data-tag={chip.key}
          data-active={chip.active ? "true" : undefined}
        >
          {chip.label}
        </span>
      ))}
    </span>
  );
}
