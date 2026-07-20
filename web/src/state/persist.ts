// Персист поверх двух хранилищ (T9.6). Единственное место, которое знает, КУДА мы пишем;
// runPersist/careerStore/ThemeProvider/I18nProvider знают только ЧТО пишут.
//
// Зачем: в webview Telegram `localStorage` не переживает перезапуск мини-приложения — проверено
// на живом клиенте 2026-07-20, слетали тема, язык, незаконченный забег и карьера целиком.
// Поэтому внутри Telegram источник правды — `WebApp.CloudStorage` (хранит Telegram, сервера не
// требует), а localStorage понижен до СИНХРОННОГО КЭША: тема и язык нужны на первом кадре,
// до всякого React, а облако отвечает асинхронно. Схема везде одна: нарисовали по кэшу →
// дочитали облако → поправили, если разошлось.
//
// Вне Telegram поведение ровно прежнее: тот же localStorage, никаких сетевых обращений.
//
// Ограничения CloudStorage, которые здесь и закодированы:
//   ключ     — `[A-Za-z0-9_-]{1,128}`; наши `aegis:run:v1` и `aegis-draft.theme` НЕ подходят;
//   значение — до 4096 символов; карьера перестаёт влезать уже на ~5 забегах (873 байта запись);
//   всего    — до 1024 ключей на пользователя, отсюда запас на чанки.
import { loadTelegram, type TelegramWebApp } from "../tma/telegram.ts";

/** С запасом от лимита в 4096: заголовок чанка и служебные символы не должны упереться в край. */
const CHUNK_SIZE = 3800;
/** Значение основного ключа, когда данные разложены по чанкам. JSON так начинаться не может. */
const CHUNK_HEADER = "__chunks__:";
/** Сколько чанковых ключей подчищаем при удалении/укорачивании: 16 × 3800 ≈ 60 KB, это ~70 забегов. */
const CHUNK_SWEEP = 16;
/** Если клиент не ответил — играем на кэше, а не подвешиваем загрузку игры. */
const CLOUD_TIMEOUT_MS = 1500;

/**
 * Наш ключ → ключ CloudStorage. Двоеточия и точки запрещены, поэтому заменяем на `_`.
 * ВАЖНО: маппинг обязан оставаться однозначным. Сейчас ключей пять и коллизий нет
 * (см. test/persist.test.ts) — добавляя новый, проверь, что он не схлопывается с существующим.
 */
export function cloudKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
}

function cloud(app: TelegramWebApp | null): TelegramWebApp["CloudStorage"] | null {
  return app?.CloudStorage ?? null;
}

/** Обёртка над callback-API: ошибка клиента — это «значения нет», а не падение игры. */
function promisify<T>(run: (resolve: (value: T | null) => void) => void): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let settled = false;
    const done = (value: T | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Клиент может не позвать колбэк вовсе (старая версия, отозванный доступ) — тогда таймаут.
    const timer = setTimeout(() => done(null), CLOUD_TIMEOUT_MS);
    try {
      run((value) => {
        clearTimeout(timer);
        done(value);
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

/** Синхронное чтение из кэша — то, чем рисуется первый кадр. */
export function readCached(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private mode
  }
}

function writeCached(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — облако (если оно есть) всё равно получит своё */
  }
}

function removeCached(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* нечего чистить */
  }
}

function chunkKeys(key: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${cloudKey(key)}_c${i}`);
}

/**
 * Чтение с учётом облака: в Telegram — CloudStorage (склеивая чанки), иначе кэш.
 * Всегда отдаёт кэш как фолбэк, поэтому вызывающему не нужно знать, где мы работаем.
 */
export async function readPersisted(key: string): Promise<string | null> {
  const store = cloud(await loadTelegram());
  if (!store) return readCached(key);

  const head = await promisify<string>((done) => store.getItem(cloudKey(key), (err, value) => done(err ? null : value ?? null)));
  if (head === null) return readCached(key);
  if (!head.startsWith(CHUNK_HEADER)) return head;

  const count = Number(head.slice(CHUNK_HEADER.length));
  if (!Number.isInteger(count) || count <= 0) return readCached(key);
  const keys = chunkKeys(key, count);
  const parts = await promisify<Record<string, string>>((done) => store.getItems(keys, (err, values) => done(err ? null : values ?? null)));
  if (!parts) return readCached(key);
  // Недостающий чанк = битая запись. Лучше отдать кэш, чем склеить обрывок и уронить JSON.parse.
  const joined = keys.map((k) => parts[k] ?? "").join("");
  if (keys.some((k) => parts[k] === undefined)) return readCached(key);
  return joined;
}

/**
 * Запись идёт в ОБА хранилища: кэш — синхронно (нужен первому кадру и вебу), облако — фоном.
 * Промис возвращаем для тестов; вызывающему ждать облако незачем.
 */
export function writePersisted(key: string, value: string): Promise<void> {
  writeCached(key, value);
  return (async () => {
    const store = cloud(await loadTelegram());
    if (!store) return;
    const root = cloudKey(key);
    if (value.length <= CHUNK_SIZE) {
      await promisify<boolean>((done) => store.setItem(root, value, (err, ok) => done(err ? null : ok ?? true)));
      // Раньше значение могло быть длинным: осиротевшие чанки не ломают чтение (их адресует
      // только заголовок), но занимают ключи из лимита в 1024. Подчищаем одним вызовом.
      await promisify<boolean>((done) => store.removeItems(chunkKeys(key, CHUNK_SWEEP), (err, ok) => done(err ? null : ok ?? true)));
      return;
    }
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) parts.push(value.slice(i, i + CHUNK_SIZE));
    // Чанки пишем ДО заголовка: если запись оборвётся на середине, заголовок ещё указывает на
    // прежнюю (целую) версию, а не на половину новой.
    await Promise.all(parts.map((part, i) => promisify<boolean>((done) => store.setItem(`${root}_c${i}`, part, (err, ok) => done(err ? null : ok ?? true)))));
    await promisify<boolean>((done) => store.setItem(root, `${CHUNK_HEADER}${parts.length}`, (err, ok) => done(err ? null : ok ?? true)));
  })();
}

export function removePersisted(key: string): Promise<void> {
  removeCached(key);
  return (async () => {
    const store = cloud(await loadTelegram());
    if (!store) return;
    await promisify<boolean>((done) => store.removeItems([cloudKey(key), ...chunkKeys(key, CHUNK_SWEEP)], (err, ok) => done(err ? null : ok ?? true)));
  })();
}
