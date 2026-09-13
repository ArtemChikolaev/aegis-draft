import { defineConfig, devices } from "@playwright/test";
import base, { OFFLINE_SPEC } from "./playwright.config.ts";

// Офлайн (T11.5) проверяется ТОЛЬКО на прод-сборке: в dev service worker выключен намеренно
// (ADR 0003), и на dev-сервере такая спека доказывала бы ровно ничего. Отдельный конфиг — чтобы
// обычный e2e и джоб реального датасета (`--project=chromium`) не собирали dist ради одной спеки.
//
// Спека обязана проверять ТЕКУЩИЙ код, а preview отдаёт то, что лежит в dist. Поэтому сборка —
// шаг запуска, а не этого конфига:
//   - локально: `npm run test:e2e:offline` = `npm run build` из рабочего дерева + этот конфиг;
//   - CI web-job: шаг `npm run build` из того же checkout, затем
//     `npx playwright test -c playwright.offline.config.ts` без повторной сборки.
// Голый запуск с `-c playwright.offline.config.ts` берёт dist как есть — только сразу после build.
//
// Порт свой, дефолтный для `vite preview`: 5173 держит dev-сервер, а 5273 по правилу проекта
// оставлен под ручной preview агента.
const previewPort = Number(process.env.E2E_PREVIEW_PORT ?? 4173);
const previewBaseUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  ...base,
  projects: [
    {
      name: "offline",
      testMatch: OFFLINE_SPEC,
      // Свой таймаут: тест ждёт установку воркера и закачку датасета (19 МБ) — это не «медленный
      // тест», а честная длительность сборки офлайн-копии.
      timeout: 150_000,
      use: { ...devices["Desktop Chrome"], baseURL: previewBaseUrl },
    },
  ],
  webServer: {
    // Без dist `vite preview` падает невнятно — говорим прямо, откуда его взять.
    command: `test -f dist/index.html || { echo "нет web/dist: сначала npm run build (или npm run test:e2e:offline)" >&2; exit 1; }; npm run preview -- --host 127.0.0.1 --port ${previewPort} --strictPort`,
    url: previewBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
