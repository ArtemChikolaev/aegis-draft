// Буткемп Roguelite Run (T5.2, срезы 2–3): Reward, контекстный Market и резерв.
// Постоянная левая панель переиспользует тот же Pentagon/SynergyBreakdown, что драфт и турнир:
// игрок всегда видит активный ростер, hero assignment и связи до принятия решения.
import { useMemo, useState } from "react";
import { playerOfferAffordable, type Offer, type Summand, type SummandValues } from "../../game/anteEconomy.ts";
import {
  RARITY,
  nextRarity,
  rarityModifiers,
  raritySwapDelta,
  upgradeCost,
  type Rarity,
} from "../../game/heroRarity.ts";
import type { Candidate } from "../../game/packs.ts";
import { candidateMatchesRef, candidatesOf } from "../../game/packs.ts";
import {
  chemistryPairEdges,
  chemistryPlayersFromRoster,
  heroStatsForAssignment,
  heroStatsForDisplay,
  heroSynergyRows,
  heroSynergyTier,
  playerHeroGames,
  squadChemistryRows,
} from "../../game/score.ts";
import { roleMessageKey, type MessageKey } from "../../i18n/core.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import {
  Button,
  CheatBadge,
  Eyebrow,
  HeroThumb,
  Modal,
  playerOvrTier,
  RoleTag,
  Select,
  StatTile,
  Surface,
} from "../../ui/index.ts";
import { Pentagon } from "../draft/Pentagon.tsx";
import { PlayerInspector } from "../draft/PlayerInspector.tsx";
import { SynergyBreakdown } from "../draft/SynergyBreakdown.tsx";
import { useHero } from "../draft/heroes.ts";
import "./camp.css";

function fmt(value: number): string {
  return Number.isInteger(value) ? value.toString() : (Math.round(value * 10) / 10).toString();
}

function signed(value: number): string {
  return value > 0 ? `+${fmt(value)}` : fmt(value);
}

/** Бейдж редкости героя (срез 3b). Цвет — токен `--rarity-*`; common не показываем (фон). */
function RarityBadge({ rarity, label }: { rarity: Rarity; label: string }) {
  if (rarity === "common") return null;
  return <span className={`rarity-badge rarity-badge--${rarity}`}>{label}</span>;
}

/** Изменение Team OVR оффера (сумма слагаемых после − до). Для пак-карты — главный сигнал.
 *  `extra` учитывает эффекты поверх score-превью движка — например, смену редкости героя. */
function teamOvrDelta(offer: Offer, extra: Partial<SummandValues> = {}): number {
  if (!offer.preview) return 0;
  const b = offer.preview.before;
  const a = offer.preview.after;
  return (a.base + a.heroSynergy + a.chemistry) - (b.base + b.heroSynergy + b.chemistry)
    + (extra.base ?? 0) + (extra.heroSynergy ?? 0) + (extra.chemistry ?? 0);
}

function valuesOf(score: { base: number; heroSynergy: number; chemistry: number }): SummandValues {
  return {
    base: score.base,
    heroSynergy: score.heroSynergy,
    chemistry: score.chemistry,
  };
}

function CampPlayerCard({
  candidate,
  heroId,
  label,
  testId,
  nameTestId,
}: {
  candidate: Candidate;
  heroId?: number;
  label: string;
  testId?: string;
  nameTestId?: string;
}) {
  const { t } = useI18n();
  const hero = useHero();
  const { player } = candidate;
  const tier = playerOvrTier(player.ovr);
  const assignedHero = heroId != null ? hero(heroId) : null;

  return (
    <div
      className={`camp-player-card card-tint--${tier}`}
      data-account-id={player.accountId}
      data-testid={testId}
    >
      <div className="camp-player-card__top">
        <span className="camp-player-card__label">{label}</span>
        <RoleTag role={player.role}>{t(roleMessageKey(player.role))}</RoleTag>
      </div>
      <div className="camp-player-card__identity">
        <span>
          <strong data-testid={nameTestId}>{player.nickname}</strong>
          <small>{candidate.teamName}</small>
        </span>
        {assignedHero && <HeroThumb {...assignedHero} showName={false} />}
      </div>
      <div className="camp-player-card__bottom">
        <span className="camp-player-card__stats">
          <span><b>{player.impact}</b> IMP</span>
          <span><b>{player.economy}</b> ECO</span>
          <span><b>{player.reliability}</b> REL</span>
        </span>
        <span className={`camp-player-card__ovr ovr-tier--${tier}`}>
          {player.ovr}<small>OVR</small>
        </span>
      </div>
    </div>
  );
}

