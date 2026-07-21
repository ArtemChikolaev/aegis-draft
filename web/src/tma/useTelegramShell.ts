import { useEffect, useState } from "react";
import { canGoBack, navigateBack } from "../state/navigation.ts";
import { useRun } from "../state/runStore.ts";
import { useShell } from "../state/shellStore.ts";
import { useTmaChrome } from "../state/tmaChrome.ts";
import { applyTelegramInsets, loadTelegram, shellBackgroundColor, tgSafe, type TelegramEvent, type TelegramWebApp } from "./telegram.ts";

/**
 * Связывает шелл Telegram с нашим состоянием (T9.4/T9.5). Вызывается один раз из App;
 * вне Telegram каждый эффект выходит на первой строке, поэтому обычный веб не платит ничего.
 */
export function useTelegramShell(): void {
  const view = useShell((s) => s.view);
  const setView = useShell((s) => s.setView);
  const phase = useRun((s) => s.phase);
  const selectedMode = useRun((s) => s.selectedMode);
  const [app, setApp] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    let alive = true;
    void loadTelegram().then((webApp) => {
      if (!alive || !webApp) return;
      tgSafe(() => webApp.ready());
      tgSafe(() => webApp.expand());
      // Свайп вниз в Telegram закрывает приложение. У нас на этом же жесте живут скроллы
      // списков и drag-to-dismiss у модалки — без этого вызова игрок закрывал бы игру,
      // пытаясь пролистать пак.
      tgSafe(() => webApp.disableVerticalSwipes?.());
      setApp(webApp);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Кнопка «назад» Telegram — единственный back в TMA (браузерного хрома нет), поэтому она
  // делегирует в navigateBack — ОДИН источник правды о навигации (state/navigation.ts), а не
  // своя логика «куда возвращаться» в адаптере.
  useEffect(() => {
    if (!app) return;
    const onBack = () => navigateBack();
    tgSafe(() => app.BackButton.onClick(onBack));
    return () => tgSafe(() => app.BackButton.offClick(onBack));
  }, [app]);

  // Показываем «назад» не только на видах, но и на экране деталей режима (баг: там был Close
  // вместо Back). В корне (picker) и в самом забеге — прячем (там Close + closing-confirm).
  useEffect(() => {
    if (!app) return;
    tgSafe(() => (canGoBack() ? app.BackButton.show() : app.BackButton.hide()));
  }, [app, view, selectedMode, phase]);

  // Настройки — в системное «…»-меню Telegram (SettingsButton). Пока меню активно, прячем
  // нашу кнопку в топбаре (флаг settingsInMenu). На старых клиентах SettingsButton нет —
  // флаг остаётся false, наша кнопка на месте (фолбэк).
  useEffect(() => {
    if (!app) return;
    const settings = app.SettingsButton;
    if (!settings) return;
    const onSettings = () => setView("settings");
    tgSafe(() => settings.onClick(onSettings));
    tgSafe(() => settings.show());
    useTmaChrome.getState().setSettingsInMenu(true);
    return () => {
      tgSafe(() => settings.offClick(onSettings));
      tgSafe(() => settings.hide());
      useTmaChrome.getState().setSettingsInMenu(false);
    };
  }, [app, setView]);

  // Fullscreen (T9.10). В fullscreen приложение уезжает во весь холст, а кнопки Telegram
  // (back/collapse/…) становятся ПЛАВАЮЩИМИ поверх нашего верха. requestFullscreen есть с
  // Bot API 8.0 — на старых клиентах и десктопе метода нет, tgSafe оставит нас в Fullsize.
  // Место под контролами приходит инсетами (safeAreaInset + contentSafeAreaInset) → в CSS-
  // переменные `--tg-safe-*`, которые читает вёрстка (топбар/модалка отодвигаются). Инсеты
  // меняются на лету (вход в fullscreen, поворот) — пересчитываем по событиям.
  useEffect(() => {
    if (!app) return;
    tgSafe(() => app.requestFullscreen?.());
    const apply = () => applyTelegramInsets(app);
    apply();
    const events: TelegramEvent[] = ["fullscreenChanged", "safeAreaChanged", "contentSafeAreaChanged"];
    events.forEach((event) => tgSafe(() => app.onEvent(event, apply)));
    return () => events.forEach((event) => tgSafe(() => app.offEvent(event, apply)));
  }, [app]);

  // Тема остаётся наша (design-language: pure black — часть айдентики), Telegram лишь
  // подкрашиваем под неё.
  //
  // Слушаем АТРИБУТ, а не значение темы из useTheme. Цвет читается из токена `--bg`, который
  // зависит от `data-theme` на <html>, а ставит его ThemeProvider — РОДИТЕЛЬ. Эффекты родителя
  // React выполняет ПОСЛЕ эффектов детей, поэтому эффект с зависимостью [resolved] читал
  // getComputedStyle до смены атрибута и на переключении в light присылал в Telegram старый
  // #000000 (поймано вживую). MutationObserver не зависит от порядка эффектов вообще и заодно
  // ловит тему, выставленную бутстрап-скриптом в index.html.
  useEffect(() => {
    if (!app) return;
    const apply = () => {
      const color = shellBackgroundColor();
      tgSafe(() => app.setBackgroundColor(color));
      tgSafe(() => app.setHeaderColor(color));
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [app]);

  // Подтверждение закрытия во время забега — тот же принцип, что наши confirm-модалки на
  // выход с потерей прогресса. Оно оправдано ИМЕННО в TMA: сейв лежит в localStorage webview,
  // который Telegram может очистить (T9.6). Когда сейвы переедут в CloudStorage, это
  // подтверждение станет ложной тревогой и его нужно будет снять.
  useEffect(() => {
    if (!app) return;
    const inRun = phase === "draft" || phase === "tournament";
    tgSafe(() => (inRun ? app.enableClosingConfirmation() : app.disableClosingConfirmation()));
  }, [app, phase]);
}
