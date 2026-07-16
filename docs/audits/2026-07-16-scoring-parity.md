# Reference audit — скоринг (Base / Hero Synergy / Chemistry) vs 322-0

## Паспорт

- Дата: 2026-07-16
- Наша версия / commit: `ratingModelVersion v1.5.2 → v1.6.0` (эта правка)
- Референс и URL/версия: [322-0.app](https://322-0.app/play), статик-датасет `/data/*.json` (снят локально) + бандл
- Scope: как считаются Base/OVR игрока, Hero Synergy (назначение + значение), Chemistry — 322-0 против нашей реализации
- Конфиг / seed / viewport: реальные данные обоих проектов; сравнение кода + величин, не UI
- Проверки и команды: `go test ./...`, `npm run test`, инспекция `web/public/data/packs.json` (наш) + `/tmp/322_*.json` (референс), чтение `web/src/game/{assign,score}.ts` и `pipeline/internal/domain/{players,packs,build}.go`

## Матрица

| Capability | Референс (322-0) | Aegis Draft (до фикса) | Статус | Evidence | Решение |
|---|---|---|---|---|---|
| Источник герой-статы | Datdota tier-1/2, pro-only | OpenDota tier-1 pro-only | `parity` | v1.5.1, `careerPlayerHeroStats` из match details | — |
| Base / OVR | **per-event** (форма на турнире) | **глобальный per-account** | `defect` (P0) | код: `BuildRatings` «ровно один PlayerRating на account»; данные: 0/3060 accountId варьируют OVR; Collapse=91 на всех 8 событиях | **исправлено** — `BuildEventRatings` |
| Назначение героев | по числу игр | по числу игр (`games·1000`) | `parity` | `assign.assignmentPairScore`, `bestAssignment` | — |
| Hero Synergy — значение | games-driven («more games is better») | **winrate-driven** (Σ `smoothedWinrate−0.5`) | `defect` (P1) | код: `pairScore = smoothedWinrate`; несогласовано с матчингом по играм | **исправлено** — `pairScore` = насыщение по играм |
| Chemistry — структура | co-games, насыщение, сумма пар | co-games, насыщение, сумма пар | `parity` | `chemMaxPerPair·g/(g+half)` | — |
| Chemistry — величина | 498 игр→~2.2, 588→~2.3, 153 former→~0.6 | `max=7` даёт 498→3.5 (завышено) | `defect` (P2) | расчёт по формуле vs скрины 322-0 (`Pure+Gpk 498·+2.2`) | **исправлено** — `chemMaxPerPair` 7→4.3 |

## Приоритеты

- **P0 — Base/OVR глобальный вместо per-event.** Save-/Noone всегда с максимальным OVR ⇒ выгодно брать только их, драфт теряет смысл. Ломает корректность игрового цикла.
- **P1 — Hero Synergy value winrate-driven** при games-driven матчинге (внутреннее противоречие) и вразрез с 322-0 + PRD §5.4/§5.7.
- **P2 — Chemistry-величины завышены** относительно 322-0.

## Синхронизация

- PRD: §5.4.1 (per-event Base) и §5.7 (games-driven synergy) уже описывали целевое поведение — код закрыл расхождение спека↔код. §5.8 Chemistry — co-games, актуально.
- BACKLOG: см. `TDATA-SCORE1` (эта правка, ✅).
- Skill / rule: `scoring-model` (games-driven synergy/chemistry, per-event Base) — актуализирован ранее.
- Исправлено сейчас: все три (`v1.6.0`): (1) `domain.BuildEventRatings` per-event; (2) `assign.pairScore` games-driven; (3) `SCORING.chemMaxPerPair` 4.3.
- Отложено и почему: нет — все три подтверждённых дефекта закрыты.

## Повторная проверка

- [x] воспроизведение больше не падает (детерминизм сохранён);
- [x] чистая логика / unit tests — `TestBuildEventRatingsPerEvent` (OVR_win > OVR_lose), 86 vitest, Go `./...`;
- [x] UI golden path — Playwright smoke;
- [x] typecheck/build — `tsc`, `vite build`, `go build`;
- [x] документы не противоречат реализации — PRD §5.4.1/§5.7/§5.8, scoring-model skill.

> Эффект #1 (per-event) появляется после прогона пайплайна (данные переэмитятся с event-scoped OVR); #2/#3 — сразу на деплое фронта. Форма данных не менялась (`packs[].players[].ovr` тот же), `data-contract` не нарушен.
