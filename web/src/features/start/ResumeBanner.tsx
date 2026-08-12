import { useEffect } from "react";
import { useRun } from "../../state/runStore.ts";
import { useManager } from "../../state/managerStore.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button } from "../../ui/index.ts";
import type { MessageKey } from "../../i18n/core.ts";
import "./resume.css";

/** Баннер «продолжить незавершённый забег» (game-state-architecture: resume из персиста).
 *  Тот же паттерн ведёт и менеджерскую карьеру (ниже): один вид «есть что продолжить»
 *  на стартовом экране, а не по карману в каждом режиме. */
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

/** Менеджерская карьера — тем же баннером. Кнопка «распустить» намеренно НЕ здесь:
 *  долгий сейв не удаляют с баннера — только изнутри режима, за confirm-модалкой. */
export function ManagerResumeBanner() {
  const resumable = useManager((s) => s.resumable);
  const hydrate = useManager((s) => s.hydrate);
  const resumeCareer = useManager((s) => s.resumeCareer);
  const setSelectedMode = useRun((s) => s.setSelectedMode);
  const data = useRun((s) => s.data);
  const { t } = useI18n();

  // Гидрация после загрузки данных: без данных сейв нечем проверить на совместимость.
  useEffect(() => {
    if (data) void hydrate();
  }, [data, hydrate]);

  if (!resumable) return null;
  return (
    <aside className="resume-banner" data-testid="manager-resume-banner">
      <div className="resume-banner__copy">
        <strong>{t("manager.resumeTitle")}</strong>
        <small>{t("manager.resumeSummary", { org: resumable.orgName, n: resumable.season })}</small>
      </div>
      <div className="resume-banner__actions">
        <Button
          variant="primaryInvert"
          data-testid="manager-resume-continue"
          onClick={() => { setSelectedMode("manager"); void resumeCareer(); }}
        >
          {t("manager.resume")}<span>→</span>
        </Button>
      </div>
    </aside>
  );
}
