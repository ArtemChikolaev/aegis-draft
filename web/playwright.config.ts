import { defineConfig, devices } from "@playwright/test";

/** Browser smoke: start → draft → result. CI web-job генерирует mock перед прогоном. */
const e2ePort = Number(process.env.E2E_PORT ?? 5173);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
// Офлайн (T11.5) проверяется ТОЛЬКО на прод-сборке: в dev service worker выключен намеренно
// (ADR 0003), и на dev-сервере такая спека доказывала бы ровно ничего. Порт свой, дефолтный для
// `vite preview`: 5173 занят dev-сервером этого же прогона, а 5273 по правилу проекта оставлен
// под ручной preview агента.
const previewPort = Number(process.env.E2E_PREVIEW_PORT ?? 4173);
const previewBaseUrl = `http://127.0.0.1:${previewPort}`;
const OFFLINE_SPEC = /offline\.spec\.ts/;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  // Desktop + mobile viewport: тот же golden path гоняется на телефонном экране,
  // чтобы ловить responsive-регрессии заранее (следующий шаг — TMA/мобилка).
  projects: [
    { name: "chromium", testIgnore: OFFLINE_SPEC, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: OFFLINE_SPEC, use: { ...devices["Pixel 5"] } },
    {
      name: "offline",
      testMatch: OFFLINE_SPEC,
      // Свой таймаут: тест ждёт установку воркера и закачку датасета (19 МБ) — это не «медленный
      // тест», а честная длительность сборки офлайн-копии.
      timeout: 150_000,
      use: { ...devices["Desktop Chrome"], baseURL: previewBaseUrl },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
      url: e2eBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Сборка входит в команду намеренно: спека обязана проверять ТЕКУЩИЙ код, а не то, что
      // случайно осталось в dist от прошлого прогона.
      command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${previewPort} --strictPort`,
      url: previewBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
