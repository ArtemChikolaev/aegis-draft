// Service worker: офлайн-доступность (ADR 0003, T11.1). Тонкая обвязка вокруг чистой политики
// из `sw/policy.ts` — решения тестируются там, здесь только Cache API и события.
//
// Три разных мира с разными правилами:
//   1. Оболочка (hashed js/css, index.html) — версия = сборка. Precache + cache-first.
//   2. Датасет (data/*.json) — версия = manifest.dataHash. Отдельное ведро на версию,
//      переключение АТОМАРНОЕ и только когда нет незавершённого забега (иначе смена хеша
//      обнулит сейв — runPersist, BUG-2026-07-23).
//   3. Всё чужое (Steam CDN, API) — не трогаем вовсе: cross-origin ответы приходят opaque,
//      и «закэшированной» оказалась бы страница captive-portal, а не картинка. Арт заберём
//      к себе в T11.2, тогда он попадёт в мир №1 сам собой.
//
// Собирается плагином в режиме injectManifest: список ассетов сборки подставляется в
// `self.__WB_MANIFEST`, вся логика ниже — наша (готовые рецепты не умеют атомарный своп набора).
import {
  META_CACHE,
  SHELL_CACHE,
  dataCacheName,
  dataFileFromPath,
  decideDataAction,
  staleDataCaches,
} from "./sw/policy.ts";
import { OPTIONAL_DATA_FILES, REQUIRED_DATA_FILES, dataFilePath } from "./data/dataFiles.ts";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

/** База приложения: SW лежит в её корне, поэтому берётся из его собственного адреса.
 *  В корне это `/`, на GitHub Pages — `/aegis-draft/`. */
const BASE = new URL("./", self.location.href).pathname;
const INDEX_URL = new URL("index.html", self.location.href).href;
/** Указатель на активный набор данных (ключ в META_CACHE — обычный URL, так требует Cache API). */
const ACTIVE_DATA_KEY = new URL("__aegis_active_data", self.location.href).href;
/** Маркер «ведро скачано целиком». Без него частично скачанный набор никогда не станет активным. */
const completeMarker = (hash: string) => new URL(`__aegis_data_complete?h=${encodeURIComponent(hash)}`, self.location.href).href;

/** Адреса оболочки из инжектированного манифеста, БЕЗ повторов.
 *  Дедуп обязателен: иконки и webmanifest приезжают в манифест дважды (из globPatterns и из
 *  описания PWA), а `cache.addAll` на дублирующемся запросе падает целиком — install при этом
 *  проваливается молча, сборка и тесты остаются зелёными, и офлайна просто нет (2026-08-14). */
const shellUrls = () => [...new Set(self.__WB_MANIFEST.map((entry) => new URL(entry.url, self.location.href).href))];

/** Ключ кэша у нас — АДРЕС, и только он. `ignoreVary` обязателен: сервер отдаёт `Vary: Origin`
 *  (проверено на vite preview 2026-08-14), а модульные скрипты Vite запрашиваются с атрибутом
 *  `crossorigin`, то есть с заголовком `Origin` — которого не было, когда файл клали в precache.
 *  Без этого флага кэш промахивается мимо собственных записей, и офлайн-страница остаётся без
 *  js и css: HTML отдался, приложение не запустилось. */
const MATCH: CacheQueryOptions = { ignoreVary: true };

