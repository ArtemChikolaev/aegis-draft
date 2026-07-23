// Буткемп Roguelite Run (T5.2, срез 2): экран между этапами — Reward (выбор 1 из 3) и Market
// (3 рычага над слагаемыми Team OVR + reroll). UI-примитивы переиспользуются из ui/ (скилл
// frontend-architecture), цвет — токен режима (--accent, у Roguelite фиолетовый), строки — i18n.
// Логика и детерминизм — в game/anteEconomy.ts; экран только рендерит снимок camp и зовёт действия.
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import type { MessageKey } from "../../i18n/core.ts";
import type { Offer, Summand } from "../../game/anteEconomy.ts";
import { Button, Eyebrow, Modal, StatTile, Surface } from "../../ui/index.ts";
import "./camp.css";

/** Округление слагаемых: base целочисленный по смыслу, synergy/chemistry — до десятых. */
function fmt(value: number): string {
  return Number.isInteger(value) ? value.toString() : (Math.round(value * 10) / 10).toString();
}

function signed(value: number): string {
  return value > 0 ? `+${fmt(value)}` : fmt(value);
}

export function CampScreen() {
  const camp = useRun((s) => s.camp);
  const ante = useRun((s) => s.ante);
  const snapshot = useRun((s) => s.snapshot);
  const chooseReward = useRun((s) => s.chooseReward);
  const buyMarket = useRun((s) => s.buyMarket);
  const rerollMarket = useRun((s) => s.rerollMarket);
  const advanceAnteStage = useRun((s) => s.advanceAnteStage);
  const reset = useRun((s) => s.reset);
  const { t } = useI18n();
  const [confirmLeave, setConfirmLeave] = useState(false);

  const score = snapshot?.score;
  if (!camp || !ante || !score) return null;

  // «До» = базовые слагаемые драфта + уже применённые модификаторы экономики.
  const current: Record<Summand, number> = {
    base: score.base + camp.modifiers.base,
    heroSynergy: score.heroSynergy + camp.modifiers.heroSynergy,
    chemistry: score.chemistry + camp.modifiers.chemistry,
  };
  const effectiveOvr = current.base + current.heroSynergy + current.chemistry;
  const nextLabel = ante.target <= 1 ? t("ante.nextTargetWin") : t("ante.nextTargetTop", { rank: ante.target });

  /** Строки «до → после» для stat-оффера: изменённое слагаемое и (если есть) trade-off. */
  function effectRows(offer: Offer) {
    if (offer.kind === "gold") {
      return [<span key="g" className="camp-offer__delta camp-offer__delta--gold">{signed(offer.goldGain ?? 0)} ◈</span>];
    }
    const e = offer.effect;
    if (!e) return null;
    const parts: { summand: Summand; delta: number }[] = [{ summand: e.summand, delta: e.delta }];
    if (e.tradeoffSummand && e.tradeoffDelta) parts.push({ summand: e.tradeoffSummand, delta: e.tradeoffDelta });
    return parts.map((p) => {
      const from = current[p.summand];
      const to = from + p.delta;
      return (
        <span key={p.summand} className={`camp-offer__delta camp-offer__delta--${p.delta >= 0 ? "up" : "down"}`}>
          {t(`common.${p.summand}` as MessageKey)} {fmt(from)}→{fmt(to)}
        </span>
      );
    });
  }

  return (
    <main className="camp" data-testid="camp-screen">
      <header className="camp__head">
        <div>
          <Eyebrow>{t("camp.title")}</Eyebrow>
          <h2 className="camp__cleared">{t("camp.cleared", { n: ante.index })}</h2>
          <p className="camp__next">{nextLabel}</p>
        </div>
        <div className="camp__gold" aria-label={t("camp.gold")}>
          <span className="camp__gold-icon">◈</span>
          <strong data-testid="camp-gold">{camp.gold}</strong>
        </div>
      </header>

      <Surface className="camp__team">
        <h3 className="camp__team-title">{t("camp.teamNow")}</h3>
        <div className="camp__stats">
          <StatTile label={t("common.base")} value={fmt(current.base)} kind="base" sublabel={camp.modifiers.base ? signed(camp.modifiers.base) : undefined} />
          <StatTile label={t("common.heroSynergy")} value={fmt(current.heroSynergy)} kind="synergy" sublabel={camp.modifiers.heroSynergy ? signed(camp.modifiers.heroSynergy) : undefined} />
          <StatTile label={t("common.chemistry")} value={fmt(current.chemistry)} kind="chemistry" sublabel={camp.modifiers.chemistry ? signed(camp.modifiers.chemistry) : undefined} />
          <StatTile label={t("common.teamOvr")} value={Math.round(effectiveOvr).toString()} kind="base" />
        </div>
      </Surface>

      <section className="camp__section" data-testid="camp-reward">
        <h3 className="camp__section-title">{camp.rewardChosen ? t("camp.rewardChosen") : t("camp.reward")}</h3>
        <div className="camp__offers">
          {camp.rewardOffers.map((offer) => {
            const isChosen = camp.chosenRewardId === offer.id;
            return (
              <div key={offer.id} className={`camp-offer camp-offer--reward${isChosen ? " is-chosen" : ""}`}>
                <div className="camp-offer__body">
                  <strong className="camp-offer__label">{t(offer.labelKey as MessageKey)}</strong>
                  <div className="camp-offer__deltas">{effectRows(offer)}</div>
                </div>
                <Button
                  variant={isChosen ? "secondary" : "primary"}
                  disabled={camp.rewardChosen}
                  data-testid={`reward-${offer.id}`}
                  onClick={() => chooseReward(offer.id)}
                >
                  {isChosen ? "✓" : t("camp.buy")}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="camp__section" data-testid="camp-market">
        <div className="camp__section-head">
          <h3 className="camp__section-title">{t("camp.market")}</h3>
          <Button variant="secondary" disabled={!camp.canReroll} data-testid="camp-reroll" onClick={rerollMarket}>
            ↻ {t("camp.reroll", { cost: camp.rerollCost })}
          </Button>
        </div>
        <div className="camp__offers">
          {camp.marketOffers.map((offer) => {
            const affordable = offer.cost <= camp.gold;
            return (
              <div key={offer.id} className="camp-offer camp-offer--market">
                <div className="camp-offer__body">
                  <strong className="camp-offer__label">{t(offer.labelKey as MessageKey)}</strong>
                  <div className="camp-offer__deltas">{effectRows(offer)}</div>
                </div>
                <div className="camp-offer__buy">
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
      </section>

      <div className="camp__actions">
        <Button variant="primary" data-testid="camp-next-stage" onClick={advanceAnteStage}>
          {t("ante.nextStage")}<span>→</span>
        </Button>
        <Button variant="secondary" onClick={() => setConfirmLeave(true)}>{t("ante.giveUp")}</Button>
      </div>

      {confirmLeave && (
        <Modal mark="A" title={t("tournament.leaveTitle")} description={t("tournament.leaveText")} labelledBy="camp-leave-title" dismissLabel={t("common.close")} onClose={() => setConfirmLeave(false)}>
          {({ close }) => (
            <>
              <Button variant="primaryInvert" onClick={close}>{t("tournament.leaveCancel")}</Button>
              <Button variant="danger" onClick={reset}>{t("tournament.leaveConfirm")}</Button>
            </>
          )}
        </Modal>
      )}
    </main>
  );
}
