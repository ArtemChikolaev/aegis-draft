import { defineConfig, devices } from "@playwright/test";

/** Browser smoke на dev-сервере: start → draft → result. CI web-job генерирует mock перед прогоном.
 *  Офлайн-спека (T11.5) вынесена в playwright.offline.config.ts: ей нужна прод-сборка, поэтому обычный
 *  прогон, в том числе `--project=chromium`, не собирает dist и не поднимает preview. */
const e2ePort = Number(process.env.E2E_PORT ?? 5173);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
export const OFFLINE_SPEC = /offline\.spec\.ts/;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI: без потолка зависший прогон висел часами (2026-09-06, job «Browser smoke» > 6 ч) — режем в 35 мин, обычный прогон ≈ 19.
  globalTimeout: process.env.CI ? 35 * 60_000 : undefined,
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
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
