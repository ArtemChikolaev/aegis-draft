# Web (TypeScript + React + Vite)

Фронтенд Aegis Draft. Вся игровая логика счёта — на клиенте; данные грузятся статикой из `public/data/*.json` (сгенерированы пайплайном).

Полный цикл `старт → драфт → турнир → итог` играется на **реальном OpenDota-слайсе** из `public/data` (mock остаётся только для тестов и golden). Сверх ядра: сейв/резюм забега, шеринг забега ссылкой и стартом по сид-коду, история забегов (карьера), hardcore-режим и справочники (герои / ростер-веб). Актуальные gaps и следующие задачи — в [`docs/BACKLOG.md`](../docs/BACKLOG.md).

**Base-путь:** `DataSource` берёт префикс из `import.meta.env.BASE_URL`, поэтому фронт работает и в корне (dev, Cloudflare/Netlify), и под сабпутём (GitHub Pages). Для сабпути задать `VITE_BASE` при сборке, напр. `VITE_BASE=/aegis-draft/ npm run build`. Деплой и CI — в корневом [README](../README.md#деплой-и-cicd).

## Структура (design-system + features)

```
web/src/
├─ app/          # шелл приложения: App.tsx, providers.tsx (Theme+I18n), App.css
├─ design/       # ДИЗАЙН-СИСТЕМА (единый источник вида)
│  ├─ tokens.css       # :root + [data-theme] — ВСЕ цвета/радиусы токенами (light/dark)
│  ├─ breakpoints.css  # канон sm/md/lg (430/680/980); в @media — литералы, не var()
│  ├─ breakpoints.ts   # те же числа для matchMedia / JS
│  ├─ base.css         # reset, типографика, focus, keyframes, reduced-motion
│  └─ theme/           # ThemeProvider (data-theme на html, persist, system)
├─ i18n/         # общий словарь RU/EN (core.ts) + I18nProvider
├─ ui/           # UIKIT — общие темизированные примитивы (CSS Modules):
│                #   Button, Surface, Eyebrow, Banner, Chip, RoleTag, SoonBadge,
│                #   StatTile, Select, TextField, PlayerPicker, Modal, OptionGroup,
│                #   HeroThumb, Dealt, TeamName, TeamSigil + index.ts (barrel)
├─ features/     # экраны, собранные ИЗ ui/ (+ локальный CSS раскладки):
│  ├─ start/       #   StartScreen, ResumeBanner, SeedField, RunLinkPrompt + start.css
│  ├─ draft/       #   DraftScreen, Pentagon, HeroAllocation, PlayerInspector, разборы счёта
│  ├─ tournament/  #   симуляция турнира, сетка, итог, карьера и шеринг забега
│  ├─ result/      #   раскладка экрана итога (result.css)
│  ├─ settings/    #   язык, тема, паспорт датасета и ссылки на справочники
│  ├─ heroes/      #   справочник: популярность героев (+ режим выбранного игрока)
│  └─ teammates/   #   справочник: ростер-веб (кто с кем играл в одном ростере)
├─ tma/          # адаптер Telegram Mini App — ЕДИНСТВЕННОЕ место, знающее про Telegram:
│                #   ленивая загрузка SDK, BackButton↔shellStore, цвет чрома, хаптика.
│                #   Вне Telegram весь модуль — no-op (features/ и ui/ о нём не знают).
│                #   Единственный потребитель за пределами app/ — ThemeProvider: в режиме
│                #   "system" тема берётся у Telegram, а не у ОС (палитра остаётся наша)
├─ game/         # логика: score/assign/packs/engine/tournament/rng (не зависит от UI)
├─ data/         # DataSource (статика: загрузка JSON) + api/ (динамика: Go API — auth/сейвы)
├─ state/        # Zustand-сторы: runStore (забег), shellStore (вид), careerStore (история),
│                #   runPersist (сейв через replay лога), runLink (кодек ссылки/сида),
│                #   persist (КУДА пишем: CloudStorage в Telegram, localStorage в вебе)
└─ types/        # типы из schema/
public/data/     # ← сюда пайплайн кладёт JSON
```

**Правила архитектуры (важно):**
- **Цвета — только через токены** `design/tokens.css`. Ноль захардкоженных цветов в компонентах → light/dark работают сами, без per-selector override. Всегда-тёмные панели/радар — через инвертные токены (`--surface-invert`, `--on-invert`, `--brand-*`).
- **Адаптив — канон `design/breakpoints`**: `sm` 430 / `md` 680 / `lg` 980. Новые `@media` только на эти ширины (литералы; `var(--bp-*)` в MQ нельзя). Раскладка — explicit `grid-template-areas` (или container), не поток «N детей в M колонок» без areas.
- **Вид определяется в `ui/`**, экраны только компонуют примитивы + раскладку. Новый элемент = взять примитив из `ui/`, а не рисовать заново.
- **Локали — только через `i18n/core.ts`** (типобезопасный `MessageKey`), примитивы `ui/` презентационные (строки передаёт вызывающий).
- **Шрифт полей ввода — токен** `--control-font` / `--control-font-sm`, не литерал в компоненте. На `(pointer: coarse)` они = 16px: Safari на iOS зумит вьюпорт при фокусе контрола со шрифтом меньше и обратно **не** отъезжает.

## Ключевые модули логики

- **score.ts** — `Team OVR = Base + Hero Synergy + Chemistry`, сглаживание winrate.
- **assign.ts** — оптимальное назначение 5 героев 5 игрокам (max-weight matching).
- **packs.ts** — Team Packs (ростер команды) и Mixed Draft (5 из разных команд, порядок 1→5).
- **tournament.ts / engine.ts** — путь `groups → playoffs → final` и состояние забега (чистая логика, без UI).
- **DataSource** — абстракция над источником игровых данных (статика с CDN; ADR 0002 — статику не проксируем через сервер).
- **data/api/** (T8.7) — клиент **динамики** (Go API), отдельно от DataSource: `authenticateTelegram` (initData → JWT), `fetchSave`/`pushSave` (облачные сейвы с 409-конфликтом по `rev`), токен через `state/persist`. База — `VITE_API_BASE`; пусто = не сконфигурен, приложение работает локально/анонимно (задаётся, когда поднимется Fly). Оркестрация синхронизации (когда пушить/тянуть) — поверх, отдельно.
- **heroes/heroPopularity.ts** — единая агрегация career player×hero для общего свода и режима выбранного игрока; UI не дублирует расчёт и не ходит во внешний API.
- **teammates/teammateGraph.ts** — совместные ростеры игроков в окне (ростер-веб справочника).
- **state/persist.ts** — единственное место, знающее, КУДА мы пишем. В Telegram источник правды — `CloudStorage` (в webview `localStorage` не переживает перезапуск), в вебе — `localStorage`. Он же режет длинные значения на чанки: карьера (≈873 байта на забег) не влезает в лимит 4096 уже на ~5 забегах. localStorage остаётся синхронным кэшем для первого кадра — тема и язык нужны до React, а облако асинхронное.
- **state/runPersist.ts** — сейв не сериализует забег целиком: хранит `config + seed + лог действий` и восстанавливает детерминированным replay; несовместимый с новым датасетом сейв отбрасывается.
- **state/runLink.ts** — кодек ссылки/сид-кода: ссылка несёт **условия** забега (seed + config + версии), а не результат — те же паки, драфтит получатель сам.

## Тесты (T3.13, 2026-07-14)

| Команда | Что делает |
|---|---|
| `npm run test` | Vitest — unit/regression/golden (`web/test/`) |
| `npm run test:e2e` | Playwright smoke — draft + tournament (`web/e2e/`) |
| `npm run test:golden:update` | Обновить golden fixtures (нужен `gen:mock` перед этим) |
| `npm run gen:mock` | Mock-baseline для тестов/golden (не коммитится; CI web-job делает сам) |

Legacy `verify_*.ts` удалены — логика покрыта Vitest.

## Dev: debug logger (draft / score / pack / tournament)

При `npm run dev` логи пиков, паков и breakdown счёта пишутся в **VS Code/Cursor → TERMINAL** (вкладка, где крутится `npm run dev`). **DEBUG CONSOLE** для этого не используется — там только Node/debugger-сессии.

В **production** logger отключён.

**Выключить** (в Console браузера на localhost, или через DevTools → Application):

```js
localStorage.setItem("aegis:debug:game", "0");
window.aegisDebug.disableGameLog();
```

**Включить снова:** `localStorage.setItem("aegis:debug:game", "1")` или `window.aegisDebug.enableGameLog()`.

Код: `vite-plugin-game-log.ts` (Vite middleware → TERMINAL), `src/debug/{gameLog,logDraft,formatGameLog}.ts`, хуки в `state/runStore.ts`. Prod: no-op (`import.meta.env.DEV`).

## Типы из контракта

Генерировать TS-типы из `../schema/*.schema.json` (напр. `json-schema-to-typescript`) в `src/types/`, чтобы не расходиться с пайплайном.
