# Pipeline (Go ETL)

Генерирует игровые JSON (`schema/`) из OpenDota. Пользователь в рантайме к API не ходит — всё считается офлайн и отдаётся статикой. Боевой датасет собирает только CI (`.github/workflows/data-refresh.yml`, ежедневно); руками `web/public/data` не коммитят.

Реализовано: общий source transport, OpenDota client, explorer-discovery tier-1 лиг, resumable details, canonical-id normalize, aggregate, event-рейтинги (модель `v1.13.0`), доменный датасет (`--emit-domain`), emit и validate. Liquipedia — только граница под авторизованный API (placements/призовые/ростеры deferred). Статус и DoD — в [`docs/BACKLOG.md`](../docs/BACKLOG.md).

## Стадии

```
fetch → normalize → aggregate → rate → emit → validate
```

1. **fetch** (`collect`, `opendota`, `sourcehttp`) — `/leagues` → tier-1 лиги (`tier1`), discovery матчей через `/explorer` (чанки по 100 лиг, граница `--as-of`), затем `/matches/{id}`; справочники `/teams`, `/heroes`, логотипы `/teams/{id}`. Raw-кэш — чекпоинт: попадания бесплатны, бюджет расходуют реальные HTTP attempts, исчерпание бюджета — валидный partial progress.
   - Liquipedia LPDB: только одобренный API access и выданная OpenAPI-спека; scraping fallback запрещён.
2. **normalize** (`normalize`) — единый `accountId`, дедуп игроков, промежуточный `data/normalized/opendota.json` (не public schema).
3. **aggregate** (`aggregate`) — pro window `playerHeroStats`, pro all-time `careerPlayerHeroStats`, `teammates`, `squadSynergy` (только пары) — из тех же match details; `data/aggregate/opendota.json` с completeness discovery/details.
4. **rate + domain** (`rating`, `roles`, `formats`, `domain`) — события из tier-1 лиг, окна `last_1y/2y/5y` от as-of + курируемый `valve_legacy` (`formats.Assign`), роли на событии, per-event OVR/IMP/ECO/REL, паки с гейтом присутствия (`packs[].formats`), `players`, прокси `teamSuccess`, `eventHeroStats`.
5. **emit** (`emit`) — `web/public/data/*.json` строго по `schema/` + `manifest.json` (`dataHash` по контенту); запись атомарная.
6. **validate** (`validate`) — кросс-файловые инварианты в Go и JSON Schema через `.claude/skills/data-contract/tools/validate_data.mjs`.

## Структура

```
pipeline/
├─ cmd/build/main.go   # CLI
└─ internal/
   ├─ sourcehttp/      # rate-limit + retry + raw cache (вечный / MaxAge)
   ├─ opendota/        # typed OpenDota client
   ├─ liquipedia/      # authorized boundary; typed API после access
   ├─ collect/         # resumable discovery (explorer, proMatches) + details
   ├─ normalize/       # канонизация id, snapshot
   ├─ aggregate/       # player×hero, teammates, пары squadSynergy
   ├─ tier1/           # tier-1 и valve_legacy лиги
   ├─ formats/         # окна форматов от as-of
   ├─ roles/           # роли по lane_role/экономике
   ├─ rating/          # модель OVR (ModelVersion)
   ├─ domain/          # события, паки, игроки, teamSuccess, eventHeroStats
   ├─ model/           # доменные типы (зеркало schema/)
   ├─ artifact/        # атомарная запись JSON
   ├─ emit/            # запись датасета + dataHash
   ├─ validate/        # инварианты + JSON Schema
   └─ pipeline/        # оркестрация Run
```

## Raw-кэш и свежесть discovery

Raw-кэш (`data/raw/<источник>/<sha256(URL без api_key)>.json`) — чекпоинт resumable-сбора: попадание в кэш бесплатно, бюджет расходуют только реальные HTTP attempts. Ответы живут по-разному:

