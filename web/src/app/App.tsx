import { useEffect } from "react";
import { useRun } from "../state/runStore.ts";
import { useShell } from "../state/shellStore.ts";
import { useTmaChrome } from "../state/tmaChrome.ts";
import { useCareer } from "../state/careerStore.ts";
import { useManager } from "../state/managerStore.ts";
import { ensureOfflinePack, useServiceWorker } from "../state/serviceWorker.ts";
import { StartScreen } from "../features/start/StartScreen.tsx";
import { ManagerResumeBanner, ResumeBanner } from "../features/start/ResumeBanner.tsx";
import { RunLinkPrompt } from "../features/start/RunLinkPrompt.tsx";
import { DraftScreen } from "../features/draft/DraftScreen.tsx";
import { PrepScreen } from "../features/prep/PrepScreen.tsx";
import { TournamentScreen } from "../features/tournament/TournamentScreen.tsx";
import { CampScreen } from "../features/run/CampScreen.tsx";
import { SettingsScreen } from "../features/settings/SettingsScreen.tsx";
import { HeroesScreen } from "../features/heroes/HeroesScreen.tsx";
import { TeammatesScreen } from "../features/teammates/TeammatesScreen.tsx";
import { CareerScreen } from "../features/career/CareerScreen.tsx";
import { RulesScreen } from "../features/rules/RulesScreen.tsx";
import { ManagerScreen } from "../features/manager/ManagerScreen.tsx";
import { DuelScreen } from "../features/duel/DuelScreen.tsx";
import { ArenaDraftScreen } from "../features/arena/ArenaDraftScreen.tsx";
import { useArena } from "../state/arenaStore.ts";
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
  const modeAccent = mode === "run" ? "violet" : mode === "manager" ? "orange" : mode === "tournament" ? "blue" : mode === "arena" ? "red" : undefined;
  // Тот же атрибут дублируем на <body>, потому что модалки рендерятся ПОРТАЛОМ в body и вне
  // `.app-shell` гамму режима уже не наследуют: в Roguelite Run свечение модалки возвращалось к
  // базовому зелёному (плейтест 2026-08-05). Токены — обычные наследуемые custom properties,
  // поэтому объявления на body хватает и порталу, и самому шеллу.
  useEffect(() => {
    if (modeAccent) document.body.dataset.accent = modeAccent;
    else delete document.body.dataset.accent;
    return () => { delete document.body.dataset.accent; };
  }, [modeAccent]);
  const { t } = useI18n();
  // Arena MP2: пока идёт общий драфт комнаты, место старт-экрана занимает экран драфта —
  // но только у СИДЯЩИХ (зритель остаётся в лобби). Serial — подписка на мутации движка.
  const arenaMatch = useArena((s) => s.match);
  const arenaSelfId = useArena((s) => s.selfId);
  useArena((s) => s.serial);
  const arenaDrafting = mode === "arena" && phase === "start" && arenaMatch !== null
    && arenaSelfId !== null && arenaMatch.engine.seatOf(arenaSelfId) !== null;
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

  // Офлайн-копия датасета (T11.1). Незавершённый забег держит СТАРЫЙ набор: смена dataHash
  // инвалидирует сейв (runPersist, BUG-2026-07-23; у Manager своя такая же сверка), поэтому
  // «можно менять» = ни активной фазы, ни сейва, который игрок ещё может продолжить.
  // Обновится сразу, как забег закончится: эффект пересчитается на смене этих же признаков.
  const data = useRun((s) => s.data);
  const resumable = useRun((s) => s.resumable);
  const managerResumable = useManager((s) => s.resumable);
  const managerEngine = useManager((s) => s.engine);
  const runUnfinished = phase === "draft" || phase === "prep" || phase === "tournament" || phase === "camp"
    || resumable !== null || managerResumable !== null || managerEngine !== null;
  useEffect(() => {
    if (data) void ensureOfflinePack(!runUnfinished);
  }, [data, runUnfinished]);

  // Обновление приложения применяет игрок и только на старт-экране: подменять код посреди
  // драфта нельзя (перезагрузка обрывает то, что игрок сейчас делает).
  const updateReady = useServiceWorker((s) => s.updateReady);
  const applyUpdate = useServiceWorker((s) => s.applyUpdate);

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
    <div
      className={`app-shell${phase === "camp" && view === "game" ? " app-shell--camp" : ""}`}
      data-accent={modeAccent}
    >
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

      {updateReady && phase === "start" && (
        <Banner tone="locked" title={t("update.title")} data-testid="update-banner">
          {t("update.text")}{" "}
          <Button variant="secondary" data-testid="update-apply" onClick={applyUpdate}>{t("update.apply")}</Button>
        </Banner>
      )}

      {view === "settings" ? <SettingsScreen /> : view === "heroes" ? <HeroesScreen /> : view === "teammates" ? <TeammatesScreen /> : view === "career" ? <CareerScreen /> : view === "rules" ? <RulesScreen /> : (
        /* Смена фазы (этап ↔ Буткемп, драфт → турнир) — мягкий фейд вместо мгновенной подмены
           (хвост R15.2). key={phase} перемонтирует обёртку и переигрывает enter-fade; экраны и
           так меняют компонент при смене фазы, лишних перемонтирований это не добавляет. */
        <div className="enter-fade" key={mode === "manager" ? "manager" : mode === "duel" ? "duel" : phase}>
          {/* Manager — свой мир со своим long-save: фазы classic-забега его не касаются.
              Плашки resume висят и над его онбордингом — как на остальных start-экранах. */}
          {mode === "manager" && phase === "start" ? (
            <>
              <ResumeBanner />
              <ManagerResumeBanner />
              <ManagerScreen />
            </>
          ) : mode === "duel" && phase === "start" ? (
            /* Дуэль (M-DUEL) — как Manager: свой мир, фазы classic-забега его не касаются.
               Персиста у hotseat-серии нет, поэтому и resume-плашек над ней нет. */
            <DuelScreen />
          ) : (
            <>
              {/* T7.3: упавшая загрузка данных — не вечная орбита, а retry. Баннер с причиной
                  уже висит выше; здесь — действие, иначе первый визит без сети упирался в тупик. */}
              {phase === "loading" && (error
                ? (
                  <div className="loading">
                    <Button variant="primary" data-testid="retry-load" onClick={() => void loadData()}>
                      ↻ {t("app.retry")}
                    </Button>
                  </div>
                )
                : <div className="loading"><span className="loading__orb" />{t("app.loading")}</div>)}
              {phase === "start" && !arenaDrafting && <ResumeBanner />}
              {phase === "start" && !arenaDrafting && <ManagerResumeBanner />}
              {phase === "start" && (arenaDrafting ? <ArenaDraftScreen /> : <StartScreen />)}
              {phase === "draft" && <DraftScreen />}
              {phase === "prep" && <PrepScreen />}
              {phase === "tournament" && <TournamentScreen />}
              {phase === "camp" && <CampScreen />}
            </>
          )}
        </div>
      )}
      {/* Вне переключателя вида: ссылку могли открыть, стоя на любом экране, и предложение
          не должно зависеть от того, где игрок находится. */}
      <RunLinkPrompt />
      <footer className="footer">{t("footer.note")}</footer>
    </div>
  );
}
