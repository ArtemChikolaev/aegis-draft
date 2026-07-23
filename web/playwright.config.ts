import { defineConfig, devices } from "@playwright/test";

/** Browser smoke: start → draft → result. CI web-job генерирует mock перед прогоном. */
const e2ePort = Number(process.env.E2E_PORT ?? 5173);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

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
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
