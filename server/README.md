# server — Go API (пользовательское/общее состояние)

Бэкенд aegis-draft по [ADR 0002](../docs/adr/0002-backend-now.md). **Гибрид:** игровые данные остаются static-first (пайплайн → JSON на CDN), сервер держит только динамику — аккаунты, сейвы забегов, мета-прогрессию, лидерборд, дейлик, Manager-персистенс. Правила — скилл `backend-architecture`.

## Стек (T8.0)
- **Router:** `chi` (поверх stdlib `net/http`).
- **БД:** Postgres, запросы через `sqlc`, миграции `goose` (с T8.2).
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
```

## Статус
Скелет (T8.1): health, конфиг, единый контракт ошибок, graceful shutdown. Дальше — БД+миграции (T8.2), auth (T8.3), сейвы (T8.4), дейлик/ре-симуляция (T8.5), лидерборд (T8.6). См. [BACKLOG M8](../docs/BACKLOG.md).

> Анти-чит (T8.5): дейлик/лидерборд валидируются сервером ре-симуляцией на Go. Для переиспользования `pipeline/internal/{model,rating}` потребуется вынести их из `internal/` в общий модуль (кросс-модульно `internal/` не импортируется) — решить в T8.5.
