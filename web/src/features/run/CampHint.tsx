import type { ReactNode } from "react";

/** Компактная справка внутри Буткемпа. Постоянные поясняющие абзацы не конкурируют с выбором,
 * но остаются доступны мышью, касанием и с клавиатуры. Локальный feature-компонент: общего
 * Tooltip в UIkit пока нет, а за пределами Буткемпа такой паттерн не используется. */
export function CampHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="camp-hint">
      <summary aria-label={label} title={label}>?</summary>
      <span className="camp-hint__bubble" role="tooltip">{children}</span>
    </details>
  );
}
