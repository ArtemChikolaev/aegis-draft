// Общая обвязка клиентов relay-комнат (Arena MP2, Дуэль): reconnection-токены и пин версий.
// Раньше жила копией в arenaStore и duelStore и расходилась только неймспейсом ключа.
import { useRun } from "./runStore.ts";
import { BALANCE_CONFIG_VERSION } from "../game/balance.ts";
import type { ArenaVersions } from "../data/api/arena.ts";

export interface RoomTokenStore {
  read: (code: string) => string;
  write: (code: string, token: string) => void;
}

/** Reconnection-токены per-код в sessionStorage: reload возвращает ТОГО ЖЕ участника
 *  (сервер по токену заменяет сессию — призрак не появляется). Session, не local:
 *  токен — секрет слота, переживать смену вкладки/устройства он не должен.
 *  `namespace` — режим (`arena`, `duel`): коды комнат разных режимов не должны делить токен. */
export function roomTokenStore(namespace: string): RoomTokenStore {
  const key = (code: string) => `aegis:${namespace}:token:${code}`;
  return {
    read(code) {
      try {
        return sessionStorage.getItem(key(code)) ?? "";
      } catch {
        return "";
      }
    },
    write(code, token) {
      try {
        sessionStorage.setItem(key(code), token);
      } catch {
        /* приватный режим — reconnect просто станет новым входом */
      }
    },
  };
}

/** Версии клиента для пина комнаты — те же оси, что у сейва/ссылки (runPersist/runLink):
 *  участники обязаны сойтись датасетом и балансом, иначе паки и счёт разъедутся. */
export function clientVersions(): ArenaVersions | null {
  const manifest = useRun.getState().data?.manifest;
  if (!manifest) return null;
  return {
    schemaVersion: manifest.schemaVersion,
    ratingModelVersion: manifest.ratingModelVersion,
    dataHash: manifest.dataHash,
    balanceConfigVersion: BALANCE_CONFIG_VERSION,
  };
}
