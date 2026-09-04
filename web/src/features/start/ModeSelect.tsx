// Выбор верхнеуровневого режима: СПИСОК строк + панель-превью (2026-09-05, решение владельца: шесть
// карточек в ряд — перебор). Строка несёт цвет и имя режима, панель — арт и длинное описание того,
// на что наведён курсор (или что выбрано клавиатурой); клик по строке входит в режим сразу — так
// e2e и тач-устройства (без hover) работают как раньше. На узком экране панели нет: строки
// показывают подсказку сами.
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun, type RunMode } from "../../state/runStore.ts";
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
  const [focused, setFocused] = useState<RunMode>(MODES[0].value);
  const preview = MODES.find((item) => item.value === focused) ?? MODES[0];
  const previewIndex = MODES.indexOf(preview);
  const previewSoon = !(preview.value === "arena" ? isApiConfigured() : preview.available);

  const enter = (value: RunMode) => {
    if (value === "classic") setStartStep("variants");
    else if (value === "tournament") {
      // Challenger-драфт mixed по МЕХАНИКЕ, но с event-скорингом (RT-B) — оси
      // draftStyle/scoring в RT скрыты, поэтому фиксируем их на входе.
      setConfig((current) => ({ ...current, draftStyle: "mixed", scoring: "event", hardMode: false, cheatMode: false }));
      setMode("tournament");
      setStartStep("config");
    } else setMode(value);
  };

  return (
    <main className="mode-select">
      <header className="mode-select__heading">
        <Eyebrow className="ms-eyebrow">{t("start.chooseModeEyebrow")}</Eyebrow>
        <h1>{t("start.chooseModeTitle")}</h1>
        <p>{t("start.chooseModeText")}</p>
      </header>
      <div className="mode-menu">
        <ul className="mode-list" role="list">
          {MODES.map((item, index) => {
            const soon = !(item.value === "arena" ? isApiConfigured() : item.available);
            const isOffline = item.needsNetwork === true && offline;
            return (
              <li key={item.value}>
                <button
                  type="button"
                  className={`mode-row mode-row--${item.value}`}
                  data-testid={`mode-${item.value}`}
                  data-active={item.value === focused ? "true" : undefined}
                  // Строка остаётся кликабельной и в офлайне: она ведёт на экран, который объясняет
                  // причину и даёт повторить проверку. Мёртвый клик — это молчание, а не переход.
                  data-offline={isOffline ? "true" : undefined}
                  onMouseEnter={() => setFocused(item.value)}
                  onFocus={() => setFocused(item.value)}
                  onClick={() => enter(item.value)}
                >
                  <span className="mode-row__index">0{index + 1}</span>
                  <span className="mode-row__swatch" aria-hidden="true" />
                  <span className="mode-row__body">
                    <strong>{t(item.label)}</strong>
                    <small>{t(item.hint)}</small>
                  </span>
                  {isOffline ? <em data-offline="true">{t("common.offline")}</em> : soon && <em>{t("common.soon")}</em>}
                  <span className="mode-row__arrow" aria-hidden="true">→</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className={`mode-stage mode-card mode-card--${preview.value}`}
          data-testid="mode-preview"
          onClick={() => enter(preview.value)}
        >
          <span className="mode-card__index">0{previewIndex + 1}</span>
          <span className="mode-card__body"><strong>{t(preview.label)}</strong><small>{t(preview.hint)}</small><span>{t(preview.detail)}</span></span>
          {preview.needsNetwork && offline
            ? <em data-offline="true">{t("common.offline")}</em>
            : previewSoon && <em>{t("common.soon")}</em>}
          <span className="mode-card__action">{t("start.selectMode")} →</span>
        </button>
      </div>
    </main>
  );
}
