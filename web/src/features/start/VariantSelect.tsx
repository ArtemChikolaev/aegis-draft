// Шаг выбора варианта Classic (Quick Draft / Roguelite Run) + дейлик (PRD §5.14).
// Вынесен из StartScreen.tsx (T12.5, 2026-09-02) без изменения разметки.
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/core.ts";
import { useRun } from "../../state/runStore.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { useCareer } from "../../state/careerStore.ts";
import { DAILY_CONFIG, dailyDateKey, dailySeed, formatDailyDate } from "../../game/daily.ts";
import { Button, Eyebrow, Surface } from "../../ui/index.ts";
import { ROGUELITE_REROLLS } from "./startOptions.ts";

export function VariantSelect() {
  const { t, locale } = useI18n();
  const start = useRun((state) => state.start);
  const data = useRun((state) => state.data);
  const setMode = useRun((state) => state.setSelectedMode);
  const setStartStep = useRun((state) => state.setStartStep);
  const setConfig = useRun((state) => state.setStartConfig);
  // В TMA «назад» в выбор режимов даёт телеграмная кнопка — свою прячем (нативный хром).
  const backNative = useTmaChrome((state) => state.backNative);
  // Дейлик (PRD §5.14): фиксированный конфиг Quick Draft + сид дня. Запись сегодняшнего
  // результата ищем в карьере по сиду — это и есть вся «серверная» часть дейлика.
  const todaySeed = dailySeed();
  const todayEntry = useCareer((state) => state.entries.find((entry) => entry.seed === todaySeed) ?? null);
  const onDaily = () => {
    setMode("classic");
    start(DAILY_CONFIG, todaySeed);
  };

  return (
    <main className="mode-select variant-select">
      {!backNative && <Button variant="back" onClick={() => setStartStep("modes")}>← {t("start.backToModes")}</Button>}
      <header className="mode-select__heading">
        <Eyebrow className="ms-eyebrow">{t("start.modeClassic")}</Eyebrow>
        <h1>{t("start.variantTitle")}</h1>
        <p>{t("start.variantText")}</p>
      </header>
      <div className="mode-grid variant-grid">
        <button
          className="mode-card mode-card--quick"
          data-testid="variant-quick"
          onClick={() => { setMode("classic"); setStartStep("config"); }}
        >
          <span className="mode-card__index">A</span>
          <span className="mode-card__body"><strong>{t("start.variantQuick")}</strong><small>{t("start.variantQuickHint")}</small><span>{t("start.variantQuickLong")}</span></span>
          <span className="mode-card__action">{t("start.variantAction")} →</span>
        </button>
        <button
          className="mode-card mode-card--run"
          data-testid="variant-run"
          data-accent="violet"
          onClick={() => { setConfig((current) => ({ ...current, rerolls: ROGUELITE_REROLLS, hardMode: false })); setMode("run"); setStartStep("config"); }}
        >
          <span className="mode-card__index">B</span>
          <span className="mode-card__body"><strong>{t("start.modeRun")}</strong><small>{t("start.modeRunHint")}</small><span>{t("start.modeRunLong")}</span></span>
          <span className="mode-card__action">{t("start.variantAction")} →</span>
        </button>
      </div>
      <Surface className="daily-card" data-testid="daily-card">
        <div className="daily-card__copy">
          <Eyebrow>{t("daily.title")}</Eyebrow>
          <p>{t("daily.text")}</p>
          {todayEntry && (
            <p className="daily-card__status" data-testid="daily-status">
              {t("daily.playedToday", { place: t(`tournament.place.${todayEntry.placement}` as MessageKey) })}
            </p>
          )}
        </div>
        <Button variant="primary" data-testid="daily-play" disabled={!data} onClick={onDaily}>
          {t("daily.play", { date: formatDailyDate(dailyDateKey(), locale) })}
        </Button>
      </Surface>
    </main>
  );
}
