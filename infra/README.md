# infra — nginx + Docker Compose (prod-like lab)

**Не заменяет** текущий деплой на GitHub Pages ([ADR 0001](../docs/adr/0001-tech-stack.md)). Это учебный/staging стенд: один домен, reverse proxy, кэш статики — без Kubernetes.

## Схема

```text
Browser → nginx:80 (host :8080)
            ├─ /           → Vite build (React SPA, try_files → index.html)
            ├─ /data/*     → web/public/data/*.json (static-first, ADR 0002)
            └─ /api/*      → Go API (server/, chi) → Postgres
```

| Путь | Куда | Зачем |
|---|---|---|
| `/` | React `dist/` | SPA + fallback маршрутов |
| `/data/*` | mount `web/public/data` | Игровые JSON с CDN-подобным кэшем |
| `/api/*` | `server:8080` (путь без изменений) | Telegram-auth и облачные сейвы (нужны секреты), комнаты Arena: `POST /api/rooms`, ws `/api/ws/rooms/{code}` |

## Быстрый старт

Из **корня репозитория**:

```bash
# Данные обязательны (реальный слайс из git или локальный mock):
[ -f web/public/data/manifest.json ] || (cd web && npm run gen:mock)

docker compose -f infra/docker-compose.yml up --build
```

Открыть: **http://localhost:8080**

Проверка API через nginx (путь `/api/*` уходит на сервер как есть):

```bash
curl -s -X POST http://localhost:8080/api/rooms   # → {"code":"ABCDE"}
# liveness сервера без префикса /api — изнутри compose (снаружи nginx его не публикует):
docker compose -f infra/docker-compose.yml exec api wget -qO- http://127.0.0.1:8080/healthz
```

WebSocket комнат идёт через тот же вход: `ws://localhost:8080/api/ws/rooms/<code>` (nginx пробрасывает `Upgrade`).

Остановка: `Ctrl+C`, затем `docker compose -f infra/docker-compose.yml down` (данные Postgres — в volume `pgdata`).

## Файлы

| Файл | Роль |
|---|---|
| `docker-compose.yml` | nginx + api + postgres |
| `nginx/nginx.conf` | routing, SPA fallback, cache headers, rate limit `/api` |
| `nginx/Dockerfile` | multi-stage: `npm run build` (VITE_BASE=/) + nginx |
| `../server/Dockerfile` | Go API бинарник |

## Что даёт nginx (сейчас)

- **Единый origin** — фронт и API на одном хосте (меньше CORS/TLS боли позже).
- **Кэш `/data`** — manifest 5 мин, остальное 1 день; `/assets/*` immutable.
- **SPA fallback** — прямое открытие client routes не ломает React.
- **Rate limit** — базовый слой на `/api/*` (20 r/s + burst).
- **Prod-like локально** — опыт настройки reverse proxy без ломания Pages-деплоя.

## Что сознательно не делаем

- **Kubernetes** — оверинжиниринг для одного API ([ADR 0002](../docs/adr/0002-backend-now.md)).
- **Проксирование игровых JSON через Go** — static-first invariant.
- **TLS в compose** — для lab достаточно HTTP; HTTPS — на VPS/Cloudflare позже.

## Следующие шаги (когда появится backend)

1. Эндпоинты под `server/internal/transport` → `/api/v1/...`
2. Фронт: отдельный API-клиент (не через `DataSource` для статики)
3. Опционально: TLS termination на nginx, env-файл для секретов Postgres
