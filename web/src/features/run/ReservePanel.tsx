// Резерв Буткемпа: скамейка игроков и reserve pool героев со свапами и точным превью каждой
// перестановки. Вынесен из `CampScreen` (остаток R13.4) без изменения поведения: превью силы
// считает экран (previewPower), панель только рисует и зовёт переданные действия.
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button, HeroThumb, Select, Surface } from "../../ui/index.ts";
import { useHero } from "../draft/heroes.ts";
import { CampHint } from "./CampHint.tsx";
import { CampPlayerCard, CardInspectTrigger, OfferDelta, valuesOf } from "./CampCards.tsx";
import type { CampReserveView } from "./campMarketView.ts";

export function ReservePanel(props: CampReserveView) {
  const { t } = useI18n();
  const hero = useHero();
  const {
    snapshot, score, power, heroTargets, onHeroTarget,
    previewPower, replaceRosterCandidate, replaceActiveHero,
    setInspected, swapReservePlayer, swapReserveHero,
  } = props;
  return (
    <Surface className="camp__reserve" data-testid="camp-reserve">
      <div className="camp__section-head">
        <div className="camp__section-heading">
          <h3 className="camp__section-title">{t("camp.reserve")}</h3>
          <CampHint label={t("camp.showHint")}>{t("camp.reserveHint")}</CampHint>
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
                const preview = previewPower(
                  valuesOf(after),
                  replaceRosterCandidate(slotIndex, reserve.candidate),
                  after.assignment.byPlayer,
                  snapshot.heroes,
                );
                const deltas = preview.deltas;
                const powerDelta = preview.delta;
                return (
                  <div
                    className="camp-reserve-swap camp-inspectable-card"
                    key={`${slotIndex}-${outgoing.player.accountId}`}
                  >
                    <CardInspectTrigger
                      label={reserve.candidate.player.nickname}
                      delta={powerDelta}
                      testId={`reserve-player-details-${slotIndex}`}
                      onOpen={() => setInspected({
                        title: reserve.candidate.player.nickname,
                        subtitle: `${t("camp.replacesPlayer")} ${outgoing.player.nickname}`,
                        summary: (
                          <div className="offer-overlay__reserve-summary">
                            <CampPlayerCard
                              candidate={reserve.candidate}
                              heroId={after.assignment.byPlayer[reserve.candidate.player.accountId]}
                              label={t("camp.reservePlayer")}
                            />
                            <span>
                              {outgoing.player.nickname} <b>{outgoing.player.ovr}</b>
                              {" → "}
                              {reserve.candidate.player.nickname} <b>{reserve.candidate.player.ovr}</b>
                            </span>
                          </div>
                        ),
                        deltas,
                        total: powerDelta,
                        from: preview.before.power.total,
                        to: preview.after.power.total,
                        action: {
                          label: t("camp.swap"),
                          onSelect: () => swapReservePlayer(slotIndex, reserve.candidate.player.accountId),
                        },
                      })}
                    />
                    <div className="camp-reserve-swap__summary">
                      <span>
                        {outgoing.player.nickname} <b>{outgoing.player.ovr}</b>
                        {" → "}
                        {reserve.candidate.player.nickname}{" "}
                        <b>{reserve.candidate.player.ovr}</b>
                      </span>
                      <div className="camp-offer__deltas">
                        <OfferDelta delta={powerDelta} />
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
          const preview = after
            ? previewPower(
                valuesOf(after),
                snapshot.roster,
                after.assignment.byPlayer,
                replaceActiveHero(outgoingHeroId, reserve.heroId),
              )
            : null;
          const deltas = preview?.deltas ?? [];
          const powerDelta = preview?.delta ?? 0;
          return (
            <div key={reserve.heroId} className="camp-reserve-card camp-reserve-card--hero camp-inspectable-card">
              {after && (
                <CardInspectTrigger
                  label={reserveHero.name}
                  delta={powerDelta}
                  testId={`reserve-hero-details-${reserve.heroId}`}
                  onOpen={() => setInspected({
                    title: reserveHero.name,
                    subtitle: `${t("camp.activeHero")}: ${outgoingHero.name}`,
                    summary: (
                      <div className="camp-hero-compare">
                        <HeroThumb {...reserveHero} size="md" />
                        <span className="camp-hero-compare__arrow" aria-hidden="true">→</span>
                        <HeroThumb {...outgoingHero} size="md" />
                      </div>
                    ),
                    deltas,
                    total: powerDelta,
                    from: preview?.before.power.total ?? power.total,
                    to: preview?.after.power.total ?? power.total,
                    action: {
                      label: t("camp.swap"),
                      onSelect: () => swapReserveHero(outgoingHeroId, reserve.heroId),
                    },
                  })}
                />
              )}
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
                onChange={(value) => onHeroTarget(reserve.heroId, Number(value))}
              />
              {after && (
                <div className="camp-offer__deltas">
                  <OfferDelta delta={powerDelta} />
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
  );
}
