import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { detectLocale, translate, type Locale, type MessageKey } from "./core.ts";

const STORAGE_KEY = "aegis-draft.locale";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  return detectLocale(window.localStorage.getItem(STORAGE_KEY), window.navigator.language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t: (key, vars) => translate(locale, key, vars),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
