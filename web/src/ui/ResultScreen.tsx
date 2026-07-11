import { useRun } from "../state/runStore.ts";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../i18n/core.ts";
import { Pentagon } from "./Pentagon.tsx";
import { useHeroName } from "./heroes.ts";

const fmt = (value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

export function ResultScreen() {
  const snapshot = useRun((state) => state.snapshot);
  const seed = useRun((state) => state.seed);
  const config = useRun((state) => state.config);
  const reset = useRun((state) => state.reset);
  const heroName = useHeroName();
  const { t } = useI18n();
  if (!snapshot?.score) return null;

  const { roster, score } = snapshot;
  return (
    <main className="result">
      <header className="screen-heading result__heading"><p className="eyebrow">{t("result.eyebrow")}</p><h1>{t("result.title")}</h1><p>{t("result.subtitle")}</p></header>
      <div className="result__grid">
        <section className="surface result__radar"><Pentagon roster={roster} teamOvr={score.teamOvr} /></section>
        <section className="surface result__report">
          <div className="result__ovr"><strong>{Math.round(score.teamOvr)}</strong><span>{t("common.teamOvr")}</span></div>
          <h2>{t("result.breakdown")}</h2>
          <dl className="breakdown"><div><dt>{t("common.base")}</dt><dd>{Math.round(score.base)}</dd></div><div><dt>{t("common.heroSynergy")}</dt><dd>{fmt(score.heroSynergy)}</dd></div><div><dt>{t("common.chemistry")}</dt><dd>{fmt(score.chemistry)}</dd></div></dl>
          <h2>{t("result.roster")}</h2>
          <ul className="final-roster">
            {roster.map((slot, index) => {
              const hero = slot.candidate ? score.assignment.byPlayer[slot.candidate.player.accountId] : undefined;
              return <li key={index}><span className={`role-tag role-tag--${slot.role}`}>{t(roleMessageKey(slot.role))}</span><strong>{slot.candidate?.player.nickname ?? "—"}</strong><span>{hero == null ? "—" : heroName(hero)}</span></li>;
            })}
          </ul>
          <p className="run-meta">{config?.draftStyle} · {config?.format} · {t("common.seed")} {seed}</p>
          <button className="primary-button" data-testid="new-run" onClick={reset}>{t("result.newRun")}<span>↻</span></button>
        </section>
      </div>
    </main>
  );
}
