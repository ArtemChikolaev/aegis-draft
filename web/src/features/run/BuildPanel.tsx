// Раздел «Билд» Буткемпа: слоты тактик/предметов с бейджами качества, Editions, зачарованием,
// trade-in и сбросом. Вынесен из `CampScreen` (остаток R13.4) без изменения поведения: вся
// арифметика по-прежнему считается на экране и приходит сюда готовой — панель только рисует
// и зовёт переданные действия (тот же шов, что MarketPanel/RewardPanel).
import { chargeCapForRarity } from "../../game/editions.ts";
import { itemAt, itemDef, itemLabel, itemTier } from "../../game/items.ts";
import { isTacticId, tacticLabelParams } from "../../game/tactics.ts";
import { itemArtSlug } from "../../game/itemArt.ts";
import type { Rarity } from "../../game/rarity.ts";
import type { MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { ItemIcon, PowerBreakdown, RarityBadge } from "../../ui/index.ts";
import { sfxBuy } from "../../ui/sound.ts";
import { CampHint } from "./CampHint.tsx";
import { CardInspectTrigger, itemLabelParams, layerChip, signed } from "./CampCards.tsx";
import type { CampBuildView } from "./campMarketView.ts";

export function BuildPanel(props: CampBuildView) {
  const { t } = useI18n();
  const { camp, tactics, itemEval, power, onInspectCard, onTrade, onDiscard, onEnchant } = props;
  return (
    <div className="camp__build-col" data-testid="camp-tactics">
      <div className="camp__build-head">
        <div className="camp__section-heading">
          <h3 className="camp__section-title">{t("camp.tactics")}</h3>
          <CampHint label={t("camp.showHint")}>{t("camp.tacticsHint")}</CampHint>
        </div>
        <span className="camp__slot-count">
          {t("camp.slotsUsed", { used: camp.equippedTactics.length, total: camp.tacticSlots })}
        </span>
      </div>
      {/* Токены зачарования (LG6): титул Династии конвертируется здесь — выбором
          Edition для карты без Edition. Баннер виден, только пока есть что тратить. */}
      {camp.editionTokens > 0 && (
        <p className="camp__milestone camp__enchant-note" data-testid="camp-enchant-tokens">
          ✨ {t("camp.enchantTokens", { n: camp.editionTokens })}
        </p>
      )}
      {/* Разложение силы забега. Показывается ТОЛЬКО когда хоть один слой активен —
          иначе это была бы строка «×1.00 / +0», не несущая информации (R8.2). */}
      {!power.trivial && (
        <PowerBreakdown
          testId="camp-power"
          roster={power.teamOvr + power.flat}
          additive={power.additive}
          xMult={power.xMult}
          total={power.total}
          labels={{
            roster: t("camp.powerRoster"), additive: t("camp.powerAdditive"),
            xMult: t("camp.powerX"), total: t("camp.powerTotal"),
          }}
        />
      )}
      {/* Слоты — компактные карточки, а не высокие строки (плейтест 2026-08-04).
          Раньше каждый слот печатал описание, ограничение, список подходящих героев и всё
          разложение вклада, поэтому пять слотов занимали экран, а три из них были пустыми
          «Empty slot» во всю ширину. Правило то же, что у рынка (R13.3): на карточке —
          что это и работает ли сейчас, остальное по клику. */}
      <div className="camp__slots">
        {Array.from({ length: camp.tacticSlots }, (_, slot) => {
          const tacticId = camp.equippedTactics[slot];
          if (!tacticId) {
            return <div key={`t-empty-${slot}`} className="camp-slot camp-slot--empty">{t("camp.emptySlot")}</div>;
          }
          // Предмет и тактика делят слот (R8.3): различаются только тем, куда целится
          // эффект — в слагаемые Team OVR или в слои силы забега.
          const item = itemDef(tacticId);
          const cardRarity: Rarity = camp.cardRarity[tacticId] ?? "common";
          const name = t(`${item ? "item" : "tactic"}.${tacticId}` as MessageKey);
          const scaled = item ? itemAt(item, cardRarity) : null;
          const label = scaled ? itemLabel(scaled.effect) : null;
          const reasons = (tactics?.sources ?? []).filter((source) => source.tacticId === tacticId);
          const contributions = itemEval.sources.filter((source) => source.itemId === tacticId);
          const idle = item ? contributions.length === 0 : reasons.length === 0;
          return (
            <div
              key={tacticId}
              className={`camp-slot camp-inspectable-card ${item ? "camp-slot--item" : "camp-slot--tactic"}`}
              data-card-id={tacticId}
              data-card-rarity={item ? cardRarity : undefined}
              data-card-tier={item ? itemTier(cardRarity) : undefined}
            >
              <CardInspectTrigger
                label={name}
                delta={0}
                testId={`build-card-${tacticId}`}
                onOpen={() => onInspectCard(tacticId)}
              />
              <div className="camp-slot__head">
                {itemArtSlug(tacticId) && (
                  <ItemIcon slug={itemArtSlug(tacticId)!} name={name} size="sm" />
                )}
                {/* Название и бейдж качества — своя колонка с переносом: в одной строке
                    бейдж отъедал ширину у имени, и «Necronomicon» рвалось на три куска.
                    Теперь бейдж уходит на следующую строку, а имени достаётся вся
                    ширина карточки (плейтест 2026-08-05). */}
                <span className="camp-slot__title">
                  <strong>{name}</strong>
                  {item && (
                    <RarityBadge
                      rarity={itemTier(cardRarity)}
                      label={t(`cardTier.${itemTier(cardRarity)}` as MessageKey)}
                      showBase
                    />
                  )}
                  {/* Edition (R13.5/LG4): бейдж; полное правило — в разборе. */}
                  {camp.cardEditions[tacticId] === "charged" && (
                    <span className="edition-badge" data-testid={`build-edition-${tacticId}`}>
                      ⚡ {t("edition.charged")} {camp.cardCharges[tacticId] ?? 0}/{chargeCapForRarity(item ? cardRarity : null)}
                    </span>
                  )}
                  {camp.cardEditions[tacticId] === "tempered" && (
                    <span className="edition-badge edition-badge--tempered" data-testid={`build-edition-${tacticId}`}>
                      🛡 {t("edition.tempered")}
                    </span>
                  )}
                  {/* Зачарование (LG6): у карты без Edition и при наличии токена — выбор
                      оси на месте. Снять Edition нельзя, как и у выпавшей, поэтому кнопки
                      не показываются зря. */}
                  {camp.editionTokens > 0 && camp.cardEditions[tacticId] == null && (
                    <span className="camp-slot__enchant">
                      <button
                        type="button"
                        data-testid={`enchant-charged-${tacticId}`}
                        title={t("camp.enchantChargedHint")}
                        onClick={() => { sfxBuy(); onEnchant(tacticId, "charged"); }}
                      >⚡ {t("edition.charged")}</button>
                      <button
                        type="button"
                        data-testid={`enchant-tempered-${tacticId}`}
                        title={t("camp.enchantTemperedHint")}
                        onClick={() => { sfxBuy(); onEnchant(tacticId, "tempered"); }}
                      >🛡 {t("edition.tempered")}</button>
                    </span>
                  )}
                </span>
                {/* Trade-in (LG1): обмен — рядом со сбросом, это два исхода одной
                    мысли «карта больше не тянет»: сброс теряет всё, обмен — тир −1. */}
                <button
                  type="button"
                  className="camp-slot__discard camp-slot__trade"
                  aria-label={t("camp.trade")}
                  data-testid={`tactic-trade-${tacticId}`}
                  onClick={() => onTrade(tacticId)}
                >
                  ⇄
                </button>
                <button
                  type="button"
                  className="camp-slot__discard"
                  aria-label={t("camp.discard")}
                  data-testid={`tactic-discard-${tacticId}`}
                  onClick={() => onDiscard(tacticId)}
                >
                  ✕
                </button>
              </div>
              <p className="camp-slot__desc">
                {label
                  ? t(label.template as MessageKey, itemLabelParams(label.params, t))
                  : t(
                    `tactic.desc.${tacticId}` as MessageKey,
                    isTacticId(tacticId) ? tacticLabelParams(tacticId) : undefined,
                  )}
              </p>
              {/* Одна строка состояния: сработала карточка или нет. Полное разложение,
                  ограничение и подходящие герои живут в разборе по клику. */}
              <div className="camp-offer__deltas">
                {idle && <span className="camp-slot__idle">{t("camp.tacticNoEffect")}</span>}
                {item && contributions.slice(0, 1).map((source, i) => (
                  <span
                    key={i}
                    className={`camp-offer__delta camp-offer__delta--${source.met ? "up" : "down"}`}
                  >
                    {layerChip(source, t)}
                  </span>
                ))}
                {!item && reasons.slice(0, 1).map((source, i) => (
                  <span
                    key={i}
                    className={`camp-offer__delta camp-offer__delta--${source.delta >= 0 ? "up" : "down"}`}
                  >
                    {t(`common.${source.summand}` as MessageKey)} {signed(source.delta)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
