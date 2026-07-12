import { useEffect, useRef, useState } from "react";
import styles from "./TeamName.module.css";

const MAX = 40;

/** Инлайн-редактируемое название команды (клик по ✎ → input; Enter/blur — коммит). */
export function TeamName({ value, placeholder, editLabel, onChange }: {
  value: string;
  placeholder: string;
  editLabel: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    onChange(draft.trim().slice(0, MAX));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={styles.input}
        value={draft}
        maxLength={MAX}
        placeholder={placeholder}
        aria-label={editLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button type="button" className={styles.display} onClick={() => setEditing(true)} aria-label={editLabel}>
      <span className={value ? styles.name : styles.placeholder}>{value || placeholder}</span>
      <span className={styles.pencil} aria-hidden="true">✎</span>
    </button>
  );
}
