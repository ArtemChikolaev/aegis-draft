import { useRun } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { roleMessageKey } from "../../i18n/core.ts";
import { Button, Eyebrow, RoleTag, Surface } from "../../ui/index.ts";
import { Pentagon } from "../draft/Pentagon.tsx";
import { useHeroName } from "../draft/heroes.ts";
import "./result.css";

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
      <header className="screen-heading result__heading"><Eyebrow>{t("result.eyebrow")}</Eyebrow><h1>{t("result.title")}</h1><p>{t("result.subtitle")}</p></header>
      <div className="result__grid">
        <Surface className="result__radar"><Pentagon roster={roster} teamOvr={score.teamOvr} /></Surface>
        <Surface className="result__report">
          <div className="result__ovr"><strong>{Math.round(score.teamOvr)}</strong><span>{t("common.teamOvr")}</span></div>
          <h2>{t("result.breakdown")}</h2>
          <dl className="breakdown"><div><dt>{t("common.base")}</dt><dd>{Math.round(score.base)}</dd></div><div><dt>{t("common.heroSynergy")}</dt><dd>{fmt(score.heroSynergy)}</dd></div><div><dt>{t("common.chemistry")}</dt><dd>{fmt(score.chemistry)}</dd></div></dl>
          <h2>{t("result.roster")}</h2>
          <ul className="final-roster">
            {roster.map((slot, index) => {
              const hero = slot.candidate ? score.assignment.byPlayer[slot.candidate.player.accountId] : undefined;
              return <li key={index}><RoleTag role={slot.role}>{t(roleMessageKey(slot.role))}</RoleTag><strong>{slot.candidate?.player.nickname ?? "—"}</strong><span>{hero == null ? "—" : heroName(hero)}</span></li>;
            })}
          </ul>
          <p className="run-meta muted">{config?.draftStyle} · {config?.format} · {t("common.seed")} {seed}</p>
          <Button variant="primary" data-testid="new-run" onClick={reset}>{t("result.newRun")}<span>↻</span></Button>
        </Surface>
      </div>
    </main>
  );
}
