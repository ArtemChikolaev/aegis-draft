// Раздел «Рынок» Буткемпа: пак игроков, пак hero re-pick и улучшение качества героев.
// Вынесен из `CampScreen` (R14.2) без изменения поведения: вся арифметика по-прежнему считается
// на экране и приходит сюда готовой — панель только рисует и зовёт переданные действия.
import { useRef, useState, type ReactNode } from "react";
import { playerOfferAffordable } from "../../game/anteEconomy.ts";
import { upgradeCost } from "../../game/heroRarity.ts";
import { nextRarity, type Rarity } from "../../game/rarity.ts";
import { candidateMatchesRef } from "../../game/packs.ts";
import type { MessageKey } from "../../i18n/core.ts";
import { CampHint } from "./CampHint.tsx";
import { CardInspectTrigger, OfferDelta, valuesOf } from "./CampCards.tsx";
import { sfxBuy, sfxReroll } from "../../ui/sound.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button, Dealt, prefersReducedMotion } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import type { CampMarketView } from "./campMarketView.ts";

/** Слепок купленной карточки (R15.1): содержимое заморожено в момент клика, чтобы уходящая
 *  карточка не пересчитывалась по уже изменившемуся состоянию. Доиграв exit, слепок становится
 *  дырой (`settled`) и держит место в раздаче — соседние карточки не переезжают. */
interface MarketGhost {
  id: string;
  className: string;
  attrs: Record<string, string>;
  summary: ReactNode;
  delta: number;
  costLabel: string;
  settled?: boolean;
}

