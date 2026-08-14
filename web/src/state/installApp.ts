// Установка на устройство (A2HS, T11.4). Для офлайна это не украшение: Safari чистит кэш сайта
// после ~7 дней без визита, а у установленного приложения хранилище живёт заметно дольше — то
// есть «поставил на экран» и есть то, что переживёт неделю до перелёта (ADR 0003).
//
// Два разных мира:
//   • Chrome/Android: браузер сам решает, что приложение «устанавливаемое», и присылает
//     `beforeinstallprompt`. Событие надо перехватить и придержать — показать его можно только
//     в ответ на действие игрока.
//   • Safari/iOS: события нет вовсе и программно поставить нельзя. Остаётся честная инструкция
//     «Поделиться → На экран «Домой»», и показывать её нужно только там, где она применима.
import { create } from "zustand";

/** Событие Chrome, которого нет в стандартных типах DOM. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallStore {
  /** Есть придержанный системный промпт — можно показать кнопку «Установить». */
  canPrompt: boolean;
  /** Приложение уже стоит на устройстве (запущено в standalone). */
  installed: boolean;
  /** iOS: системного промпта не будет, нужна ручная инструкция. */
  manualIos: boolean;
  promptInstall: () => Promise<void>;
}

let heldPrompt: InstallPromptEvent | null = null;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // `navigator.standalone` — старый признак Safari, у остальных его нет; display-mode работает
  // и в Chrome, и в новых Safari. Проверяем оба: у них нет пересечения.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS с некоторых версий представляется Macintosh — отличаем по тач-точкам, иначе на iPad
  // инструкция не показалась бы вовсе.
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export const useInstallApp = create<InstallStore>((set) => ({
  canPrompt: false,
  installed: isStandalone(),
  manualIos: isIos() && !isStandalone(),

  async promptInstall() {
    if (!heldPrompt) return;
    const event = heldPrompt;
    // Промпт одноразовый: показали — держать больше нечего, независимо от ответа игрока.
    heldPrompt = null;
    set({ canPrompt: false });
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") set({ installed: true });
  },
}));

export function startInstallWatch(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Без preventDefault Chrome покажет свой баннер сам и когда захочет — а нам нужна кнопка
    // в понятном месте (настройки), рядом со статусом офлайн-копии.
    event.preventDefault();
    heldPrompt = event as InstallPromptEvent;
    useInstallApp.setState({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    heldPrompt = null;
    useInstallApp.setState({ canPrompt: false, installed: true, manualIos: false });
  });
}
