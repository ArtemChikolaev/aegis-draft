# Aegis Draft

Драфт-рогалик по Dota 2 — вдохновлён [322-0.app](https://322-0.app/play), с расширенной механикой. Собираешь пятёрку по ролям, раздаёшь героев, максимизируешь `Team OVR = Base + Hero Synergy + Chemistry` и ведёшь команду через турнир.

🎮 **Живая версия:** https://artemchikolaev.github.io/aegis-draft/

## Статус
Играбельное ядро в проде: старт → драфт → итог, Team Packs и Mixed Draft, счёт с пентагоном, RU/EN + system/light/dark темы. Данные — **реальный OpenDota-слайс** (события/паки/игроки/рейтинги), обновляется по расписанию. Фронт — на собственной design-system (токены + UIkit + features). Бэкенд (Go API) — скелет, поднимается по [ADR 0002](docs/adr/0002-backend-now.md). План задач — [docs/BACKLOG.md](docs/BACKLOG.md).

## Режимы игры (PRD §5.9)
- **Classic** — all-time драфт (**Team Packs** — из ростеров команд, или **Mixed Draft** — 5 звёзд из разных команд), затем турнирный путь `groups → playoffs → final`. Работает.
- **Esports Manager** *(в разработке)* — веди организацию в регионе: бюджет, контракты, ростер, квалификации.
- **Real Tournament** *(в разработке)* — поле соперников известно заранее (Falcons/BetBoom/Spirit…), их игроки заблокированы (roster lock) — собираешь challenger из свободных игроков и легенд вне турнира.

Формула: **Base** (event-OVR пятёрки) + **Hero Synergy** (оптимальное назначение героев) + **Chemistry** (сыгранность). Роли: `carry/mid/offlane/support×2` (без деления 4/5).

## Как запустить
```bash
# Фронт (Node 24+): dev-сервер на http://localhost:5173
cd web && npm install && npm run dev
# Тесты и валидация (реальный датасет в git; unit/golden — после gen:mock):
npm run validate:data && npm run test && npm run test:e2e && npm run typecheck
# Локально: mock для golden/fixtures и детерминированных unit-тестов:
npm run gen:mock && npm run test

# Go-пайплайн (Go 1.26+): реальный датасет из OpenDota
cd pipeline
go run ./cmd/build --fetch-opendota --emit-domain --as-of 2026-07-11 \
  --match-detail-limit 100 --out ../web/public/data

# Go-сервер (скелет): http://localhost:8080/healthz
cd server && PORT=8080 go run ./cmd/api
```

## Архитектура
| Слой | Стек | Роль |
|---|---|---|
| **`pipeline/`** | Go | ETL: OpenDota → игровые JSON (`fetch→normalize→aggregate→rate→emit→validate`), детерминизм, версионирование. |
| **`web/`** | TS + React + Vite + Zustand | Фронт + игровая логика счёта на клиенте. Design-system: `design/` (токены+тема) · `ui/` (примитивы) · `features/` (экраны) · `i18n/` · `game/` (логика) · `app/` (шелл). |
| **`server/`** | Go + chi + Postgres | API пользовательского/общего состояния (аккаунты/сейвы/лидерборд/дейлик). Игровые данные — **не** тут (они статика). |
| **`schema/`** | JSON Schema | Единый контракт данных между Go и TS — источник истины. |

**Static-first гибрид** (ADR [0001](docs/adr/0001-tech-stack.md)/[0002](docs/adr/0002-backend-now.md)): игровые данные — статикой на CDN (масштабируется бесконечно), сервер держит только изменяемое состояние. **Без Kubernetes.**

## Данные, деплой, CI/CD
Workflow [.github/workflows/ci.yml](.github/workflows/ci.yml):
- **Проверки** (push/PR): Go pipeline · Go server · Web (`gen:mock`→`validate:data`→`test`→`test:e2e`→`typecheck`→`build`; mock только в CI web-job) · antipattern-scan.
- **Деплой на GitHub Pages** (push в `main`, если проверки зелёные) — публикует **реальный** `web/public/data` из data-refresh.

`web/public/data/*.json` версионируются (OpenDota-слайс). Обновляет [.github/workflows/data-refresh.yml](.github/workflows/data-refresh.yml). **CI web-job** генерирует mock эфемерно (`gen:mock`) для Vitest/Playwright/golden; **deploy** — без mock. Локально: `gen:mock` для golden (`npm run test:golden:update`).

Разовая настройка GitHub: **Settings → Pages → Source: GitHub Actions**; **Settings → Actions → General → Workflow permissions → Read and write**.

## Система скиллов и правил (для AI-агентов)
Единый контракт `CLAUDE.md` (= `AGENTS.md`), процедуры-скиллы в `.claude/skills/` (авто-активация по `description`), зеркала для Cursor (`.cursor/rules/`) и Codex (`.codex/skills/`). Маршрутизация «задача → скилл» — [docs/ai/INDEX.md](docs/ai/INDEX.md), принципы — [docs/ai/PRINCIPLES.md](docs/ai/PRINCIPLES.md).
- **Архитектурные/доменные:** `data-contract`, `external-data-etl`, `scoring-model`, `frontend-architecture`, `game-state-architecture`, `backend-architecture`.
- **Процессные:** `discovery-before-code`, `plan-first-communication`, `reference-parity-audit`, `self-review-checklist`.

## Документы
- 📄 **[docs/PRD.md](docs/PRD.md)** — концепция, механики, режимы, роадмап.
- 🏛 **[ADR 0001](docs/adr/0001-tech-stack.md)** (стек, static-first) · **[ADR 0002](docs/adr/0002-backend-now.md)** (backend сейчас).
- 🎨 **[docs/design-language.md](docs/design-language.md)** — визуальная айдентика.
- 📐 **[schema/README.md](schema/README.md)** — контракт данных.
- 🤖 **[CLAUDE.md](CLAUDE.md)** — контракт для AI-агентов.

## Лицензия
[MIT](LICENSE) © 2026 Artem Chikolaev. Некоммерческий фан-проект по Dota 2; Dota 2 и связанные материалы — собственность Valve. Данные: OpenDota (атрибуция), Liquipedia — только при авторизованном доступе (CC-BY-SA).
