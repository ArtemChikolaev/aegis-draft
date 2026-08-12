import { useEffect, useState } from "react";
import { useRun } from "../../state/runStore.ts";
import { useManager } from "../../state/managerStore.ts";
import { ManagerAbandonModal } from "../manager/ManagerScreen.tsx";
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

/** Менеджерская карьера — тем же баннером: продолжить и распустить. Роспуск — только
 *  через confirm-модалку: долгий сейв не удаляется одним кликом (в отличие от короткого
 *  сейва забега выше). */
export function ManagerResumeBanner() {
  const engine = useManager((s) => s.engine);
  const resumable = useManager((s) => s.resumable);
  const careerOpen = useManager((s) => s.careerOpen);
  const setCareerOpen = useManager((s) => s.setCareerOpen);
  const hydrate = useManager((s) => s.hydrate);
  const resumeCareer = useManager((s) => s.resumeCareer);
  const abandonCareer = useManager((s) => s.abandonCareer);
  const setSelectedMode = useRun((s) => s.setSelectedMode);
  const data = useRun((s) => s.data);
  const { t } = useI18n();
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  // Гидрация после загрузки данных: без данных сейв нечем проверить на совместимость.
  useEffect(() => {
    if (data) void hydrate();
  }, [data, hydrate]);

  // Внутри открытой карьеры плашка — шум: игрок уже в ней.
  if (careerOpen) return null;
  // Карьера может жить в памяти (вышли из режима кнопкой «назад») ИЛИ в сейве (после
  // перезагрузки). Баннер обязан видеть обе — иначе после «назад» он молчит (плейтест).
  const info = engine
    ? { orgName: engine.state.config.orgName, season: engine.state.season }
    : resumable;
  if (!info) return null;
  return (
    <aside className="resume-banner" data-testid="manager-resume-banner">
      <div className="resume-banner__copy">
        <strong>{t("manager.resumeTitle")}</strong>
        <small>{t("manager.resumeSummary", { org: info.orgName, n: info.season })}</small>
      </div>
      <div className="resume-banner__actions">
        <Button variant="secondaryInvert" data-testid="manager-resume-discard" onClick={() => setConfirmAbandon(true)}>
          {t("manager.abandon")}
        </Button>
        <Button
          variant="primaryInvert"
          data-testid="manager-resume-continue"
          onClick={() => {
            setSelectedMode("manager");
            setCareerOpen(true);
            if (!engine) void resumeCareer();
          }}
        >
          {t("manager.resume")}<span>→</span>
        </Button>
      </div>
      {confirmAbandon && <ManagerAbandonModal onConfirm={abandonCareer} onClose={() => setConfirmAbandon(false)} />}
    </aside>
  );
}
