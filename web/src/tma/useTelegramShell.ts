import { useEffect, useState } from "react";
import { useRun } from "../state/runStore.ts";
import { useShell } from "../state/shellStore.ts";
import { loadTelegram, shellBackgroundColor, tgSafe, type TelegramWebApp } from "./telegram.ts";

/**
 * Связывает шелл Telegram с нашим состоянием (T9.4/T9.5). Вызывается один раз из App;
 * вне Telegram каждый эффект выходит на первой строке, поэтому обычный веб не платит ничего.
 */
export function useTelegramShell(): void {
  const view = useShell((s) => s.view);
  const setView = useShell((s) => s.setView);
  const phase = useRun((s) => s.phase);
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

  // Кнопка «назад» Telegram. В TMA нет браузерного хрома, поэтому она ЗАМЕНЯЕТ кнопку «назад»
  // браузера — и должна вести себя так же: history.back() → popstate → shellStore.syncFromHash.
  // Своя логика «куда возвращаться» тут была бы вторым источником правды о навигации.
  useEffect(() => {
    if (!app) return;
    const onBack = () => {
      // Ссылку могли открыть сразу на справочнике: своей записи в истории нет, back() увёл бы
      // из приложения. Тогда просто идём на игру.
      if (window.history.state?.aegisView) window.history.back();
      else setView("game");
    };
    tgSafe(() => app.BackButton.onClick(onBack));
    return () => tgSafe(() => app.BackButton.offClick(onBack));
  }, [app, setView]);

  useEffect(() => {
    if (!app) return;
    tgSafe(() => (view === "game" ? app.BackButton.hide() : app.BackButton.show()));
  }, [app, view]);

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
