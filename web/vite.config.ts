import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { aegisGameLogPlugin } from "./vite-plugin-game-log.ts";
import { swKillSwitchPlugin } from "./vite-plugin-sw-killswitch.ts";

// base конфигурируется через VITE_BASE (деплой на GitHub Pages ставит /aegis-draft/);
// по умолчанию корень — для dev, превью и хостингов без сабпути (Cloudflare/Netlify).
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [
    react(),
    aegisGameLogPlugin(),
    // Dev: по URL прод-воркера отдаём самоуничтожающийся SW, чтобы старый precache не подменял dev-бандл.
    swKillSwitchPlugin(),
    // Офлайн (ADR 0003, T11.1). Режим injectManifest: плагин подставляет в наш `src/sw.ts`
    // список хешированных ассетов сборки, вся стратегия — наша (готовые рецепты не умеют
    // атомарный своп датасета по dataHash).
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Регистрируем вручную из main.tsx: нужно поймать waiting-воркер и показать плашку
      // обновления, а не перезагружать игрока посреди забега.
      injectRegister: null,
      // В dev SW не поднимаем: он ломает HMR и превращает отладку в ловлю призраков.
      devOptions: { enabled: false },
      injectManifest: {
        // Классический воркер, не ES-модуль: module-воркеры до сих пор не везде поддержаны
        // (в первую очередь на iOS, где офлайн нужен больше всего), а регистрация с
        // `type: "module"` там просто падает. Импорты в sw.ts всё равно инлайнятся сборкой.
        rollupFormat: "iife",
        // data/** намеренно НЕ в precache: датасет версионируется своим dataHash и живёт в
        // отдельном ведре (см. src/sw.ts). Ассеты бота (обложка/сплэш) нужны Telegram, а не
        // игре — в офлайн-пакет их не тянем.
        //
        // art/** — наоборот, В precache (T11.2): офлайн-готовность не должна зависеть от того,
        // какие экраны игрок успел открыть до самолёта. Это ~1.3 МБ на 268 файлов.
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}", "icon-*.png", "art/**/*.webp"],
        // Спрайт-листы Аркады в precache не кладём: это сотни файлов по 0.5–3 МБ, они грузятся
        // лениво и по одному. Раньше их не цепляло само собой (были PNG), а после перевода в WebP
        // шаблон `art/**/*.webp` начал их подхватывать и сборка падала на лимите в 2 МБ.
        globIgnores: ["data/**", "bot-*.*", "art/sprites/**"],
      },
      manifest: {
        name: "Aegis Draft",
        short_name: "Aegis Draft",
        description: "Build a legendary Dota 2 roster in a replayable drafting roguelite.",
        lang: "en",
        // start_url/scope относительные: одна и та же сборка живёт и в корне, и под сабпутём
        // GitHub Pages — абсолютный путь развалил бы установку на одном из них.
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "portrait",
        // Тон совпадает с <meta name="theme-color"> в index.html: иначе splash установленного
        // приложения мигает чужим цветом до первого кадра (та же грабля, что в TMA).
        background_color: "#080b12",
        theme_color: "#080b12",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // React/Zustand — отдельный чанк со стабильным хешем: меняется код игры, а не библиотеки,
        // и precache SW перекачивает только наш чанк, а не 140 КБ вендора при каждом деплое.
        manualChunks: { vendor: ["react", "react-dom", "zustand"] },
      },
    },
  },
  // strictPort: иначе Vite уйдёт на 5174+ и localStorage (resume) окажется «пустым».
  server: { port: 5173, strictPort: true },
});
