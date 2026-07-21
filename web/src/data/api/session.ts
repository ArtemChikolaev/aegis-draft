// Хранение сессионного токена (Bearer) поверх того же persist, что и остальной стейт:
// в Telegram — CloudStorage, иначе localStorage. Клиент API про это не знает.
import { readPersisted, removePersisted, writePersisted } from "../../state/persist.ts";

/** Versioned-ключ по образцу aegis:run:v1 (см. persist/cloudKey — маппинг однозначен). */
const SESSION_KEY = "aegis:session:v1";

export function readSession(): Promise<string | null> {
  return readPersisted(SESSION_KEY);
}

export function writeSession(token: string): Promise<void> {
  return writePersisted(SESSION_KEY, token);
}

export function clearSession(): Promise<void> {
  return removePersisted(SESSION_KEY);
}
