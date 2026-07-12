import { useRun } from "../../state/runStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button } from "../../ui/index.ts";
import "./resume.css";

/** Баннер «продолжить незавершённый забег» (game-state-architecture: resume из персиста). */
export function ResumeBanner() {
  const resumable = useRun((s) => s.resumable);
  const resumeRun = useRun((s) => s.resumeRun);
  const discardResume = useRun((s) => s.discardResume);
  const { t } = useI18n();
  if (!resumable) return null;

  const picked = resumable.actions.filter((a) => a.t === "pickPlayer" || a.t === "pickHero").length;

  return (
    <aside className="resume-banner" data-testid="resume-banner">
      <div className="resume-banner__copy">
        <strong>{t("resume.title")}</strong>
        <small>{t("resume.text", { picked, total: 10 })}</small>
      </div>
      <div className="resume-banner__actions">
        <Button variant="secondary" onClick={discardResume} data-testid="resume-discard">{t("resume.discard")}</Button>
        <Button variant="primaryInvert" onClick={resumeRun} data-testid="resume-continue">{t("resume.button")}<span>→</span></Button>
      </div>
    </aside>
  );
}
