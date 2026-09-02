// Состояние офлайн-копии для экрана настроек (T11.4): готов ли игрок к самолёту, какой датасет
// лежит и сколько это занимает. Читает те же кэши, что пишет service worker, — своей копии правды
// не заводит: имена и служебные ключи берутся из sw/policy.ts.
//
// Почему страница читает Cache API напрямую, а не спрашивает воркера: это read-only взгляд, и
// лишний раунд сообщений ради него только добавил бы состояний «спросили, а он спит».
import {
  DATA_CACHE_PREFIX,
  META_CACHE,
  SHELL_CACHE,
  activeDataKey,
  completeMarkerKey,
  dataCacheName,
} from "../sw/policy.ts";

/** Что показываем игроку.
 *  `ready` — можно улетать; `partial` — копия неполная (качается или оборвалась);
 *  `none` — офлайн-копии нет; `unsupported` — браузер/режим без service worker (в т.ч. dev). */
export type OfflineState = "ready" | "partial" | "none" | "unsupported";

export interface OfflineStatus {
  state: OfflineState;
  /** Версия закэшированного датасета — короткий хеш и дата сборки (из кэшированного manifest). */
  datasetHash: string | null;
  datasetBuiltAt: string | null;
  /** Сколько занято в браузере, байт. Оценка самого браузера (округляет и «набивает» приватность). */
  usageBytes: number | null;
}

export interface OfflineFacts {
  supported: boolean;
  /** Есть ли оболочка (precache сработал целиком: `addAll` кладёт всё или ничего). */
  shellCached: boolean;
  /** Скачан ли активный набор данных целиком (маркер полноты на месте). */
  datasetComplete: boolean;
  /** Указатель на активный набор вообще выставлен. */
  hasActiveDataset: boolean;
}

/** Чистое правило состояния — отдельно от Cache API, чтобы проверялось тестом.
 *  «Готов» — это И оболочка, И полный набор данных: без любого из них игра офлайн не откроется. */
export function summarizeOfflineState(facts: OfflineFacts): OfflineState {
  if (!facts.supported) return "unsupported";
  if (facts.shellCached && facts.datasetComplete) return "ready";
  if (facts.shellCached || facts.hasActiveDataset) return "partial";
  return "none";
}

/** Человеческий размер. Держим рядом с состоянием: это часть одного ответа «что у меня занято». */
export function formatBytes(bytes: number | null, unit: string): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null;
  const mb = bytes / 1024 / 1024;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} ${unit}`;
}

/** Короткая форма `sha256:4f5e032c…` — полный хеш в интерфейсе не нужен, а первые символы
 *  позволяют сверить версию с паспортом датасета выше по экрану. */
export function shortHash(hash: string | null): string | null {
  if (!hash) return null;
  const hex = hash.includes(":") ? hash.slice(hash.indexOf(":") + 1) : hash;
  return hex.slice(0, 8);
}

const swAvailable = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && import.meta.env.PROD;

/** Снимок состояния офлайн-копии. Ничего не меняет. */
export async function readOfflineStatus(): Promise<OfflineStatus> {
  const empty: OfflineStatus = { state: "unsupported", datasetHash: null, datasetBuiltAt: null, usageBytes: null };
  if (!swAvailable() || typeof caches === "undefined") return empty;

  const origin = `${location.origin}${import.meta.env.BASE_URL}`;
  const names = await caches.keys();
  const shellCached = names.includes(SHELL_CACHE)
    && (await (await caches.open(SHELL_CACHE)).keys()).length > 0;

  let datasetHash: string | null = null;
  if (names.includes(META_CACHE)) {
    const pointer = await (await caches.open(META_CACHE)).match(activeDataKey(origin), { ignoreVary: true });
    datasetHash = pointer ? (await pointer.text()) || null : null;
  }

  let datasetComplete = false;
  let datasetBuiltAt: string | null = null;
  if (datasetHash !== null && names.includes(dataCacheName(datasetHash))) {
    const bucket = await caches.open(dataCacheName(datasetHash));
    datasetComplete = (await bucket.match(completeMarkerKey(origin, datasetHash), { ignoreVary: true })) !== undefined;
    const manifest = await bucket.match(`${origin}data/manifest.json`, { ignoreVary: true });
    if (manifest) {
      const parsed = (await manifest.json()) as { builtAt?: unknown };
      datasetBuiltAt = typeof parsed.builtAt === "string" ? parsed.builtAt : null;
    }
  }

  const usage = await navigator.storage?.estimate?.().then((e) => e.usage ?? null, () => null) ?? null;
  return {
    state: summarizeOfflineState({
      supported: true,
      shellCached,
      datasetComplete,
      hasActiveDataset: datasetHash !== null || names.some((name) => name.startsWith(DATA_CACHE_PREFIX)),
    }),
    datasetHash,
    datasetBuiltAt,
    usageBytes: usage,
  };
}

/** Снести офлайн-копию: только НАШИ кэши. Сейвы и карьера живут в localStorage и не трогаются;
 *  регистрацию воркера тоже оставляем — иначе следующая офлайн-копия не соберётся сама. */
export async function clearOfflineCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name === SHELL_CACHE || name === META_CACHE || name.startsWith(DATA_CACHE_PREFIX))
      .map((name) => caches.delete(name)),
  );
}
