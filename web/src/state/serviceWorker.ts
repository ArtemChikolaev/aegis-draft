// Связь страницы с service worker'ом (ADR 0003, T11.1) — ЕДИНСТВЕННОЕ место, знающее про
// `navigator.serviceWorker`. Экраны видят только стор: «есть обновление» и «применить».
//
// Два правила, ради которых регистрация написана руками, а не взята готовой из плагина:
//   1. Обновление приложения применяет ИГРОК. Автоматический `skipWaiting` подменил бы код
//      посреди драфта — плашка ждёт старт-экрана (см. App.tsx).
//   2. Датасет обновляется только когда нет незавершённого забега: смена `dataHash` инвалидирует
//      сейв (runPersist, BUG-2026-07-23). Знает об этом страница, поэтому она и командует.
import { create } from "zustand";

interface ServiceWorkerStore {
  /** Новая версия приложения скачана и ждёт применения. */
  updateReady: boolean;
  /** Применить обновление: активировать воркер и перезагрузить страницу. */
  applyUpdate: () => void;
}

let waitingWorker: ServiceWorker | null = null;
/** Перезагружаемся только по своей команде: `controllerchange` стреляет и на первой установке. */
let applyingUpdate = false;

export const useServiceWorker = create<ServiceWorkerStore>((set) => ({
  updateReady: false,
  applyUpdate() {
    if (!waitingWorker) return;
    applyingUpdate = true;
    set({ updateReady: false });
    waitingWorker.postMessage({ type: "skip-waiting" });
  },
}));

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) {
    void cleanupInDev();
    return;
  }
  // После load: регистрация конкурирует за сеть с первой загрузкой игры, а данные важнее.
  window.addEventListener("load", () => { void register(); });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applyingUpdate) window.location.reload();
  });
}

/** Dev и прод-превью живут на одном origin (localhost:5273), поэтому воркер от `npm run preview`
 *  остаётся управлять dev-страницей и отдаёт закэшированный бандл вместо HMR — «правка не
 *  применяется» на ровном месте. Снимаем регистрацию, сносим свои кэши и, если страницей всё ещё
 *  управляет воркер, один раз перезагружаемся: отписка действует только со следующей навигации. */
async function cleanupInDev(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((one) => one.unregister()));
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("aegis-")).map((name) => caches.delete(name)));
  }
  // Флаг в sessionStorage: без него страница, оставшаяся под управлением, перезагружалась бы
  // по кругу, если воркер почему-то не отцепился.
  const RELOADED = "aegis:sw-dev-reload";
  if (navigator.serviceWorker.controller && !sessionStorage.getItem(RELOADED)) {
    sessionStorage.setItem(RELOADED, "1");
    window.location.reload();
  }
}

async function register(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    trackWaiting(registration);
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") trackWaiting(registration);
      });
    });
  } catch {
    /* SW недоступен (приватный режим, политика браузера) — игра работает как раньше, без офлайна */
  }
}

function trackWaiting(registration: ServiceWorkerRegistration): void {
  // `controller === null` — первая в жизни установка: это не «обновление», а появление офлайна,
  // и дёргать игрока плашкой не за что.
  if (!registration.waiting || !navigator.serviceWorker.controller) return;
  waitingWorker = registration.waiting;
  useServiceWorker.setState({ updateReady: true });
}

/** Попросить воркер сверить версию датасета. `allowSwap` — можно ли менять набор прямо сейчас
 *  (нет незавершённого забега). Без SW — no-op: игра и так грузит данные из сети. */
export async function ensureOfflineData(allowSwap: boolean): Promise<void> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: "ensure-data", allowSwap });
}
