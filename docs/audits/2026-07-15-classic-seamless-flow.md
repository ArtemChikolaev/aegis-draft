# Аудит: бесшовность Classic-флоу (draft → tournament → result)

## Паспорт

- Дата: 2026-07-15
- Наша версия / commit: `bb9ea29` (main)
- Референс и URL/версия: https://322-0.app/ (живой проход 2026-07-15), режим 322-0 Classic
- Scope: пост-стартовый флоу Classic — переходы draft → (итог драфта) → групповой этап → плей-офф → финальные результаты; фокус на **бесшовности** (кол-во экранов/кнопок-гейтов и «камера»/авто-скролл). Контент самих стадий (боты, сетка, live-reveal, career) уже покрыт TREF-TOUR1 и здесь не переигрывается.
- Конфиг / seed / viewport: Classic · Valve Legacy · Easy · Event Rating · Auto allocation; десктоп 1280×720; референс seed случайный (наш проход — «Your Team», итог 9–12th).
- Проверки и команды: живой проход 322-0 (полный забег до FINAL STANDINGS + Skip); чтение нашего кода `app/App.tsx`, `state/runStore.ts`, `game/tournament.ts`, `features/{result,tournament}/*`.

## Что делает референс (наблюдение, одна непрерывная страница)

Весь забег — **одна вертикально растущая страница**, без переходов на «другие экраны» и без stage-gate кнопок:

1. **Draft (верх):** слева пентагон + ростер + score-strip (Base/Hero Synergy/Chemistry) + разборы Hero Synergy и Squad Chemistry; справа — паки-кандидаты.
2. **По завершении драфта:** правая колонка **на месте** превращается из паков в `PROJECTED FINISH · 18-TEAM FIELD` + список поля (18 команд) + **одна** CTA `Simulate The International →` (и `Abandon Run`). Отдельного «экрана итога» нет — разбор счёта остаётся в левой колонке.
3. **Клик Simulate → ниже дорисовываются секции** и «камера» (авто-скролл) уходит к активной: `THE INTERNATIONAL · 🔴 Simulating live…` → `GROUP STAGE` (A/B, standings наполняются вживую, route UB/LB/OUT) → `UPPER/LOWER BRACKET` (пораундовый reveal до Grand Final) → `FINAL STANDINGS` (1..18). Индикатор LIVE + `Skip ⏭`.
4. **Финал (низ):** шэр-карточка `THE INTERNATIONAL · Finished N–Mth · Champions: … · ростер с event-лейблами · Save as image` → `CAREER` (счётчики + Last 8 runs) → `New Run · Same Settings` / `New Run (change settings)`.

Итого действий пользователя от конца драфта до результата: **одна** кнопка `Simulate` (+ опц. `Skip`). Камера ведёт сама.

## Что делаем мы (наблюдение)

Машина фаз (`state/runStore.ts`): `start → draft → result → tournament`, где `tournament` = под-стадии `field → groups → playoffs` (`game/tournament.ts`), каждая продвигается **ручной кнопкой** (`advanceTournament`).

- `result` — **отдельный полноэкранный `ResultScreen`** (разбор счёта) с кнопкой `Начать турнир →` (`startTournament`).
- `tournament` — отдельный `TournamentScreen`; переходы `field → «→ Группы» → groups → «→ Плей-офф» → playoffs` — **гейты-кнопки**. Внутри `groups`/`playoffs` live-reveal + Skip **уже есть** (TREF-TOUR1).

Действий от конца драфта до результата: **3 клика-гейта** (`start-tournament`, `advance→groups`, `advance→playoffs`), между 4 сменами полноэкранного вида. Авто-скролла/«камеры» нет — виды заменяют друг друга целиком.

## Матрица

