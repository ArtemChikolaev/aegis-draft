import { useEffect } from "react";
import { useRun } from "../state/runStore.ts";
import { useShell } from "../state/shellStore.ts";
import { StartScreen } from "../features/start/StartScreen.tsx";
import { ResumeBanner } from "../features/start/ResumeBanner.tsx";
import { RunLinkPrompt } from "../features/start/RunLinkPrompt.tsx";
import { DraftScreen } from "../features/draft/DraftScreen.tsx";
import { TournamentScreen } from "../features/tournament/TournamentScreen.tsx";
import { SettingsScreen } from "../features/settings/SettingsScreen.tsx";
import { HeroesScreen } from "../features/heroes/HeroesScreen.tsx";
import { TeammatesScreen } from "../features/teammates/TeammatesScreen.tsx";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Banner, Button } from "../ui/index.ts";
import "./App.css";

export function App() {
  const phase = useRun((s) => s.phase);
  const error = useRun((s) => s.error);
  const loadData = useRun((s) => s.loadData);
  const { t } = useI18n();
  const view = useShell((s) => s.view);
  const setView = useShell((s) => s.setView);
  const syncFromHash = useShell((s) => s.syncFromHash);
  const syncLinkFromHash = useRun((s) => s.syncLinkFromHash);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Кнопка «назад» браузера: на телефоне это единственный способ уйти со страницы.
  useEffect(() => {
    window.addEventListener("popstate", syncFromHash);
    return () => window.removeEventListener("popstate", syncFromHash);
  }, [syncFromHash]);

  // Ссылку на забег могли открыть в УЖЕ открытом приложении: меняется только hash,
  // перезагрузки нет, и loadData повторно не вызывается. Без этого присланная ссылка
  // молча не срабатывала бы у всех, у кого игра уже открыта во вкладке.
  useEffect(() => {
    window.addEventListener("hashchange", syncLinkFromHash);
    return () => window.removeEventListener("hashchange", syncLinkFromHash);
  }, [syncLinkFromHash]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" data-testid="brand">
          <span className="brand__mark" aria-hidden="true">A</span>
          <span className="brand__copy">
            <strong>Aegis Draft</strong>
            <small>{t("brand.kicker")}</small>
          </span>
        </div>
        {/* Язык и тема переехали на отдельную страницу: в топбаре два селекта съедали
            всю ширину на телефоне, а меняют их раз в жизни. */}
        <Button variant="secondary" data-testid="open-settings" onClick={() => setView("settings")}>
          ⚙ {t("shell.menu")}
        </Button>
      </header>

      {error && (
        <Banner title={t(error === "resume.failed" ? "resume.failed" : "app.error")}>
          {error === "resume.failed" ? null : error}
        </Banner>
      )}

      {view === "settings" ? <SettingsScreen /> : view === "heroes" ? <HeroesScreen /> : view === "teammates" ? <TeammatesScreen /> : (
        <>
          {phase === "loading" && <div className="loading"><span className="loading__orb" />{t("app.loading")}</div>}
          {phase === "start" && <ResumeBanner />}
          {phase === "start" && <StartScreen />}
          {phase === "draft" && <DraftScreen />}
          {phase === "tournament" && <TournamentScreen />}
        </>
      )}
      {/* Вне переключателя вида: ссылку могли открыть, стоя на любом экране, и предложение
          не должно зависеть от того, где игрок находится. */}
      <RunLinkPrompt />
      <footer className="footer">{t("footer.note")}</footer>
    </div>
  );
}
