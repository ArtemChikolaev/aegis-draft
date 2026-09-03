// Разбор карточки билда — один на все места, где карточка показана компактно (плейтест 2026-08-04).
//
// Правило то же, что у карточек рынка (R13.3): на самой карточке — что это и работает ли она
// сейчас; всё остальное открывается по клику. До этого слот билда печатал описание, ограничение,
// список подходящих героев и разложение вклада прямо в ряду, из-за чего пять слотов занимали
// экран, а в рейле карточку вообще нельзя было прочитать — только увидеть иконку.
import { itemAt, itemDef, itemTier, effectMatch } from "../../game/items.ts";
import { isTacticId } from "../../game/tactics.ts";
import { itemArtSlug } from "../../game/itemArt.ts";
import { chargeCapForRarity, chargeFactor, EDITION, type CardEdition } from "../../game/editions.ts";
import type { Rarity } from "../../game/rarity.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { ItemIcon, Modal, RarityBadge } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import { ItemMatch, cardTexts, layerChip, type Translate } from "./CampCards.tsx";

/** Вклад карточки в силу забега — те же `sources`, что рисует разложение. Необязателен: рейл на
 *  экране этапа знает вклад, а вне забега его может не быть, и карточка обязана читаться без него. */
export interface BuildCardContribution {
  layer: "flat" | "additive" | "xMult" | "economy" | "boss";
  value: number;
  met: boolean;
}

export function BuildCardInspector({ cardId, rarity, edition, charges = 0, activeHeroes, cardRarity, contributions, onClose }: {
  cardId: string;
  rarity: Rarity;
  /** Edition карточки (R13.5); undefined — обычная. */
  edition?: CardEdition;
  /** Заряды Charged-карты (0..потолок по тиру, chargeCapForRarity). */
  charges?: number;
  activeHeroes: readonly number[];
  cardRarity: Record<string, Rarity>;
  contributions?: readonly BuildCardContribution[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const hero = useHero();
  const item = itemDef(cardId);
  const kind = item ? "item" : isTacticId(cardId) ? "tactic" : "action";
  const title = t(`${kind}.${cardId}` as MessageKey);
  const slug = itemArtSlug(cardId);
  const chargeCtx = { [cardId]: charges };
  const scaled = item ? itemAt(item, rarity) : null;
  // Тактика описывается своим текстом с подставленными числами; предмет собирает описание из
  // масштабированного эффекта — в обоих случаях текст читает ТУ ЖЕ модель, что и расчёт.
  const texts = cardTexts(cardId, t as Translate, rarity);

  return (
    <Modal title={title} onClose={onClose} layout="content" presentation="card">
      <div className="build-card-inspector">
        <div className="build-card-inspector__head">
          {slug && <ItemIcon slug={slug} name={title} />}
          {item && (
            <RarityBadge
              rarity={itemTier(rarity)}
              label={t(`cardTier.${itemTier(rarity)}` as MessageKey)}
              showBase
            />
          )}
        </div>
        {/* Edition — вторая ось (R13.5): бейдж + заряды + правило. Рамку не красим — цвет рамки
            принадлежит качеству. */}
        {/* Tempered (LG4): защита от штрафа босса, пока условие карты работает. */}
        {edition === "tempered" && (
          <p className="build-card-inspector__edition" data-testid="card-edition">
            <span className="edition-badge edition-badge--tempered">🛡 {t("edition.tempered")}</span>
            <small>{t("edition.temperedHint", { pct: Math.round((1 - EDITION.tempered.penaltyFactor) * 100) })}</small>
          </p>
        )}
        {edition === "charged" && (
          <p className="build-card-inspector__edition" data-testid="card-edition">
            <span className="edition-badge">{t("edition.charged")}</span>
            <span className="edition-charges">
              {charges > 0 ? `${"⚡".repeat(charges)} ` : ""}
              {`${charges}/${chargeCapForRarity(item ? rarity : null)}`}
              {charges > 0 && ` · ×${chargeFactor(charges).toFixed(1)}`}
            </span>
            <small>{t("edition.chargedHint", { bonus: Math.round(EDITION.chargeBonus * 100), cap: chargeCapForRarity(item ? rarity : null) })}</small>
          </p>
        )}
        <p className="build-card-inspector__desc">{texts.effect}</p>
        {texts.cost && (
          <p className="build-card-inspector__desc build-card-inspector__desc--cost">{texts.cost}</p>
        )}
        {scaled && (
          <>
            <ItemMatch
              match={effectMatch(scaled.effect, { activeHeroes, cardRarity, cardCharges: chargeCtx })}
              hero={hero}
              t={t as Translate}
            />
            {scaled.drawback && (
              <ItemMatch
                match={effectMatch(scaled.drawback, { activeHeroes, cardRarity, cardCharges: chargeCtx })}
                hero={hero}
                t={t as Translate}
              />
            )}
          </>
        )}
        <div className="camp-offer__deltas">
          {contributions && contributions.length === 0 && (
            <span className="camp-slot__idle">{t("camp.tacticNoEffect")}</span>
          )}
          {(contributions ?? []).map((source, i) => (
            <span
              key={i}
              className={`camp-offer__delta camp-offer__delta--${source.met ? "up" : "down"}`}
            >
              {layerChip(source, t as Translate)}
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
}
