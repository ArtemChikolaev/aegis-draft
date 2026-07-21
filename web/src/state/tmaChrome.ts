// Флаги «нативного хрома» TMA: в Telegram полагаемся на системные кнопки Telegram и
// прячем свои дубли. Вне Telegram оба false — веб не меняется.
//   backNative      — прятать наши внутренние кнопки «назад» (в TMA всегда: есть телеграмная).
//   settingsInMenu  — настройки уехали в «…»-меню (SettingsButton поддержан) → прятать нашу.
import { create } from "zustand";
import { isTelegramLaunch } from "../tma/telegram.ts";

interface TmaChrome {
  backNative: boolean;
  settingsInMenu: boolean;
  setSettingsInMenu: (value: boolean) => void;
}

export const useTmaChrome = create<TmaChrome>((set) => ({
  // Синхронно: признак запуска в Telegram известен до загрузки SDK, без мигания кнопок.
  backNative: isTelegramLaunch(),
  settingsInMenu: false,
  setSettingsInMenu: (settingsInMenu) => set({ settingsInMenu }),
}));
