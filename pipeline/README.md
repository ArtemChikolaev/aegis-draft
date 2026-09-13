# Pipeline (Go ETL)

Генерирует игровые JSON (`schema/`) из внешних источников. Пользователь в рантайме к API не ходит — всё считается офлайн и отдаётся статикой.

Go-модуль, CLI, общий source transport, OpenDota client, canonical-id normalize, emit и validate реализованы. Liquipedia typed client и сборка доменного датасета ждут одобренного API access; aggregate/rate пока skeleton. Статус и DoD — в [`docs/BACKLOG.md`](../docs/BACKLOG.md).

## Стадии

```
fetch → normalize → aggregate → rate → emit → validate
```

1. **fetch** — тянем сырьё в `data/raw/` (кэш), соблюдая rate-limit.
   - Liquipedia LPDB: только одобренный API access и выданная OpenAPI-спека; scraping fallback запрещён.
     - Выданная auth scheme + User-Agent с контактами, лимит плана, кэш и атрибуция CC-BY-SA.
   - OpenDota: resumable-пагинация pro-матчей (`/proMatches`), детали (`/matches/{id}`), career player heroes. Raw-кэш служит чекпоинтом; бюджет расходуют только реальные HTTP attempts.
2. **normalize** — приводим к каноническим id: **единый `accountId`** во всех сущностях (чиним дефект оригинала).
   - До подключения Liquipedia можно собрать промежуточный `data/normalized/opendota.json`: match details, команды, герои и дедуп игроков. Это internal ETL artifact, не public schema.
3. **aggregate** — из матчей считаем: per-event player stats, player×hero (career + event), пары (squad synergy), тиммейтов, историю команд.
   - Window `playerHeroStats`, `teammates` и `squadSynergy` считаются из normalized match details; отдельный `careerPlayerHeroStats` — из `/players/{accountId}/heroes`. Оба intermediate artifacts содержат раздельные `discovery/details/career` completeness и счётчики network/cache.
   - `eventHeroStats` ждёт авторитетный mapping `leagueId → eventId`; numeric league id не выдаём за публичный event slug.
4. **rate** — модель рейтингов (версионируется):
   - `v1.0.0` реализует role-relative `IMP/ECO/REL` и role-aware `OVR`, shrinkage малых выборок и confidence к 50. Вход требует role-labelled match performances; роли не угадываются rating-слоем.
   - `v1.1.0` добавляет Peak: rolling 120 календарных дней, `games ≥ 15`, отдельно по ролям; change-point проход эквивалентен ежедневному.
   - `v1.2.0` добавляет Team-Success для Mixed: nested 1/2/5-year windows, prestige placements, log-prize, smoothed winrate, top finishes и player correction по нескольким командам.
   - Реальное заполнение ждёт авторизованные Liquipedia placements/rosters; `valve_legacy` остаётся курируемым набором.
5. **emit** — пишем `web/public/data/*.json` строго по `schema/` + `manifest.json`.
6. **validate** — валидируем артефакты против JSON Schema (sanity-check `counts`).

## Целевая структура

```
pipeline/
├─ go.mod
├─ cmd/build/main.go          # CLI: aegis-build --format last_2y --out ../web/public/data
├─ internal/
│  ├─ sourcehttp/             # общий rate-limit + retry + raw cache
│  ├─ opendota/               # typed OpenDota client
│  ├─ liquipedia/             # authorized boundary; typed API после access
│  ├─ model/                  # доменные типы (совпадают со schema/)
│  ├─ normalize/              # канонизация id
│  ├─ aggregate/              # сборка статистик
│  ├─ rating/                 # OVR/IMP/ECO/REL, peak, team-success
│  ├─ emit/                   # запись JSON по контракту
│  └─ validate/               # проверка против JSON Schema
└─ data/{raw,out}
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

```
# Без источника запуск — ошибка «nothing to do»: offline-режим, писавший пустой датасет в --out, удалён.

# Явный Free Tier live fetch только в raw cache; ключ не обязателен, output не перезаписывается.
go run ./cmd/build --fetch-opendota --cache ./data/raw

# Опционально: premium/high-volume key OpenDota (НЕ Steam Web API key).
OPENDOTA_API_KEY=... go run ./cmd/build --fetch-opendota --cache ./data/raw

# Реальный smoke normalize на первых 10 матчах; public output не меняется.
go run ./cmd/build --fetch-opendota --match-detail-limit 10 \
  --cache ./data/raw \
  --normalized-out ./data/normalized/opendota.json \
  --aggregate-out ./data/aggregate/opendota.json

# Бюджетно-resumable сбор полного last_2y. Повторяйте ту же команду:
# cached страницы/details/players бесплатны, бюджет уйдёт на первый cache miss.
go run ./cmd/build --fetch-opendota --collect-window \
  --window last_2y --as-of 2026-07-11 --request-budget 100 \
  --cache ./data/raw \
  --normalized-out ./data/normalized/opendota.json \
  --aggregate-out ./data/aggregate/opendota.json

# Безопасный smoke: ограничить страницы и/или число details.
go run ./cmd/build --fetch-opendota --collect-window \
  --window last_2y --as-of 2026-07-11 --request-budget 10 \
  --max-pages 2 --match-detail-limit 10
```

## Открытые перед реализацией

- OpenDota Free Tier доступен без ключа; premium key нужен только для high-volume и оформляется через OpenDota login/billing.
- Liquipedia LPDB — подать заявку; получить base URL, auth scheme, OpenAPI spec и лимит плана. MediaWiki scraping как обход не используем.
- Черновик заявки и checklist: [`docs/LIQUIPEDIA_ACCESS.md`](../docs/LIQUIPEDIA_ACCESS.md).
- Список тир-1 событий и веса престижа (TI/Major) для team-success.
