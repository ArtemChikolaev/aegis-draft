// Увеличенная offer-карточка R13.3: identity предложения + полный `до → после` + то же действие.
// Доступность, Escape, focus trap, возврат фокуса и блокировка скролла переиспользуют `ui/Modal`.
import type { ReactNode } from "react";
import { Button, Modal } from "../../ui/index.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import type { SummandDelta } from "./campPresentation.ts";

function fmt(value: number): string {
  return Number.isInteger(value) ? value.toString() : (Math.round(value * 10) / 10).toString();
}

function signed(value: number): string {
  return value > 0 ? `+${fmt(value)}` : fmt(value);
}

export interface OfferOverlayAction {
  label: string;
  meta?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function OfferOverlay({
  title,
  subtitle,
  summary,
  deltas,
  total,
  totalFrom,
  totalTo,
  totalLabel,
  action,
  onClose,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Верх карточки в компактном и увеличенном виде один: герой/игрок и контекст замены. */
  summary?: ReactNode;
  deltas: readonly SummandDelta[];
  total: number;
  totalFrom: number;
  totalTo: number;
  totalLabel: string;
  action?: OfferOverlayAction;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      title={title}
      description={subtitle}
      labelledBy="camp-offer-overlay-title"
      onClose={onClose}
      layout="content"
      presentation="card"
      dismissLabel={t("common.close")}
    >
      {({ close }) => (
        <div className="offer-overlay" data-testid="offer-overlay">
          {summary && <div className="offer-overlay__summary">{summary}</div>}
          <p className={`offer-overlay__total offer-overlay__total--${total >= 0 ? "up" : "down"}`}>
            <span>
              {totalLabel}
              <small>{fmt(totalFrom)}→{fmt(totalTo)}</small>
            </span>
            <strong data-testid="offer-overlay-total">{signed(total)}</strong>
          </p>
          {deltas.length > 0 && (
            <dl className="offer-overlay__rows">
              {deltas.map((row) => (
                <div key={row.summand} className="offer-overlay__row">
                  <dt>{t(`common.${row.summand}` as MessageKey)}</dt>
                  <dd className={`camp-offer__delta camp-offer__delta--${row.delta >= 0 ? "up" : "down"}`}>
                    {fmt(row.from)}→{fmt(row.to)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {action && (
            <div className="offer-overlay__action">
              {action.meta && <span>{action.meta}</span>}
              <Button
                variant="primary"
                disabled={action.disabled}
                data-testid="offer-overlay-action"
                onClick={() => {
                  close();
                  action.onSelect();
                }}
              >
                {action.label}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