| Сценарий / capability | Референс: наблюдение | Aegis Draft: наблюдение | Статус | Evidence | Решение / задача |
|---|---|---|---|---|---|
| Переход draft → пост-драфт | Правая колонка морфится паки→field на месте; разбор счёта остаётся слева; отдельного экрана итога нет | Отдельная фаза/экран `result` (полноэкранный разбор) с кнопкой «Начать турнир» | `defect` (лишний гейт) | `runStore.ts` phase `result`; `features/result/ResultScreen.tsx:160` | Свернуть `result` в бесшовный переход: разбор — в левую колонку драфта; поле + одна CTA справа |
| Запуск турнира | Одна CTA `Simulate The International →` проигрывает весь турнир | 3 стадии, каждая за ручной кнопкой `advanceTournament` | `defect` (лишние гейты) | `TournamentScreen.tsx:307`; `runStore.advanceTournament` | Одна CTA «Симулировать»; стадии проигрываются подряд без ручных гейтов |
| «Камера» / авто-скролл к активной стадии | Одна длинная страница; авто-скролл ведёт к текущей секции | Полноэкранные виды заменяют друг друга; авто-скролла нет | `missing` | наблюдение референса; `app/App.tsx:60` (взаимоисключающие phase-вью) | Единый вертикальный run-вид + авто-скролл (`scrollIntoView`) к активной секции; `prefers-reduced-motion` |
| Live-reveal групп/сетки + Skip | Есть (LIVE + Skip) | Есть (70/320мс + Skip) | `parity` | `TournamentScreen.tsx:31` `useReveal`; TREF-TOUR1 | Переиспользовать as-is |
| Контент стадий (боты/сетка/standings) | field/groups/playoffs с роутингом и итоговой таблицей | Тот же контент | `parity` | TREF-TOUR1 ✅ | Переиспользовать компоненты |
| Финальная шэр-карточка + Save as image | Есть | Итог-панель есть; «Save as image» — отдельно (T3.9 🟨) | `not-applicable` (вне scope) | BACKLOG T3.9 | Не трогаем в этой задаче |
| Career-панель под итогом | Есть | Есть (`CareerPanel`) | `parity` | TREF-CAREER1 ✅ | Переиспользовать |
| Manual hero-allocation (swap) | — (в Auto не наблюдался; в 322-0 своп на карточке) | Живёт на `ResultScreen` (swap-режим) | `unknown` | `ResultScreen.tsx:60` | При сворачивании `result` — сохранить swap-UI в левой колонке; проверить отдельно |

## Приоритеты

- **P1 — бесшовная оркестрация Classic-забега** (ядро запроса): убрать гейт `ResultScreen` и ручные stage-кнопки, свести пост-драфт в один непрерывный run-вид с авто-скроллом. Ключевой слой игрового цикла (подача забега), заявлен пользователем как обязательный «как в 322-0».
- **P2 — полировка «камеры»**: тайминги авто-скролла, поведение при resume (открывать сразу нужную секцию), `prefers-reduced-motion`, mobile-вьюпорт (одна колонка).

Нет P0: корректность счёта, детерминизм и завершаемость забега не затронуты — меняется только подача/оркестрация (презентационный слой + phase-машина), движки `RunEngine`/`TournamentEngine` не трогаем.

## Синхронизация

- PRD: добавить в §6 (UX/поток) требование «бесшовный Classic-забег: пост-драфт без гейт-экранов, один непрерывный вид с авто-скроллом; одна CTA запускает турнир».
- BACKLOG: новая атомарная задача **TREF-TOUR2 — Seamless Classic run flow** (под M5, deps TREF-TOUR1). Не дублирует TREF-TOUR1 (тот закрыл контент/parity стадий; здесь — оркестрация/подача).
- Skill / rule: без изменений (процесс сработал: audit → live → plan).
- Исправлено сейчас: ничего (плановая задача, ждёт согласования подхода).
- Отложено и почему: «Save as image» (T3.9) и mobile-полировка — вне ядра; manual-swap перенос — деталь реализации, проверить при кодировании.

## Повторная проверка (после реализации TREF-TOUR2)

- [ ] воспроизведение/детерминизм забега не сломаны (`verify_tournament`, `verify_career`);
- [ ] чистая логика движков не изменена (границы game/ ≠ ui/);
- [ ] UI golden path: draft → одна CTA → group→playoffs→standings без ручных гейтов, авто-скролл ведёт;
- [ ] resume открывает корректную секцию; `prefers-reduced-motion` отключает авто-скролл-анимацию;
- [ ] typecheck/build/tests зелёные; PRD/BACKLOG не противоречат коду.
