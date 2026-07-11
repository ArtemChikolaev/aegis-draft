import { useEffect } from "react";
import { useRun } from "./state/runStore.ts";
import { StartScreen } from "./ui/StartScreen.tsx";
import { DraftScreen } from "./ui/DraftScreen.tsx";
import { ResultScreen } from "./ui/ResultScreen.tsx";
import { useI18n } from "./i18n/I18nProvider.tsx";
import { useTheme } from "./theme/ThemeProvider.tsx";
import type { Locale } from "./i18n/core.ts";
import type { ThemeMode } from "./theme/core.ts";

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
          <label className="preference">
            <span>{t("shell.language")}</span>
            <select data-testid="locale-select" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
          </label>
          <label className="preference">
            <span>{t("shell.theme")}</span>
            <select data-testid="theme-select" value={mode} onChange={(event) => setMode(event.target.value as ThemeMode)}>
              <option value="system">{t("theme.system")}</option>
              <option value="dark">{t("theme.dark")}</option>
              <option value="light">{t("theme.light")}</option>
            </select>
          </label>
        </div>
      </header>

      {error && <div className="banner banner--error"><strong>{t("app.error")}</strong><span>{error}</span></div>}

      {phase === "loading" && <div className="loading"><span className="loading__orb" />{t("app.loading")}</div>}
      {phase === "start" && <StartScreen />}
      {phase === "draft" && <DraftScreen />}
      {phase === "result" && <ResultScreen />}
      <footer className="footer">{t("footer.note")}</footer>
    </div>
  );
}
