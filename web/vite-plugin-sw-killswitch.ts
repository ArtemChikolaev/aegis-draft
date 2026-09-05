import type { Plugin } from "vite";

/**
 * Dev-only: отдаём по адресу прод-воркера (`<base>sw.js`) самоуничтожающийся service worker.
 *
 * Зачем. Прод-сборка (`npm run preview`, старый деплой, открытый когда-то на этом же localhost:порт)
 * оставляет в браузере воркер с precache оболочки. Он отдаёт закэшированный index.html и старый бандл —
 * а значит новый код (в том числе `cleanupInDev` в state/serviceWorker.ts) просто не выполняется, и
 * человек видит «make dev-all, а изменений нет» (владелец, 2026-09-06). Единственное, что браузер
 * делает сам, — раз в навигацию перекачивает скрипт воркера по его URL. Раньше dev отдавал по /sw.js
 * index.html (SPA-фолбэк, text/html) — обновление воркера падало, и старый жил вечно. Теперь по этому
 * URL приходит корректный JS, байтово другой → браузер ставит его как обновление, он тут же
 * активируется, чистит кэши, снимает регистрацию и перезагружает все вкладки.
 */
export function swKillSwitchPlugin(): Plugin {
  const body = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch {}
  try { await self.registration.unregister(); } catch {}
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of clients) { try { await c.navigate(c.url); } catch {} }
})()));
self.addEventListener('fetch', () => {});
`;
  return {
    name: "aegis-sw-killswitch",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!/\/sw\.js$/.test(url)) return next();
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Service-Worker-Allowed", "/");
        res.end(body);
      });
    },
  };
}
