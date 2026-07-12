import type { ReactNode } from "react";
import type { HeroSynergyRow, SquadChemistryRow } from "../../game/score.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { heroGamesMessageKey } from "../../i18n/core.ts";
import { HeroThumb } from "../../ui/index.ts";
import { useHero } from "./heroes.ts";
import "./synergy-breakdown.css";

const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

/** Списки Hero Synergy и Squad Chemistry под радаром (parity 322-0). */
export function SynergyBreakdown({ heroRows, chemistryRows, onPlayerClick }: {
  heroRows: HeroSynergyRow[];
  chemistryRows: SquadChemistryRow[];
  onPlayerClick?: (accountId: number) => void;
}) {
  const { locale, t } = useI18n();
  const hero = useHero();
  const link = onPlayerClick != null;

  const PlayerLink = ({ accountId, children }: { accountId: number; children: ReactNode }) => (
    link ? (
      <button type="button" className="synergy-breakdown__link" onClick={() => onPlayerClick(accountId)}>
        {children}
      </button>
    ) : (
      <strong>{children}</strong>
    )
  );

  return (
    <div className="synergy-breakdown">
      <section className="synergy-breakdown__col">
        <h3>{t("draft.heroSynergyList")}</h3>
        {heroRows.length === 0 ? (
          <p className="synergy-breakdown__empty">{t("draft.synergyNone")}</p>
        ) : (
          <ul>
            {heroRows.map((row) => {
              const h = row.heroId != null ? hero(row.heroId) : null;
              return (
                <li key={row.accountId}>
                  {h ? (
                    <span className="synergy-breakdown__icon">
                      <HeroThumb picture={h.picture} name={h.name} showName={false} />
                    </span>
                  ) : (
                    <span className="synergy-breakdown__icon-spacer" aria-hidden="true" />
                  )}
                  <span className="synergy-breakdown__label">
                    <PlayerLink accountId={row.accountId}>{row.nickname}</PlayerLink>
                    <span className="synergy-breakdown__hero">
                      {h?.name ?? t("draft.noHeroYet")}
                    </span>
                  </span>
                  <span className="synergy-breakdown__meta">
                    {row.heroId != null
                      ? t(heroGamesMessageKey(locale, row.games), { count: row.games })
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="synergy-breakdown__col synergy-breakdown__col--chemistry">
        <h3>{t("draft.chemistryList")}</h3>
        {chemistryRows.length === 0 ? (
          <p className="synergy-breakdown__empty">{t("draft.synergyNone")}</p>
        ) : (
          <ul>
            {chemistryRows.map((row) => (
              <li key={`${row.accountIdA}:${row.accountIdB}`}>
                <span className="synergy-breakdown__label">
                  <PlayerLink accountId={row.accountIdA}>{row.nicknameA}</PlayerLink>
                  <span className="synergy-breakdown__sep">+</span>
                  <PlayerLink accountId={row.accountIdB}>{row.nicknameB}</PlayerLink>
                </span>
                <span className="synergy-breakdown__meta">
                  {row.games > 0 && `${row.games} · `}{fmt(row.bonus)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
