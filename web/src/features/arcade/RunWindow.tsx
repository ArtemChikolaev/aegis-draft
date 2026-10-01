// Окно забега поверх сцены (M23): лавка, лут, места, карточки уровня, выкуп, награда Рошана, сборка. Для читалок — диалог
// (`role="dialog"`, `aria-modal`, подпись — название окна); Tab ходит по его кнопкам по кругу, геймпад — шагом по ним же.
// Фокус сам НЕ ставится: окна уровня, выкупа и Рошана открываются посреди боя, и Enter (подбор) выбрал бы первую карточку.
import { useRef, type KeyboardEvent, type ReactNode } from "react";

/** Что фокусируется в окне — доступные кнопки и ссылки, в порядке разметки. */
const FOCUSABLE = 'button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Фокусируемые элементы окна (видимые). */
export function runWindowFocusables(root: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

/** Открытое окно забега (оно одно — `activeModal()` сима). */
export function openRunWindow(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-run-window="true"]');
}

/** Шаг фокуса по окну: −1/+1 по кругу; фокуса в окне нет — на первую (вперёд) или последнюю (назад) кнопку. */
export function stepRunWindowFocus(root: HTMLElement, dir: -1 | 1): HTMLElement | null {
  const items = runWindowFocusables(root);
  if (items.length === 0) return null;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = i === -1 ? (dir > 0 ? 0 : items.length - 1) : (i + dir + items.length) % items.length;
  items[next].focus();
  items[next].scrollIntoView?.({ block: "nearest" });
  return items[next];
}

export function RunWindow({ testId, label, pad, children }: { testId: string; label: string; pad: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !ref.current) return;
    if (stepRunWindowFocus(ref.current, e.shiftKey ? -1 : 1)) e.preventDefault();
  };
  return (
    <div ref={ref} className="arcade-overlay" data-testid={testId} role="dialog" aria-modal="true" aria-label={label} data-run-window="true" data-pad={pad ? "true" : undefined} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
