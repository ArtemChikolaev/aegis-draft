import { useEffect } from "react";
import { useRun } from "../state/runStore.ts";
import { useShell } from "../state/shellStore.ts";
import { useTmaChrome } from "../state/tmaChrome.ts";
import { useCareer } from "../state/careerStore.ts";
import { StartScreen } from "../features/start/StartScreen.tsx";
import { ResumeBanner } from "../features/start/ResumeBanner.tsx";
import { RunLinkPrompt } from "../features/start/RunLinkPrompt.tsx";
import { DraftScreen } from "../features/draft/DraftScreen.tsx";
import { TournamentScreen } from "../features/tournament/TournamentScreen.tsx";
import { SettingsScreen } from "../features/settings/SettingsScreen.tsx";
import { HeroesScreen } from "../features/heroes/HeroesScreen.tsx";
import { TeammatesScreen } from "../features/teammates/TeammatesScreen.tsx";
import { CareerScreen } from "../features/career/CareerScreen.tsx";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useTelegramShell } from "../tma/useTelegramShell.ts";
import { Banner, Button } from "../ui/index.ts";
import "./App.css";

export function App() {
  const phase = useRun((s) => s.phase);
  const mode = useRun((s) => s.selectedMode);
  const error = useRun((s) => s.error);
  const loadData = useRun((s) => s.loadData);
  // Гамма всего опыта режима (T5.7): каждый режим несёт свою — Roguelite Run фиолетовую,
  // Manager оранжевую, Real Tournament синюю; Classic/Quick Draft — базовую зелёную (без
  // override). Нейтрально, пока режим не выбран (mode === null): это mode-select и экран выбора
  // варианта. Вешается на весь app-shell, поэтому Settings/справочник, открытые ИЗ режима, тоже
  // наследуют его гамму (карточку варианта Roguelite тегаем отдельно — она на нейтральном экране).
  const modeAccent = mode === "run" ? "violet" : mode === "manager" ? "orange" : mode === "tournament" ? "blue" : undefined;
  const { t } = useI18n();
  const view = useShell((s) => s.view);
  const setView = useShell((s) => s.setView);
  // В TMA настройки уезжают в системное «…»-меню (SettingsButton) — нашу кнопку прячем.
  const settingsInMenu = useTmaChrome((s) => s.settingsInMenu);
  const syncFromHash = useShell((s) => s.syncFromHash);
  const syncLinkFromHash = useRun((s) => s.syncLinkFromHash);

  // Шелл Telegram (кнопка «назад», цвет хедера, подтверждение закрытия). Вне Telegram — no-op.
  useTelegramShell();

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Карьера рисуется из синхронного кэша, а в Telegram он между запусками пустеет (T9.6) —
  // догружаем из CloudStorage. Вне Telegram читает тот же кэш и ничего не меняет.
  useEffect(() => {
    void useCareer.getState().hydrate();
  }, []);

  // Browser Back/Forward и прямое изменение hash должны вести в один и тот же shell-view.
  // pushState из setView обновляет store сам и событий не создаёт — двойного рендера нет.
  useEffect(() => {
    window.addEventListener("popstate", syncFromHash);
    window.addEventListener("hashchange", syncFromHash);
    return () => {
      window.removeEventListener("popstate", syncFromHash);
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, [syncFromHash]);

  // Ссылку на забег могли открыть в УЖЕ открытом приложении: меняется только hash,
  // перезагрузки нет, и loadData повторно не вызывается. Без этого присланная ссылка
  // молча не срабатывала бы у всех, у кого игра уже открыта во вкладке.
  useEffect(() => {
    window.addEventListener("hashchange", syncLinkFromHash);
    return () => window.removeEventListener("hashchange", syncLinkFromHash);
  }, [syncLinkFromHash]);

  return (
    <div className="app-shell" data-accent={modeAccent}>
      <header className="topbar">
        <div className="brand" data-testid="brand">
          <span className="brand__mark" aria-hidden="true">A</span>
          <span className="brand__copy">
            <strong>Aegis Draft</strong>
            <small>{t("brand.kicker")}</small>
          </span>
        </div>
        {/* Язык и тема переехали на отдельную страницу: в топбаре два селекта съедали
            всю ширину на телефоне, а меняют их раз в жизни. В TMA кнопка уезжает в «…»-меню. */}
        {!settingsInMenu && (
          <Button variant="secondary" data-testid="open-settings" onClick={() => setView("settings")}>
            ⚙ {t("shell.menu")}
          </Button>
        )}
      </header>

      {error && (
        <Banner title={t(error === "resume.failed" ? "resume.failed" : "app.error")}>
          {error === "resume.failed" ? null : error}
        </Banner>
      )}

      {view === "settings" ? <SettingsScreen /> : view === "heroes" ? <HeroesScreen /> : view === "teammates" ? <TeammatesScreen /> : view === "career" ? <CareerScreen /> : (
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
