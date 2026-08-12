import { useI18n } from "../../i18n/I18nProvider.tsx";
import { navigateBack } from "../../state/navigation.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { Button, Eyebrow, SoonBadge, Surface } from "../../ui/index.ts";
import { ClassicFlowDiagram, RunLadderDiagram, ScoreDiagram } from "./diagrams.tsx";
import "./rules.css";

/** Правила режимов: что это за режим, как выглядит петля и что в нём «правильная игра».
 *  Для нереализованных режимов — краткий питч с бейджем «Скоро» (решение 2026-08-12).
 *  Страница не закрывается хардкором: она объясняет механику, а не данные игроков. */
export function RulesScreen() {
  const { t } = useI18n();
  const backNative = useTmaChrome((state) => state.backNative);

  return (
    <main className="rules" data-testid="rules-screen">
      {!backNative && <Button variant="back" onClick={navigateBack}>← {t("codex.back")}</Button>}
      <header className="screen-heading">
        <Eyebrow>{t("rules.eyebrow")}</Eyebrow>
        <h1>{t("rules.title")}</h1>
        <p className="rules__intro">{t("rules.intro")}</p>
      </header>

      {/* Общий счёт: одна формула на все режимы — объясняем один раз, наверху. */}
      <Surface className="rules__panel">
        <h2 className="rules__section">{t("rules.scoreTitle")}</h2>
        <p className="rules__lead">{t("rules.scoreLead")}</p>
        <div className="rules__diagram">
          <ScoreDiagram
            base={t("common.base")}
            synergy={t("common.heroSynergy")}
            chemistry={t("common.chemistry")}
            ovr={t("common.teamOvr")}
          />
        </div>
        <dl className="rules__terms">
          <div><dt>{t("draft.scoringLegendBaseTitle")}</dt><dd>{t("draft.scoringLegendBase")}</dd></div>
          <div><dt>{t("draft.scoringLegendSynergyTitle")}</dt><dd>{t("draft.scoringLegendSynergy")}</dd></div>
          <div><dt>{t("draft.scoringLegendChemistryTitle")}</dt><dd>{t("draft.scoringLegendChemistry")}</dd></div>
        </dl>
        <p className="rules__moral">{t("rules.scoreMoral")}</p>
      </Surface>

      <Surface className="rules__panel">
        <h2 className="rules__section">{t("rules.classicTitle")}</h2>
        <p className="rules__lead">{t("start.modeClassicLong")}</p>
        <div className="rules__diagram">
          <ClassicFlowDiagram
            steps={[
              t("rules.classicStepPacks"),
              t("rules.classicStepRoster"),
              t("rules.classicStepGroups"),
              t("rules.classicStepPlayoffs"),
              t("rules.classicStepPlace"),
            ]}
          />
        </div>
        <ul className="rules__how">
          <li>{t("rules.classicHow1")}</li>
          <li>{t("rules.classicHow2")}</li>
          <li>{t("rules.classicHow3")}</li>
          <li>{t("rules.classicHow4")}</li>
        </ul>
      </Surface>

      <Surface className="rules__panel">
        <h2 className="rules__section">{t("rules.runTitle")}</h2>
        <p className="rules__lead">{t("start.modeRunLong")}</p>
        <div className="rules__diagram">
          <RunLadderDiagram
            threshold={t("rules.runDiagramThreshold")}
            power={t("rules.runDiagramPower")}
            boss={t("rules.runDiagramBoss")}
            camp={t("rules.runDiagramCamp")}
            acts={t("rules.runDiagramActs")}
          />
        </div>
        <ul className="rules__how">
          <li>{t("rules.runHow1")}</li>
          <li>{t("rules.runHow2")}</li>
          <li>{t("rules.runHow3")}</li>
          <li>{t("rules.runHow4")}</li>
        </ul>
      </Surface>

      <Surface className="rules__panel">
        <h2 className="rules__section">{t("rules.managerTitle")}</h2>
        <p className="rules__lead">{t("start.modeManagerLong")}</p>
        <div className="rules__diagram">
          <ClassicFlowDiagram
            steps={[
              t("rules.managerStepTryouts"),
              t("rules.managerStepContracts"),
              t("rules.managerStepSeason"),
              t("rules.managerStepFinale"),
              t("rules.managerStepOffseason"),
            ]}
          />
        </div>
        <ul className="rules__how">
          <li>{t("rules.managerHow1")}</li>
          <li>{t("rules.managerHow2")}</li>
          <li>{t("rules.managerHow3")}</li>
          <li>{t("rules.managerHow4")}</li>
        </ul>
      </Surface>

      {/* Нереализованные режимы: питч + чем отличается, без обещаний интерфейса. */}
      <Surface className="rules__panel rules__panel--soon">
        <h2 className="rules__section">{t("rules.tournamentTitle")} <SoonBadge>{t("common.soon")}</SoonBadge></h2>
        <p className="rules__lead">{t("start.modeTournamentLong")}</p>
        <p className="rules__soon-note">{t("rules.tournamentSoon")}</p>
      </Surface>

      <Surface className="rules__panel rules__panel--soon">
        <h2 className="rules__section">{t("rules.arenaTitle")} <SoonBadge>{t("common.soon")}</SoonBadge></h2>
        <p className="rules__lead">{t("start.modeArenaLong")}</p>
        <p className="rules__soon-note">{t("rules.arenaSoon")}</p>
      </Surface>
    </main>
  );
}
