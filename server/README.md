# server — Go API (пользовательское/общее состояние)

Бэкенд aegis-draft по [ADR 0002](../docs/adr/0002-backend-now.md). **Гибрид:** игровые данные остаются static-first (пайплайн → JSON на CDN), сервер держит только динамику — аккаунты, сейвы забегов, мета-прогрессию, лидерборд, дейлик, Manager-персистенс. Правила — скилл `backend-architecture`.

## Стек (T8.0)
- **Router:** `chi` (поверх stdlib `net/http`).
- **БД:** Postgres, запросы через `sqlc`, миграции `goose` (T8.2 — `users`/`identities`).
- **Auth:** Steam OpenID, **опционально** — анонимная игра работает без логина (local-first), вход только для синхронизации/лидерборда (с T8.3).

## Слои (`internal/`, не пробивать)
```
cmd/api/            entrypoint (config → router → http.Server + graceful shutdown)
internal/
  config/           env → Config (секреты не в коде)
  transport/        HTTP: chi-router, хендлеры, health, маппинг ошибок
  service/          бизнес-логика (с T8.4)
  store/            Postgres/sqlc, миграции goose (с T8.2)
  model/            доменные типы (форма schema/ на пересечении)
  apperr/           единый тип доменной ошибки → HTTP {code,message}
```

## Запуск
```bash
cd server
PORT=8080 go run ./cmd/api      # → http://localhost:8080/healthz
go test ./...                    # тесты
gofmt -l . && go vet ./...

## Docker (за nginx, см. infra/)
```bash
# из корня репо, после docker compose up:
curl http://localhost:8080/api/healthz
```
Сборка образа: `docker compose -f infra/docker-compose.yml build api`
```

## БД и стор — `users`/`identities` (T8.2, срез аккаунтов)
Схема — единственный источник в goose-миграциях [`internal/store/migrations`](internal/store/migrations); запросы типобезопасные через `sqlc`. `users.id` — личность приложения (НЕ игровой `accountId`); способ входа (telegram/google/steam) — в `identities`, «любой один» из ADR 0002.

- **Миграции на старте:** `store.Migrate` (goose, embed) прогоняется в `main`, если задан `DATABASE_URL`. Без него сервер поднимается **без БД** (liveness ок, `/readyz` → `"disabled"`) — для локали без Docker.
- **Стор:** `store.UserRepo.FindOrCreateByIdentity` — идемпотентный find-or-create в транзакции (гонка по `UNIQUE(provider,uid)` → перечитывание). Наружу отдаёт `model`-типы, не `sqlcgen` (граница слоя).
- **Тесты стора** гоняются против реального Postgres из `DATABASE_URL`; без него **скипаются** (локально зелено). В CI их поднимает postgres service-container (`ci.yml`, джоб `server`).

**Регенерация после правки SQL** (схемы/запросов) — коммитим сгенерированное:
```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0   # разово
cd server && "$(go env GOPATH)/bin/sqlc" generate        # → internal/store/sqlcgen/
```

**Локальный прогон с БД** (нужен свой Postgres): `DATABASE_URL=postgres://… go test ./...`.

## Auth — сессия по Telegram initData (T8.3)
`POST /api/auth/telegram` `{ "initData": "<raw>" }` → проверка подписи ([internal/telegram](internal/telegram/initdata.go), T9.8) → `UserRepo.FindOrCreateByIdentity("telegram", …)` → **сессионный JWT** (HS256, Bearer). Ответ: `{ token, user: { id }, created }`. Дальше клиент шлёт `Authorization: Bearer <token>`.

- **JWT stateless** ([internal/auth](internal/auth/session.go)): подпись `SESSION_SECRET` из env, TTL 30 дней, alg жёстко HS256 (защита от alg-confusion). Отзыв до истечения не поддержан намеренно — если понадобится, отдельная таблица `sessions`.
- **Маршрут включается**, только когда есть `DATABASE_URL` + `SESSION_SECRET` + `BOT_TOKEN`; иначе `/api/auth/*` не регистрируется (404) — сервер живёт в урезанном режиме.
- Провайдеры Google/Apple/Steam (ADR 0002) лягут тем же путём: свой `Validate` → `FindOrCreateByIdentity(provider, …)` → тот же issuer.

## Публичный деплой (Fly.io, T9.0)
Один контейнер, без k8s (ADR 0002). Конфиг — [`fly.toml`](fly.toml) рядом; Fly собирает наш `Dockerfile` напрямую. Игровые данные тут НЕ живут — они static-first на GitHub Pages.

**Первый запуск (разово, нужен аккаунт Fly + карта для верификации):**
```bash
brew install flyctl          # или: curl -L https://fly.io/install.sh | sh
fly auth login
fly apps create aegis-draft-api          # имя должно совпадать с app в fly.toml
cd server && fly deploy                   # соберёт и задеплоит; выдаст https://<app>.fly.dev
curl https://aegis-draft-api.fly.dev/healthz   # → {"status":"ok","env":"prod"}
```

**Деплой из CI** — [`.github/workflows/deploy-server.yml`](../.github/workflows/deploy-server.yml): push в `main` с изменениями в `server/**` (или ручной запуск) прогоняет `go vet/build/test` и `fly deploy`. Нужен один секрет в репозитории:
```bash
fly tokens create deploy -x 999999h      # deploy-scoped токен
# → GitHub → Settings → Secrets and variables → Actions → New secret: FLY_API_TOKEN
```

**Секреты приложения из env**: `fly secrets set DATABASE_URL=… BOT_TOKEN=… SESSION_SECRET=…` — Fly инъектит их в env, читает `config.Load()` (без всех трёх auth-маршрут не поднимается). В `fly.toml` держим только НЕсекретное (`APP_ENV`, `PORT`).

## Статус
Скелет (T8.1) + аккаунты (T8.2) + Telegram-auth (T8.3, T9.8): health/readiness, конфиг, единый контракт ошибок, graceful shutdown, `users`/`identities` (goose+sqlc), валидатор initData, `POST /api/auth/telegram` → JWT. Дальше — провайдеры Google/Steam (T8.3), сейвы (T8.4), дейлик/ре-симуляция (T8.5), лидерборд (T8.6). См. [BACKLOG M8](../docs/BACKLOG.md).

> Анти-чит (T8.5): дейлик/лидерборд валидируются сервером ре-симуляцией на Go. Для переиспользования `pipeline/internal/{model,rating}` потребуется вынести их из `internal/` в общий модуль (кросс-модульно `internal/` не импортируется) — решить в T8.5.
