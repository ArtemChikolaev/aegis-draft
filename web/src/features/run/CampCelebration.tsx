// Секвенция «этап пройден» (R15.2): перекрытие между турниром и Буткемпом — момент кульминации
// вместо мгновенной подмены экрана. Чистая презентация: все числа уже начислены экономикой
// (`lastPayout` в openCampAfterStage), здесь анимируется только их ПОЯВЛЕНИЕ — значения точные,
// набега нет (правило game-feel-juice). Клик в любом месте, Continue и Escape закрывают сразу;
// resume в лагерь секвенцию не переигрывает (транзиентный `campCelebration` не пишется в сейв).
import { useEffect, type CSSProperties } from "react";
import type { AnteRunState } from "../../game/anteRun.ts";
import type { MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button } from "../../ui/index.ts";

const enterAt = (i: number) => ({ ["--enter-i" as string]: i } as CSSProperties);

export function CampCelebration({ ante, payout, showPayout, onDismiss }: {
  ante: AnteRunState;
  payout: { prize: number; performance: number; interest: number } | undefined;
  /** Cheat Mode прячет золотые строки: у «∞» выплата — шум, а не награда. */
  showPayout: boolean;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    // Авто-закрытие: секвенция — переход, а не экран; вся информация остаётся в шапке лагеря
    // (`camp__payout`). Побочно это оставляет e2e без правок: клики по лагерю дожидаются ухода
    // перекрытия штатным auto-wait Playwright.
    const timer = window.setTimeout(onDismiss, 2600);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [onDismiss]);

  const lines = !showPayout || !payout
    ? []
    : [
        { key: "camp.payoutPrize" as MessageKey, value: payout.prize },
        ...(payout.performance > 0 ? [{ key: "camp.payoutPerformance" as MessageKey, value: payout.performance }] : []),
        ...(payout.interest > 0 ? [{ key: "camp.payoutInterest" as MessageKey, value: payout.interest }] : []),
      ];

  return (
    <div
      className="camp-celebration"
      data-testid="camp-celebration"
      role="dialog"
      aria-modal="true"
      aria-label={t("camp.cleared", { n: ante.index })}
      onClick={onDismiss}
    >
      <div className="camp-celebration__panel">
        <h2 className="camp-celebration__title enter" style={enterAt(0)}>
          {t("camp.cleared", { n: ante.index })}
        </h2>
        {ante.lastPlacement && (
          <p className="camp-celebration__place enter" style={enterAt(1)}>
            {t("camp.celebrationFinish", { place: t(`tournament.place.${ante.lastPlacement}` as MessageKey) })}
          </p>
        )}
        {lines.length > 0 && (
          <ul className="camp-celebration__payout">
            {lines.map((line, i) => (
              <li key={line.key} className="enter" style={enterAt(2 + i)}>
                <b>+{line.value} ◈</b>
                <span>{t(line.key)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="camp-celebration__continue enter" style={enterAt(2 + lines.length)}>
          <Button variant="primary" autoFocus data-testid="camp-celebration-continue" onClick={onDismiss}>
            {t("camp.celebrationContinue")} <span aria-hidden="true">→</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
