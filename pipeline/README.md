# Pipeline (Go ETL)

Генерирует игровые JSON (`schema/`) из внешних источников. Пользователь в рантайме к API не ходит — всё считается офлайн и отдаётся статикой.

> ⚠️ Требует установленного Go (в текущем окружении Go нет — поставить перед реализацией). Код будет добавлен на этапе реализации.

## Стадии

```
fetch → normalize → aggregate → rate → emit → validate
```

1. **fetch** — тянем сырьё в `data/raw/` (кэш), соблюдая rate-limit.
   - Liquipedia (MediaWiki + LPDB): турниры, даты, патчи, команды, ростеры, placement, лого.
     - User-Agent с контактами (обязательно), 1 req/2s, кэш, gzip, атрибуция CC-BY-SA.
   - OpenDota: pro-матчи (`/proMatches`), детали (`/matches/{id}`), player heroes.
2. **normalize** — приводим к каноническим id: **единый `accountId`** во всех сущностях (чиним дефект оригинала).
3. **aggregate** — из матчей считаем: per-event player stats, player×hero (career + event), пары (squad synergy), тиммейтов, историю команд.
4. **rate** — модель рейтингов (версионируется):
   - `IMP/ECO/REL/OVR` (веса по ролям), Peak (скользящее окно 3–6 мес., `N_min`), team-success (для Mixed).
5. **emit** — пишем `web/public/data/*.json` строго по `schema/` + `manifest.json`.
6. **validate** — валидируем артефакты против JSON Schema (sanity-check `counts`).

## Планируемая структура

```
pipeline/
├─ go.mod
├─ cmd/build/main.go          # CLI: aegis-build --format last_2y --out ../web/public/data
├─ internal/
│  ├─ opendota/               # клиент + rate-limit
│  ├─ liquipedia/             # клиент + User-Agent + кэш
│  ├─ model/                  # доменные типы (совпадают со schema/)
│  ├─ normalize/              # канонизация id
│  ├─ aggregate/              # сборка статистик
│  ├─ rating/                 # OVR/IMP/ECO/REL, peak, team-success
│  ├─ emit/                   # запись JSON по контракту
│  └─ validate/               # проверка против JSON Schema
└─ data/{raw,out}
```

## CLI (план)

```
aegis-build \
  --sources opendota,liquipedia \
  --window last_2y \
  --rating-model v1 \
  --out ../web/public/data \
  --cache ./data/raw
```

## Открытые перед реализацией

- Ключ OpenDota (лимиты free-tier) — оформить.
- Liquipedia LPDB — заявка на доступ (60 req/час) или обойтись MediaWiki.
- Список тир-1 событий и веса престижа (TI/Major) для team-success.
