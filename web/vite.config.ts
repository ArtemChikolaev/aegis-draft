import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base конфигурируется через VITE_BASE (деплой на GitHub Pages ставит /aegis-draft/);
// по умолчанию корень — для dev, превью и хостингов без сабпути (Cloudflare/Netlify).
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: { port: 5173 },
});
