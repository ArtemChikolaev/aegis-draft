// Превью режима без Classic-конфига (Arena-лобби / «скоро» / состояние сети).
// Вынесен из StartScreen.tsx (T12.5, 2026-09-02) без изменения разметки.
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useRun, type RunMode } from "../../state/runStore.ts";
import { useConnectivity } from "../../state/connectivity.ts";
import { useTmaChrome } from "../../state/tmaChrome.ts";
import { isApiConfigured } from "../../data/api/index.ts";
import { Button, Eyebrow } from "../../ui/index.ts";
import { ArenaLobby } from "./ArenaLobby.tsx";
import { MODES } from "./startOptions.ts";

export function ModePreview({ mode }: { mode: RunMode }) {
  const { t } = useI18n();
  const setMode = useRun((state) => state.setSelectedMode);
  const setStartStep = useRun((state) => state.setStartStep);
  const backNative = useTmaChrome((state) => state.backNative);
  const connectivity = useConnectivity((state) => state.status);
  const checkingConnectivity = useConnectivity((state) => state.checking);
  const connectivityChecked = useConnectivity((state) => state.checkedAt > 0);
  const checkConnectivity = useConnectivity((state) => state.check);
  const offline = connectivity === "offline";
  const selectedMode = MODES.find((item) => item.value === mode)!;
  // Состояние сети занимает панель, а не заголовок: пока режим сам «в разработке», сеть — не
  // главная причина недоступности, и подменять ею заголовок было бы полуправдой.
  //
  // `checking` — отдельное состояние, а не «пока считаем, что всё хорошо»: молчащий сервер
  // держит вердикт до 3с, и без него экран сначала показывал бы обещание режима, а потом
  // прыгал на «нет сети» (поймано живьём на недоступном API 2026-08-14).
  const netState = selectedMode.needsNetwork !== true
    ? "ok"
    : offline ? "offline" : (checkingConnectivity && !connectivityChecked ? "checking" : "ok");
  return (
    <main className={`mode-preview mode-preview--${mode}`}>
      {!backNative && <Button variant="back" onClick={() => { setMode(null); setStartStep("modes"); }}>← {t("start.backToModes")}</Button>}
      <Eyebrow className="mp-eyebrow">{t(selectedMode.label)}</Eyebrow>
      {/* Arena при сконфигуренном API — играбельный режим (MP1), а не превью «в разработке». */}
      <h1>{t(mode === "arena" && isApiConfigured() ? "start.modeArena" : "start.comingSoon")}</h1>
      <p className="mp-text">{t(selectedMode.detail)}</p>
      {netState === "ok" ? (
        mode === "arena" && isApiConfigured() ? (
          <ArenaLobby />
        ) : (
          <div className="mode-preview__art"><strong>{t(selectedMode.label)}</strong><span>{t("start.comingSoonText")}</span></div>
        )
      ) : (
        <div className="mode-preview__art mode-preview__art--network" data-state={netState} data-testid="mode-network">
          <strong>{t(netState === "checking" ? "start.offlineChecking" : "common.offline")}</strong>
          <div className="mode-preview__retry">
            <span>{t("start.offlineText")}</span>
            {netState === "offline" && (
              <Button
                variant="primaryInvert"
                data-testid="offline-retry"
                disabled={checkingConnectivity}
                onClick={() => { void checkConnectivity({ force: true }); }}
              >
                {t(checkingConnectivity ? "start.offlineChecking" : "start.offlineRetry")}
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
