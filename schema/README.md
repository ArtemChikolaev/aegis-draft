# Data Contract — Aegis Draft

Источник истины для формата игровых данных. **Go-пайплайн** их генерирует, **TS-фронт** потребляет. Оба конца валидируются против JSON Schema из этой папки.

- Формат: JSON Schema **draft-07**.
- Версия контракта: `schemaVersion = 1` (пишется в `manifest.json`).
- Все файлы отдаются статикой из `web/public/data/` (static-first).

## Ключевые принципы (чиним дефекты 322-0)

1. **Единый канонический `accountId`.** В оригинале игроки в разных файлах шли под разными id (`steamId` в паках vs иные account_id в статистике) → часть связей не матчилась. У нас **везде один и тот же `accountId`** (OpenDota 32-bit account_id) — в паках, статистике, тиммейтах, synergy.
2. **Все производные рейтинги версионируются.** Поля `ovr/impact/economy/reliability` и team-success считаются по явной модели; версия пишется в `manifest.ratingModelVersion`.
3. **Сглаженные winrate.** Сырые `winrate` при малых `games` шумят — фронт использует сглаживание (`score = (winrate·games + m·μ)/(games+m)`), но в данных храним сырые `games`/`winrate`, чтобы модель сглаживания можно было менять на клиенте.
4. **Совместимость сейва — по контенту.** `manifest.dataHash` — SHA-256 всех игровых JSON в фиксированном порядке, без самого `manifest.json`. Поэтому новый `builtAt` при неизменных данных не ломает resume, а изменение любого игрового файла меняет хеш.

## Файлы данных

| Файл | Тип | Назначение | Schema |
|---|---|---|---|
| `manifest.json` | object | Версии, дата сборки, контент-хеш данных, список форматов | `manifest.schema.json` |
| `events.json` | array | Турниры | `events.schema.json` |
| `heroes.json` | array | Герои (Valve hero_id) | `heroes.schema.json` |
| `packs.json` | array | Team Packs (команда × турнир) | `packs.schema.json` |
| `players.json` | object | Справочник игроков (`accountId` → профиль) | `players.schema.json` |
| `playerHeroStats.json` | object | `accountId` → `heroId` → {games, winrate} (pro window) | `playerHeroStats.schema.json` |
| `careerPlayerHeroStats.json` | object | Pro tier-1 all-time player×hero (Hero Synergy) | `careerPlayerHeroStats.schema.json` |
| `teammates.json` | object | `accountId` → [accountId] | `teammates.schema.json` |
| `squadSynergy.json` | array | Сыгранность пар: пайплайн эмитит только пары, схема допускает `ids` до 5 | `squadSynergy.schema.json` |
| `eventHeroStats.json` | object | `eventId` → `accountId` → `heroId` → {games, winrate} | `eventHeroStats.schema.json` |
| `teamSuccess.json` | object | Успех команд по окнам для Mixed Draft; сырой `games+winrate` и производный score | `teamSuccess.schema.json` |

> `players.json` — справочник (в оригинале профиль игрока был размазан по пакам): ростер-история и роли игрока, дедупликация id.

### Reserved-поля (схема есть, Go-пайплайн не выдаёт)

Ждут Liquipedia (placements/призовые/патчи) или отдельной модели; клиент обязан жить без них:
`events[].short`, `events[].patch`, `events[].prizePool`, `packs[].placement`, `players[].peak`, `players[].teams[].from/to`, `teamSuccess[].titles/topFinishes/prizeUsd/tiPlacement`.

## Как режимы потребляют данные

- **Team Packs (Classic):** пул строится по `packs[].formats` (гейт присутствия команды; у́же `events[].formats`, проверка на клиенте — `packInFormat` в `game/packs.ts`). Рейтинг игрока — `ovr` из пака (форма на этом событии).
- **Mixed Draft:** кандидаты — игроки паков того же пула, пятёрка из пяти разных команд (`mixedPack`); base — `teamSuccess.json` команды за окно × ограниченная индивидуальная поправка (`game/teamSuccess.ts`).
- **Hero Synergy:** `careerPlayerHeroStats` (pro all-time) или `eventHeroStats` (event-scoped). `playerHeroStats` — pro window.
- **Chemistry:** пары `squadSynergy` (+ `teammates` для UI).

## Идентификаторы

| Сущность | id |
|---|---|
| Игрок | `accountId` (int, OpenDota account_id) |
| Герой | `id` (int, Valve hero_id) |
| Событие | `id` (string, `league-<leagueId>` OpenDota, напр. `league-16935`) |
| Команда | `teamId` (int, OpenDota team_id) |
| Пак | `id` (string, `{eventId}-{teamId}`) |

## Роли
`role ∈ {"safelane","mid","offlane","support"}`. `support` встречается дважды на команду; два саппорт-слота взаимозаменяемы. Деление на 4/5 **не делаем** (см. PRD §5.1).

`packs[].players` содержит минимум валидную пятёрку, но может включать substitutes сверх пяти. Игровой слой показывает всех кандидатов и проверяет покрытие ролей; normalize не должен молча обрезать ростер.
