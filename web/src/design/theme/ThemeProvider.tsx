import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { watchTelegramColorScheme } from "../../tma/telegram.ts";
import { readCached, readPersisted, writePersisted } from "../../state/persist.ts";
import { isThemeMode, resolveTheme, type ResolvedTheme, type ThemeMode } from "./core.ts";

const STORAGE_KEY = "aegis-draft.theme";
const QUERY = "(prefers-color-scheme: dark)";

interface ThemeValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function initialMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  // Синхронно и только из кэша: первый кадр рисуется до всякого асинхронного хранилища.
  const stored = readCached(STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [prefersDark, setPrefersDark] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  const resolved = resolveTheme(mode, prefersDark);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // В Telegram «система» — это тема Telegram, а не ОС: splash он рисует по своей теме ещё до
  // старта нашего кода, и при расхождении первый кадр приложения перекрашивается на глазах.
  // Подписка приходит позже matchMedia (SDK грузится асинхронно) и потому перекрывает его —
  // так и задумано. Явный выбор light/dark пользователя это не трогает: prefersDark участвует
  // только в режиме "system" (resolveTheme).
  useEffect(() => watchTelegramColorScheme(setPrefersDark), []);

  // Выбор темы в Telegram переживает перезапуск только через CloudStorage: кэш webview
  // очищается (T9.6). Флаг «игрок уже трогал» защищает от гонки — облако не должно
  // перебить переключение, сделанное за те миллисекунды, пока оно отвечало.
  const touched = useRef(false);
  useEffect(() => {
    let alive = true;
    void readPersisted(STORAGE_KEY).then((stored) => {
      if (!alive || touched.current || !isThemeMode(stored)) return;
      setMode(stored);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    void writePersisted(STORAGE_KEY, mode);
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#080b12" : "#f3f6fb");
  }, [mode, resolved]);

  const value = useMemo(() => ({
    mode,
    resolved,
    setMode: (next: ThemeMode) => { touched.current = true; setMode(next); },
  }), [mode, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
