import { useEffect } from "react";
import { useRun } from "../state/runStore.ts";
import { StartScreen } from "../features/start/StartScreen.tsx";
import { ResumeBanner } from "../features/start/ResumeBanner.tsx";
import { DraftScreen } from "../features/draft/DraftScreen.tsx";
import { TournamentScreen } from "../features/tournament/TournamentScreen.tsx";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useTheme } from "../design/theme/ThemeProvider.tsx";
import { Banner, Select } from "../ui/index.ts";
import type { Locale } from "../i18n/core.ts";
import type { ThemeMode } from "../design/theme/core.ts";
import "./App.css";

export function App() {
  const phase = useRun((s) => s.phase);
  const error = useRun((s) => s.error);
  const loadData = useRun((s) => s.loadData);
  const { locale, setLocale, t } = useI18n();
  const { mode, setMode } = useTheme();

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
        <div className="preferences">
          <Select
            label={t("shell.language")}
            value={locale}
            options={[{ value: "ru", label: "RU" }, { value: "en", label: "EN" }]}
            onChange={(value) => setLocale(value as Locale)}
            data-testid="locale-select"
          />
          <Select
            label={t("shell.theme")}
            value={mode}
            options={[
              { value: "system", label: t("theme.system") },
              { value: "dark", label: t("theme.dark") },
              { value: "light", label: t("theme.light") },
            ]}
            onChange={(value) => setMode(value as ThemeMode)}
            data-testid="theme-select"
          />
        </div>
      </header>

      {error && <Banner title={t("app.error")}>{error}</Banner>}

      {phase === "loading" && <div className="loading"><span className="loading__orb" />{t("app.loading")}</div>}
      {phase === "start" && <ResumeBanner />}
      {phase === "start" && <StartScreen />}
      {phase === "draft" && <DraftScreen />}
      {phase === "tournament" && <TournamentScreen />}
      <footer className="footer">{t("footer.note")}</footer>
    </div>
  );
}
