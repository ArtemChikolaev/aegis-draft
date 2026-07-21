// Высокоуровневый API-клиент aegis-draft: обмен initData на сессию и облачные сейвы.
// Отражает контракт сервера (server/internal/transport). Оркестрацию синхронизации
// (когда пушить/тянуть, разрешение конфликта в UI) строим отдельно, поверх этого.
import { apiFetch, toApiError } from "./client.ts";

export { ApiError, apiBase, isApiConfigured } from "./client.ts";
export { readSession, writeSession, clearSession } from "./session.ts";

/** Ответ POST /api/auth/telegram. */
export interface AuthResult {
  token: string;
  user: { id: string };
  created: boolean;
}

/** Облачный сейв. payload — непрозрачный клиентский стейт (сервер его не трактует). */
export interface CloudSave {
  kind: string;
  payload: unknown;
  rev: number;
  schemaVersion: string;
  ratingModelVersion: string;
  updatedAt: string;
}

/** Данные на запись сейва. baseRev — известный клиенту rev (0 для первой записи). */
export interface SaveWrite {
  payload: unknown;
  baseRev: number;
  schemaVersion?: string;
  ratingModelVersion?: string;
}

/** Результат записи: успех с новым сейвом либо конфликт с актуальным серверным. */
export type PutResult =
  | { status: "ok"; save: CloudSave }
  | { status: "conflict"; current: CloudSave };

/** Обмен Telegram initData на сессионный токен (проверка подписи — на сервере). */
export async function authenticateTelegram(initData: string): Promise<AuthResult> {
  const res = await apiFetch("/api/auth/telegram", { method: "POST", body: { initData } });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as AuthResult;
}

/** Чтение облачного сейва. 404 → null (сейва такого вида ещё нет). */
export async function fetchSave(kind: string, token: string): Promise<CloudSave | null> {
  const res = await apiFetch(`/api/saves/${encodeURIComponent(kind)}`, { token });
  if (res.status === 404) return null;
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as CloudSave;
}

/** Запись сейва с CAS по baseRev. 409 → конфликт с актуальным сейвом (для мержа/повтора). */
export async function pushSave(kind: string, token: string, write: SaveWrite): Promise<PutResult> {
  const res = await apiFetch(`/api/saves/${encodeURIComponent(kind)}`, {
    method: "PUT",
    token,
    body: write,
  });
  if (res.status === 409) {
    const body = (await res.json()) as { current: CloudSave };
    return { status: "conflict", current: body.current };
  }
  if (!res.ok) throw await toApiError(res);
  return { status: "ok", save: (await res.json()) as CloudSave };
}
