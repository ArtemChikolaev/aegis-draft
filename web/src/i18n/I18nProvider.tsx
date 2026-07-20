import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { detectLocale, translate, type Locale, type MessageKey } from "./core.ts";
import { readCached, readPersisted, writePersisted } from "../state/persist.ts";

const STORAGE_KEY = "aegis-draft.locale";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  // Только кэш: первый кадр рисуется до ответа асинхронного хранилища (см. state/persist.ts).
  return detectLocale(readCached(STORAGE_KEY), window.navigator.language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  // Язык в Telegram переживает перезапуск только через CloudStorage (T9.6). Флаг «игрок уже
  // трогал» не даёт облаку перебить выбор, сделанный пока оно отвечало.
  const touched = useRef(false);
  useEffect(() => {
    let alive = true;
    void readPersisted(STORAGE_KEY).then((stored) => {
      if (!alive || touched.current || !stored) return;
      setLocale(detectLocale(stored, window.navigator.language));
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    void writePersisted(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale: (next: Locale) => { touched.current = true; setLocale(next); },
    t: (key, vars) => translate(locale, key, vars),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