export function MarketPanel(props: CampMarketView) {
  const { t } = useI18n();
  const hero = useHero();
  const {
    camp, snapshot, score, power, candidates,
    playerOffers, heroOffers,
    previewPower, replaceRosterCandidate, replaceActiveHero,
    playerOfferSummary, heroOfferSummary, rarityOfferSummary,
    setInspected, buyMarket, rerollMarket, upgradeHeroRarity,
  } = props;
  // Раздача рынка (R14.4). Ключ обязан меняться на новый лагерь И на каждый реролл: CSS-анимация
  // играет только при монтировании, поэтому без смены ключа перероленные карточки подменялись бы
  // молча. Индекс сквозной по всем трём группам — это ОДНА раздача, а не три одновременных.
  const deal = `${camp.campStageIndex}:${camp.marketSerial}`;
  // Улучшения качества реролл НЕ трогает: это те же пять активных героев забега. Ключ у них
  // только по лагерю — с `marketSerial` они перемонтировались на каждый реролл и переигрывали
  // раздачу, из-за чего неизменные карточки мигали (плейтест 2026-08-05).
  const campDeal = `${camp.campStageIndex}`;
  // Exit покупки (R15.1) + дыра на месте (плейтест 2026-08-09). Движок зовётся СРАЗУ (золото и
  // радар вспыхивают в момент клика, e2e читают состояние синхронно), уход рисует ghost — слепок
  // содержимого карточки, замороженный в момент клика: пересчёт по уже изменившемуся состоянию
  // менял бы текст на глазах. Доиграв exit, ghost НЕ освобождает ячейку, а остаётся дырой до
  // конца раздачи: пересборка сетки сдвигала соседние карточки, и сравнение позиций ломалось.
  // Порядок ячеек фиксируется на первом рендере раздачи (dealOrder) — купленное место стабильно.
  const [ghosts, setGhosts] = useState<readonly MarketGhost[]>([]);
  // Реролл/новый лагерь пересобирают раздачу — ghost'ы и дыры к ней не относятся.
  const lastDeal = useRef(deal);
  if (lastDeal.current !== deal) {
    lastDeal.current = deal;
    if (ghosts.length > 0) setGhosts([]);
  }
  const dealOrder = useRef<{ key: string; players: readonly string[]; heroes: readonly string[] } | null>(null);
  if (dealOrder.current?.key !== deal) {
    dealOrder.current = { key: deal, players: playerOffers.map((o) => o.id), heroes: heroOffers.map((o) => o.id) };
  }
  const order = dealOrder.current;
  const settleGhost = (id: string) =>
    setGhosts((prev) => prev.map((g) => (g.id === id ? { ...g, settled: true } : g)));
  const buyWithGhost = (ghost: MarketGhost) => {
    // reduced-motion: анимация погашена глобально — дыра появляется сразу, без exit-слепка.
    setGhosts((prev) => [...prev, { ...ghost, settled: prefersReducedMotion() }]);
    // Страховка: в скрытой вкладке CSS-анимации на паузе и animationend не приходит.
    window.setTimeout(() => settleGhost(ghost.id), 600);
    sfxBuy(); // звук на клике намеренно: неудачная покупка = disabled-кнопка, клик ≈ успех
    buyMarket(ghost.id);
  };
  const ghostCard = (ghost: MarketGhost, dealIndex: number) => (
    <Dealt className="camp-dealt" key={`${deal}:${ghost.id}`} index={dealIndex}>
      {ghost.settled ? (
        // Дыра: покупка оставляет пустое место до конца раздачи, соседи не переезжают.
        <div className="camp-pack-card camp-pack-card--sold" aria-hidden="true">
          <span>{t("camp.sold")}</span>
        </div>
      ) : (
        <div
          className={ghost.className}
          {...ghost.attrs}
          data-leaving
          onAnimationEnd={(e) => {
            // Фильтр по имени обязателен: с карточки всплывают и card-foil, и ovr-shine.
            if (e.animationName === "camp-card-exit") settleGhost(ghost.id);
          }}
        >
          {ghost.summary}
          <div className="camp-offer__deltas">
            <OfferDelta delta={ghost.delta} />
          </div>
          <div className="camp-pack-card__buy">
            <span className="camp-offer__cost">{ghost.costLabel}</span>
          </div>
        </div>
      )}
    </Dealt>
  );

  // `enter-fade` (только прозрачность), а НЕ `enter` (fade-rise): подъём на 8px двигает всю
  // секцию, пока её содержимое уже кликабельно, — это и мис-клик, и гонка для любого замера
  // позиции. Ровно на этом упал CI: инвариант «сетка не дёргается под оверлеем» видел остаток
  // translateY в 2.09px (desktop) / 2.8px (mobile). Карточки внутри по-прежнему раздаются
  // движением — секции оно не нужно.
  return (
      <section id="camp-panel-market" role="tabpanel" className="camp__section enter-fade" data-testid="camp-market">
        <div className="camp__section-head">
          <div className="camp__section-heading">
            <h3 className="camp__section-title">{t("camp.market")}</h3>
            <CampHint label={t("camp.showHint")}>{t("camp.marketHint")}</CampHint>
          </div>
          <Button
            variant="secondary"
            disabled={!camp.canReroll}
            data-testid="camp-reroll"
            onClick={() => { sfxReroll(); rerollMarket(); }}
          >
            ↻ {t("camp.reroll", { cost: camp.rerollCost })}
          </Button>
        </div>
        <h4 className="camp__market-group-title">{t("camp.marketPlayers")}</h4>
        {/* Пак-рулетка из 5 игроков: разное качество, ловушки допустимы. Ячейки идут в порядке
            раздачи (dealOrder): купленная превращается в ghost → дыру, а не освобождает место. */}
        <div className="camp__pack" data-testid="camp-pack">
          {order.players.map((offerId, dealIndex) => {
            const ghost = ghosts.find((g) => g.id === offerId);
            if (ghost) return ghostCard(ghost, dealIndex);
            const offer = playerOffers.find((o) => o.id === offerId);
            if (!offer) return null;
            const incoming = candidates.find((c) => candidateMatchesRef(c, offer.playerSwap!.incoming));
            if (!incoming) return null;
            const outgoing = snapshot.roster[offer.playerSwap!.slotIndex]?.candidate;
            const afterHeroId = offer.preview?.afterAssignment?.[incoming.player.accountId];
            // Stand-in делает ОДНУ замену игрока бесплатной — цена и доступность это учитывают,
            // иначе дорогая карта остаётся заблокированной, хотя движок списал бы 0 (баг live).
            const freeSwap = camp.freePlayerSwaps > 0;
            const affordable = playerOfferAffordable(offer.cost, camp.gold, camp.freePlayerSwaps, camp.unlimitedGold);
            const preview = offer.preview
              ? previewPower(
                  offer.preview.after,
                  replaceRosterCandidate(offer.playerSwap!.slotIndex, incoming),
                  offer.preview.afterAssignment ?? score.assignment.byPlayer,
                  snapshot.heroes,
                )
              : null;
            const deltas = preview?.deltas ?? [];
            const powerDelta = preview?.delta ?? 0;
            const summary = playerOfferSummary(incoming, outgoing, afterHeroId);
            const costLabel = freeSwap ? t("camp.free") : t("camp.cost", { cost: offer.cost });
            const buy = () => buyWithGhost({
              id: offer.id,
              className: "camp-pack-card camp-inspectable-card",
              attrs: { "data-offer-kind": "player" },
              summary,
              delta: powerDelta,
              costLabel,
            });
            return (
              <Dealt className="camp-dealt" key={`${deal}:${offer.id}`} index={dealIndex}>
              <div className="camp-pack-card camp-inspectable-card" data-offer-kind="player">
                <CardInspectTrigger
                  label={incoming.player.nickname}
                  delta={powerDelta}
                  testId={`offer-details-${offer.id}`}
                  onOpen={() => setInspected({
                    title: incoming.player.nickname,
                    subtitle: outgoing ? t("camp.replacesPlayer") + " " + outgoing.player.nickname : undefined,
                    summary,
                    deltas,
                    total: powerDelta,
                    from: preview?.before.power.total ?? power.total,
                    to: preview?.after.power.total ?? power.total,
                    action: {
                      label: t("camp.buy"),
                      meta: costLabel,
                      disabled: !affordable,
                      onSelect: buy,
                    },
                  })}
                />
                {summary}
                <div className="camp-offer__deltas">
                  <OfferDelta delta={powerDelta} />
                </div>
                <div className="camp-pack-card__buy">
                  <span className={`camp-offer__cost${freeSwap ? " camp-offer__cost--free" : ""}`}>
                    {costLabel}
                  </span>
                  <Button
                    variant="primary"
                    disabled={!affordable}
                    data-testid={`market-${offer.id}`}
                    onClick={buy}
                  >
                    {t("camp.buy")}
                  </Button>
                </div>
              </div>
              </Dealt>
            );
          })}
        </div>
        <h4 className="camp__market-group-title">{t("camp.marketHeroes")}</h4>
        {/* Второй полноценный пак: 5 разных hero re-pick с полным score + rarity preview.
            Ячейки — в порядке раздачи, купленная остаётся дырой (см. пак игроков выше). */}
        <div className="camp__pack" data-testid="camp-hero-pack">
          {order.heroes.map((offerId, heroIndex) => {
            const ghost = ghosts.find((g) => g.id === offerId);
            if (ghost) return ghostCard(ghost, order.players.length + heroIndex);
            const offer = heroOffers.find((o) => o.id === offerId);
            if (!offer) return null;
            const affordable = camp.unlimitedGold || offer.cost <= camp.gold;
            // Срез 3b: редкость входящего героя детерминирована по seed+heroId+stage — тот же
            // ролл, что применит покупка. Полное превью ниже пересобирает и редкость, и
            // условия Tactics/Items: входящий mythic может усилить сырой score, но выключить
            // карточку билда и в итоге ослабить Run Power.
            // Качество входящего берём С ОФФЕРА (R4.1), а не роллим здесь заново: цена карты
            // считается от него же, и разойтись с покупкой они больше не могут. Ровно это
            // расхождение и было багом первого забега.
            // Улучшение своего героя (R14.8) — вторая форма hero-карты: ростер не меняется,
            // меняется только тир. Поэтому у неё нет `heroSwap` и нет `preview` от рынка:
            // разложение считается здесь, на текущем составе с поднятым тиром.
            const upgrade = offer.heroUpgrade;
            const upgradeHeroId = upgrade?.heroId;
            const incomingRarity: Rarity = upgrade
              ? upgrade.targetRarity
              : offer.heroSwap?.incomingRarity ?? "common";
            const outgoingRarity: Rarity = upgrade
              ? camp.heroRarity[String(upgrade.heroId)] ?? "common"
              : offer.heroSwap
                ? camp.heroRarity[String(offer.heroSwap.outgoingHeroId)] ?? "common"
                : "common";
            const afterHeroes = offer.heroSwap
              ? replaceActiveHero(offer.heroSwap.outgoingHeroId, offer.heroSwap.incomingHeroId)
              : snapshot.heroes;
            const afterRarity = { ...camp.heroRarity };
            if (offer.heroSwap) afterRarity[String(offer.heroSwap.incomingHeroId)] = incomingRarity;
            if (upgrade) afterRarity[String(upgrade.heroId)] = upgrade.targetRarity;
            const preview = offer.preview
              ? previewPower(
                  offer.preview.after,
                  snapshot.roster,
                  offer.preview.afterAssignment ?? score.assignment.byPlayer,
                  afterHeroes,
                  afterRarity,
                )
              : upgrade
                ? previewPower(
                    { base: score.base, heroSynergy: score.heroSynergy, chemistry: score.chemistry },
                    snapshot.roster,
                    score.assignment.byPlayer,
                    afterHeroes,
                    afterRarity,
                  )
                : null;
            const deltas = preview?.deltas ?? [];
            const powerDelta = preview?.delta ?? 0;
            // У улучшения переиспользуем карточку из Preparation: там уже решено, как показывать
            // «твой герой + новый тир» (портрет + теги), и второй версии этого вида быть не должно.
            const summary = upgradeHeroId != null
              ? rarityOfferSummary(upgradeHeroId, incomingRarity)
              : heroOfferSummary(offer, incomingRarity, outgoingRarity);
            const cardHeroId = upgradeHeroId ?? offer.heroSwap!.incomingHeroId;
            const buy = () => buyWithGhost({
              id: offer.id,
              className: "camp-pack-card camp-pack-card--hero camp-inspectable-card",
              attrs: {
                "data-offer-kind": "hero",
                "data-incoming-rarity": incomingRarity,
                "data-rarity-glow": incomingRarity,
                "data-outgoing-rarity": outgoingRarity,
              },
              summary,
              delta: powerDelta,
              costLabel: t("camp.cost", { cost: offer.cost }),
            });
            return (
              <Dealt className="camp-dealt" key={`${deal}:${offer.id}`} index={order.players.length + heroIndex}>
              <div
                className="camp-pack-card camp-pack-card--hero camp-inspectable-card"
                data-offer-kind="hero"
                data-incoming-rarity={incomingRarity}
                data-rarity-glow={incomingRarity}
                data-outgoing-rarity={outgoingRarity}
              >
                <CardInspectTrigger
                  label={hero(cardHeroId).name}
                  delta={powerDelta}
                  testId={`offer-details-${offer.id}`}
                  onOpen={() => setInspected({
                    title: hero(cardHeroId).name,
                    subtitle: upgradeHeroId != null
                      ? t("market.heroUpgradeHint", {
                        hero: hero(upgradeHeroId).name,
                        from: t(`rarity.${outgoingRarity}` as MessageKey),
                        to: t(`rarity.${incomingRarity}` as MessageKey),
                      })
                      : t("camp.activeHero") + ": " + hero(offer.heroSwap!.outgoingHeroId).name,
                    summary: upgradeHeroId != null
                      ? rarityOfferSummary(upgradeHeroId, incomingRarity, false)
                      : heroOfferSummary(offer, incomingRarity, outgoingRarity, false),
                    deltas,
                    total: powerDelta,
                    from: preview?.before.power.total ?? power.total,
                    to: preview?.after.power.total ?? power.total,
                    action: {
                      label: t("camp.buy"),
                      meta: t("camp.cost", { cost: offer.cost }),
                      disabled: !affordable,
                      onSelect: buy,
                    },
                  })}
                />
                {/* Улучшение обязано отличаться от re-pick с первого взгляда: обе карты рисуют
                    портрет героя, но одна МЕНЯЕТ состав, а другая нет. Подпись с переходом тиров —
                    единственное, что их различает. */}
                {upgradeHeroId != null && (
                  <p className="camp-offer__upgrade-note">
                    <b>{t("market.heroUpgrade")}</b>
                    <span>{t("market.heroUpgradeHint", {
                      hero: hero(upgradeHeroId).name,
                      from: t(`rarity.${outgoingRarity}` as MessageKey),
                      to: t(`rarity.${incomingRarity}` as MessageKey),
                    })}</span>
                  </p>
                )}
                {summary}
                <div className="camp-offer__deltas">
                  <OfferDelta delta={powerDelta} />
                </div>
                <div className="camp-pack-card__buy">
                  <span className="camp-offer__cost">{t("camp.cost", { cost: offer.cost })}</span>
                  <Button
                    variant="primary"
                    disabled={!affordable}
                    data-testid={`market-${offer.id}`}
                    onClick={buy}
                  >
                    {t("camp.buy")}
                  </Button>
                </div>
              </div>
              </Dealt>
            );
          })}
        </div>

        {camp.rarityUpgradesEnabled && (
          <>
            {/* Заголовок и «?» одной строкой: раздельными блоками подсказка занимала
                собственный ряд сетки — тридцать пустых пикселей над рядом карточек. */}
            <div className="camp__market-group-head">
              <h4 className="camp__market-group-title">{t("camp.rarityUpgrade")}</h4>
              <CampHint label={t("camp.showHint")}>{t("camp.rarityHint")}</CampHint>
            </div>
            {/* Улучшение — второе действие рынка героев (реролл его не качает): поднимает тир
                активного героя, растит его вклад в Hero Synergy (+OVR игроку у immortal). */}
            <div className="camp__rarity-grid" data-testid="camp-rarity">
              {snapshot.heroes.map((heroId, rarityIndex) => {
                const current: Rarity = (camp.heroRarity[String(heroId)] as Rarity) ?? "common";
                const up = nextRarity(current);
                const cost = upgradeCost(current);
                const thumb = hero(heroId);
                // Токен «бесплатное улучшение» (награда R4.3) должен учитываться и в UI:
                // иначе карточка выглядит заблокированной, хотя движок списал бы 0 — тот же
                // класс бага, что уже ловили на stand-in.
                const freeUpgrade = camp.freeRarityUpgrades > 0;
                const affordable = cost != null && (freeUpgrade || camp.unlimitedGold || cost <= camp.gold);
                const afterRarity = { ...camp.heroRarity };
                if (up) afterRarity[String(heroId)] = up;
                const preview = up
                  ? previewPower(
                      valuesOf(score),
                      snapshot.roster,
                      score.assignment.byPlayer,
                      snapshot.heroes,
                      afterRarity,
                    )
                  : null;
                const deltas = preview?.deltas ?? [];
                const powerDelta = preview?.delta ?? 0;
                return (
                  <Dealt
                    className="camp-dealt"
                    key={`${campDeal}:rarity-${heroId}`}
                    index={playerOffers.length + heroOffers.length + rarityIndex}
                  >
                  <div
                    className={`camp-rarity-card${up ? " camp-inspectable-card" : ""}`}
                    data-hero-id={heroId}
                    data-rarity={current}
                    data-rarity-glow={current}
                  >
                    {up && (
                      <CardInspectTrigger
                        label={thumb.name}
                        delta={powerDelta}
                        testId={`rarity-details-${heroId}`}
                        onOpen={() => setInspected({
                          title: thumb.name,
                          subtitle: `${t(`rarity.${current}` as MessageKey)} → ${t(`rarity.${up}` as MessageKey)}`,
                          summary: rarityOfferSummary(heroId, current, false),
                          deltas,
                          total: powerDelta,
                          from: preview?.before.power.total ?? power.total,
                          to: preview?.after.power.total ?? power.total,
                          action: {
                            label: t("camp.rarityBuy"),
                            meta: freeUpgrade ? t("camp.free") : t("camp.cost", { cost: cost ?? 0 }),
                            disabled: !affordable,
                            onSelect: () => { sfxBuy(); upgradeHeroRarity(heroId); },
                          },
                        })}
                      />
                    )}
                    {rarityOfferSummary(heroId, current)}
                    {up ? (
                      <>
                        <div className="camp-offer__deltas">
                          <OfferDelta delta={powerDelta} />
                        </div>
                        <div className="camp-pack-card__buy">
                          <span className={`camp-offer__cost${freeUpgrade ? " camp-offer__cost--free" : ""}`}>
                            {freeUpgrade ? t("camp.free") : t("camp.cost", { cost: cost ?? 0 })}
                          </span>
                          <Button
                            variant="primary"
                            disabled={!affordable}
                            data-testid={`rarity-upgrade-${heroId}`}
                            onClick={() => { sfxBuy(); upgradeHeroRarity(heroId); }}
                          >
                            {t("camp.rarityBuy")}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <span className="camp-rarity-card__max">{t("camp.rarityMax")}</span>
                    )}
                  </div>
                  </Dealt>
                );
              })}
            </div>
          </>
        )}
      </section>
  );
}
