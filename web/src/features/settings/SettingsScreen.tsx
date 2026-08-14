import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useTheme } from "../../design/theme/ThemeProvider.tsx";
import { isCodexLocked, useRun } from "../../state/runStore.ts";
import { useShell } from "../../state/shellStore.ts";
import { navigateBack } from "../../state/navigation.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { Banner, Button, Eyebrow, Modal, OptionGroup, Surface, useScreenShakeSetting } from "../../ui/index.ts";
import { useInstallApp } from "../../state/installApp.ts";
import { clearOfflineCache, formatBytes, readOfflineStatus, shortHash, type OfflineStatus } from "../../state/offlineStatus.ts";
import { ensureOfflinePack } from "../../state/serviceWorker.ts";
import type { Locale, MessageKey } from "../../i18n/core.ts";
import type { ThemeMode } from "../../design/theme/core.ts";
import "./settings.css";

/** Настройки приложения + паспорт датасета. Забег продолжает жить в своём сторе: сюда
 *  можно уйти и вернуться из любой фазы, ничего не теряя. */
export function SettingsScreen() {
  const { locale, setLocale, t } = useI18n();
  const { mode, setMode } = useTheme();
  const setView = useShell((state) => state.setView);
  const backNative = useTmaChrome((state) => state.backNative);
  const manifest = useRun((state) => state.data?.manifest);
  const locked = isCodexLocked(useRun((state) => state.config), useRun((state) => state.phase), useRun((state) => state.resumable));
  // Тряска экрана (R15.4) — отдельный тумблер, как в Balatro: не хотеть тряску ≠ reduced-motion.
  const [shakeEnabled, setShakeEnabled] = useScreenShakeSetting();

  // Офлайн-копия (T11.4). Статус читается из настоящих кэшей, а не хранится где-то рядом:
  // иначе он расходится с реальностью ровно в тот момент, когда важен.
  const [offline, setOffline] = useState<OfflineStatus | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [clearGate, setClearGate] = useState(false);
  const refreshStatus = useCallback(() => { void readOfflineStatus().then(setOffline); }, []);
  // Пока копия не собрана, статус ПЕРЕЧИТЫВАЕМ: игрок часто открывает настройки сразу после
  // первого захода, а копия в этот момент ещё качается — без опроса он видел бы «копии нет»
  // до самого ухода с экрана (поймано офлайн-спекой T11.5). Готовая копия сама не меняется:
  // дальше её трогают только кнопки на этом же экране, поэтому опрос останавливается.
  useEffect(() => {
    refreshStatus();
    if (offline?.state === "ready" || offline?.state === "unsupported") return;
    const timer = setInterval(refreshStatus, 2000);
    return () => clearInterval(timer);
  }, [refreshStatus, offline?.state]);
  // Незавершённый забег держит старый датасет (смена dataHash обнуляет сейв), поэтому кнопка
  // «обновить» честно предупреждает, а не молча ничего не делает.
  //
  // Хуки вызываются ОТДЕЛЬНО, а не внутри `||`: короткое замыкание пропускало второй `useRun`,
  // число хуков между рендерами менялось, и React рушил экран (ошибка #310). Ловится только
  // когда первый операнд истинен — то есть при заходе в настройки НЕ со старт-экрана; ручная
  // проверка со старта этого не видела, поймала офлайн-спека T11.5.
  const phase = useRun((state) => state.phase);
  const resumable = useRun((state) => state.resumable);
  const runUnfinished = phase !== "start" || resumable !== null;
  const installApp = useInstallApp();

  const onOfflineRefresh = async () => {
    setOfflineBusy(true);
    // allowSwap=true: это явное решение игрока, ради него кнопка и существует.
    await ensureOfflinePack(true);
    // Загрузка идёт в воркере — статус подтягиваем с небольшой задержкой, иначе прочитаем «до».
    setTimeout(() => { refreshStatus(); setOfflineBusy(false); }, 2500);
  };

  const onOfflineClear = async () => {
    setClearGate(false);
    setOfflineBusy(true);
    await clearOfflineCache();
    refreshStatus();
    setOfflineBusy(false);
  };

  // `offline === null` — статус ещё не прочитан. Это НЕ «недоступно»: показывать отказ до
  // первого чтения значит врать про самое интересное состояние (замер 2026-08-14).
  const offlineStateLabel: MessageKey = offline === null ? "offline.stateChecking"
    : offline.state === "ready" ? "offline.stateReady"
    : offline.state === "partial" ? "offline.statePartial"
    : offline.state === "none" ? "offline.stateNone"
    : "offline.stateUnsupported";
  const offlineActionsBusy = offlineBusy || offline === null;

  return (
    <main className="settings" data-testid="settings-screen">
      {!backNative && <Button variant="back" onClick={navigateBack}>← {t("settings.back")}</Button>}
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
        <OptionGroup
          title={t("settings.shake")}
          soonLabel={t("common.soon")}
          options={[
            { value: "on", label: t("common.on"), hint: t("settings.shakeHint") },
            { value: "off", label: t("common.off") },
          ]}
          value={shakeEnabled ? "on" : "off"}
          onChange={(value) => setShakeEnabled(value === "on")}
        />
      </Surface>

      {/* Справочник — отсюда же, чтобы вход в приложение был один: шестерёнка в топбаре. */}
      <Surface className="settings__panel">
        <h2 className="settings__section">{t("codex.eyebrow")}</h2>
        <nav className="settings__links">
          {/* Правила режимов замком НЕ закрываются: они объясняют механику и не раскрывают
              ничего про конкретных игроков — хардкор прячет данные, а не правила игры. */}
          <button type="button" className="settings__link" data-testid="open-rules" onClick={() => setView("rules")}>
            <span>
              <strong>{t("rules.tile")}</strong>
              <small>{t("rules.tileHint")}</small>
            </span>
            <em>→</em>
          </button>
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

      {/* История — отдельной секцией от справочника: это твои данные, а не сведения о сцене. */}
      <Surface className="settings__panel">
        <h2 className="settings__section">{t("career.eyebrow")}</h2>
        <nav className="settings__links">
          <button type="button" className="settings__link" data-testid="open-career" disabled={locked} onClick={() => setView("career")}>
            <span>
              <strong>{t("codex.career")}{locked && <span className="settings__lock" aria-hidden="true"> 🔒</span>}</strong>
              <small>{t("codex.careerHint")}</small>
            </span>
            <em>→</em>
          </button>
        </nav>
        {locked && (
          <Banner tone="locked" title={<>🔒 {t("codex.locked")}</>}>
            {t("career.lockedHistory")}
          </Banner>
        )}
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

      {/* Офлайн-копия (T11.4). Рядом с паспортом данных намеренно: это тот же датасет, только
          вопрос не «какой он», а «доедет ли он со мной в самолёт». */}
      <Surface className="settings__panel">
        <h2 className="settings__section">{t("offline.section")}</h2>
        <dl className="settings__facts" data-testid="offline-facts">
          <div>
            <dt>{t("offline.status")}</dt>
            <dd data-testid="offline-state" data-state={offline?.state ?? "checking"}>{t(offlineStateLabel)}</dd>
          </div>
          {offline?.datasetBuiltAt && (
            <div>
              <dt>{t("offline.cachedDataset")}</dt>
              <dd>{new Date(offline.datasetBuiltAt).toLocaleDateString(locale)} · {shortHash(offline.datasetHash)}</dd>
            </div>
          )}
          {formatBytes(offline?.usageBytes ?? null) && (
            <div><dt>{t("offline.usage")}</dt><dd>{formatBytes(offline?.usageBytes ?? null)}</dd></div>
          )}
        </dl>

        {offline?.state !== "unsupported" && offline !== null && (
          <div className="settings__actions">
            {/* Во время незавершённого забега кнопка НЕДОСТУПНА, а не «нажимается вхолостую»:
                смена dataHash обнулила бы сейв, и тихо подменять данные под игроком нельзя. */}
            <Button variant="secondary" data-testid="offline-refresh" disabled={offlineActionsBusy || runUnfinished} onClick={() => void onOfflineRefresh()}>
              {t(offlineBusy ? "offline.working" : "offline.refresh")}
            </Button>
            <Button variant="secondary" data-testid="offline-clear" disabled={offlineActionsBusy || offline?.state === "none"} onClick={() => setClearGate(true)}>
              {t("offline.clear")}
            </Button>
          </div>
        )}

        {runUnfinished && offline?.state !== "unsupported" && (
          <Banner tone="locked" title={t("offline.runLockedTitle")} data-testid="offline-run-locked">
            {t("offline.runLocked")}
          </Banner>
        )}

        {/* Установка на устройство: на Android системный промпт, на iOS его нет в природе —
            там только инструкция. Уже установленному ничего не показываем. */}
        {installApp.canPrompt && (
          <div className="settings__actions">
            <Button data-testid="offline-install" onClick={() => void installApp.promptInstall()}>{t("offline.install")}</Button>
          </div>
        )}
        {!installApp.canPrompt && installApp.manualIos && (
          <Banner tone="locked" title={t("offline.installIosTitle")} data-testid="offline-install-ios">
            {t("offline.installIos")}
          </Banner>
        )}

        <p className="settings__source">
          {t(offline?.state === "unsupported" ? "offline.unsupportedHint" : "offline.hint")}
        </p>
      </Surface>

      {/* Подтверждение: удалить копию — не потеря сейвов (они в localStorage), но потеря
          готовности к офлайну и трафик на повторную закачку. Молча такое не делают. */}
      {clearGate && (
        <Modal
          mark="✕"
          title={t("offline.clearTitle")}
          description={t("offline.clearText")}
          labelledBy="offline-clear-title"
          dismissLabel={t("common.close")}
          layout="content"
          onClose={() => setClearGate(false)}
        >
          {() => (
            <Button variant="danger" data-testid="offline-clear-confirm" onClick={() => void onOfflineClear()}>
              {t("offline.clear")}
            </Button>
          )}
        </Modal>
      )}
    </main>
  );
}
