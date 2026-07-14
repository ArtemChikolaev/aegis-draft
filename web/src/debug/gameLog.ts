/** Dev-only game debug logger → VS Code TERMINAL via Vite dev-server. Prod: no-op. */

export type GameLogCategory = "data" | "draft" | "nav" | "tournament";

export const GAME_LOG_STORAGE_KEY = "aegis:debug:game";

export function isGameLogEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(GAME_LOG_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setGameLogEnabled(enabled: boolean): void {
  if (!import.meta.env.DEV) return;
  try {
    localStorage.setItem(GAME_LOG_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode */
  }
  gameLog("data", `Game log ${enabled ? "enabled" : "disabled"}`);
}

function postToTerminal(category: GameLogCategory, message: string, body?: string): void {
  const url = `${import.meta.env.BASE_URL}__aegis_game_log`.replace(/\/{2,}/g, "/");
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, message, body }),
    keepalive: true,
  }).catch(() => {
    /* dev server not running / tests — ignore */
  });
}

export function gameLog(category: GameLogCategory, message: string, body?: string): void {
  if (!isGameLogEnabled()) return;
  postToTerminal(category, message, body);
}

declare global {
  interface Window {
    aegisDebug?: {
      gameLogEnabled: () => boolean;
      enableGameLog: () => void;
      disableGameLog: () => void;
    };
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.aegisDebug = {
    gameLogEnabled: isGameLogEnabled,
    enableGameLog: () => setGameLogEnabled(true),
    disableGameLog: () => setGameLogEnabled(false),
  };
}
