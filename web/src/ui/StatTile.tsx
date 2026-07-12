import styles from "./StatTile.module.css";

export type StatKind = "base" | "synergy" | "chemistry";

/** Плитка метрики (Base / Hero Synergy / Chemistry) для тёмного радара. */
export function StatTile({ label, value, kind, sublabel }: {
  label: string;
  value: string;
  kind: StatKind;
  sublabel?: string;
}) {
  return (
    <div className={`${styles.stat} ${styles[kind]}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {sublabel && <em>{sublabel}</em>}
    </div>
  );
}
