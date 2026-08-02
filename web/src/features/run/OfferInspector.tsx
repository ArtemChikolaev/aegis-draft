// Инспектор карточки рынка (R13.3): полный разбор `до → после` по слагаемым.
//
// ПОЧЕМУ ОТДЕЛЬНО ОТ КАРТОЧКИ. Карточка отвечает на «брать или нет» и обязана быть сравнимой с
// соседними — то есть компактной и одного размера. Разбор отвечает на «почему» и нужен реже, но
// целиком. До R13.3 оба уровня печатались одновременно, и карточка вырастала в мини-отчёт.
//
// ПОЧЕМУ MODAL, А НЕ БОКОВАЯ ПАНЕЛЬ. `ui/Modal` уже есть, доступен с клавиатуры и ровно так же
// открывает `HeroTagInspector` — второй механизм «показать подробности, не уводя с экрана» здесь
// был бы дублированием. Разбор читают после выбора карточки, а не одновременно с пятью соседними,
// поэтому перекрытие соседей приемлемо; если понадобится сравнение бок о бок, меняется только этот
// компонент — карточки отдают чистые данные (`campPresentation`).
import type { ReactNode } from "react";
import { Modal } from "../../ui/index.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import type { SummandDelta } from "./campPresentation.ts";

function fmt(value: number): string {
  return Number.isInteger(value) ? value.toString() : (Math.round(value * 10) / 10).toString();
}

function signed(value: number): string {
  return value > 0 ? `+${fmt(value)}` : fmt(value);
}

export function OfferInspector({ title, subtitle, deltas, total, totalFrom, totalTo, totalLabel, onClose, children }: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Разбор по слагаемым. Пустой — значит оффер не двигает состав (экономика, утилита). */
  deltas: readonly SummandDelta[];
  total: number;
  totalFrom?: number;
  totalTo?: number;
  totalLabel: string;
  onClose: () => void;
  /** Специфика вида оффера: кого заменяет, лучшее назначение, редкость. */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} description={subtitle} onClose={onClose} layout="content" dismissLabel={t("common.close")}>
      <div className="offer-inspector" data-testid="offer-inspector">
        <p className={`offer-inspector__total offer-inspector__total--${total >= 0 ? "up" : "down"}`}>
          <span>
            {totalLabel}
            {totalFrom != null && totalTo != null && (
              <small>{fmt(totalFrom)}→{fmt(totalTo)}</small>
            )}
          </span>
          <strong data-testid="offer-inspector-total">{signed(total)}</strong>
        </p>
        {deltas.length > 0 && (
          <dl className="offer-inspector__rows">
            {deltas.map((row) => (
              <div key={row.summand} className="offer-inspector__row">
                <dt>{t(`common.${row.summand}` as MessageKey)}</dt>
                <dd className={`camp-offer__delta camp-offer__delta--${row.delta >= 0 ? "up" : "down"}`}>
                  {fmt(row.from)}→{fmt(row.to)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </Modal>
  );
}
