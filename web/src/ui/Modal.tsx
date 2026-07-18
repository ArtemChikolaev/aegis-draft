import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { prefersReducedMotion } from "./motion.ts";
import styles from "./Modal.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
const DISMISS_PX = 88;
const DISMISS_VELOCITY = 0.5; // px/ms
const ENTER_MS = 560;
const EXIT_MS = 640;

type ModalClose = () => void;
type ModalChildren = ReactNode | ((api: { close: ModalClose }) => ReactNode);

/**
 * Модалка: mark + title + description; крестик без рамки; у content-layout
 * шапка липкая, скроллится только body.
 */
export function Modal({
  mark,
  title,
  description,
  subhead,
  labelledBy,
  onClose,
  children,
  layout = "actions",
  dismissLabel = "Close",
}: {
  mark?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Под шапкой (ссылка и т.п.) — тоже в липкой зоне у content. */
  subhead?: ReactNode;
  labelledBy?: string;
  onClose: () => void;
  children: ModalChildren;
  layout?: "actions" | "content";
  dismissLabel?: string;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const dragRef = useRef<{ startY: number; startT: number; fromHead: boolean } | null>(null);
  const dragYRef = useRef(0);
  const closingRef = useRef(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(prefersReducedMotion());

  const finishClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  const exitDistance = useCallback(() => {
    const panel = panelRef.current;
    return Math.max(window.innerHeight, (panel?.getBoundingClientRect().height ?? 0) + 64);
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    dragRef.current = null;
    setDragging(false);

    if (prefersReducedMotion()) {
      finishClose();
      return;
    }

    const distance = exitDistance();
    setClosing(true);
    setDragY(distance);
    dragYRef.current = distance;
    exitTimerRef.current = window.setTimeout(finishClose, EXIT_MS);
  }, [exitDistance, finishClose]);

  // Таймер выхода снимаем на размонтировании: экран под модалкой может смениться
  // раньше (reset забега), и отложенный onClose дёрнул бы состояние мёртвого экрана.
  useEffect(() => () => {
    if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
  }, []);

  // Фон не должен скроллиться под открытой модалкой. Ширину скроллбара компенсируем,
  // иначе на десктопе страница дёргается вбок в момент открытия.
  useEffect(() => {
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, []);

  // aria-modal без фокуса внутри — фикция: Tab продолжает ходить по экрану за диалогом.
  // Забираем фокус на открытии (autoFocus-элемент, иначе крестик) и возвращаем на закрытии.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    const target = panel.querySelector<HTMLElement>("[autofocus]") ?? closeRef.current;
    target?.focus();
    return () => restoreTo?.focus?.();
  }, []);

  useEffect(() => {
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onTab);
    return () => window.removeEventListener("keydown", onTab);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const inHead = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest(`.${styles.head}`));

    const canPull = (fromHead: boolean) => {
      if (closingRef.current) return false;
      if (fromHead) return true;
      const scroller = scrollRef.current;
      if (!scroller) return true;
      return scroller.scrollTop <= 0;
    };

    const onStart = (event: TouchEvent, fromHead: boolean) => {
      if (closingRef.current || event.touches.length !== 1) return;
      if (!canPull(fromHead)) return;
      const touch = event.touches[0];
      dragRef.current = { startY: touch.clientY, startT: performance.now(), fromHead };
      setDragging(true);
    };

    const onMove = (event: TouchEvent) => {
      const drag = dragRef.current;
      if (!drag || event.touches.length !== 1) return;
      if (!canPull(drag.fromHead)) {
        dragRef.current = null;
        setDragging(false);
        setDragY(0);
        dragYRef.current = 0;
        return;
      }
      const dy = Math.max(0, event.touches[0].clientY - drag.startY);
      if (dy > 0 && event.cancelable) event.preventDefault();
      dragYRef.current = dy;
      setDragY(dy);
    };

    const onEnd = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const y = dragYRef.current;
      const elapsed = Math.max(1, performance.now() - drag.startT);
      const shouldClose = y >= DISMISS_PX || y / elapsed >= DISMISS_VELOCITY;
      dragRef.current = null;
      setDragging(false);
      if (shouldClose) {
        requestClose();
        return;
      }
      setDragY(0);
      dragYRef.current = 0;
    };

    // Слушаем только panel: head лежит внутри и события всплывают. Отдельный набор
    // на head давал два вызова onMove на каждое движение (и два preventDefault).
    const onPanelStart = (event: TouchEvent) => onStart(event, inHead(event.target));

    panel.addEventListener("touchstart", onPanelStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);

    return () => {
      panel.removeEventListener("touchstart", onPanelStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, [requestClose]);

  const offsetY = closing || dragging || dragY > 0
    ? dragY
    : entered ? 0 : Math.min(window.innerHeight * 0.42, 340);

  const duration = closing ? EXIT_MS : ENTER_MS;
  const panelStyle: CSSProperties = {
    transform: `translate3d(0, ${offsetY}px, 0)`,
    opacity: entered || closing || dragY > 0 ? 1 : 0.88,
    transition: dragging
      ? "none"
      : `transform ${duration}ms cubic-bezier(.16, .84, .18, 1), opacity ${duration}ms ease-out`,
  };

  const content = typeof children === "function" ? children({ close: requestClose }) : children;
  const isContent = layout === "content";

  return (
    <div
      className={`${styles.backdrop} ${entered ? styles.backdropIn : ""} ${closing ? styles.backdropOut : ""}`}
      style={dragY > 0 || closing ? { ["--modal-dim" as string]: String(1 - Math.min((closing ? 1 : dragY / 360), 0.55)) } : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        ref={panelRef}
        className={`${styles.panel} ${isContent ? styles.contentPanel : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={panelStyle}
      >
        <header className={styles.head}>
          <button ref={closeRef} type="button" className={styles.close} aria-label={dismissLabel} onClick={requestClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M1.2 1.2l11.6 11.6M12.8 1.2L1.2 12.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {mark && <span className={styles.mark} aria-hidden="true">{mark}</span>}
          <h2 id={labelledBy}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}
          {subhead && <div className={styles.subhead}>{subhead}</div>}
        </header>
        <div
          ref={scrollRef}
          className={isContent ? styles.content : styles.actions}
        >
          {content}
        </div>
      </section>
    </div>
  );
}
