# CLAUDE.md — aegis-draft

Контекст, который должен быть **всегда** при работе над проектом. Пошаговые процедуры вынесены в скиллы (`.claude/skills/`, авто-активация по `description`); каталог и маршрутизация — [docs/ai/INDEX.md](docs/ai/INDEX.md); принципы ведения скиллов — [docs/ai/PRINCIPLES.md](docs/ai/PRINCIPLES.md).

## Проект
Драфт-рогалик по Dota 2 (аналог 322-0.app). Полное описание — [docs/PRD.md](docs/PRD.md), решение по стеку — [docs/adr/0001-tech-stack.md](docs/adr/0001-tech-stack.md).
- **Go** — data-пайплайн ETL (`pipeline/`): OpenDota + Liquipedia → игровые JSON.
- **TypeScript + React + Vite** — фронт и игровая логика (`web/`); данные — статикой (static-first).
- **JSON Schema** — единый контракт данных (`schema/`), источник истины для Go и TS.

## Правило 0 — Reuse-first (главное)
Перед новым кодом (Go-пакет/функция, TS-модуль/компонент, скрипт, структура данных) — **докажи, что готового аналога нет**. Смотри `README.md`, `docs/PRD.md`, `schema/`, `pipeline/README.md`, `web/README.md`. Формула: «НЕ создаю X, Y — есть A, B; создаю только Q». Процесс — скилл `discovery-before-code`.

## Контракт данных (никогда не нарушать)
- `schema/*.schema.json` — **единственный источник правды** о формате. Меняешь формат → сначала схему, потом оба конца (Go `pipeline/internal/model` + TS `web/src/types`).
- **Единый `accountId`** (OpenDota) во всех сущностях — никаких `steamId` в одних файлах и иных id в других (главный дефект оригинала, чиним его).
- Роли: `safelane/mid/offlane/support` (support ×2), **без деления 4/5**.
- Сырые `games`/`winrate` — в данных; сглаживание — на клиенте. Версии — в `manifest.json`.
- Детали — скилл `data-contract`.

## Внешние данные (ETL)
- Источники: **OpenDota** (матчи, player×hero) + **Liquipedia** (турниры/ростеры). **Dotabuff — не используем** (нет API, ToS).
- Liquipedia: только **авторизованный API-доступ** по выданной OpenAPI-спеке/тарифу; не скрейпить wiki/MediaWiki в обход доступа. User-Agent с контактом, выданные auth credentials из env и **атрибуция CC-BY-SA** в `manifest.source` и UI обязательны. OpenDota: Free Tier работает без ключа (≤60 req/min); premium key опционален и только из env.
- Кэш raw, ретраи с бэк-оффом, канонизация id на normalize. Секреты — из env, не в код. Детали — скилл `external-data-etl`.

## Рейтинги / скоринг
- `Team OVR = Base + Hero Synergy + Chemistry`. Base = Event / Peak (скользящее окно 3–6 мес.) / Team-Success (Mixed).
- **Сглаживание winrate обязательно** при малых выборках; назначение героев — matching (венгерский), не жадность.
- Менял формулу/веса/окно → **бампни `ratingModelVersion`**. Решения зафиксированы в PRD §5. Детали — скилл `scoring-model`.

## Границы
- Go: стадии `fetch→normalize→aggregate→rate→emit→validate` изолированы; детерминизм (raw + версия ⇒ тот же output).
- TS: `game/` (логика) не зависит от `ui/`; доступ к данным — через интерфейс `DataSource` (позже подменяемый на API).

## Перед «готово»
Скилл `self-review-checklist` + `bash .claude/skills/self-review-checklist/tools/antipatterns_grep.sh`. Go: `gofmt -l`, `go vet`, `go build`. TS: `tsc --noEmit`. Менял данные → валидатор `node .claude/skills/data-contract/tools/validate_data.mjs`. Нет несвязанных правок в diff.

## Сравнение с референсом
Если пользователь просит «потестить и сравнить с референсом», «пройтись по оригиналу», «найти, чего не хватает» или сверить с 322-0/Balatro — **обязательно** используй скилл `reference-parity-audit`. Пройди живьём референс и нашу реализацию, классифицируй различия с доказательствами; подтверждённые продуктовые решения синхронизируй с PRD, а баги и gaps — с BACKLOG. Статус ✅ в backlog сам по себе не является доказательством.

## Дисциплина скиллов
1. Повторяющуюся инструкцию — в скилл/CLAUDE.md, а не объяснять заново.
2. Скилл = `description` (когда брать) + инструкции + tools.
3. Композиция: узкие скиллы, не монолит; актуальный список — `docs/ai/INDEX.md`.
4. **Заводим/уточняем скилл из реальной шишки.** В конце сессии: «что забрать в скилл навсегда?»

## Для не-Claude агентов (Codex, Cursor и др.)
Этот файл — единый источник правил; он же `AGENTS.md` (симлинк) и подключён в `.cursor/rules/`. Процедуры — в `.claude/skills/` (единый источник). Маршрутизация — [docs/ai/INDEX.md](docs/ai/INDEX.md). Хуки Claude Code вне Claude **не работают** — валидацию данных и линт держи сам.
