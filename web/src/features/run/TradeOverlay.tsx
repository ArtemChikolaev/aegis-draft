// Trade-in карты билда (LG1, R12.6): обмен экипированной карты на одну из тройки офферов с
// переносом тира −1. Оверлей, а не секция Буткемпа: обмен — редкое точечное действие поверх
// конкретной карты, и ещё одна постоянная панель вернула бы «ленту» R13.4. Переиспользует
// card-Modal (фокус/Escape/скролл — без дублей); цены приходят из движка через CampView.
import { itemDef, itemLabel, itemAt, itemTier } from "../../game/items.ts";
import { isTacticId, tacticLabelParams } from "../../game/tactics.ts";
import { itemArtSlug } from "../../game/itemArt.ts";
import { tradeInRarity } from "../../game/anteEconomy.ts";
import type { Rarity } from "../../game/rarity.ts";
import type { MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button, ItemIcon, Modal, RarityBadge } from "../../ui/index.ts";
import { itemLabelParams, type Translate } from "./CampCards.tsx";

export interface TradeOption {
  id: string;
  /** Сдвиг Run power после обмена — считает экран тем же previewPower, что и рынок. */
  delta: number;
}

export function TradeOverlay({ outgoingId, outgoingRarity, options, tradeCost, rerollCost, canReroll, affordable, onTrade, onReroll, onClose }: {
  outgoingId: string;
  /** Тир уходящей карты (у тактики — common): из него выводится тир входящих. */
  outgoingRarity: Rarity;
  options: readonly TradeOption[];
  tradeCost: number;
  rerollCost: number;
  canReroll: boolean;
  affordable: boolean;
  onTrade: (incomingId: string) => void;
  onReroll: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const incomingRarity = tradeInRarity(outgoingRarity);
  const nameOf = (id: string) =>
    t(`${itemDef(id) ? "item" : "tactic"}.${id}` as MessageKey);

  return (
    <Modal title={t("camp.tradeTitle", { card: nameOf(outgoingId) })} onClose={onClose} layout="content" presentation="card">
      <div className="trade-overlay" data-testid="trade-overlay">
        <p className="trade-overlay__hint">{t("camp.tradeHint")}</p>
        {options.map((option) => {
          const item = itemDef(option.id);
          const scaled = item ? itemAt(item, incomingRarity) : null;
          const label = scaled ? itemLabel(scaled.effect) : null;
          const slug = itemArtSlug(option.id);
          return (
            <div key={option.id} className="trade-overlay__option" data-testid={`trade-option-${option.id}`}>
              <span className="trade-overlay__head">
                {slug && <ItemIcon slug={slug} name={nameOf(option.id)} size="sm" />}
                <strong>{nameOf(option.id)}</strong>
                {item && incomingRarity !== "common" && (
                  <RarityBadge
                    rarity={itemTier(incomingRarity)}
                    label={t(`cardTier.${itemTier(incomingRarity)}` as MessageKey)}
                    showBase
                  />
                )}
              </span>
              <p className="trade-overlay__desc">
                {label
                  ? t(label.template as MessageKey, itemLabelParams(label.params, t as Translate))
                  : t(`tactic.desc.${option.id}` as MessageKey, isTacticId(option.id) ? tacticLabelParams(option.id) : undefined)}
              </p>
              <div className="trade-overlay__action">
                <span className={`camp-offer__delta camp-offer__delta--${option.delta >= 0 ? "up" : "down"}`}>
                  {t("camp.power")} {option.delta >= 0 ? "+" : ""}{option.delta.toFixed(1)}
                </span>
                <Button
                  variant="primary"
                  disabled={!affordable}
                  data-testid={`trade-take-${option.id}`}
                  onClick={() => onTrade(option.id)}
                >
                  {t("camp.trade")} · {t("camp.cost", { cost: tradeCost })}
                </Button>
              </div>
            </div>
          );
        })}
        <div className="trade-overlay__footer">
          <Button variant="secondary" disabled={!canReroll} data-testid="trade-reroll" onClick={onReroll}>
            ↻ {t("camp.reroll", { cost: rerollCost })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
