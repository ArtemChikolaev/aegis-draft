# Aegis Draft

Драфт-рогалик по Dota 2 — вдохновлён [322-0.app](https://322-0.app/play), с расширенной механикой.
Собираешь пятёрку (Team Packs — из ростеров команд, или Mixed Draft — из звёзд разных команд), раздаёшь героев, максимизируешь `Team OVR = Base + Hero Synergy + Chemistry`.

## Статус
MVP-ядро играбельно на мок-данных. Готово: PRD + контракт данных + система скиллов + фронт-MVP (Team/Mixed режимы, счёт, пентагон) + скелет Go-пайплайна. Дальше — реальные данные (OpenDota/Liquipedia). План задач — [docs/BACKLOG.md](docs/BACKLOG.md).

## Как запустить
```bash
# Фронт (Node 24+): dev-сервер на http://localhost:5173
cd web && npm install && npm run dev
# Пересобрать мок-данные и проверить логику/контракт:
npm run gen:mock && npm run verify && npm run validate:data
# Go-пайплайн (скелет, Go 1.26+): эмитит валидный по схеме датасет
cd pipeline && go run ./cmd/build --window last_2y --out ../web/public/data
```

## Деплой и CI/CD
Static-first (ADR 0001): фронт + данные — статикой на CDN, пайплайн — batch-ETL по расписанию, **без сервера, БД и Kubernetes** (они — фаза 2, M8). Workflow — [.github/workflows/ci.yml](.github/workflows/ci.yml):
- **Проверки** (push/PR): Go (`gofmt`/`vet`/`build`/`test`), Web (`gen:mock` → `validate:data` → `verify` → `typecheck` → `build`), antipattern-scan.
- **Деплой на GitHub Pages** (push в `main`, только если проверки зелёные): сборка с `VITE_BASE=/aegis-draft/` + мок-данные → Pages. URL: `https://artemchikolaev.github.io/aegis-draft/`.

**Разовая ручная настройка:** в GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions** (без этого деплой-джоб не опубликует сайт).

Другой хостинг (Cloudflare Pages / Netlify — корень без сабпути): build command `npm ci && npm run gen:mock && npm run build`, publish dir `web/dist`, `VITE_BASE` не задавать. Base-путь фронта берётся из `import.meta.env.BASE_URL`, поэтому работает и в корне, и под сабпутём.

> Реальные данные пока не эмитятся — деплой собирает мок (`gen:mock`). Scheduled data-refresh (крон, прогон Go-пайплайна → реальные `web/public/data`) добавится вместе с emit доменного датасета (BACKLOG M2.5/S4).

## Документы
- 📄 **[docs/PRD.md](docs/PRD.md)** — концепция, разбор оригинала, механики, режимы, стек, роадмап.
- 🏛 **[docs/adr/0001-tech-stack.md](docs/adr/0001-tech-stack.md)** — решение по стеку.
- 📐 **[schema/README.md](schema/README.md)** — контракт данных (источник истины) + JSON Schema.
- 🤖 **[CLAUDE.md](CLAUDE.md)** — контракт для AI-агентов (всегда в контексте). Скиллы: **[docs/ai/INDEX.md](docs/ai/INDEX.md)**.

## Система скиллов и правил (для AI-агентов)
Автоматическая система по образцу aifory: единый контракт `CLAUDE.md` (= `AGENTS.md`), процедуры-скиллы в `.claude/skills/` (авто-активация по `description`), хук-напоминания, зеркала для Cursor (`.cursor/rules/`) и Codex (`.codex/skills/`). Маршрутизация «задача → скилл» — [docs/ai/INDEX.md](docs/ai/INDEX.md), принципы — [docs/ai/PRINCIPLES.md](docs/ai/PRINCIPLES.md).
- Проектные скиллы: `data-contract`, `external-data-etl`, `scoring-model`.
- Процессные: `discovery-before-code`, `plan-first-communication`, `reference-parity-audit`, `self-review-checklist`.

## Структура
```
aegis-draft/
├─ docs/       # PRD, ADR
├─ schema/     # JSON Schema контракта данных (Go генерит, TS потребляет)
├─ pipeline/   # Go: ETL (OpenDota + Liquipedia → JSON)   [скелет: model/emit/CLI]
├─ web/        # TS: React+Vite фронт + игровая логика     [MVP на моках]
└─ server/     # Go: API (фаза 2: дейлик/лидерборд/сейвы)   [не начат]
```

## Стек
- **Go** — data-пайплайн (ETL), опц. API в фазе 2.
- **TypeScript + React + Vite** — фронт и игровая логика; данные — статикой (static-first).
- **JSON Schema** — единый контракт между Go и TS.

Обоснование — в PRD §7 и ADR 0001.
