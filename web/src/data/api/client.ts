// Низкоуровневый HTTP-клиент Go API (динамика: аккаунты/сейвы). Живёт РЯДОМ с
// DataSource (статика) намеренно: статику тянем с CDN, динамику — отдельным клиентом
// (ADR 0002, «статику не проксируем через сервер»). Пока VITE_API_BASE пуст, клиент
// не сконфигурен и приложение работает локально/анонимно.

/** База API без завершающего слэша. Пусто = сервер не задан (см. isApiConfigured). */
export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");
}

/** Сконфигурен ли API. Верхние слои проверяют это перед облачными операциями. */
export function isApiConfigured(): boolean {
  return apiBase() !== "";
}

/** Ошибка API: HTTP-статус + машинный code и message из единого контракта apperr. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null; // Bearer, если задан
  signal?: AbortSignal;
}

/** Сырой запрос к API. Бросает ApiError только на сетевом сбое/отсутствии базы —
 *  HTTP-статусы (включая 404/409) отдаёт вызывающему, который решает, что это значит. */
export async function apiFetch(path: string, opts: RequestOptions = {}): Promise<Response> {
  const base = apiBase();
  if (!base) throw new ApiError(0, "not_configured", "API base URL is not configured");

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  try {
    return await fetch(`${base}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    throw new ApiError(0, "network", e instanceof Error ? e.message : "network error");
  }
}

/** Разбирает тело ошибки {code,message}. Тело не-JSON → дефолт по статусу. */
export async function toApiError(res: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    if (typeof body.code === "string") code = body.code;
    if (typeof body.message === "string") message = body.message;
  } catch {
    /* тело не JSON — оставляем дефолт */
  }
  return new ApiError(res.status, code, message);
}
