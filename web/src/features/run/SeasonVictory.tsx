import { useState } from "react";
import { stageMutators, type AnteRunState } from "../../game/anteRun.ts";
import { mutatorDescParams } from "../../game/dynastyMutators.ts";
import { isItemId, itemTier } from "../../game/items.ts";
import type { Rarity } from "../../game/rarity.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { useRun } from "../../state/runStore.ts";
import { Button, CheatBadge, Eyebrow, HeroThumb, RarityBadge, StatTile, Surface } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import "./seasonVictory.css";

/** Экран победы сезона (R6.3): терминальное состояние забега + добровольный выбор Династии.
 *
 *  Панель НЕ дублирует то, что уже стоит выше на экране турнира (ростер, синергии, разложение
 *  Tournament Power, итоговая таблица): показывает ровно то, чего там нет — титулы актов, качества
 *  героев и собранный билд, то есть чем именно забег дошёл до Aegis.
 *
 *  Выбор здесь обязателен и необратим в одну сторону: «Завершить» оставляет обычный терминальный
 *  блок (рестарт/шеринг), «Продолжить» уводит в бесконечную фазу, где штатный финал — поражение.
 *  Победа к этому моменту УЖЕ записана в карьеру (см. runStore.finishTournament), поэтому кнопка
 *  ничего не ставит на кон. */
export function SeasonVictory({ ante, heroRarity, cards, cardRarity, power, cheatMode }: {
  ante: AnteRunState;
  heroRarity: Record<string, Rarity>;
  cards: readonly string[];
  cardRarity: Record<string, Rarity>;
  power: number;
  cheatMode: boolean;
}) {
  const { t } = useI18n();
  const [declined, setDeclined] = useState(false);
  const hero = useHero();
  const heroes = useRun((state) => state.snapshot?.heroes ?? []);
  const continueDynasty = useRun((state) => state.continueDynasty);
  const seed = useRun((state) => state.seed);
  // Мутатор ПЕРВОГО круга Династии (LG3) объявляется на входе: выбор «продолжать или нет»
  // делается с открытым правилом, как у боссов. Первый этап Династии = ante.count.
  // Анонс первого круга: за пределами сезона правило круга ровно одно (stageMutators же
  // отвечает и за сезонные Stakes, но здесь этап уже в Династии).
  const firstCircleMutator = stageMutators(seed, ante.count)[0] ?? null;

  return (
    <Surface className="season-victory enter" data-testid="season-victory">
      <header className="season-victory__head">
        <div>
          <Eyebrow>{t("ante.seasonStage")}</Eyebrow>
          <h2>{t("ante.won")}</h2>
          <p>{t("ante.wonText", { count: ante.count })}</p>
        </div>
        {cheatMode && <CheatBadge />}
      </header>

      <div className="season-victory__stats">
        {/* Титулы = финалы актов, а их у выигранного сезона ровно столько, сколько актов:
            до последнего этапа иначе не дойти. */}
        <StatTile label={t("ante.seasonTitles")} value={String(ante.titles)} kind="base" />
        <StatTile label={t("camp.powerTotal")} value={Math.round(power).toString()} kind="synergy" />
        <StatTile label={t("ante.stage", { n: ante.index + 1, count: ante.count })} value="✓" kind="chemistry" />
      </div>

      <div className="season-victory__build">
        <section>
          <h3>{t("camp.rarityUpgrade")}</h3>
          <ul className="season-victory__heroes">
            {heroes.map((heroId) => {
              const info = hero(heroId);
              const rarity = heroRarity[String(heroId)] ?? "common";
              return (
                <li key={heroId} data-rarity={rarity}>
                  <HeroThumb picture={info.picture} name={info.name} />
                  <RarityBadge rarity={rarity} label={t(`rarity.${rarity}` as MessageKey)} />
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h3>{t("camp.tactics")}</h3>
          {cards.length === 0 ? (
            <p className="season-victory__empty">{t("camp.emptySlot")}</p>
          ) : (
            <ul className="season-victory__cards">
              {cards.map((cardId) => {
                const tier = itemTier(cardRarity[cardId] ?? "common");
                return (
                  <li key={cardId} data-card-id={cardId}>
                    <strong>{t(`${isItemId(cardId) ? "item" : "tactic"}.${cardId}` as MessageKey)}</strong>
                    {isItemId(cardId) && (
                      <RarityBadge rarity={tier} label={t(`cardTier.${tier}` as MessageKey)} showBase />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* «Завершить» ничего не разрушает: забег и так терминален, а результаты и шеринг остаются
          на экране. Поэтому это не confirm-действие, а просто снятие предложения — иначе игрок,
          который хочет досмотреть таблицу, вынужден был бы держать перед собой чужую кнопку. */}
      <div className="season-victory__actions">
        {declined ? (
          <p className="season-victory__hint" data-testid="dynasty-declined">{t("ante.dynastyFinished")}</p>
        ) : (
          <>
            <Button variant="primary" data-testid="dynasty-continue" onClick={continueDynasty}>
              {t("ante.dynastyContinue")}<span>→</span>
            </Button>
            <Button variant="secondary" data-testid="dynasty-finish" onClick={() => setDeclined(true)}>
              {t("ante.dynastyFinish")}
            </Button>
            <p className="season-victory__hint">{t("ante.dynastyHint")}</p>
            {firstCircleMutator && (
              <p className="season-victory__hint season-victory__mutator" data-testid="dynasty-mutator">
                ☄ {t("mutator.announce")}{" "}
                <b>{t(`mutator.${firstCircleMutator}` as MessageKey)}</b>
                {" — "}
                {t(`mutator.desc.${firstCircleMutator}` as MessageKey, mutatorDescParams(firstCircleMutator))}
              </p>
            )}
          </>
        )}
      </div>
    </Surface>
  );
}
