import { useRun } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button } from "../../ui/index.ts";
import type { MessageKey } from "../../i18n/core.ts";
import "./resume.css";

/** Баннер «продолжить незавершённый забег» (game-state-architecture: resume из персиста). */
export function ResumeBanner() {
  const resumable = useRun((s) => s.resumable);
  const resumeRun = useRun((s) => s.resumeRun);
  const discardResume = useRun((s) => s.discardResume);
  const { t } = useI18n();
  if (!resumable) return null;

  const picked = resumable.actions.filter((a) => a.t === "pickPlayer" || a.t === "pickHero").length;
  const tournamentStages: MessageKey[] = ["tournament.field", "tournament.groups", "tournament.playoffs", "tournament.final", "tournament.complete"];
  const resumeText = resumable.tournamentStarted
    ? t("resume.tournamentText", { stage: t(tournamentStages[Math.max(0, Math.min(4, resumable.tournamentStep ?? 0))]) })
    : t("resume.text", { picked, total: 10 });

  return (
    <aside className="resume-banner" data-testid="resume-banner">
      <div className="resume-banner__copy">
        <strong>{t("resume.title")}</strong>
        <small>{resumeText}</small>
      </div>
      <div className="resume-banner__actions">
        <Button variant="secondaryInvert" onClick={discardResume} data-testid="resume-discard">{t("resume.discard")}</Button>
        <Button variant="primaryInvert" onClick={resumeRun} data-testid="resume-continue">{t("resume.button")}<span>→</span></Button>
      </div>
    </aside>
  );
}
