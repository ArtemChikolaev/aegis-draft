# Аудит алгоритмов скоринга: 322-0 vs Aegis Draft (Hero Synergy + Chemistry)

## Паспорт

- Дата: 2026-07-12
- Наша версия / commit: `355a48a` (main), `ratingModelVersion=v1.3.1`, deploy snapshot = 1 событие (EWC 2026)
- Референс и URL/версия: 322-0 — https://322-0.app/ (Classic, автор Noxville; внизу указано «stats from Datdota»)
- Scope: алгоритм Base / Hero Synergy / Chemistry; стратегия источника данных (OpenDota vs Datdota, tier-1, окна)
- Конфиг / seed / viewport: 322-0 Classic · Valve Legacy · Event Rating · прогнаны **Automatic** и **Manual**; наш `web/src/game/{score,assign,packs,engine}.ts` + committed `web/public/data`
- Проверки и команды: живой проход 322-0 в браузере (10 пиков, оба allocation); чтение нашего кода; `git show HEAD:web/public/data/*` для объёма данных

## Матрица

| Сценарий / capability | Референс: наблюдение | Aegis Draft: наблюдение | Статус | Evidence | Решение / задача |
|---|---|---|---|---|---|
| Base = per-event rating | «raw rating игрока в выбранном событии»; один игрок = разный балл на разных турнирах | `baseRating` = средний event-OVR; `heroStatsForAssignment` берёт `eventHeroStats` | `parity` | live explainer + `score.ts:44` | зафиксировано PRD §5.4.1 |
| Hero Synergy = games-weighted matching | глобальный оптимум player×hero, «больше игр — лучше»; Void Spirit переехал с игрока 7 games на 30 games; остаток может получить 0 games; роль не ограничивает | `assignmentPairScore = games·1000 + winrate`, битмаск-DP; tier GREAT/INSANE | `parity` | live (MSS→Malr1ne); `assign.ts:33` | — |
| Chemistry = lifetime попарные co-games | попарно `Saksa + Watson · 185 games · +0.8` для игроков из **разных** паков | формула есть (current ×1, former ×0.35), но данных нет | `defect` (P0) | live; `git show`: 1 событие, 240 внутрикомандных пар, `winrate:0.5` | TREF6 + **TDATA1** |
| Глубина player×hero | богатая career+event история tier-1 | тонкий срез 1 турнира → часто `SIGNATURE_PRIOR` | `defect` (P1) | `git show HEAD:web/public/data/playerHeroStats.json` | TDATA1 |
| Tier-1 scope | только премьер-сцена | нет отбора по лигам (один EWC 2026) | `missing` | manifest `counts.events=1` | PRD §5.4.1, TDATA1 |
| Окна 1y/2y/5y/valve_legacy | нарезка по времени/legacy | в snapshot 1 событие; `valve_legacy` нет в manifest | `missing` | `manifest.formats` | TDATA1, T4.3 |
| Проекция места + Simulate TI | место в поле из 18 команд → плей-офф-симуляция | не реализовано | `missing` (P2) | live result screen | TREF2 / M5 |
| Manual allocation | герой садится на лучшего по играм, ре-оптимизации нет; имя команды редактируемо | `assign()`/`assignWithFixed` в движке; UI-привязки нет; имя команды нет | `missing` (P1) | live manual run | T3.10, T7.1 |
| Заголовок пака = турнир | показывает читаемое имя события | было `league-19785` → **исправлено** на `event.name` | `parity` | `DraftScreen.tsx` (this session) | TREF8 ✅ |
| Источник данных | «stats from Datdota» (автор владеет БД) | OpenDota (санкционированный API) | `intentional-divergence` | live footer; PRD §4.1 | Datdota не источник для нас |

## Приоритеты

- **P0 — Chemistry структурно ≈ 0** из-за отсутствия пожизненной кросс-командной матрицы co-games (данные, не код). Разблокирует TDATA1.
- **P1 — тонкий player×hero** занижает Hero Synergy; Manual allocation UI (T3.10).
- **P2 — projected finish / Simulate TI** (мета-петля, M5); редактируемое имя команды (T7.1).

Вывод: **формулы близки к референсу; разрыв — в данных.** 322-0 «работает», потому что стоит на мульти-эвентной tier-1 истории Datdota (у автора прямой доступ к БД). Нам тот же результат даёт OpenDota (`/peers`, `/heroes`, `/proMatches`+`/matches/{id}`+`/leagues.tier`) — см. TDATA1.

## Синхронизация

- PRD: v0.9 — §5.4.1 (per-event Base + tier-1 scope), §5.7 (games-weighted matching + career/event источник), §5.8 (Chemistry = lifetime попарные co-games + требование к данным), §4/§4.1 (Datdota не источник; `/peers` для Chemistry).
- BACKLOG: TREF6 дополнен root-cause; заведена TDATA1 (peers/hero/tier-1-коллекторы + окна); TREF8 (заголовок пака) ✅.
- Skill / rule: без изменений (процесс аудита отработал штатно).
- Исправлено сейчас: заголовок пака показывает название турнира вместо `eventId` (`DraftScreen.tsx`).
- Отложено и почему: инженерный сбор мульти-эвентного tier-1 датасета (TDATA1) — по отдельной отмашке пользователя; проекция места/Simulate TI — M5.

## Повторная проверка

- [x] воспроизведение больше не падает (движок покрыт `verify_engine`, зелёный на прошлой сессии);
- [ ] чистая логика / unit tests — без изменений логики скоринга в этой сессии;
- [x] UI golden path — правка заголовка пака проверяется `tsc`/build (ниже);
- [x] typecheck/build;
- [x] документы не противоречат реализации (PRD/BACKLOG синхронизированы).
