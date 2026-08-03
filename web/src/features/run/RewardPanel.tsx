// Раздел «Награда» Буткемпа: обязательный выбор одной из трёх карт при входе в лагерь и свёрнутая
// сводка после выбора. Вынесен из `CampScreen` (R14.2) без изменения поведения — описание эффекта
// по-прежнему собирает экран (`effectRows`), панель только рисует.
import { cardSlotKind, type Offer } from "../../game/anteEconomy.ts";
import { itemTier } from "../../game/items.ts";
import type { MessageKey } from "../../i18n/core.ts";
import type { CampView } from "../../game/anteEconomy.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button } from "../../ui/index.ts";
import type { ReactNode } from "react";

export function RewardPanel({ camp, chosenReward, effectRows, onChoose }: {
  camp: CampView;
  chosenReward: Offer | undefined;
  effectRows: (offer: Offer) => ReactNode;
  /** Выбор награды сразу открывает рынок — переход остаётся решением экрана, не панели. */
  onChoose: (offerId: string) => void;
}) {
  const { t } = useI18n();
  return (
      <section id="camp-panel-reward" role="tabpanel" className="camp__section" data-testid="camp-reward">
        <h3 className="camp__section-title">
          {camp.rewardChosen ? t("camp.rewardChosen") : t("camp.reward")}
        </h3>
        {camp.rewardChosen && chosenReward ? (
          <div className="camp__section-summary" data-testid="camp-reward-summary">
            <strong>{t("camp.navReward")}: {t(chosenReward.labelKey as MessageKey)}</strong>
            <span className="camp-offer__deltas">{effectRows(chosenReward)}</span>
            <b aria-label={t("camp.rewardChosen")}>✓</b>
          </div>
        ) : (
        <div className="camp__offers camp__offers--reward">
          {camp.rewardOffers.map((offer) => {
            const isChosen = camp.chosenRewardId === offer.id;
            // Какой слот займёт карточка — спрашиваем у игровой логики, а не перечисляем виды
            // здесь заново: своя копия этого правила забыла про `item` и дала R13.1 (предмет
            // без бейджа слота, активная кнопка при полных слотах и молча проваленный клик).
            const slot = cardSlotKind(offer.kind);
            const slotFull = (slot === "tactic" && camp.equippedTactics.length >= camp.tacticSlots)
              || (slot === "action" && camp.heldActions.length >= camp.actionSlots);
            const isCard = slot != null;
            return (
              <div
                key={offer.id}
                className={`camp-offer camp-offer--reward${isChosen ? " is-chosen" : ""}${isCard ? " camp-offer--card" : ""}`}
                data-offer-kind={offer.kind}
                data-card-tier={itemTier(offer.cardRarity ?? "common")}
              >
                <div className="camp-offer__body">
                  <span className="camp-offer__head">
                    <strong className="camp-offer__label">{t(offer.labelKey as MessageKey)}</strong>
                    {isCard && (
                      // Бейдж отвечает на «какой слот это займёт», а не «какого типа карта»:
                      // предмет и тактика делят слоты и лежат в одной секции Буткемпа, поэтому
                      // у предмета честная подпись — та же, что у тактики.
                      <span className={`camp-card-tag camp-card-tag--${slot}`}>
                        {t(slot === "tactic" ? "camp.tactics" : "camp.campActions")}
                      </span>
                    )}
                  </span>
                  <div className="camp-offer__deltas">{effectRows(offer)}</div>
                  {slotFull && !isChosen && (
                    <span className="camp-offer__note">{t("camp.slotFull")}</span>
                  )}
                </div>
                <Button
                  variant={isChosen ? "secondary" : "primary"}
                  disabled={camp.rewardChosen || (slotFull && !isChosen)}
                  data-testid={`reward-${offer.id}`}
                  onClick={() => onChoose(offer.id)}
                >
                  {isChosen ? "✓" : t("camp.choose")}
                </Button>
              </div>
            );
          })}
        </div>
        )}
      </section>
  );
}
