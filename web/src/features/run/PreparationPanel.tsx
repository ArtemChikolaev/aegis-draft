// Подготовка к этапу (T5.9) — поздние синки Буткемпа: расходуемые покупки с растущей ценой.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ (R13.4). `CampScreen` держал в одном месте экономику, награды, два рынка,
// апгрейды, резерв, действия, тактики и подготовку — 1400+ строк. Это влияло не только на
// читаемость: когда весь экран в одной функции, любое новое число проще дописать в ближайший JSX,
// чем найти для него место. Ровно так карточки и выросли в мини-отчёты (R13.3).
//
// Панель самодостаточна: ей нужны только числа лагеря и три колбэка — никакого доступа к движку,
// ростеру или счёту.
import { Button } from "../../ui/index.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { CampHint } from "./CampHint.tsx";

/** Карточка синка: расходуемая покупка с растущей ценой. Форма та же, что у reward/market-оффера
 *  (`camp-offer`) — это тоже «карточка с описанием и ценой», и своя вёрстка здесь означала бы
 *  второй набор правил для одного и того же элемента. */
function SinkCard({ label, desc, cost, note, disabled, testId, onBuy }: {
  label: string;
  desc: string;
  cost: number;
  note?: string;
  disabled: boolean;
  testId: string;
  onBuy: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="camp-offer camp-offer--reward camp-offer--sink" data-testid={testId}>
      <div className="camp-offer__body">
        <span className="camp-offer__head">
          <strong className="camp-offer__label">{label}</strong>
        </span>
        <p className="camp-offer__card-desc">{desc}</p>
        {note && (
          <div className="camp-offer__deltas">
            <span className="camp-offer__delta camp-offer__delta--up" data-testid={`${testId}-note`}>{note}</span>
          </div>
        )}
      </div>
      <Button
        variant="primary"
        disabled={disabled}
        data-testid={`${testId}-buy`}
        onClick={onBuy}
      >
        {t("camp.buy")} · {t("camp.cost", { cost })}
      </Button>
    </div>
  );
}

/** Числа лагеря, от которых зависит панель. Узкий срез `campView`, а не он целиком: панель не
 *  должна получать доступ к тому, чем не управляет. */
export interface PreparationView {
  prepDelta: number;
  prepCost: number;
  prepBought: number;
  canBuyPrep: boolean;
  bossRerollCost: number;
  canRerollBoss: boolean;
  scouted: boolean;
  scoutCost: number;
  canBuyScouting: boolean;
}

export function PreparationPanel({ view, hasBoss, onBuyPrep, onRerollBoss, onBuyScouting }: {
  view: PreparationView;
  /** Без правила этапа менять нечего — карточка реролла босса не показывается. */
  hasBoss: boolean;
  onBuyPrep: () => void;
  onRerollBoss: () => void;
  onBuyScouting: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="camp__section" data-testid="camp-prep">
      <div className="camp__section-heading">
        <h3 className="camp__section-title">{t("camp.prep")}</h3>
        <CampHint label={t("camp.showHint")}>{t("camp.prepHint")}</CampHint>
      </div>
      <div className="camp__offers camp__offers--reward">
        <SinkCard
          label={t("camp.prepBoost")}
          desc={t("camp.prepBoostDesc", { n: view.prepDelta })}
          cost={view.prepCost}
          note={view.prepBought > 0 ? t("camp.prepBought", { n: view.prepBought }) : undefined}
          disabled={!view.canBuyPrep}
          testId="camp-prep-boost"
          onBuy={onBuyPrep}
        />
        {hasBoss && (
          <SinkCard
            label={t("camp.prepBossReroll")}
            desc={t("camp.prepBossRerollDesc")}
            cost={view.bossRerollCost}
            disabled={!view.canRerollBoss}
            testId="camp-prep-boss"
            onBuy={onRerollBoss}
          />
        )}
        {!view.scouted && (
          <SinkCard
            label={t("camp.prepScout")}
            desc={t("camp.prepScoutDesc")}
            cost={view.scoutCost}
            disabled={!view.canBuyScouting}
            testId="camp-prep-scout"
            onBuy={onBuyScouting}
          />
        )}
      </div>
    </section>
  );
}
