import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useTheme } from "../../design/theme/ThemeProvider.tsx";
import { isCodexLocked, useRun } from "../../state/runStore.ts";
import { useShell } from "../../state/shellStore.ts";
import { Banner, Button, Eyebrow, OptionGroup, Surface } from "../../ui/index.ts";
import type { Locale } from "../../i18n/core.ts";
import type { ThemeMode } from "../../design/theme/core.ts";
import "./settings.css";

/** Настройки приложения + паспорт датасета. Забег продолжает жить в своём сторе: сюда
 *  можно уйти и вернуться из любой фазы, ничего не теряя. */
export function SettingsScreen() {
  const { locale, setLocale, t } = useI18n();
  const { mode, setMode } = useTheme();
  const setView = useShell((state) => state.setView);
  const manifest = useRun((state) => state.data?.manifest);
  const locked = isCodexLocked(useRun((state) => state.config), useRun((state) => state.phase), useRun((state) => state.resumable));

  return (
    <main className="settings" data-testid="settings-screen">
      <Button variant="back" onClick={() => setView("game")}>← {t("settings.back")}</Button>
      <header className="screen-heading">
        <Eyebrow>{t("settings.eyebrow")}</Eyebrow>
        <h1>{t("settings.title")}</h1>
      </header>

      <Surface className="settings__panel">
        <OptionGroup
          title={t("shell.language")}
          soonLabel={t("common.soon")}
          // Названия языков НЕ переводим: в переключателе языка каждый подписан на себе —
          // иначе тот, кто не читает текущий язык, не найдёт свой.
          options={[
            { value: "ru", label: "Русский" },
            { value: "en", label: "English" },
          ]}
          value={locale}
          onChange={(value) => setLocale(value as Locale)}
        />
        <OptionGroup
          title={t("shell.theme")}
          soonLabel={t("common.soon")}
          options={[
            { value: "system", label: t("theme.system"), hint: t("settings.themeSystemHint") },
            { value: "dark", label: t("theme.dark") },
            { value: "light", label: t("theme.light") },
          ]}
          value={mode}
          onChange={(value) => setMode(value as ThemeMode)}
        />
      </Surface>

      {/* Справочник — отсюда же, чтобы вход в приложение был один: шестерёнка в топбаре. */}
      <Surface className="settings__panel">
        <h2 className="settings__section">{t("codex.eyebrow")}</h2>
        <nav className="settings__links">
          <button type="button" className="settings__link" data-testid="open-heroes" disabled={locked} onClick={() => setView("heroes")}>
            <span>
              <strong>{t("codex.heroes")}{locked && <span className="settings__lock" aria-hidden="true"> 🔒</span>}</strong>
              <small>{t("codex.heroesHint")}</small>
            </span>
            <em>→</em>
          </button>
          {/* Плитка не просто помечена — она недоступна: иначе «закрыто» остаётся словами. */}
          <button
            type="button"
            className="settings__link"
            data-testid="open-teammates"
            disabled={locked}
            onClick={() => setView("teammates")}
          >
            <span>
              <strong>{t("codex.teammates")}{locked && <span className="settings__lock" aria-hidden="true"> 🔒</span>}</strong>
              <small>{t("codex.teammatesHint")}</small>
            </span>
            <em>→</em>
          </button>
        </nav>
        {/* Причина — под плитками: сами плитки остаются обычными, просто недоступными. */}
        {locked && <Banner tone="locked" title={<>🔒 {t("codex.locked")}</>}>{t("codex.lockedTiles")}</Banner>}
      </Surface>

      {/* Паспорт данных: по какому срезу играем. Версии — те же поля, что решают
          совместимость сейва (state/runPersist), поэтому полезны и при разборе багов. */}
      <Surface className="settings__panel">
        <h2 className="settings__section">{t("settings.dataset")}</h2>
        {manifest ? (
          <dl className="settings__facts">
            <div><dt>{t("settings.datasetBuilt")}</dt><dd>{new Date(manifest.builtAt).toLocaleString(locale)}</dd></div>
            <div><dt>{t("settings.datasetSchema")}</dt><dd>{manifest.schemaVersion}</dd></div>
            <div><dt>{t("settings.datasetRating")}</dt><dd>{manifest.ratingModelVersion}</dd></div>
          </dl>
        ) : <p className="muted">{t("common.empty")}</p>}
        <p className="settings__source">{t("settings.source")}</p>
      </Surface>
    </main>
  );
}
