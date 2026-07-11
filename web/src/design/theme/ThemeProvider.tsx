import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  const stored = window.localStorage.getItem(STORAGE_KEY);
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

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#080b12" : "#f3f6fb");
  }, [mode, resolved]);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
