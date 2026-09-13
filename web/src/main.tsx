import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { AppProviders } from "./app/providers.tsx";
import { startConnectivityWatch } from "./state/connectivity.ts";
import { registerServiceWorker } from "./state/serviceWorker.ts";
import { startInstallWatch } from "./state/installApp.ts";
import { initSoundUnlock } from "./ui/sound.ts";
import "./debug/gameLog.ts";
import "./design/tokens.css";
import "./design/breakpoints.css";
import "./design/base.css";

// События сети слушаем до первого рендера: карточка режима, которому нужен интернет, обязана
// показать причину сразу, а не после того, как игрок туда ткнётся.
startConnectivityWatch();
// Офлайн (T11.1): в прод-сборке ставит service worker, в dev — наоборот, сносит чужого,
// оставшегося от превью на том же порту.
registerServiceWorker();
// `beforeinstallprompt` прилетает рано и ровно один раз — слушателя ставим до первого рендера,
// иначе предложение установить приложение просто теряется (T11.4).
startInstallWatch();
// Звук (R15.5): AudioContext разлочивается первым жестом — до него тишина и ноль autoplay-ошибок.
initSoundUnlock();
// Ленивые экраны — отдельные чанки с хэшем сборки. Вкладка со старым кодом после деплоя может
// запросить чанк, которого уже нет (новый service worker при активации чистит старые хэши), —
// тогда перезагружаемся на новую сборку вместо белого экрана. Не чаще раза в 10 с: без этого
// сломанный чанк зациклил бы перезагрузки.
const CHUNK_RELOAD_KEY = "aegis-draft.chunk-reload";
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0) < 10_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return; // без sessionStorage защититься от цикла нечем — пусть ошибка всплывёт как есть
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
