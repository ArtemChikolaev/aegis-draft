// Слоты одноразовых Camp Actions раздела «Подготовка». Вынесен из `CampScreen` (остаток R13.4)
// без изменения поведения: панель только рисует состояние и зовёт переданные действия.
import type { MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button } from "../../ui/index.ts";
import { CampHint } from "./CampHint.tsx";
import type { CampActionsView } from "./campMarketView.ts";

export function ActionsPanel({ camp, onDiscard, onPlay }: CampActionsView) {
  const { t } = useI18n();
  return (
    <div className="camp__build-col" data-testid="camp-actions-panel">
      <div className="camp__build-head">
        <div className="camp__section-heading">
          <h3 className="camp__section-title">{t("camp.campActions")}</h3>
          <CampHint label={t("camp.showHint")}>{t("camp.campActionsHint")}</CampHint>
        </div>
        <span className="camp__slot-count">
          {t("camp.slotsUsed", { used: camp.heldActions.length, total: camp.actionSlots })}
        </span>
      </div>
      {camp.scouted && <p className="camp__scouted" data-testid="camp-scouted">{t("camp.scouted")}</p>}
      {camp.freeMarketRerolls > 0 && (
        <p className="camp__perk">{t("camp.freeReroll", { n: camp.freeMarketRerolls })}</p>
      )}
      {camp.freePlayerSwaps > 0 && (
        <p className="camp__perk">{t("camp.freeSwap", { n: camp.freePlayerSwaps })}</p>
      )}
      <div className="camp__slots">
        {Array.from({ length: camp.actionSlots }, (_, slot) => {
          const actionId = camp.heldActions[slot];
          if (!actionId) {
            return <div key={`a-empty-${slot}`} className="camp-slot camp-slot--empty">{t("camp.emptySlot")}</div>;
          }
          return (
            <div key={actionId} className="camp-slot camp-slot--action" data-card-id={actionId}>
              <div className="camp-slot__head">
                <strong>{t(`action.${actionId}` as MessageKey)}</strong>
                <button
                  type="button"
                  className="camp-slot__discard"
                  aria-label={t("camp.discard")}
                  data-testid={`action-discard-${actionId}`}
                  onClick={() => onDiscard(actionId)}
                >
                  ✕
                </button>
              </div>
              <p className="camp-slot__desc">{t(`action.desc.${actionId}` as MessageKey)}</p>
              <Button
                variant="primary"
                data-testid={`action-play-${actionId}`}
                onClick={() => onPlay(actionId)}
              >
                {t("camp.play")}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
