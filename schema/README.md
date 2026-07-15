# Data Contract — Aegis Draft

Источник истины для формата игровых данных. **Go-пайплайн** их генерирует, **TS-фронт** потребляет. Оба конца валидируются против JSON Schema из этой папки.

- Формат: JSON Schema **draft-07**.
- Версия контракта: `schemaVersion = 1` (пишется в `manifest.json`).
- Все файлы отдаются статикой из `web/public/data/` (static-first).

## Ключевые принципы (чиним дефекты 322-0)

1. **Единый канонический `accountId`.** В оригинале игроки в разных файлах шли под разными id (`steamId` в паках vs иные account_id в статистике) → часть связей не матчилась. У нас **везде один и тот же `accountId`** (OpenDota 32-bit account_id) — в паках, статистике, тиммейтах, synergy.
2. **Все производные рейтинги версионируются.** Поля `ovr/impact/economy/reliability` и team-success считаются по явной модели; версия пишется в `manifest.ratingModelVersion`.
3. **Сглаженные winrate.** Сырые `winrate` при малых `games` шумят — фронт использует сглаживание (`score = (winrate·games + m·μ)/(games+m)`), но в данных храним сырые `games`/`winrate`, чтобы модель сглаживания можно было менять на клиенте.

## Файлы данных

| Файл | Тип | Назначение | Schema |
|---|---|---|---|
| `manifest.json` | object | Версии, дата сборки, список форматов | `manifest.schema.json` |
| `events.json` | array | Турниры | `events.schema.json` |
| `heroes.json` | array | Герои (Valve hero_id) | `heroes.schema.json` |
| `packs.json` | array | Team Packs (команда × турнир) | `packs.schema.json` |
| `players.json` | object | Справочник игроков (`accountId` → профиль) | `players.schema.json` |
| `playerHeroStats.json` | object | `accountId` → `heroId` → {games, winrate} (pro window) | `playerHeroStats.schema.json` |
| `careerPlayerHeroStats.json` | object | Pro tier-1 all-time player×hero (Hero Synergy) | `careerPlayerHeroStats.schema.json` |
| `teammates.json` | object | `accountId` → [accountId] | `teammates.schema.json` |
| `squadSynergy.json` | array | Сыгранность пар | `squadSynergy.schema.json` |
| `eventHeroStats.json` | object | `eventId` → `accountId` → `heroId` → {games, winrate} | `eventHeroStats.schema.json` |
| `teamSuccess.json` | object | Успех команд по окнам для Mixed Draft; сырой `games+winrate` и производный score | `teamSuccess.schema.json` |

> `players.json` — новый справочник (в оригинале профиль игрока был размазан по пакам). Нужен для Mixed Draft (собрать кандидатов из разных команд) и для дедупликации id.

## Как режимы потребляют данные

- **Team Packs (Classic):** пул паков фильтруется по `manifest.formats` (окно/legacy) → `packs.json`. Рейтинг игрока — из пака (`ovr` при Event) или пиковое окно (Peak).
- **Mixed Draft:** кандидаты собираются из `players.json` (по роли, из разных команд в окне); рейтинг — из `teamSuccess.json` за окно × индивидуальная поправка.
- **Hero Synergy:** `careerPlayerHeroStats` (pro all-time) или `eventHeroStats` (event-scoped). `playerHeroStats` — pro window.
- **Chemistry:** `squadSynergy` + `teammates`.

## Идентификаторы

| Сущность | id |
|---|---|
| Игрок | `accountId` (int, OpenDota account_id) |
| Герой | `id` (int, Valve hero_id) |
| Событие | `id` (string, напр. `ti2024`, `esl-birmingham-2024`) |
| Команда | `teamId` (int, OpenDota/Liquipedia team id) |
| Пак | `id` (string, `{eventId}-{teamId}`) |

## Роли
`role ∈ {"safelane","mid","offlane","support"}`. `support` встречается дважды на команду; два саппорт-слота взаимозаменяемы. Деление на 4/5 **не делаем** (см. PRD §5.1).

`packs[].players` содержит минимум валидную пятёрку, но может включать substitutes сверх пяти. Игровой слой показывает всех кандидатов и проверяет покрытие ролей; normalize не должен молча обрезать ростер.