self.addEventListener("install", (event) => {
  // Ждём команды от страницы: новая версия не должна подменять код под ногами играющего.
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(shellUrls());
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Оболочка живёт в кэше со стабильным именем, поэтому чистим не кэш целиком, а записи,
    // которых нет в манифесте текущей сборки (старые hashed-ассеты).
    const cache = await caches.open(SHELL_CACHE);
    const fresh = new Set(shellUrls());
    for (const request of await cache.keys()) {
      if (!fresh.has(request.url)) await cache.delete(request);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // чужое — мимо нас (см. шапку)

  if (request.mode === "navigate") {
    event.respondWith(navigationFirst(request));
    return;
  }
  if (dataFileFromPath(url.pathname, BASE) !== null) {
    event.respondWith(dataFromActiveBucket(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string; allowSwap?: boolean } | null;
  if (!data) return;
  // Обновление применяет игрок, а не мы: страница показывает плашку и присылает эту команду.
  if (data.type === "skip-waiting") void self.skipWaiting();
  if (data.type === "ensure-data") event.waitUntil(ensureData(data.allowSwap === true));
});

/** Навигация: сначала сеть (свежий index), офлайн — из кэша. Наоборот нельзя: cache-first на
 *  документе оставил бы игрока на старой сборке до ручного сброса. */
async function navigationFirst(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(INDEX_URL, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(INDEX_URL, { ...MATCH, cacheName: SHELL_CACHE });
    if (cached) return cached;
    throw error;
  }
}

/** Ассеты сборки: имена содержат хеш содержимого, поэтому кэш не может «протухнуть».
 *  Промах (файл не из precache — favicon, картинка) — сеть, и кладём рядом на будущее. */
async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request, { ...MATCH, cacheName: SHELL_CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Датасет отдаём ТОЛЬКО из активного ведра: смешать файлы двух версий нельзя (общий accountId,
 *  общий dataHash). Ведра нет — идём в сеть, но по одному файлу ничего не кэшируем. */
async function dataFromActiveBucket(request: Request): Promise<Response> {
  const hash = await readActiveHash();
  if (hash !== null) {
    const cached = await caches.match(request, { ...MATCH, cacheName: dataCacheName(hash) });
    if (cached) return cached;
  }
  return fetch(request);
}

async function readActiveHash(): Promise<string | null> {
  const cache = await caches.open(META_CACHE);
  const stored = await cache.match(ACTIVE_DATA_KEY, MATCH);
  return stored ? (await stored.text()) || null : null;
}

/** Сверить версию датасета с сетью и, если положено, скачать/переключить набор.
 *  Вызывается страницей: только она знает, идёт ли забег. */
async function ensureData(allowSwap: boolean): Promise<void> {
  let manifest: Response;
  try {
    // no-store: ответ из HTTP-кэша сказал бы «версия та же» и заморозил бы офлайн-копию навсегда.
    manifest = await fetch(new URL(dataFilePath("manifest"), self.location.href).href, { cache: "no-store" });
  } catch {
    return; // офлайн — ничего не проверяем, работаем на том, что есть
  }
  if (!manifest.ok) return;
  const remoteHash = ((await manifest.clone().json()) as { dataHash?: unknown }).dataHash;
  if (typeof remoteHash !== "string" || remoteHash === "") return;

  const activeHash = await readActiveHash();
  const action = decideDataAction({
    activeHash,
    remoteHash,
    bucketComplete: await isBucketComplete(remoteHash),
    allowSwap,
  });
  if (action === "none") return;
  if (action === "download") await downloadBucket(remoteHash, manifest);
  await activateBucket(remoteHash);
}

async function isBucketComplete(hash: string): Promise<boolean> {
  // `caches.open` СОЗДАЁТ кэш, если его нет, поэтому проверять наличие им нельзя: проверка
  // «скачан ли набор» оставляла бы за собой пустое ведро несуществующей версии.
  const name = dataCacheName(hash);
  if (!(await caches.has(name))) return false;
  const cache = await caches.open(name);
  return (await cache.match(completeMarker(hash), MATCH)) !== undefined;
}

/** Скачивает набор целиком в своё ведро и только потом ставит маркер полноты. Оборвалось на
 *  середине — маркера нет, активным такое ведро не станет, а дозагрузка продолжится с того же
 *  места (уже скачанные файлы не перезапрашиваются). */
async function downloadBucket(hash: string, manifest: Response): Promise<void> {
  const cache = await caches.open(dataCacheName(hash));
  const manifestUrl = new URL(dataFilePath("manifest"), self.location.href).href;
  await cache.put(manifestUrl, manifest.clone());

  for (const name of REQUIRED_DATA_FILES) {
    if (name === "manifest") continue;
    const url = new URL(dataFilePath(name), self.location.href).href;
    if (await cache.match(url, MATCH)) continue;
    // Обычный кэш-режим намеренно: браузер только что тянул эти файлы для игры, и повторно
    // качать 19 МБ ради того же содержимого незачем.
    const response = await fetch(url);
    if (!response.ok) throw new Error(`data ${name}: ${response.status}`);
    await cache.put(url, response);
  }
  for (const name of OPTIONAL_DATA_FILES) {
    const url = new URL(dataFilePath(name), self.location.href).href;
    if (await cache.match(url, MATCH)) continue;
    try {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    } catch {
      /* опциональный файл: его отсутствие — не сбой набора */
    }
  }
  await cache.put(completeMarker(hash), new Response("1"));
}

/** Переключение — одна запись указателя. Старые ведра сносим только после неё: упади мы между
 *  шагами, игрок останется со старым рабочим набором, а не без данных вообще. */
async function activateBucket(hash: string): Promise<void> {
  const meta = await caches.open(META_CACHE);
  await meta.put(ACTIVE_DATA_KEY, new Response(hash));
  for (const name of staleDataCaches(await caches.keys(), hash)) await caches.delete(name);
}
