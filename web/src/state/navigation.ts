// Единый источник правды о навигации «назад». Его зовёт телеграмная кнопка «назад»
// (useTelegramShell), и по нему же считается, показывать её или нет. Держим логику
// «куда возвращаться» в ОДНОМ месте, а не размазанной по адаптеру и экранам.
//
// Уровни (сверху вниз по глубине):
//   view ≠ game (settings/справочник) → назад по истории (как браузерный «назад»);
//   config → выбор Quick/Roguelite → выбор верхнего режима;
//   экран деталей недоступного режима → назад в выбор режимов;
//   в самом забеге (draft/tournament) «назад» НЕ показываем — там выход это Telegram Close
//     + closing-confirmation (useTelegramShell), а не возврат в конфиг;
//   корень (picker) → показываем Close.
import { useRun } from "./runStore.ts";
import { useShell } from "./shellStore.ts";

/** Есть ли куда возвращаться — для show/hide телеграмной кнопки «назад». */
export function canGoBack(): boolean {
  if (useShell.getState().view !== "game") return true;
  const { selectedMode, phase, startStep } = useRun.getState();
  return phase === "start" && (selectedMode !== null || startStep !== "modes");
}

/** Куда ведёт «назад» из текущего состояния. */
export function navigateBack(): void {
  const shell = useShell.getState();
  if (shell.view !== "game") {
    // Виды живут в истории — назад через историю, чтобы браузерный и телеграмный «назад»
    // совпадали. Истории нет (открыли по прямой ссылке) — уходим на игру, а не из приложения.
    if (typeof window !== "undefined" && window.history.state?.aegisFrom) window.history.back();
    else shell.replaceView(shell.view === "settings" ? "game" : "settings");
    return;
  }
  const run = useRun.getState();
  if (run.phase !== "start") return;
  if (run.startStep === "config") {
    run.setSelectedMode(null);
    run.setStartStep("variants");
  } else if (run.startStep === "variants") {
    run.setStartStep("modes");
  } else if (run.selectedMode !== null) {
    run.setSelectedMode(null);
  }
}
