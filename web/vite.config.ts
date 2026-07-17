import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aegisGameLogPlugin } from "./vite-plugin-game-log.ts";

// base конфигурируется через VITE_BASE (деплой на GitHub Pages ставит /aegis-draft/);
// по умолчанию корень — для dev, превью и хостингов без сабпути (Cloudflare/Netlify).
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), aegisGameLogPlugin()],
  // strictPort: иначе Vite уйдёт на 5174+ и localStorage (resume) окажется «пустым».
  server: { port: 5173, strictPort: true },
});