| Запрос | Кэш | Почему |
|---|---|---|
| `/matches/{id}`, `/teams/{id}` | вечный | матч иммутабелен; логотип команды — best effort |
| `/explorer` (discovery матчей tier-1 лиг) | ключ включает as-of | SQL ограничен `start_time < полночь UTC дня --as-of`: новый as-of — новый запрос, тот же as-of — кэш |
| `/leagues`, `/teams`, `/heroes` | срок годности 20 ч (`opendota.DirectoryMaxAge`) | новые лиги и герои, переименования; время загрузки — в `<ключ>.meta.json` |

- **Окно данных полуоткрытое:** `[as-of − N лет, as-of)`. Матчи дня as-of приедут следующим прогоном — к тому времени OpenDota успевает их распарсить, а детали матча кэшируются навсегда.
- **Срок годности считается по `fetchedAt` из метаданных, а не по mtime:** mtime теряется при копировании кэша без `-p`, и просроченный справочник выглядел бы свежим. Тело без метаданных (записанное до срока годности) считается просроченным.
- **Недоступный справочник не роняет прогон:** если обновить просроченный ответ не удалось по resumable-причине (бюджет, 429, устойчивый 5xx), берётся прежний (`stale=N` в логе `[progress]`).
- **Детерминизм:** output — функция raw-кэша и версии модели; повтор с тем же `--as-of` и тем же raw даёт тот же датасет. Свежесть решает только, когда перезапросить raw.
- **Бюджет ежедневного прогона** (cron `data-refresh`: `--request-budget 2000`, клиент держит ~50 req/min при лимите Free Tier 60/min): +3 справочника и +3 explorer-запроса (по `/leagues` на 2026-07: 166 tier-1 лиг → 2 чанка по 100, 33 valve_legacy → 1), плюс `/matches/{id}` новых матчей — ноль между турнирами, десятки в игровой день. Explorer-ответы прошлых дат остаются в raw-кэше (~3 файла в день).

## CLI

Без источника запуск — ошибка «nothing to do»: offline-режим, писавший пустой датасет в `--out`, удалён. Опциональный premium-ключ — `OPENDOTA_API_KEY` (не Steam Web API key).

| Флаг | По умолчанию | Что делает |
|---|---|---|
| `--fetch-opendota` | `false` | источник OpenDota (обязателен) |
| `--emit-domain` | `false` | собрать доменный датасет и записать в `--out` |
| `--collect-window` | `false` | resumable-сбор полного окна (emit только при полных discovery+details) |
| `--as-of` | — | UTC-дата `YYYY-MM-DD`; обязательна с `--collect-window`/`--emit-domain` |
| `--window` | `last_2y` | окно rolling-статистики: `last_1y` \| `last_2y` \| `last_5y` |
| `--request-budget` | `100` | реальные HTTP attempts за прогон; `0` — без лимита |
| `--match-detail-limit` | `0` | smoke: details первых N матчей |
| `--max-pages` | `0` | smoke: страниц `/proMatches` (только без `--emit-domain`) |
| `--min-event-matches` | `8` | порог матчей на событие |
| `--max-matches-per-league` | `150` | потолок деталей на событие; cron ставит `0` |
| `--out` / `--cache` | `../web/public/data` / `./data/raw` | куда писать датасет / raw-кэш |
| `--normalized-out` / `--aggregate-out` | `./data/{normalized,aggregate}/opendota.json` | промежуточные артефакты |
| `--schema-validator` / `--node` | skill validator / `node` | JSON Schema проверка после emit |

```bash
# Как в CI (data-refresh): полное окно, повторяйте ту же команду — добор с первого cache miss.
go run ./cmd/build --fetch-opendota --emit-domain --collect-window \
  --window last_5y --as-of 2026-09-13 --request-budget 2000 \
  --max-matches-per-league 0 --out ../web/public/data

# Smoke без emit: raw + normalized/aggregate на 10 матчах, public output не меняется.
go run ./cmd/build --fetch-opendota --match-detail-limit 10 --cache ./data/raw
```

## Открытые вопросы

- OpenDota Free Tier доступен без ключа; premium key нужен только для high-volume и оформляется через OpenDota login/billing.
- Liquipedia LPDB — подать заявку; получить base URL, auth scheme, OpenAPI spec и лимит плана. MediaWiki scraping как обход не используем. Черновик заявки: [`docs/LIQUIPEDIA_ACCESS.md`](../docs/LIQUIPEDIA_ACCESS.md).
