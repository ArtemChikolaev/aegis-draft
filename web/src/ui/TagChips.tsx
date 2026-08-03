import styles from "./TagChips.module.css";

export type TagChipTone = "gameplay" | "lore" | "attribute";

export interface TagChip {
  /** Стабильный ключ для React и для тестов (сам тег: `illusion`, `dark`, `agi`). */
  key: string;
  /** Уже переведённая подпись: локализация — снаружи, как у RoleTag. */
  label: string;
  /** Тег участвует в условии какой-то из экипированных карточек. */
  active?: boolean;
  /** Семантический слой задаёт стабильный цвет, а не случайную раскраску каждого слова. */
  tone?: TagChipTone;
}

/** Чипы тегов героя (R11.7). Презентационный примитив: решение «какие теги показывать» принимает
 *  вызывающий, потому что оно зависит от экрана — в справочнике уместен весь набор, а на узкой
 *  карточке Буткемпа только то, что сейчас во что-то играет.
 *
 *  `onSelect` делает чип кнопкой. Именно кнопкой, а не span с onClick: чип становится точкой
 *  входа («покажи всех illusion»), а такая точка обязана быть доступна с клавиатуры и объявляться
 *  скринридером. */
export function TagChips({ chips, testId, onSelect, selectLabel, align = "start" }: {
  chips: readonly TagChip[];
  testId?: string;
  onSelect?: (key: string) => void;
  /** Подсказка для кликабельного чипа, например «Показать всех с этим тегом». */
  selectLabel?: (chip: TagChip) => string;
  /** В карточках с центральным портретом чипы образуют одну устойчивую центральную строку. */
  align?: "start" | "center";
}) {
  if (!chips.length) return null;
  return (
    <span className={`${styles.chips}${align === "center" ? ` ${styles.center}` : ""}`} data-testid={testId}>
      {chips.map((chip) => {
        const className = `${styles.chip}${chip.active ? ` ${styles.active}` : ""}`
          + `${chip.tone ? ` ${styles[chip.tone]}` : ""}${onSelect ? ` ${styles.clickable}` : ""}`;
        if (!onSelect) {
          return (
            <span key={chip.key} className={className} data-tag={chip.key} data-tone={chip.tone} data-active={chip.active ? "true" : undefined}>
              {chip.label}
            </span>
          );
        }
        return (
          <button
            key={chip.key}
            type="button"
            className={className}
            data-tag={chip.key}
            data-tone={chip.tone}
            data-active={chip.active ? "true" : undefined}
            title={selectLabel?.(chip)}
            aria-label={selectLabel?.(chip)}
            onClick={() => onSelect(chip.key)}
          >
            {chip.label}
          </button>
        );
      })}
    </span>
  );
}
