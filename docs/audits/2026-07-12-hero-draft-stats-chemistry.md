# Hero draft, player stats и Chemistry — parity audit

## Паспорт

- Дата: 2026-07-12
- Наша версия / commit: `38b8137` + рабочий diff этого аудита
- Референс и URL/версия: `https://322-0.app/play`, production bundle `index-BCFh8CR5.js`; пользовательские screenshots Classic Draft
- Scope: пять hero offers, games player×hero, инспекция игрока, DatDota link, промежуточные Hero Synergy/Chemistry, стратегия данных
- Конфиг / seed / viewport: Aegis Classic / Team Packs / last_2y / Event / Auto; desktop light+dark; реальный snapshot `league-19785`
- Проверки и команды: public bundle inspection; `npm run verify`; real-data Team/Mixed smoke; `npm run typecheck`; `npm run build`; schema validator; browser start→draft→player inspector

## Матрица

| Сценарий / capability | Референс: наблюдение | Aegis Draft: наблюдение | Статус | Evidence | Решение / задача |
|---|---|---|---|---|---|
| Пять героев в каждом паке | Pack UI содержит 5 hero cards; bundle использует `heroPackSize`/filler | После исправления pack count и hero cards всегда равны 5 | `parity` | screenshots 1–2; `RunEngine.packHeroes`; новый verify «после пика снова 5» | Детерминированно добирать из signature heroes текущего format-pool |
| Games назначенной пары | В breakdown: `player · hero · N games`; портрет имеет badge games | Drafted hero показывает owner + career games | `parity` | screenshot 4; bundle `assignment...games`; DraftScreen browser smoke | Показывать career games из `playerHeroStats` |
| Инспекция игрока | Клик по узлу открывает event heroes и career hero combos с games/winrate | Клик по узлу открывает те же два stats scope | `parity` | screenshot 5; bundle `eventHero`, `playerHeroStats`; browser smoke | `PlayerInspector` поверх общего `Modal` |
| DatDota profile | Ник ведёт на `https://datdota.com/players/{id}` | Инспектор содержит canonical DatDota link | `parity` | screenshot 5; production bundle href; modal DOM | Внешняя ссылка по canonical `accountId` |
| Hero Synergy до 5 героев | Бонус суммирует реально назначенные player×hero games; игрок без героя не штрафует | После исправления считаются только назначенные пары; 0 pairs = 0 | `parity` | live browser: 1 player/0 heroes больше не даёт −10 | Делить только на число назначенных пар; 0 pairs ⇒ 0 bonus |
| Chemistry по мере сборки ростера | Bundle суммирует бонусы пар по их совместным games | После исправления Aurora растёт `0 → 0.27 → 0.80 → 1.60 → 2.67` | `parity` | real-data repro; bundle `chemEdges`/pair games | Нормировать промежуточный sum на 10 пар полной пятёрки |
| Формула Hero Synergy | Референс в Classic в основном ранжирует по games | Aegis сглаживает games+winrate и решает exact matching | `intentional-divergence` | PRD §5.7 | Сохраняем более устойчивую модель; UI раскрывает games/winrate |
| Runtime источник данных | Референс загружает предрассчитанный bundle | Aegis загружает 10 static JSON один раз; API во время пиков нет | `parity` | `StaticDataSource`, ADR 0001/0002 | Не заводить runtime-БД; расширять resumable ETL + scheduled refresh |
| Полнота истории | Референс имеет event + career history tier 1–2 | Snapshot: 127 heroes, 120/120 career coverage, но только 1 event | `missing` | manifest/data census | M2.5/S4: полное last_2y + Liquipedia mapping/roster intervals |

## Приоритеты

- P0: нет.
- P1: four-hero offer; отрицательная/разбавленная partial Hero Synergy; ненакопительная Chemistry — исправлено сейчас.
- P2: player stats, games и DatDota link — исправлено сейчас.
- Data gap: multi-event historical snapshot — остаётся M2.5/S4, не требует runtime API/БД.

## Синхронизация

- PRD: §5.7, §5.8, §10-G обновлены.
- BACKLOG: TREF1/TREF3 закрыты; TREF4/TREF6 уточнены.
- Skill / rule: новых процессных правил не требуется; `reference-parity-audit` корректно поймал разницу между data gap и engine defect.
- Исправлено сейчас: 5 offers, games, inspector, DatDota, partial synergy, accumulated chemistry.
- Отложено и почему: полное last_2y/roster history зависит от бюджетного ETL и Liquipedia mapping, а не от UI.

## Повторная проверка

- [x] воспроизведение больше не падает;
- [x] чистая логика / unit tests;
- [x] UI golden path;
- [x] typecheck/build;
- [x] документы не противоречат реализации.