export function CampScreen() {
  const camp = useRun((s) => s.camp);
  const ante = useRun((s) => s.ante);
  const snapshot = useRun((s) => s.snapshot);
  const data = useRun((s) => s.data);
  const config = useRun((s) => s.config);
  const tactics = useRun((s) => s.tactics);
  const boss = useRun((s) => s.boss);
  const chooseReward = useRun((s) => s.chooseReward);
  const buyMarket = useRun((s) => s.buyMarket);
  const rerollMarket = useRun((s) => s.rerollMarket);
  const discardTactic = useRun((s) => s.discardTactic);
  const discardAction = useRun((s) => s.discardAction);
  const playCampAction = useRun((s) => s.playCampAction);
  const upgradeHeroRarity = useRun((s) => s.upgradeHeroRarity);
  const swapReservePlayer = useRun((s) => s.swapReservePlayer);
  const swapReserveHero = useRun((s) => s.swapReserveHero);
  const advanceAnteStage = useRun((s) => s.advanceAnteStage);
  const reset = useRun((s) => s.reset);
  const { t } = useI18n();
  const hero = useHero();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [heroTargets, setHeroTargets] = useState<Record<number, number>>({});
  const [inspectedPlayer, setInspectedPlayer] = useState<Candidate | null>(null);
  const candidates = useMemo(() => (data?.packs ?? []).flatMap(candidatesOf), [data]);
  const eventNames = useMemo(
    () => new Map((data?.events ?? []).map((event) => [event.id, event.short ?? event.name])),
    [data?.events],
  );
  const eventLabel = (eventId: string) => eventNames.get(eventId) ?? eventId;

  const score = snapshot?.score;
  if (!camp || !ante || !score || !snapshot || !data || !config) return null;

  // Итоговые слагаемые = счёт ростера + модификаторы экономики (покупки/временные действия) +
  // вклад условных Tactics + редкость активных героев. Ровно та же сумма, что стор кладёт в поле.
  const tacticMods = tactics?.modifiers ?? { base: 0, heroSynergy: 0, chemistry: 0 };
  const rarityMods = rarityModifiers(camp.heroRarity, snapshot.heroes);
  const mods = {
    base: camp.modifiers.base + tacticMods.base + rarityMods.base,
    heroSynergy: camp.modifiers.heroSynergy + tacticMods.heroSynergy + rarityMods.heroSynergy,
    chemistry: camp.modifiers.chemistry + tacticMods.chemistry + rarityMods.chemistry,
  };
  const current: SummandValues = {
    base: score.base + mods.base,
    heroSynergy: score.heroSynergy + mods.heroSynergy,
    chemistry: score.chemistry + mods.chemistry,
  };
  const effectiveOvr = current.base + current.heroSynergy + current.chemistry;
  const playerOffers = camp.marketOffers.filter((o) => o.kind === "player");
  const heroOffers = camp.marketOffers.filter((o) => o.kind === "hero");
  const nextLabel = ante.target <= 1
    ? t("ante.nextTargetWin")
    : t("ante.nextTargetTop", { rank: ante.target });
  const chemistryEdges = chemistryPairEdges(
    chemistryPlayersFromRoster(snapshot.roster),
    data.squadSynergy,
    data.teammates,
  );
  const phs = heroStatsForAssignment(data);
  const displayPhs = heroStatsForDisplay(data);
  const heroRows = heroSynergyRows(snapshot.roster, score.assignment, phs, displayPhs);
  const chemistryRows = squadChemistryRows(snapshot.roster, data.squadSynergy, data.teammates);
  const synergyTier = heroSynergyTier(current.heroSynergy);
  const synergySublabel = synergyTier === "insane"
    ? t("draft.synergyInsane")
    : synergyTier === "great"
      ? t("draft.synergyGreat")
      : mods.heroSynergy
        ? signed(mods.heroSynergy)
        : undefined;

  function deltaRows(
    before: SummandValues,
    after: SummandValues,
    extra: Partial<SummandValues> = {},
  ) {
    return (["base", "heroSynergy", "chemistry"] as const).flatMap((summand) => {
      const from = before[summand] + mods[summand];
      const to = after[summand] + mods[summand] + (extra[summand] ?? 0);
      const delta = to - from;
      if (Math.abs(delta) < 0.01) return [];
      return [(
        <span
          key={summand}
          className={`camp-offer__delta camp-offer__delta--${delta >= 0 ? "up" : "down"}`}
        >
          {t(`common.${summand}` as MessageKey)} {fmt(from)}→{fmt(to)}
        </span>
      )];
    });
  }

  function effectRows(offer: Offer) {
    if (offer.kind === "gold") {
      return [
        <span key="g" className="camp-offer__delta camp-offer__delta--gold">
          {signed(offer.goldGain ?? 0)} ◈
        </span>,
      ];
    }
    if ((offer.kind === "tactic" || offer.kind === "action") && offer.cardId) {
      return [
        <span key="card" className="camp-offer__card-desc">
          {t(`${offer.kind}.desc.${offer.cardId}` as MessageKey)}
        </span>,
      ];
    }
    if (offer.preview) return deltaRows(offer.preview.before, offer.preview.after);
    const effect = offer.effect;
    if (!effect) return null;
    const parts: Array<{ summand: Summand; delta: number }> = [
      { summand: effect.summand, delta: effect.delta },
    ];
    if (effect.tradeoffSummand && effect.tradeoffDelta) {
      parts.push({ summand: effect.tradeoffSummand, delta: effect.tradeoffDelta });
    }
    return parts.map(({ summand, delta }) => (
      <span
        key={summand}
        className={`camp-offer__delta camp-offer__delta--${delta >= 0 ? "up" : "down"}`}
      >
        {t(`common.${summand}` as MessageKey)} {fmt(current[summand])}→{fmt(current[summand] + delta)}
      </span>
    ));
  }

  function offerIdentity(offer: Offer) {
    if (offer.kind === "hero" && offer.heroSwap) {
      const outgoing = hero(offer.heroSwap.outgoingHeroId);
      const incoming = hero(offer.heroSwap.incomingHeroId);
      const assignedAccountId = Number(
        Object.entries(offer.preview?.afterAssignment ?? {})
          .find(([, heroId]) => heroId === offer.heroSwap!.incomingHeroId)?.[0],
      );
      const assignedPlayer = snapshot!.roster
        .find((slot) => slot.candidate?.player.accountId === assignedAccountId)
        ?.candidate;
      const games = assignedPlayer
        ? playerHeroGames(displayPhs, assignedPlayer.player.accountId, offer.heroSwap.incomingHeroId)
        : 0;
      return (
        <div className="camp-hero-offer">
          <div className="camp-hero-compare">
            <span className="camp-hero-compare__hero">
              <small>{t("camp.newHero")}</small>
              <HeroThumb {...incoming} layout="card" />
            </span>
            <span className="camp-hero-compare__arrow" aria-hidden="true">→</span>
            <span className="camp-hero-compare__hero">
              <small>{t("camp.activeHero")}</small>
              <HeroThumb {...outgoing} layout="card" />
            </span>
          </div>
          {assignedPlayer && (
            <div className="camp-offer__fit">
              <small>{t("camp.heroBestFit")}</small>
              <strong>{assignedPlayer.player.nickname}</strong>
              <span>{t("camp.heroGames", { n: games })}</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  const openInspector = config.hardMode
    ? undefined
    : (candidate: Candidate) => setInspectedPlayer(candidate);

  return (
    <main className="camp" data-testid="camp-screen">
      <header className="camp__head">
        <div>
          <Eyebrow>{t("camp.title")}</Eyebrow>
          <h2 className="camp__cleared">{t("camp.cleared", { n: ante.index })}</h2>
          <p className="camp__next">{nextLabel}</p>
        </div>
        {config.cheatMode && <CheatBadge />}
        <div className="camp__gold" aria-label={t("camp.gold")}>
          <span className="camp__gold-icon">◈</span>
          <strong data-testid="camp-gold">{camp.unlimitedGold ? "∞" : camp.gold}</strong>
        </div>
      </header>

      <div className="camp__workbench">
        <Surface className="camp__team on-invert-surface" data-testid="camp-team-radar">
          <span className="camp__team-glow" aria-hidden="true" />
          <h3 className="camp__team-title">{t("camp.teamNow")}</h3>
          <Pentagon
            roster={snapshot.roster}
            teamOvr={effectiveOvr}
            chemistryEdges={chemistryEdges}
            assignmentByPlayer={score.assignment.byPlayer}
            onSelectPlayer={openInspector}
          />
          <div className="camp__stats score-strip">
            <StatTile
              label={t("common.base")}
              value={fmt(current.base)}
              kind="base"
              sublabel={mods.base ? signed(mods.base) : undefined}
            />
            <StatTile
              label={t("common.heroSynergy")}
              value={fmt(current.heroSynergy)}
              kind="synergy"
              sublabel={synergySublabel}
            />
            <StatTile
              label={t("common.chemistry")}
              value={fmt(current.chemistry)}
              kind="chemistry"
              sublabel={mods.chemistry ? signed(mods.chemistry) : undefined}
            />
          </div>
          <SynergyBreakdown
            heroRows={heroRows}
            chemistryRows={chemistryRows}
            onPlayerClick={config.hardMode ? undefined : (accountId) => {
              const candidate = snapshot.roster
                .find((slot) => slot.candidate?.player.accountId === accountId)
                ?.candidate;
              if (candidate) setInspectedPlayer(candidate);
            }}
          />
        </Surface>

        <div className="camp__economy">
          {boss && (
            <section
              className={`camp-boss camp-boss--${boss.met ? "met" : "active"}`}
              data-testid="camp-boss"
              data-boss-id={boss.bossId}
            >
              <div className="camp-boss__head">
                <Eyebrow>{t("boss.next")}</Eyebrow>
                <strong className="camp-boss__name">{t(`boss.${boss.bossId}` as MessageKey)}</strong>
              </div>
              <p className="camp-boss__desc">{t(`boss.desc.${boss.bossId}` as MessageKey)}</p>
              <div className="camp-boss__status">
                <span className={`camp-boss__reason camp-boss__reason--${boss.met ? "met" : "warn"}`}>
                  {t(boss.reasonKey as MessageKey, boss.reasonParams)}
                </span>
                {boss.met ? (
                  <span className="camp-boss__tag camp-boss__tag--met" data-testid="camp-boss-met">
                    ✓ {t("boss.metLabel")}
                  </span>
                ) : (
                  <span className="camp-boss__tag camp-boss__tag--warn" data-testid="camp-boss-penalty">
                    {t("boss.penaltyValue", { n: fmt(boss.penalty) })}
                  </span>
                )}
              </div>
            </section>
          )}
          <section className="camp__section" data-testid="camp-reward">
            <h3 className="camp__section-title">
              {camp.rewardChosen ? t("camp.rewardChosen") : t("camp.reward")}
            </h3>
            <div className="camp__offers camp__offers--reward">
              {camp.rewardOffers.map((offer) => {
                const isChosen = camp.chosenRewardId === offer.id;
                const slotFull = (offer.kind === "tactic" && camp.equippedTactics.length >= camp.tacticSlots)
                  || (offer.kind === "action" && camp.heldActions.length >= camp.actionSlots);
                const isCard = offer.kind === "tactic" || offer.kind === "action";
                return (
                  <div
                    key={offer.id}
                    className={`camp-offer camp-offer--reward${isChosen ? " is-chosen" : ""}${isCard ? " camp-offer--card" : ""}`}
                    data-offer-kind={offer.kind}
                  >
                    <div className="camp-offer__body">
                      <span className="camp-offer__head">
                        <strong className="camp-offer__label">{t(offer.labelKey as MessageKey)}</strong>
                        {isCard && (
                          <span className={`camp-card-tag camp-card-tag--${offer.kind}`}>
                            {t(offer.kind === "tactic" ? "camp.tactics" : "camp.campActions")}
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
                      onClick={() => chooseReward(offer.id)}
                    >
                      {isChosen ? "✓" : t("camp.choose")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="camp__section" data-testid="camp-build">
            <div className="camp__build">
              <div className="camp__build-col" data-testid="camp-tactics">
                <div className="camp__build-head">
                  <h3 className="camp__section-title">{t("camp.tactics")}</h3>
                  <span className="camp__slot-count">
                    {t("camp.slotsUsed", { used: camp.equippedTactics.length, total: camp.tacticSlots })}
                  </span>
                </div>
                <p className="camp__section-hint">{t("camp.tacticsHint")}</p>
                <div className="camp__slots">
                  {Array.from({ length: camp.tacticSlots }, (_, slot) => {
                    const tacticId = camp.equippedTactics[slot];
                    if (!tacticId) {
                      return <div key={`t-empty-${slot}`} className="camp-slot camp-slot--empty">{t("camp.emptySlot")}</div>;
                    }
                    const reasons = (tactics?.sources ?? []).filter((source) => source.tacticId === tacticId);
                    return (
                      <div key={tacticId} className="camp-slot camp-slot--tactic" data-card-id={tacticId}>
                        <div className="camp-slot__head">
                          <strong>{t(`tactic.${tacticId}` as MessageKey)}</strong>
                          <button
                            type="button"
                            className="camp-slot__discard"
                            aria-label={t("camp.discard")}
                            data-testid={`tactic-discard-${tacticId}`}
                            onClick={() => discardTactic(tacticId)}
                          >
                            ✕
                          </button>
                        </div>
                        <p className="camp-slot__desc">{t(`tactic.desc.${tacticId}` as MessageKey)}</p>
                        <div className="camp-offer__deltas">
                          {reasons.length === 0 && (
                            <span className="camp-slot__idle">{t("camp.tacticNoEffect")}</span>
                          )}
                          {reasons.map((source, i) => (
                            <span
                              key={i}
                              className={`camp-offer__delta camp-offer__delta--${source.delta >= 0 ? "up" : "down"}`}
                            >
                              {t(source.reasonKey as MessageKey, source.reasonParams)} · {t(`common.${source.summand}` as MessageKey)} {signed(source.delta)}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="camp__build-col" data-testid="camp-actions-panel">
                <div className="camp__build-head">
                  <h3 className="camp__section-title">{t("camp.campActions")}</h3>
                  <span className="camp__slot-count">
                    {t("camp.slotsUsed", { used: camp.heldActions.length, total: camp.actionSlots })}
                  </span>
                </div>
                <p className="camp__section-hint">{t("camp.campActionsHint")}</p>
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
                            onClick={() => discardAction(actionId)}
                          >
                            ✕
                          </button>
                        </div>
                        <p className="camp-slot__desc">{t(`action.desc.${actionId}` as MessageKey)}</p>
                        <Button
                          variant="primary"
                          data-testid={`action-play-${actionId}`}
                          onClick={() => playCampAction(actionId)}
                        >
                          {t("camp.play")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="camp__section" data-testid="camp-market">
            <div className="camp__section-head">
              <div>
                <h3 className="camp__section-title">{t("camp.market")}</h3>
                <p className="camp__section-hint">{t("camp.marketHint")}</p>
              </div>
              <Button
                variant="secondary"
                disabled={!camp.canReroll}
                data-testid="camp-reroll"
                onClick={rerollMarket}
              >
                ↻ {t("camp.reroll", { cost: camp.rerollCost })}
              </Button>
            </div>
            <h4 className="camp__market-group-title">{t("camp.marketPlayers")}</h4>
            {/* Пак-рулетка из 5 игроков: разное качество, ловушки допустимы. */}
            <div className="camp__pack" data-testid="camp-pack">
              {playerOffers.map((offer) => {
                const incoming = candidates.find((c) => candidateMatchesRef(c, offer.playerSwap!.incoming));
                if (!incoming) return null;
                const outgoing = snapshot.roster[offer.playerSwap!.slotIndex]?.candidate;
                const afterHeroId = offer.preview?.afterAssignment?.[incoming.player.accountId];
                // Stand-in делает ОДНУ замену игрока бесплатной — цена и доступность это учитывают,
                // иначе дорогая карта остаётся заблокированной, хотя движок списал бы 0 (баг live).
                const freeSwap = camp.freePlayerSwaps > 0;
                const affordable = playerOfferAffordable(offer.cost, camp.gold, camp.freePlayerSwaps, camp.unlimitedGold);
                const ovrDelta = teamOvrDelta(offer);
                return (
                  <div key={offer.id} className="camp-pack-card" data-offer-kind="player">
                    <CampPlayerCard
                      candidate={incoming}
                      heroId={afterHeroId}
                      label={t(roleMessageKey(incoming.player.role))}
                    />
                    {outgoing && (
                      // Form Upgrade (R5.2): та же личность в другой турнирной форме. Без явной
                      // подписи карта читалась бы как «Satanic заменит Satanic» — игрок обязан
                      // видеть, что меняется не человек, а его форма, и откуда она.
                      outgoing.player.accountId === incoming.player.accountId ? (
                        <div className="camp-offer__fit camp-offer__fit--form" data-form-upgrade="true">
                          <small>{t("camp.formUpgrade")}</small>
                          {/* Формы различает СОБЫТИЕ, а не команда: у одного человека бывает
                              несколько снимков внутри одной организации. */}
                          <strong>{eventLabel(outgoing.eventId)}</strong>
                          <span>{outgoing.player.ovr} OVR →</span>
                        </div>
                      ) : (
                        <div className="camp-offer__fit">
                          <small>{t("camp.replacesPlayer")}</small>
                          <strong>{outgoing.player.nickname}</strong>
                          <span>{outgoing.player.ovr} OVR</span>
                        </div>
                      )
                    )}
                    <div className="camp-offer__deltas">
                      <span className={`camp-offer__delta camp-offer__delta--${ovrDelta >= 0 ? "up" : "down"}`}>
                        {t("common.teamOvr")} {signed(ovrDelta)}
                      </span>
                      {deltaRows(offer.preview!.before, offer.preview!.after)}
                    </div>
                    <div className="camp-pack-card__buy">
                      <span className={`camp-offer__cost${freeSwap ? " camp-offer__cost--free" : ""}`}>
                        {freeSwap ? t("camp.free") : t("camp.cost", { cost: offer.cost })}
                      </span>
                      <Button
                        variant="primary"
                        disabled={!affordable}
                        data-testid={`market-${offer.id}`}
                        onClick={() => buyMarket(offer.id)}
                      >
                        {t("camp.buy")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <h4 className="camp__market-group-title">{t("camp.marketHeroes")}</h4>
            {/* Второй полноценный пак: 5 разных hero re-pick с полным score + rarity preview. */}
            <div className="camp__pack" data-testid="camp-hero-pack">
              {heroOffers.map((offer) => {
                const affordable = camp.unlimitedGold || offer.cost <= camp.gold;
                // Срез 3b: редкость входящего героя детерминирована по seed+heroId+stage — тот же
                // ролл, что применит покупка. Из неё вычитаем вклад редкости снимаемого героя:
                // иначе mythic, заменяющий immortal, выглядел как +1.4 при фактическом падении.
                // Качество входящего берём С ОФФЕРА (R4.1), а не роллим здесь заново: цена карты
                // считается от него же, и разойтись с покупкой они больше не могут. Ровно это
                // расхождение и было багом первого забега.
                const incomingRarity: Rarity = offer.heroSwap?.incomingRarity ?? "common";
                // Снимаемый герой — из реальной карты забега, без гейта: в первом забеге дропов
                // нет, но вручную поднятый тир существует, и его потеря при замене должна быть
                // видна в дельте.
                const outgoingRarity: Rarity = offer.heroSwap
                  ? camp.heroRarity[String(offer.heroSwap.outgoingHeroId)] ?? "common"
                  : "common";
                const rarityDelta = raritySwapDelta(outgoingRarity, incomingRarity);
                const ovrDelta = teamOvrDelta(offer, rarityDelta);
                return (
                  <div
                    key={offer.id}
                    className="camp-pack-card camp-pack-card--hero"
                    data-offer-kind="hero"
                    data-incoming-rarity={incomingRarity}
                    data-outgoing-rarity={outgoingRarity}
                  >
                    {offerIdentity(offer)}
                    {(incomingRarity !== "common" || outgoingRarity !== "common") && (
                      <div className="camp-hero-rarity">
                        <RarityBadge rarity={incomingRarity} label={t(`rarity.${incomingRarity}` as MessageKey)} />
                        {Math.abs(rarityDelta.heroSynergy) >= 0.01 && (
                          <span className={`camp-offer__delta camp-offer__delta--${rarityDelta.heroSynergy >= 0 ? "up" : "down"}`}>
                            {t("common.heroSynergy")} {signed(rarityDelta.heroSynergy)}
                          </span>
                        )}
                        {Math.abs(rarityDelta.base) >= 0.01 && (
                          <span className={`camp-offer__delta camp-offer__delta--${rarityDelta.base >= 0 ? "up" : "down"}`}>
                            {t("common.base")} {signed(rarityDelta.base)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="camp-offer__deltas">
                      <span className={`camp-offer__delta camp-offer__delta--${ovrDelta >= 0 ? "up" : "down"}`}>
                        {t("common.teamOvr")} {signed(ovrDelta)}
                      </span>
                      {offer.preview && deltaRows(offer.preview.before, offer.preview.after, rarityDelta)}
                    </div>
                    <div className="camp-pack-card__buy">
                      <span className="camp-offer__cost">{t("camp.cost", { cost: offer.cost })}</span>
                      <Button
                        variant="primary"
                        disabled={!affordable}
                        data-testid={`market-${offer.id}`}
                        onClick={() => buyMarket(offer.id)}
                      >
                        {t("camp.buy")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {camp.rarityUpgradesEnabled && (
              <>
                <h4 className="camp__market-group-title">{t("camp.rarityUpgrade")}</h4>
                <p className="camp__section-hint">{t("camp.rarityHint")}</p>
                {/* Улучшение — второе действие рынка героев (реролл его не качает): поднимает тир
                    активного героя, растит его вклад в Hero Synergy (+OVR игроку у immortal). */}
                <div className="camp__rarity-grid" data-testid="camp-rarity">
                  {snapshot.heroes.map((heroId) => {
                    const current: Rarity = (camp.heroRarity[String(heroId)] as Rarity) ?? "common";
                    const up = nextRarity(current);
                    const cost = upgradeCost(current);
                    const thumb = hero(heroId);
                    const affordable = cost != null && (camp.unlimitedGold || cost <= camp.gold);
                    const gain = up ? RARITY.heroSynergyBonus[up] - RARITY.heroSynergyBonus[current] : 0;
                    return (
                      <div key={heroId} className="camp-rarity-card" data-hero-id={heroId} data-rarity={current}>
                        <div className="camp-rarity-card__hero">
                          <HeroThumb {...thumb} size="md" />
                          <RarityBadge rarity={current} label={t(`rarity.${current}` as MessageKey)} />
                        </div>
                        {up ? (
                          <>
                            <div className="camp-offer__deltas">
                              <span className="camp-offer__delta camp-offer__delta--up">
                                → {t(`rarity.${up}` as MessageKey)}
                              </span>
                              <span className="camp-offer__delta camp-offer__delta--up">
                                {t("common.heroSynergy")} {signed(gain)}
                              </span>
                              {up === "immortal" && (
                                <span className="camp-offer__delta camp-offer__delta--up">
                                  {t("common.base")} {signed(RARITY.immortalBaseBonus)}
                                </span>
                              )}
                            </div>
                            <div className="camp-pack-card__buy">
                              <span className="camp-offer__cost">{t("camp.cost", { cost: cost ?? 0 })}</span>
                              <Button
                                variant="primary"
                                disabled={!affordable}
                                data-testid={`rarity-upgrade-${heroId}`}
                                onClick={() => upgradeHeroRarity(heroId)}
                              >
                                {t("camp.rarityBuy")}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <span className="camp-rarity-card__max">{t("camp.rarityMax")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {(snapshot.reservePlayers.length > 0 || snapshot.reserveHeroes.length > 0) && (
            <Surface className="camp__reserve" data-testid="camp-reserve">
              <div className="camp__section-head">
                <div>
                  <h3 className="camp__section-title">{t("camp.reserve")}</h3>
                  <p className="camp__section-hint">{t("camp.reserveHint")}</p>
                </div>
              </div>
              <div className="camp__reserve-grid">
                {snapshot.reservePlayers.map((reserve, reserveIndex) => (
                  <div
                    key={reserve.candidate.player.accountId}
                    className="camp-reserve-card camp-reserve-card--player"
                  >
                    <CampPlayerCard
                      candidate={reserve.candidate}
                      heroId={score.assignment.byPlayer[reserve.candidate.player.accountId]}
                      label={t("camp.reservePlayer")}
                      testId={reserveIndex === 0 ? "camp-reserve-player" : undefined}
                      nameTestId={reserveIndex === 0 ? "camp-reserve-player-name" : undefined}
                    />
                    <div className="camp-reserve-card__actions">
                      {reserve.previews.map(({ slotIndex, score: after }) => {
                        const outgoing = snapshot.roster[slotIndex]?.candidate;
                        if (!outgoing) return null;
                        return (
                          <div
                            className="camp-reserve-swap"
                            key={`${slotIndex}-${outgoing.player.accountId}`}
                          >
                            <div className="camp-reserve-swap__summary">
                              <span>
                                {outgoing.player.nickname} <b>{outgoing.player.ovr}</b>
                                {" → "}
                                {reserve.candidate.player.nickname}{" "}
                                <b>{reserve.candidate.player.ovr}</b>
                              </span>
                              <div className="camp-offer__deltas">
                                {deltaRows(valuesOf(score), valuesOf(after))}
                              </div>
                            </div>
                            <Button
                              variant="secondary"
                              data-testid={`camp-reserve-player-swap-${slotIndex}`}
                              onClick={() => swapReservePlayer(slotIndex, reserve.candidate.player.accountId)}
                            >
                              {t("camp.swap")}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {snapshot.reserveHeroes.map((reserve) => {
                  const reserveHero = hero(reserve.heroId);
                  const outgoingHeroId = heroTargets[reserve.heroId] ?? snapshot.heroes[0];
                  const outgoingHero = hero(outgoingHeroId);
                  const after = reserve.previews
                    .find((preview) => preview.outgoingHeroId === outgoingHeroId)
                    ?.score;
                  const ovrDelta = after ? after.teamOvr - score.teamOvr : 0;
                  return (
                    <div key={reserve.heroId} className="camp-reserve-card camp-reserve-card--hero">
                      <small>{t("camp.reserveHeroes")}</small>
                      <div className="camp-hero-compare">
                        <HeroThumb {...reserveHero} size="md" />
                        <span className="camp-hero-compare__arrow" aria-hidden="true">→</span>
                        <HeroThumb {...outgoingHero} size="md" />
                      </div>
                      <Select
                        label={t("camp.replaceHero")}
                        value={String(outgoingHeroId)}
                        options={snapshot.heroes.map((heroId) => ({
                          value: String(heroId),
                          label: hero(heroId).name,
                        }))}
                        onChange={(value) => setHeroTargets((targets) => ({
                          ...targets,
                          [reserve.heroId]: Number(value),
                        }))}
                      />
                      {after && (
                        <div className="camp-offer__deltas">
                          <span className={`camp-offer__delta camp-offer__delta--${ovrDelta >= 0 ? "up" : "down"}`}>
                            {t("common.teamOvr")} {signed(ovrDelta)}
                          </span>
                          {deltaRows(valuesOf(score), valuesOf(after))}
                        </div>
                      )}
                      <Button
                        variant="secondary"
                        data-testid={`camp-reserve-hero-swap-${reserve.heroId}`}
                        onClick={() => swapReserveHero(outgoingHeroId, reserve.heroId)}
                      >
                        {t("camp.swap")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Surface>
          )}

          <div className="camp__actions">
            <Button variant="primary" data-testid="camp-next-stage" onClick={advanceAnteStage}>
              {t("ante.nextStage")}<span>→</span>
            </Button>
            <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
              {t("ante.giveUp")}
            </Button>
          </div>
        </div>
      </div>

      {confirmLeave && (
        <Modal
          mark="A"
          title={t("tournament.leaveTitle")}
          description={t("tournament.leaveText")}
          labelledBy="camp-leave-title"
          dismissLabel={t("common.close")}
          onClose={() => setConfirmLeave(false)}
        >
          {({ close }) => (
            <>
              <Button variant="primaryInvert" onClick={close}>{t("tournament.leaveCancel")}</Button>
              <Button variant="danger" onClick={reset}>{t("tournament.leaveConfirm")}</Button>
            </>
          )}
        </Modal>
      )}
      {inspectedPlayer && (
        <PlayerInspector
          candidate={inspectedPlayer}
          data={data}
          onClose={() => setInspectedPlayer(null)}
        />
      )}
    </main>
  );
}
