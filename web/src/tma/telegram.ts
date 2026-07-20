// Единственное место во фронте, которое знает про Telegram (T9.4/T9.5, PRD §5.11).
// TMA — это КАНАЛ ДОСТАВКИ той же сборки, а не форк: `game/`, `ui/` и `features/` о Telegram
// не подозревают, а вне Telegram весь модуль — no-op.
//
// SDK грузим ЛЕНИВО и только внутри Telegram. Официальный путь — статический <script> с
// telegram.org в index.html, но он висит на критическом пути загрузки У ВСЕХ, включая обычный
// веб: если telegram.org недоступен (у части провайдеров это регулярная реальность), сайт ждёт
// таймаута сетевого запроса, прежде чем показать игру. Внутри Telegram telegram.org доступен
// по определению, поэтому ленивая загрузка ничего не стоит именно там, где нужна.

const SDK_URL = "https://telegram.org/js/telegram-web-app.js";

export type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";

/** Только то, чем реально пользуемся. Полный тип SDK тащить незачем — он живёт в telegram.org. */
export interface TelegramWebApp {
  initData: string;
  platform: string;
  version: string;
  /** Тема САМОГО Telegram (не ОС). Ей же он рисует splash до старта нашего кода. */
  colorScheme: "light" | "dark";
  onEvent(event: "themeChanged", cb: () => void): void;
  offEvent(event: "themeChanged", cb: () => void): void;
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  /** Bot API 7.7+: без этого свайп вниз закрывает приложение поверх наших скроллов и drag-модалок. */
  disableVerticalSwipes?(): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: HapticStyle): void;
    selectionChanged(): void;
  };
  /**
   * Хранилище на стороне Telegram, привязанное к паре «пользователь × бот». Сервера не требует.
   * Ограничения (закодированы в state/persist.ts): ключ `[A-Za-z0-9_-]{1,128}`, значение до
   * 4096 символов, до 1024 ключей на пользователя. Bot API 6.9+ — на старых клиентах его нет.
   */
  CloudStorage?: {
    getItem(key: string, cb: (err: string | null, value?: string) => void): void;
    getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void;
    setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
    removeItems(keys: string[], cb?: (err: string | null, ok?: boolean) => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    TelegramWebviewProxy?: unknown;
  }
}

/**
 * Клиент Telegram старше нашего вызова кидает `WebAppMethodUnsupported` — на ровном месте
 * это уронило бы весь эффект и, например, оставило бы кнопку «назад» невидимой. Любая работа
 * с SDK идёт через этот guard: деградируем молча, приложение остаётся играбельным.
 */
export function tgSafe(run: () => void): void {
  try {
    run();
  } catch {
    /* метод не поддержан этой версией клиента — не наша проблема, играем дальше */
  }
}

/**
 * Запущены ли мы внутри Telegram — ДО загрузки SDK (иначе пришлось бы грузить его всем).
 * Telegram кладёт параметры запуска в фрагмент URL (`#tgWebAppData=…`), в мобильном webview
 * есть свой мост, а Telegram Web дублирует параметры в sessionStorage.
 */
export function isTelegramLaunch(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Telegram?.WebApp) return true;
  if (window.location.hash.includes("tgWebApp")) return true;
  if (window.TelegramWebviewProxy !== undefined) return true;
  try {
    return window.sessionStorage.getItem("__telegram__initParams") !== null;
  } catch {
    return false; // приватный режим может запрещать sessionStorage — это не признак Telegram
  }
}

let pending: Promise<TelegramWebApp | null> | null = null;

/** Грузит SDK один раз за сессию. Вне Telegram и при недоступной сети — `null`, без ошибок. */
export function loadTelegram(): Promise<TelegramWebApp | null> {
  if (!isTelegramLaunch()) return Promise.resolve(null);
  const existing = window.Telegram?.WebApp;
  if (existing) return Promise.resolve(existing);

  pending ??= new Promise<TelegramWebApp | null>((resolve) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.Telegram?.WebApp ?? null);
    // Сеть до telegram.org не поднялась — играем как обычный веб, а не показываем ошибку.
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return pending;
}

/**
 * Хаптика на решающих действиях (пик игрока/героя). Отдельная функция, а не хук: её зовут
 * из обработчиков, и вне Telegram она обязана быть дешёвым no-op.
 */
export function tgHaptic(style: HapticStyle = "medium"): void {
  const haptics = window.Telegram?.WebApp?.HapticFeedback;
  if (!haptics) return;
  tgSafe(() => haptics.impactOccurred(style));
}

/**
 * Подписка на тему Telegram для режима «system». Внутри Telegram «системная» тема — это тема
 * ТЕЛЕГРАМА, а не ОС: `prefers-color-scheme` в webview следует системе, и человек с тёмным
 * Telegram поверх светлой системы получал бы splash по одной теме, а приложение по другой.
 * Это единственное, что мы берём у Telegram: палитра остаётся наша (никаких `themeParams`).
 *
 * Возвращает функцию отписки. Вне Telegram — no-op, колбэк не зовётся ни разу.
 */
export function watchTelegramColorScheme(onChange: (prefersDark: boolean) => void): () => void {
  let app: TelegramWebApp | null = null;
  let disposed = false;
  const sync = () => app && onChange(app.colorScheme === "dark");

  void loadTelegram().then((webApp) => {
    if (disposed || !webApp) return;
    app = webApp;
    sync();
    tgSafe(() => webApp.onEvent("themeChanged", sync));
  });

  return () => {
    disposed = true;
    const subscribed = app;
    if (subscribed) tgSafe(() => subscribed.offEvent("themeChanged", sync));
  };
}

/** `#abc` / `rgb(0, 0, 0)` → `#aabbcc`. Telegram принимает только `#rrggbb`. */
export function toHexColor(raw: string): string | null {
  const value = raw.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
  if (!rgb) return null;
  const hex = rgb.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}

/**
 * Цвет фона приложения из токена `--bg` (design/tokens.css). Тему НЕ натягиваем из
 * `themeParams`: pure black — часть айдентики (docs/design-language.md), поэтому синхронизируем
 * ровно в обратную сторону — чтобы чром Telegram совпал с нашим фоном, а не наоборот.
 */
export function shellBackgroundColor(): string {
  if (typeof window === "undefined") return "#000000";
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--bg");
  return toHexColor(raw) ?? "#000000";
}
