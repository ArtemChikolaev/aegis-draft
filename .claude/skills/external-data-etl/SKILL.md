---
name: external-data-etl
description: "При сборе и нормализации OpenDota/Liquipedia в pipeline: доступ, лимиты, кэш, ретраи, атрибуция и id. Не для игровых ассетов или обычного поиска в интернете."
---

# External data ETL — как тянуть OpenDota и Liquipedia правильно

Пользователь в рантайме к внешним API **не ходит**. Всё тянется офлайн в raw-кэш и детерминированно пересчитывается в игровые JSON. Стадии: `fetch → normalize → aggregate → rate → emit → validate`.

## Источники и жёсткие правила
### Liquipedia (турниры, ростеры, placement, патчи, лого)
- **Сначала проверить актуальные условия доступа** по официальному источнику и выданной спецификации/тарифу. Историческая доступность Basic не является текущим разрешением.
- Использовать только base URL, auth scheme/header, endpoint DTO и rate-limit из **выданной Liquipedia OpenAPI-спеки/плана**. Не угадывать endpoint/auth и не обходить отсутствие доступа скрейпингом wiki/MediaWiki.
- **User-Agent обязателен** и должен содержать имя проекта + контакт. Дженерик-агенты (`Go-http-client`, `node-fetch`) **банятся** — задать кастомный UA явно.
- **Атрибуция CC-BY-SA обязательна** — писать источник в `manifest.source.liquipedia` и в UI-футере.
- Поддерживать gzip, переиспользовать соединения, **кэшировать** (нарушения → авто-IP-бан).

### OpenDota (pro-матчи, player×hero, детали матчей)
- Free Tier работает **без ключа**: лимиты не считать вечными константами. Перед bulk-run сверить официальные условия и конфигурацию клиента; соблюдать более строгий применимый лимит.
- API key — premium/high-volume режим (300 req/min в текущей конфигурации), требует OpenDota login/billing; Steam Web API key к нему не относится.
- Эндпоинты: `/proMatches`, `/matches/{id}`, `/players/{id}/heroes`.

### Dotabuff — НЕ используем
Нет публичного API; скрейпинг против ToS, за Cloudflare, хрупок. Всё нужное есть в OpenDota. Не добавлять как источник (см. ADR 0001).

## Правила реализации (Go)
1. **Rate-limit на клиента** — под актуальный лимит OpenDota или выданного Liquipedia-плана; один worker-pool, не долби параллельно сверх лимита.
2. **Кэш raw** в `pipeline/data/raw/` — не перезапрашивай то, что уже скачано (ключ = URL/эндпоинт+параметры).
3. **Ретраи** с бэк-оффом на 429/5xx; уважать `Retry-After`. Явный таймаут на запрос.
4. **Канонизация id при normalize** — сразу приводи к единому `accountId` (см. [data-contract](../data-contract/SKILL.md)); не тащи разные id-пространства дальше по пайплайну.
5. **Детерминизм** — одинаковый raw + версия модели ⇒ одинаковый output. Никакой недетерминированной агрегации.
6. **Секреты** (опциональный premium key OpenDota, Liquipedia credentials; контакт для UA) — из env, не в код (`.env`, см. `.gitignore`). URL ошибок редактировать, чтобы query-token/key не попадал в логи. Не подставлять `STEAM_API_KEY` вместо `OPENDOTA_API_KEY`.
7. **Bulk-сбор обязан быть budget-resumable** — фиксируй границу окна (`as-of`), считай бюджет по реальным HTTP attempts (cache hits бесплатны), а исчерпание бюджета возвращай как валидный partial progress. Повтор той же команды должен переиграть raw-кэш и продолжить с первого cache miss; в intermediate artifact записывай отдельно completeness discovery/details/dependent endpoints. Не помечай ограниченный `max-pages`/`match-limit` smoke как полное окно и не перезаписывай полезный intermediate artifact пустым результатом, если бюджет закончился на discovery.

## Чек перед «готово» (ETL)
- [ ] Кастомный User-Agent с контактом выставлен (Liquipedia).
- [ ] Liquipedia endpoint/auth scheme/limit взяты из выданной спецификации; нет несанкционированного scraping fallback.
- [ ] Rate-limit соблюдён, есть кэш и ретраи с бэк-оффом.
- [ ] Bulk-run имеет фиксированный `as-of`, request budget и тест фактического resume; completeness стадий видна в metadata.
- [ ] Атрибуция записана в `manifest.source`.
- [ ] id канонизированы на стадии normalize.
- [ ] Секреты из env, не захардкожены.

## Связано
- Выход пайплайна → контракт [data-contract](../data-contract/SKILL.md). Рейтинговые стадии → [scoring-model](../scoring-model/SKILL.md).
