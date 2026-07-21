// Единый источник правды о навигации «назад». Его зовёт телеграмная кнопка «назад»
// (useTelegramShell), и по нему же считается, показывать её или нет. Держим логику
// «куда возвращаться» в ОДНОМ месте, а не размазанной по адаптеру и экранам.
//
// Уровни (сверху вниз по глубине):
//   view ≠ game (settings/справочник) → назад по истории (как браузерный «назад»);
//   экран деталей режима (mode выбран, забег ещё не начат) → назад в выбор режимов;
//   в самом забеге (draft/tournament) «назад» НЕ показываем — там выход это Telegram Close
//     + closing-confirmation (useTelegramShell), а не возврат в конфиг;
//   корень (picker) → показываем Close.
import { useRun } from "./runStore.ts";
import { useShell } from "./shellStore.ts";

/** Есть ли куда возвращаться — для show/hide телеграмной кнопки «назад». */
export function canGoBack(): boolean {
  if (useShell.getState().view !== "game") return true;
  const { selectedMode, phase } = useRun.getState();
  return selectedMode !== null && phase === "start";
}

/** Куда ведёт «назад» из текущего состояния. */
export function navigateBack(): void {
  const shell = useShell.getState();
  if (shell.view !== "game") {
    // Виды живут в истории — назад через историю, чтобы браузерный и телеграмный «назад»
    // совпадали. Истории нет (открыли по прямой ссылке) — уходим на игру, а не из приложения.
    if (typeof window !== "undefined" && window.history.state?.aegisView) window.history.back();
    else shell.setView("game");
    return;
  }
  const run = useRun.getState();
  if (run.selectedMode !== null && run.phase === "start") run.setSelectedMode(null);
}
