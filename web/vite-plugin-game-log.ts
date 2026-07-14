import type { Plugin } from "vite";

const LOG_PATH = "/__aegis_game_log";
let helpPrinted = false;

/** Dev-only: принимает POST из браузера и печатает в TERMINAL (npm run dev). */
export function aegisGameLogPlugin(): Plugin {
  return {
    name: "aegis-game-log",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== LOG_PATH || req.method !== "POST") {
          next();
          return;
        }
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body) as {
              category?: string;
              message?: string;
              body?: string;
            };
            if (!helpPrinted) {
              helpPrinted = true;
              console.log(
                "\n  [aegis:debug] Game logs below (this TERMINAL). OFF in browser: localStorage.setItem(\"aegis:debug:game\",\"0\")\n",
              );
            }
            const tag = `[aegis:${payload.category ?? "?"}]`;
            const ts = new Date().toISOString().slice(11, 23);
            console.log(`\n${ts} ${tag} ${payload.message ?? ""}`);
            if (payload.body) {
              console.log(payload.body);
            }
          } catch {
            /* ignore malformed */
          }
          res.statusCode = 204;
          res.end();
        });
      });

      server.httpServer?.once("listening", () => {
        const addr = server.httpServer?.address();
        const port = typeof addr === "object" && addr ? addr.port : 5173;
        console.log(
          "\n  [aegis:debug] Game logs → VS Code/Cursor TERMINAL (this panel), tab TERMINAL not DEBUG CONSOLE\n" +
          `  Play at http://localhost:${port} — logs appear here as you draft.\n`,
        );
      });
    },
  };
}
