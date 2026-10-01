// Политика офлайн-кэша — чистая часть service worker'а: решения без сети, Cache API и глобалей,
// поэтому проверяется юнит-тестом (сам SW остаётся тонкой обвязкой вокруг этих функций).
//
// Ключевое правило (ADR 0003): датасет — АТОМАРНЫЙ набор. Он живёт в отдельном ведре кэша с
// именем по `manifest.dataHash`, и переключение на новый набор — это смена одного указателя,
// а не дозагрузка файлов в общий котёл.

/** Что делать с датасетом после сверки версий. */
export type DataAction =
  /** Ничего: набор актуален либо трогать его сейчас нельзя. */
  | "none"
  /** Ведро уже скачано целиком — просто переключить указатель. */
  | "swap"
  /** Ведра нет (или оно неполное) — скачать набор, затем переключить. */
  | "download";

export interface DataDecision {
  /** Хеш активного набора; `null` — офлайн-копии ещё нет вовсе. */
  activeHash: string | null;
  /** Хеш набора, который сейчас отдаёт сеть. */
  remoteHash: string;
  /** Скачано ли ведро под `remoteHash` целиком. */
  bucketComplete: boolean;
  /** Можно ли менять набор прямо сейчас (нет незавершённого забега). */
  allowSwap: boolean;
}

export function decideDataAction({ activeHash, remoteHash, bucketComplete, allowSwap }: DataDecision): DataAction {
  // Набор уже активен — самый частый случай, никаких запросов.
  if (activeHash === remoteHash) return "none";
  // Первая офлайн-копия нужна всегда: без неё игра просто не откроется без сети, и «незавершённый
  // забег» тут ничего не защищает — защищать пока нечего.
  if (activeHash === null) return bucketComplete ? "swap" : "download";
  // Незавершённый забег: старый набор остаётся активным, новый даже не качаем. Смена `dataHash`
  // инвалидирует сейв (runPersist, BUG-2026-07-23), поэтому обновление ждёт конца забега — и
  // заодно не съедает мобильный трафик посреди игры. Явное обновление игроком — T11.4.
  if (!allowSwap) return "none";
  return bucketComplete ? "swap" : "download";
}

/** Имя ведра кэша под конкретную версию датасета. `dataHash` приходит как `sha256:<hex>`,
 *  а в имени кэша двоеточию делать нечего — оно мешает читать список каналов в DevTools. */
export function dataCacheName(hash: string): string {
  return `${DATA_CACHE_PREFIX}${hash.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

export const DATA_CACHE_PREFIX = "aegis-data-";
/** Кэш оболочки: hashed-ассеты сборки + index.html. Имя стабильно, содержимое чистится по манифесту. */
export const SHELL_CACHE = "aegis-shell";
/** Служебный кэш: указатель на активный набор данных. */
export const META_CACHE = "aegis-meta";

/* ─── Арт Аркады (M23) ───
   Спрайты и звуки (`art/…`) не входят в precache: их сотни мегабайт, нужен из них десяток листов на забег. Раньше они
   лежали в кэше оболочки, а `activate` чистит оттуда всё, чего нет в манифесте сборки, — каждый деплой (а датасет
   обновляется почти каждый день) выкидывал скачанный арт, и офлайн Аркада оставалась без него. Теперь у арта своё
   ведро: деплой его не трогает, отдаём из кэша сразу, а давнее перепроверяем в фоне по ETag (304 — почти даром). */
export const ART_CACHE = "aegis-art";
/** Потолок записей в ведре арта: при переполнении уходят самые старые. */
export const ART_MAX_ENTRIES = 800;
/** Как часто перепроверять закэшированный файл арта (мс). */
export const ART_REVALIDATE_MS = 12 * 60 * 60 * 1000;
/** Служебный заголовок записи: когда её положили или последний раз проверили. */
export const ART_STAMP_HEADER = "x-aegis-art-at";

/** Запрос к арту приложения (`<base>art/…`). */
export function isArtPath(pathname: string, base: string): boolean {
  return pathname.startsWith(`${base}art/`);
}

/** Пора ли перепроверить запись арта: метки нет (запись старого формата) или она старше `ART_REVALIDATE_MS`. */
export function artNeedsRevalidate(stampedAt: string | null, now: number): boolean {
  const at = Number(stampedAt);
  return !stampedAt || !Number.isFinite(at) || now - at > ART_REVALIDATE_MS;
}

/** Сколько самых старых записей удалить, чтобы ведро не превышало потолка. */
export function artOverflow(entries: number): number {
  return Math.max(0, entries - ART_MAX_ENTRIES);
}

/** Служебные ключи в кэшах. Cache API умеет только URL-ключи, поэтому «указатель» и «маркер» —
 *  это адреса внутри базы приложения. Собираются здесь, а не по месту: их читают двое — сам
 *  воркер и экран настроек (панель «Офлайн»), и разъехаться они не имеют права.
 *  `origin` — абсолютный адрес чего-нибудь внутри приложения (у SW это его собственный URL). */
export function activeDataKey(origin: string): string {
  return new URL("__aegis_active_data", origin).href;
}

export function completeMarkerKey(origin: string, hash: string): string {
  return new URL(`__aegis_data_complete?h=${encodeURIComponent(hash)}`, origin).href;
}

/** Имя файла датасета из пути запроса; `null` — запрос не к датасету.
 *  `base` — база приложения со слэшем на конце (`/` в корне, `/aegis-draft/` на Pages). */
export function dataFileFromPath(pathname: string, base: string): string | null {
  const prefix = `${base}data/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  return rest.endsWith(".json") && !rest.includes("/") ? rest.slice(0, -".json".length) : null;
}

/** Ведро датасета, которое можно удалить: любое из наших, кроме активного. */
export function staleDataCaches(cacheNames: readonly string[], activeHash: string | null): string[] {
  const keep = activeHash === null ? null : dataCacheName(activeHash);
  return cacheNames.filter((name) => name.startsWith(DATA_CACHE_PREFIX) && name !== keep);
}
