import type { ReactNode } from "react";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { ThemeProvider } from "../design/theme/ThemeProvider.tsx";

/** Единая точка подключения кросс-срезовых провайдеров (тема + локаль). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>{children}</I18nProvider>
    </ThemeProvider>
  );
}
