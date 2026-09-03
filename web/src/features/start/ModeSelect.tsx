// Выбор верхнеуровневого режима (Classic / Manager / Real Tournament / Arena / Duel).
// Вынесен из StartScreen.tsx (T12.5, 2026-09-02) без изменения разметки.
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun } from "../../state/runStore.ts";
import { useConnectivity } from "../../state/connectivity.ts";
import { isApiConfigured } from "../../data/api/index.ts";
import { Eyebrow } from "../../ui/index.ts";
import { MODES } from "./startOptions.ts";

export function ModeSelect() {
  const { t } = useI18n();
  const setMode = useRun((state) => state.setSelectedMode);
  const setStartStep = useRun((state) => state.setStartStep);
  const setConfig = useRun((state) => state.setStartConfig);
  const offline = useConnectivity((state) => state.status) === "offline";

  return (
    <main className="mode-select">
      <header className="mode-select__heading">
        <Eyebrow className="ms-eyebrow">{t("start.chooseModeEyebrow")}</Eyebrow>
        <h1>{t("start.chooseModeTitle")}</h1>
        <p>{t("start.chooseModeText")}</p>
      </header>
      <div className="mode-grid">
        {MODES.map((item, index) => (
          <button
            key={item.value}
            className={`mode-card mode-card--${item.value}`}
            data-testid={`mode-${item.value}`}
            // Карточка остаётся кликабельной и в офлайне: она ведёт на экран, который объясняет
            // причину и даёт повторить проверку. Мёртвый клик — это молчание, а не переход.
            data-offline={item.needsNetwork && offline ? "true" : undefined}
            onClick={() => {
              if (item.value === "classic") setStartStep("variants");
              else if (item.value === "tournament") {
                // Challenger-драфт mixed по МЕХАНИКЕ, но с event-скорингом (RT-B) — оси
                // draftStyle/scoring в RT скрыты, поэтому фиксируем их на входе.
                setConfig((current) => ({ ...current, draftStyle: "mixed", scoring: "event", hardMode: false, cheatMode: false }));
                setMode("tournament");
                setStartStep("config");
              } else setMode(item.value);
            }}
          >
            <span className="mode-card__index">0{index + 1}</span>
            <span className="mode-card__body"><strong>{t(item.label)}</strong><small>{t(item.hint)}</small><span>{t(item.detail)}</span></span>
            {item.needsNetwork && offline
              ? <em data-offline="true">{t("common.offline")}</em>
              : !(item.value === "arena" ? isApiConfigured() : item.available) && <em>{t("common.soon")}</em>}
            <span className="mode-card__action">{t("start.selectMode")} →</span>
          </button>
        ))}
      </div>
    </main>
  );
}
