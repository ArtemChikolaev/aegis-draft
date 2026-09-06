# BACKLOG — aegis-draft

Атомарные задачи, по которым идёт любой AI-агент (или человек). Каждая задача: **цель · файлы · скиллы · критерии готовности (DoD) · зависимости**. Порядок внутри вехи — сверху вниз. Веха M0 сделана.

Легенда статуса: ⬜ todo · 🟨 in progress · ✅ done · ⛔ blocked.
Перед задачей — прочитать [CLAUDE.md](../CLAUDE.md) и подобрать скиллы по [docs/ai/INDEX.md](ai/INDEX.md).

---

## M0 — Основа ✅
- ✅ PRD ([docs/PRD.md](PRD.md)), ADR ([docs/adr/0001-tech-stack.md](adr/0001-tech-stack.md))
- ✅ Контракт данных ([schema/](../schema)) — 10 JSON Schema
- ✅ Система скиллов/правил (`.claude/`, `.cursor/`, `.codex/`, `docs/ai/`)
- ✅ **T0.1 Reference parity automation** — `reference-parity-audit`, обязательный триггер в `CLAUDE.md`, шаблон evidence-матрицы и baseline-аудит 322-0/Balatro.

---

## M3 — Фронт-MVP на моках
> Делаем раньше пайплайна: логику и геймплей можно щупать на мок-данных.

### T3.1 — Мок-датасет ✅
- **Цель:** маленький валидный датасет в `web/public/data/` по всем схемам.
- **Файлы:** `web/public/data/*.json` + генератор производных `web/scripts/gen_mock.mjs`.
- **Скиллы:** `data-contract`.
- **DoD:** ✅ `validate_data.mjs` зелёный; единый `accountId`; 2 события / 15 героев / 4 пака / 20 игроков.

### T3.2 — TS-типы из схемы ✅
- **Цель:** типы данных в `web/src/types/` (ручные или ген из `schema/`).
- **Файлы:** `web/src/types/data.ts`.
- **Скиллы:** `data-contract`.
- **DoD:** ✅ типы отражают схему 1:1; используются логикой без ошибок (Node native TS).

### T3.3 — Ядро логики счёта ✅
- **Цель:** чистые функции PRD §5: сглаживание winrate, назначение героев (точное 5×5), `Team OVR = Base + HeroSynergy + Chemistry`.
- **Файлы:** `web/src/game/{smoothing,assign,score}.ts` + верификатор `web/scripts/verify_game.ts`.
- **Скиллы:** `scoring-model`, `data-contract`.
- **DoD:** ✅ запускается на Node v24; проверки на моках зелёные; matching (DP по битмаске) обгоняет жадность; Mixed Chemistry ниже Team Packs.

### T3.4 — Генерация паков ✅
- **Цель:** Team Packs (ростер команды) и Mixed Draft (5 из разных команд, свободный порядок незаполненных ролей) + реролл; детерминизм по сиду.
- **Файлы:** `web/src/game/packs.ts`, `web/src/game/rng.ts`.
- **Скиллы:** `scoring-model`.
- **DoD:** ✅ одинаковый сид ⇒ один пак; фильтр по формату; Mixed предлагает 5 ролей из разных команд и разрешает любую незаполненную роль; рерроллы вкл. ∞.

### T3.5 — Движок забега (чистый) ✅
- **Цель:** состояние: настройки, текущий пак, ростер по слотам, пул героев, счёт, рерроллы.
- **Файлы:** `web/src/game/engine.ts` (класс `RunEngine`, независим от UI) + `web/scripts/verify_engine.ts`.
- **Скиллы:** `discovery-before-code`, `scoring-model`.
- **DoD:** ✅ pick/reroll/score покрыты тестом на Node; Zustand-обёртка — тонкий адаптер в T3.6.
- **Прим.:** вынесено из Zustand в чистый класс (game/ не зависит от UI — граница из CLAUDE.md).

### T3.6 — Vite-скелет + DataSource ✅
- **Файлы:** `web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `web/src/{main.tsx,App.tsx}`, `web/src/data/DataSource.ts`, `web/src/state/runStore.ts`.
- **DoD:** ✅ `npm run dev` открывает старт-экран; `vite build` (57 модулей) и `tsc --noEmit` чисты; данные через `DataSource`.

### T3.7 — Экран настроек старта ✅
- **Файлы:** `web/src/ui/StartScreen.tsx`.
- **DoD:** ✅ все 5 осей (PRD §5.5–5.6); недоступные форматы помечены SOON; выбор пишется в стор.

### T3.8 — Экран драфта + пентагон ✅
- **Файлы:** `web/src/ui/{DraftScreen,Pentagon,heroes}.tsx/ts`.
- **DoD:** ✅ играбельный цикл; Team и Mixed (кликабельны кандидаты всех незаполненных ролей); числа сходятся с ядром; проверено в браузере.

### T3.9 — Экран итога + шеринг ✅
- **Файлы:** `web/src/ui/ResultScreen.tsx`.
- **DoD:** итог с разбивкой и назначением героев ✅; **шеринг-ссылка по сиду ✅** — закрыта в T3.12 (кнопка «Скопировать ссылку» на терминальном экране, кодек `state/runLink.ts`); **«Save as image» ✅ 2026-08-11** — см. T7.1.
- **Файлы (актуально):** `features/tournament/{TournamentScreen,ShareRunButton}.tsx` — отдельного `ui/ResultScreen.tsx` больше нет, итог свёрнут в run-вид (TREF-TOUR2).
- **Deps:** T3.8

### T3.10 — Исполнение всех настроек старта 🟨
> **Ревизия 2026-07-19: формулировка ниже была устаревшей.** Проверка по коду показала, что «декоративной» оси почти не осталось — `peak` стоит `soon: true` → `disabled` + бейдж SOON (ровно как `peak enabled:false` у 322-0), `manual` реализован полностью (`RunEngine.swapHeroes` с guard'ом на `allocation`, компонент `HeroAllocation`, тап-свап), `format`/`difficulty`/`draftStyle` работают (`poolForFormat`, `rerollsLeft`, `mixedPack`). Единственным реальным пробелом был Mixed.
- ✅ **Mixed использует team-success (2026-07-19).** Было: `mixedPack` брал кандидатов из того же per-event пула, и оба стиля считались одинаково — `base = среднее event OVR`. То есть режимы отличались только тем, что показывают, а не тем, как оценивают. Замер, почему это плохо именно в Mixed: один игрок встречается в 62 паках с OVR 60..91 (разброс 31) — без общего события число говорит про выпавший ивент, а не про игрока. Стало: `base` = успех команды за окно × поправка `0.8 + 0.4·OVR/100`. **Team Packs не затронут** — golden `engine-run-team` проходит байт-в-байт, плюс тест на точное равенство `score.base === baseRating(players)`. `ratingModelVersion` → `v1.11.0`. Файлы: `game/teamSuccess.ts` (новый), `game/{engine,packs,score}.ts`, `features/draft/ScoringLegend.tsx`, `i18n/core.ts`, `test/mixedTeamSuccess.test.ts`.
  - **Калибровка — по реализованной медиане, не по когортной.** Первый заход целился «середина полосы = медиана OVR» и дал Mixed +5 очков Team OVR (83.4 против 78.3): игрок берёт не среднюю команду, а лучшую доступную, и режим становился строго выгоднее. Полоса `48..76` подобрана замером 60 забегов на стиль → Team Packs 78.3, Mixed 76.8.
  - **Потолок полосы поймал тест.** На `58..95` верх `95 × 1.2 = 114` упирался в кламп 100, и сильная/очень сильная команда давали одно число. Теперь `76 × 1.2 = 91.2`, инвариант закреплён проверкой.
  - **`valve_legacy` в Mixed закрыт SOON**: 0 команд из 131 с team-success. Гейт `mixedSupportsFormat` читает данные, а не имя формата — наполнится окно, режим откроется сам, и тест `formats.test.ts` начнёт его покрывать автоматически.
- ⬜ **Осталось: настоящий team-success вместо прокси.** Сейчас `successScore` = winrate × вес тира лиги (`domain.BuildTeamSuccess`); плейсменты/призовые/топ-финиши в данных нулевые, полная v1.2.0 в `pipeline/internal/teamsuccess` не подключена. **Deps: T1.3 ⛔** — блокер не технический, нужна отправленная заявка на Liquipedia API ([LIQUIPEDIA_ACCESS.md](LIQUIPEDIA_ACCESS.md), действие на стороне пользователя).
- ⬜ **Осталось: `peak`** — ждёт T2.3 (Peak в пайплайне). До тех пор честно закрыт SOON.
- **Цель (исходная):** убрать «декоративные» config-поля: `peak` берёт peak rating; Mixed использует team-success; `manual` открывает реальное назначение героев.
- **Файлы:** `web/src/game/{engine,score,packs}.ts`, `web/src/ui/{StartScreen,ResultScreen}.tsx`, тесты; возможно контракт данных по результатам M2.
- **Скиллы:** `reference-parity-audit`, `scoring-model`, `data-contract`, `discovery-before-code`.
- **DoD:** переключение каждой доступной оси меняет результат/flow и покрыто тестом; недоступная ось disabled/`SOON`, а не молча игнорируется.
- **Deps:** T2.3, T2.4 для реальных Peak/team-success; manual можно делать независимо.

### T3.11 — Correctness hero matching и Mixed packs ✅
- **Цель:** убрать два P0-риска baseline-аудита: 32-битная маска/экспонента на большом hero pool и неполный Mixed-пак при отсутствии роли/уникальных команд.
- **Файлы:** `web/src/game/{assign,packs,engine}.ts`, `web/scripts/verify_{game,engine}.ts` либо unit suite.
- **Скиллы:** `reference-parity-audit`, `scoring-model`, `discovery-before-code`.
- **DoD:** ✅ matching использует маску по 5 игрокам (`O(H·2^5·5)`) и проверен на 40 героях; Mixed выдаёт ровно 5 ролей/5 команд либо fail-fast; тесты на 4 команды, отсутствующую роль и subs/6+ игроков; mock generator обеспечивает 5 команд.

### T3.12 — Воспроизводимый URL забега ✅
Сделано 2026-07-19. Ссылка несёт **условия** забега (config + seed + версии), а не чужой результат: получатель играет ТЕ ЖЕ паки и драфтит сам — челлендж по сиду в духе Balatro. Формат `#/run=<base64url>`.
- **Переиспользован контракт сейва.** `runPersist.SavedRun` уже решал ту же задачу («воспроизводим ли забег на этом датасете»), поэтому кодек повторяет его поля и не заводит вторую проверку версий. Оттуда же взята решённая грабля: `JSON.stringify(Infinity) === "null"`, и Easy-режим без сторожевого значения приезжал бы с нулём рероллов.
- **`dataBuiltAt` и `dataHash` намеренно НЕ входят в ссылку:** она остаётся долгоживущим челленджем и проверяет только публичные `schemaVersion`/`ratingModelVersion`. Точное совпадение паков гарантировано на том же контенте датасета; после реального data-refresh ссылка воспроизводится уже на свежих данных.
- **Ссылка не стартует молча.** Три исхода: версии разошлись → называем причину, кнопки «играть» нет; идёт свой забег → предупреждаем о потере прогресса (CLAUDE.md: destructive → confirm); иначе обычное предложение. После ответа hash убирается (`replaceState`), чтобы перезагрузка не переспрашивала.
- **Баг, найденный тестом:** разбор ссылки жил только в `loadData()`, который идёт один раз при монтировании. Если ссылку открыть в УЖЕ открытом приложении, меняется только hash — перезагрузки нет, и предложение не появлялось. Добавлен слушатель `hashchange` → `syncLinkFromHash`.
- **Файлы:** `state/runLink.ts` (кодек), `state/runStore.ts` (pendingLink + accept/dismiss/sync), `app/App.tsx`, `features/start/RunLinkPrompt.tsx`, `features/tournament/ShareRunButton.tsx`, `i18n/core.ts`, `test/runLink.test.ts` (12), `e2e/runLink.spec.ts` (4).
- **DoD:** round-trip стабилен ✅ (включая не-ASCII: голый `btoa` умеет только Latin1, кодек идёт через `TextEncoder`); одинаковые данные+версия+URL дают одинаковые паки ✅ (проверено живьём с чистого localStorage — те же 5 кандидатов и те же 5 героев); несовместимая версия объясняется пользователю ✅; битая ссылка не роняет приложение ✅.
- ✅ «Save as image» из T3.9 — сделан 2026-08-11 в T7.1 (Ревизия статусов 2026-08-31: ⬜ был устаревшим).
- **Цель (исходная):** завершить T3.9: seed + все настройки + `schemaVersion`/`ratingModelVersion` в URL; открыть ссылку и получить тот же run.
- **Файлы:** `web/src/state/runStore.ts`, роутинг/URL codec, UI результата, тесты.
- **Скиллы:** `reference-parity-audit`, `discovery-before-code`.
- **DoD:** round-trip URL стабилен; одинаковые данные+версия+URL дают одинаковые паки и итог; несовместимая версия объясняется пользователю.
- **Deps:** T3.10, T3.11.

### T3.13 — Настоящий test baseline ✅
- **Цель:** превратить ad-hoc verify-скрипты в регрессионный набор для engine/scoring/packs и минимальный browser golden path.
- **Файлы:** `web/vitest.config.ts`, `web/playwright.config.ts`, `web/test/**`, `web/e2e/**`, `web/package.json`, `.github/workflows/ci.yml`.
- **DoD:** одна команда проверяет unit + UI start→draft→result; CI-friendly; утверждение «Mixed Chemistry ниже» либо формализовано инвариантом, либо удалено как ложная гарантия.
- **Итог (2026-07-14):** Vitest 77 tests (assign/score/engine/packs/tournament/career/preferences/regression/golden); Playwright smoke (draft + tournament); golden fixtures (`npm run test:golden:update`, только mock-baseline); legacy `verify_*.ts` удалены; **CI web** — эфемерный `gen:mock` для тестов; **deploy** — реальный датасет из data-refresh; dev debug-logger → VS Code TERMINAL (`web/src/debug/`, `vite-plugin-game-log.ts`).

### T3.14 — Seed-код на экране настройки забега ✅
Сделано 2026-07-19. `Seed` — компактная карточка сразу под CTA в `launch-panel`: принимает bare seed-код T3.12, `#/run=…` или полную ссылку, валидирует ввод при каждом изменении текста/настроек и передаёт в существующий `runStore.start` только исходный `link.seed`. Пустое поле по-прежнему использует `createRunSeed()`.
- **Достоверные состояния:** зелёный — payload разобран, версии и полный `mode/config` совпали; красный — повреждённый код, schema/model mismatch, другой режим или настройки. При config mismatch показана ожидаемая конфигурация; непустая ошибка блокирует CTA и ничего не пишет в run state.
- **Reuse:** отдельный seed-flow, каталог и поле `RunConfig` не появились. Расширен `state/runLink.ts`; капсульный input экрана героев извлечён в общий `ui/TextField` и переиспользован в `SeedField`.
- **Проверка:** unit покрывает bare/full URL, лимит/мусор, порядок причин, все оси config, `Infinity` и `hardMode: undefined === false`; Playwright покрывает воспроизводимость первого пака, ошибку/очистку и реактивное исправление Easy-настроек на desktop+mobile. Полный прогон: 176 unit passed (+3 dataset-dependent skipped на каждом из production/mock), 3 mock golden passed, 28 Playwright passed, typecheck/build/data validation ✅.
> **Продуктовое решение:** сырой seed нельзя честно валидировать как «найден / не найден»: текущий `Rng` детерминированно принимает **любую** строку, поэтому любая непустая строка создаст какой-то забег. Поле принимает проверяемый **seed-код T3.12** (bare base64url-токен либо полную share-ссылку `#/run=<token>`), где уже упакованы `seed + mode + config + schemaVersion + ratingModelVersion`. Так «найден» означает «код распознан, совместим с текущей сборкой и выбранными настройками», а не вымышленный поиск в несуществующей базе.
- **Цель:** позволить начать заранее известный воспроизводимый забег прямо с Classic start screen. При одинаковых seed-коде, настройках, датасете и версиях игрок получает ту же последовательность паков, героев, поля и турнира; дальнейшие решения игрок принимает сам.
- **UX / расположение:** в правой `launch-panel`, **ниже** кнопки «Начать драфт», добавить компактную карточку `Seed` с коротким объяснением: пустое поле = новый случайный забег; вставленный код = повтор известных условий. Внутри — одно поле с placeholder «Seed или ссылка на забег». Внешний вид поля переиспользует капсульный input-паттерн экрана героев (скрин пользователя), но оформляется через общий UI-примитив `TextField`, а не копированием CSS.
- **Состояния поля (проверка сразу после ввода и при каждом изменении настроек):**
  - пусто — нейтральное состояние, CTA запускает текущий `createRunSeed()` как сегодня;
  - ✅ код разобран, версии совпали и `mode/config` равны выбранным — «Seed найден. Порядок паков будет воспроизведён» через существующий зелёный success-токен;
  - ❌ не base64url / не JSON / неизвестная версия payload / пустой seed — «Такой seed не найден или код повреждён» через существующий danger/error-токен;
  - ❌ `schemaVersion` или `ratingModelVersion` не совпали — конкретное объяснение из уже существующего `runLinkIssue`, а не общий «не найден»;
  - ❌ код валиден, но `mode/config` отличаются — «Seed создан для других настроек» + компактная строка ожидаемых настроек. Настройки **не переключаются молча**; отдельную кнопку «Применить настройки seed» можно добавить в этой же карточке, если она помещается без перегруза.
- **Поведение CTA:** непустой невалидный/несовместимый код блокирует «Начать драфт»; валидный передаёт существующий `link.seed` в `runStore.start(config, seed)`; очистка возвращает обычный случайный старт. Изменение любой оси конфигурации повторно валидирует уже введённый код и может перевести зелёное состояние в красное.
- **Переиспользование (не заводить второй seed-flow):** `decodeRunLink`/`runLinkFromHash` и `runLinkIssue` из `state/runLink.ts`; существующие `RunEngine`, `Rng`, `runStore.start(config, seed)`, save/replay и tournament seed; i18n RU+EN; токены `--brand-green`/`--danger`. Из визуального паттерна `features/heroes` извлечь общий `ui/TextField` и оставить поиск героев на том же примитиве, чтобы не появилось две реализации одинакового поля.
- **Границы состояния:** seed **не добавляется в `RunConfig`** — он уже отдельный аргумент `start` и отдельное поле сейва/share-link. `schema/` и игровой data-contract не меняются; сервер/каталог seed не нужен; формулы рейтинга не меняются, `ratingModelVersion` не бампается.
- **Нормализация / безопасность:** обрезать только пробелы по краям, не менять регистр и содержимое seed; принимать полный URL и bare-токен; ограничить ввод разумной длиной (до 2048 символов) до decode; неизвестный/битый payload не бросает исключение и не меняет текущий run state.
- **Файлы (ожидаемо):** `web/src/state/runLink.ts` (единый parser полного URL/bare-токена + сравнение нормализованного config), `web/src/features/start/{StartScreen,SeedField}.tsx`, `start.css`, `web/src/ui/TextField.tsx` + barrel/стили, `web/src/features/heroes/HeroesScreen.tsx` (перевод существующего поиска на примитив), `web/src/i18n/core.ts`, unit + Playwright.
- **Тесты:** bare-токен и полная ссылка; мусор/base64/JSON/неизвестный payload; несовместимые schema/model; различия по каждой оси config, включая `Infinity` и отсутствующий `hardMode` = `false`; валидный код даёт те же первые 5 паков/героев и тот же турнир; невалидный код блокирует CTA; очистка снова создаёт случайный seed; desktop/mobile и dark/light не переполняют `launch-panel`.
- **DoD:** игрок вставляет код/ссылку и до старта видит достоверный зелёный или конкретный красный статус; валидный код с теми же настройками воспроизводит забег T3.12; пустое поле не меняет текущий golden path; ни одно ошибочное состояние не стартует забег и не перезаписывает сейв; `npm run validate:data && npm run test && npm run test:e2e && npm run typecheck && npm run build` зелёные.
- **Не входит:** публичный каталог/поиск чужих seed, короткие серверные aliases, подпись seed для анти-чита, daily/leaderboard. Если нужен настоящий ответ «существует ли такой короткий код в базе», это отдельная backend-задача поверх T8.x.
- **Deps:** T3.12, T3.13.

---

## M1 — Пайплайн-скелет (Go)  ·  Go 1.26 установлен
### T1.1 — Go-модуль + CLI-скелет ✅
- **Цель:** `pipeline/go.mod`, `cmd/build`, стадии-заглушки `fetch→normalize→aggregate→rate→emit→validate`.
- **Файлы:** `pipeline/go.mod`, `pipeline/cmd/build/main.go`, `pipeline/internal/{model,opendota,liquipedia,rating,emit,pipeline}`.
- **Скиллы:** `discovery-before-code`, `external-data-etl`, `data-contract`.
- **DoD:** ✅ `gofmt` чист, `go vet` чист, `go build ./...` ок, `--help` печатает флаги; **эмитит валидный по схеме датасет** (кросс-проверка Node-валидатором — Go пишет → Node проверяет).

### T1.2 — OpenDota-клиент ✅
- **Цель:** клиент с rate-limit, кэшем raw, ретраями; ключ из env.
- **Файлы:** `pipeline/internal/opendota/*.go`.
- **Скиллы:** `external-data-etl`.
- **DoD:** ✅ реализованы `/proMatches` (pagination), `/matches/{id}`, `/players/{id}/heroes`, общий raw-cache, rate-limit, 429/5xx retry, `Retry-After`, atomic write, redaction ключа и unit tests; live Free Tier smoke без ключа получил 100 pro matches и сохранил raw cache; emit/output не затронут.
- **Resumable window:** ✅ фиксированный `--as-of`, пагинация до границы `last_1y/2y/5y`, общий cache-aware `--request-budget`, штатный partial progress, дозагрузка details и career heroes. Повторный запуск продолжает с первого cache miss; прогресс и раздельная completeness записаны в normalized/aggregate artifacts. Полный `last_2y` остаётся операционным многозапусковым сбором.
- **Deps:** T1.1. Premium `OPENDOTA_API_KEY` опционален и не равен Steam Web API key.

### T1.3 — Liquipedia-клиент ⛔
- **Цель:** авторизованный LPDB-клиент по выданной OpenAPI-спеке: турниры/ростеры/placement.
- **Файлы:** `pipeline/internal/liquipedia/*.go`.
- **Скиллы:** `external-data-etl`.
- **DoD:** boundary уже требует base URL + выданные auth header/value + контактный User-Agent и переиспользует cache/retry transport; после получения спеки добавить typed DTO/endpoints и live-тест 1 турнира; атрибуция в `manifest.source` и UI.
- **Deps:** T1.1, одобренный Liquipedia API access + выданная OpenAPI-спека/лимит.
- **Access draft:** [`docs/LIQUIPEDIA_ACCESS.md`](LIQUIPEDIA_ACCESS.md) — готов текст заявки, список данных и safeguards; пользователь должен подтвердить public repo/license/non-commercial/contact facts и отправить форму.

### T1.4 — Normalize (канонизация id) 🟨
- **Цель:** единый `accountId` во всех сущностях; дедуп игроков.
- **Файлы:** `pipeline/internal/normalize/*.go`, `pipeline/internal/model/*.go`.
- **Скиллы:** `data-contract`, `external-data-etl`.
- **DoD:** ✅ есть проверенная канонизация OpenDota account_id/SteamID64, конфликтов и дублей; CLI загрузил details 10 реальных матчей и создал deterministic snapshot: 100 appearances → 70 canonical players, 30 игроков дедуплицированы между матчами, `steamId` не протёк. Осталось связать Liquipedia roster DTO, определить роли и эмитить доменные сущности.
- **Deps:** T1.2, T1.3.

### T1.5 — Emit + validate по схеме 🟨
- **Цель:** запись `web/public/data/*.json` строго по `schema/` + `manifest`.
- **Файлы:** `pipeline/internal/emit/*.go`, `pipeline/internal/validate/*.go`.
- **Скиллы:** `data-contract`.
- **DoD:** ✅ structural invariants + реальный запуск `validate_data.mjs` встроены в CLI и зелёные на offline smoke; ⛔ проверка реального турнира зависит от T1.3–T1.4.
- **Deps:** T1.4.

---

## M2 — Рейтинг + team-success (Go)
### T2.1 — Агрегация статистик 🟨
- **Цель:** per-event player stats, player×hero (career+event), squad-пары, тиммейты, история команд.
- **Файлы:** `pipeline/internal/aggregate/*.go`, intermediate `pipeline/data/aggregate/opendota.json`.
- **Скиллы:** `scoring-model`, `data-contract`.
- **DoD:** ✅ window `playerHeroStats`, symmetric `teammates` и canonical `squadSynergy` реализованы и проверены на 10 реальных матчах (70 игроков, 98 player×hero, 140 squad pairs); `careerPlayerHeroStats` дозагружается отдельно из `/players/{accountId}/heroes`; raw games/winrate без сглаживания. ⬜ Полный career artifact завершится вместе с resumable last_2y; `eventHeroStats` и per-event aggregates ждут mapping `OpenDota leagueId → Liquipedia eventId`; история команд будет дополнена roster intervals из T1.3. **Deps:** T1.5/T1.3 для полного event output.

### T2.2 — Модель OVR/IMP/ECO/REL 🟨
- **Цель:** нормировка 0–100, веса по ролям; `ratingModelVersion`.
- **Файлы:** `pipeline/internal/rating/ovr.go`, `pipeline/internal/rating/config.go`.
- **Скиллы:** `scoring-model`.
- **DoD:** ✅ `v1.0.0`: role-relative IMP/ECO/REL, role-aware OVR, cohort shrinkage + confidence к 50, единый config, детерминизм и unit tests; одна карта не даёт экстремальный рейтинг. ⬜ Прогон на известных реальных ростерах и emit в packs ждут авторитетных role labels/event mapping из T1.3–T1.4; rating-пакет намеренно не угадывает роли. **Deps:** T2.1, T1.3–T1.4 для полного output.

### T2.3 — Peak (скользящее окно) 🟨
- **Цель:** best rolling 3–6 мес., порог `N_min`, по ролям.
- **Файлы:** `pipeline/internal/rating/peak.go`.
- **Скиллы:** `scoring-model`.
- **DoD:** ✅ `v1.1.0`: rolling 120 календарных дней, `games ≥ 15`, расчёт на change-points, отдельный peak по ролям, deterministic tie-break; тесты подтверждают, что короткий аномальный турнир не даёт peak, а периоды внутри окна объединяются. ⬜ Заполнение реального `players[].peak` ждёт role-labelled history из T1.3–T1.4. **Deps:** T2.2, T1.3–T1.4 для полного output.

### T2.4 — Team-success (для Mixed) 🟨
- **Цель:** `teamSuccess.json` по окнам (титулы/призовые/винрейт, веса TI/Major).
- **Файлы:** `pipeline/internal/teamsuccess/*.go`.
- **Скиллы:** `scoring-model`, `data-contract`.
- **DoD:** ✅ `v1.2.0`: team success для вложенных `last_1y/2y/5y`, TI/Major/tier-1 prestige, placements/prize/smoothed winrate/top-4; сырой `games+winrate` в контракте; player score взвешивает несколько команд по играм и применяет bounded individual correction. Тесты: чемпион выше аутсайдера, 1–0 не обгоняет 15–5, окна вложены, broken teamId fail-fast. ⬜ Реальный `teamSuccess.json` ждёт Liquipedia placements/prize и roster intervals из T1.3; `valve_legacy` — курируемый набор T4.3. **Deps:** T2.1, T1.3 для полного output.

---

## M4 — Полный датасет
- ✅ **T4.1 Форматы `last_1y/2y/5y/valve_legacy` (фильтры + пулы).** Правило назначения окон выведено из даты сборки (`pipeline/internal/formats/Assign` — источник истины + тесты; зеркало в `web/scripts/gen_mock.mjs`). Мок расширен до 6 событий / 7 команд / 4 лет — каждый формат имеет ≥5 команд (Mixed играбелен), все 4 формата в `manifest.formats`. Убран хак «Aegis Mock Five» и ручные `events[].formats`. ✅ Wiring `Assign` в реальный emit сделан (`domain.BuildEvents` через `formats.Assign`, S3a/S4; Ревизия статусов 2026-08-31).
- T4.2 Peak Rating в UI-скоринге. ⬜
- T4.3 Курируемый список тир-1 событий и веса престижа. ⬜

## M2.5 — Real OpenDota slice (слезаем с мока без Liquipedia)
> Решение 2026-07-11: строим доменный датасет из OpenDota (players, ростеры, player×hero, рейтинги, синергия). Liquipedia-зависимое (точные placements/призовые/исторические ростеры/престиж-тиры) — аппроксимируем из OpenDota или временно оставляем моком до T1.3.
- ✅ **S1 — OpenDota endpoints `/teams`, `/teams/{id}/players`, `/leagues`.** Типы + методы клиента на общем `sourcehttp` (кэш/ретраи/rate-limit/UA), юнит-тесты на реальных shapes; `/teams/{id}/players` даёт текущий ростер (`is_current_team_member`), `/leagues` — tier (premium/professional) для классификации событий. Live shapes сверены с API.
- ✅ **S2 — вывод ролей** (safelane/mid/offlane/support×2) из `lane_role`+фарма. `pipeline/internal/roles.Infer([]NormalizedMatch)` → per-account primaryRole/rolesPlayed. При полной пятёрке — строгое разбиение (mid по lane_role/XPM, 2 саппорта по роумингу+низкому фарму, safe/off по линии/фарму); иначе — деградированный per-player маппинг. Детерминизм (tie-break по accountID) + тесты. Потребитель — S3.
- ✅ **S3 — сборщик домена** (`pipeline/internal/domain`, чистые tested-билдеры):
  - ✅ **S3a events** — `BuildEvents`: события из реально встреченных лиг, тип из tier (premium→tier1, professional→tier2), даты из диапазона матчей, формат через `formats.Assign`; вне-оконные отброшены.
  - ✅ **S3b teamSuccess** — `BuildTeamSuccess`: прокси W/L × tier (сглаженный winrate, взвешенный по престижу лиги); titles/prize/placements/valve_legacy deferred до Liquipedia.
  - ✅ **S3c packs+players+ratings** — `BuildRatings` (обёртка `rating.RatePlayers`: per-account OVR/IMP/ECO/REL из окна матчей, TeamKills из состава), `BuildPlayers` (профили: nickname/primaryRole/rolesPlayed/teams+игры), `BuildPacks` (пак = реальный состав команды на событии, топ-5 по играм с отсечением стенд-инов, рейтинги+роли+сигнатурные герои; placement deferred). Тесты. Peak — deferred (T4.2).
- 🟨 **S4 — сборка `Dataset` + emit + live-run**. Ассемблер `domain.Build` (events+teamSuccess+players+packs + pass-through heroStats/teammates/squadSynergy + eventHeroStats из appearances + heroes через `/heroes`), клиент `FetchHeroes`, отбор состава пака по ролям (инвариант validate), CLI-флаг `--emit-domain` (+`--as-of`), сквозная `validate.Dataset`. ✅ **Живой smoke прошёл**: 40 матчей → 1 событие (EWC 2026), 24 пака с реальными командами/никами/ролями/OVR, 120 игроков, 127 героев, JSON Schema зелёная. ✅ Остаток закрыт (Ревизия статусов 2026-08-31): ежедневный `data-refresh` коммитит реальный датасет (89 событий/1415 паков), deploy собирается из него (T3.13: CI web — эфемерный gen:mock только для тестов); explorer-сбор TDATA2 A/B заменил бюджетный collect-window. **Deps:** S1–S3.

### TDATA1 — Мульти-эвентный tier-1 датасет: peers/hero-коллекторы + окна (P1) ✅ (Ревизия статусов 2026-08-31: инкременты 1–3 закрыты; всё оставшееся жило в инкременте 3 и закрыто TDATA2)
> Заведено из алгоритмического аудита 2026-07-12 ([audits/2026-07-12-322-0-scoring-algorithm.md](audits/2026-07-12-322-0-scoring-algorithm.md)). Оживляет Chemistry и углубляет Hero Synergy на реальных данных.
- ✅ **Инкремент 1 — источник пожизненной химии `/players/{id}/peers`.** `opendota.Peer` + `Client.FetchPlayerPeers` (кэш/ретраи/бюджет через общий transport); `aggregate.MergePeers` апсертит пожизненные `with_games/with_win` в `squadSynergy`+`teammates`, только внутри pro-вселенной (pub-тиммейты отсечены), с приоритетом пожизненных тоталов над оконным счётом. Форма контракта не изменена. Юнит-тесты: кросс-командная пара создаётся, оконный счёт перекрывается, out-of-universe/self/zero-игр игнор, symmetry + `Validate` зелёные, gofmt/vet/build/test чисты. Вынесены хелперы `squadSlice`/`teammateSet`/`emitTeammates` (убрано дублирование в `FromOpenDota`).
- ✅ **Инкремент 2 — сбор peers + wiring.** Resumable `/peers`-сбор для всей pro-вселенной (`known` = аккаунты снапшота) в `pipeline.Run` тем же budget-паттерном, что career heroes; `MergePeers` вызывается до `aggregate.Validate`, merged `squadSynergy`/`teammates` прокидываются через `domain.Build`. `CollectionStatus` дополнен `peersTargetPlayers/peersPlayersComplete/peersComplete` + progress-лог. **Живой smoke (Free Tier, 5 матчей, budget 300):** `peers=50/50 (complete=true)`, emit domain зелёный, JSON Schema ок; `squadSynergy` вырос до **539 пар** с пожизненными co-games (топ-пара 2056 игр, wr 0.60; 368 пар >20 игр) — кросс-командная Chemistry структурно ожила.
- ✅ **Инкремент 2b — tier-1 фильтр дискавери (exclude-based + порог).** Решение 2026-07-12: OpenDota-тир `premium` слишком узкий (214 лиг; EWC/DreamLeague/OGA PIT/EPICENTER помечены `professional`), поэтому пакет `internal/tier1` классифицирует **tier-1 = premium ∪ (professional − шум)** (шум = квалы/дивизионы/регионалки/минорки/бегиннеры), а `domain.BuildEvents` отбрасывает события с `< min-event-matches` (CLI, дефолт 8) — гасит мелкий шум/недосбор. `collect.OpenDotaWindow` фильтрует дискавери по set'у tier-1 лиг (пагинация/граница окна не зависят от фильтра). **Живой smoke:** фильтр 2440 лиг, EWC (professional) проходит, events=1, JSON Schema ✅. Проверено, что покрытие ловит DreamLeague S19/23/24, OGA PIT, WePlay, EPICENTER, ESL One, Wallachia. Юнит-тесты `tier1`/`collect`.
- ✅ **Инкремент 2c — tier-1 фильтр: exclude→include (реальный датасет).** Обновление 2026-07-12: на реальном сборе exclude-based (`professional − шум`) пропустил ~46 tier-2/3 (Snake Trophy, CCT, BetBoom Streamers Battle, кубки Сбера, регионалки) при 64 «событиях». Заменено на **include-реестр реальных tier-1 серий** (`tier1Series`: TI/EWC/DreamLeague/ESL One/PGL Wallachia/BLAST Slam/FISSURE/Riyadh/Games of the Future/Elite League/Snow-Ruyi/OGA PIT/DPC Major) + `tier1Exclude` (квалы/дивизионы): tier-1 = premium ∪ (professional, совпавший с реестром). На live-именах: **оставляет 18 настоящих, выкидывает 46 мусорных**. Заодно `event.Type` перекладывает на престиж (**TI→`ti`, Major→`major`, остальное→`tier1`**) — `tier2` больше не эмитим. teamSuccess-престиж не тронут (весит по tier лиги напрямую). Тесты на junk/real кейсы ([57e8d6d], [91c85c2]).
- ✅ **Инкремент 2d — обогащение только для pack-игроков.** career/peers тянем не по всему окну (~1500), а только по аккаунтам, реально попадающим в паки (топ-5 составов на событиях) — полное окно не влезает в дневной бюджет, а непаковые в датасет не входят. Пул паков зависит лишь от ролей и числа игр (не от career/peers), поэтому `domain.PackPlayerAccounts` считает его из снапшота до сетевого обогащения; `known`-фильтр peers сужен до пула (химия нужна между будущими тиммейтами). Вынесены `buildLineups`/`selectRoster` (общий путь отбора с `BuildPacks`). Тест `TestPackPlayerIDs` ([17357d1]).
- ✅ **Инкремент 3 — окна + valve_legacy** (Ревизия статусов 2026-08-31: остаток «all-time сбор valve_legacy по league_id + операционный прогон» закрыт осью B TDATA2 — explorer-discovery `since=0` по лигам `IsValveLegacy`, ежедневный крон). ✅ `valve_legacy` флаг: `tier1.IsValveLegacy` = все The International (по имени) + курируемый набор Valve/DPC Major id; `BuildEvents` проставляет формат через `formats.Assign`. ✅ Скользящие `1y/2y/5y` уже вложенно даёт `formats.Assign` из одного широкого сбора. ⬜ Осталось: **all-time сбор valve_legacy** (старые TI/Major вне rolling-окна нужно тянуть по league_id, а не по времени) + операционный `--collect-window` прогон. **Deps:** T1.2, T4.3.

### TDATA2 — Полноценный сбор: 1y/2y/5y + все TI/Major, career-глубина, деление по режимам ✅ (Ревизия статусов 2026-08-31: A–D реализованы, E — «код не нужен»; DoD выполнена данными — окна наполнены (last_1y 217 / last_2y 469 / last_5y 897 / valve_legacy 458 паков), TI/Major присутствуют событиями (TI 2017/2022/2023 в каталоге RT), careerPlayerHeroStats эмитится и работает в назначении; сбор сходится ежедневным кроном)
> Заведено 2026-07-13. Проблема (по логам прогона 13.07): текущий сбор — одно **временное** окно (`/proMatches` back-пагинация) + кап `--max-matches-per-league 25`, поэтому датасет тонкий (925 матчей/264 игрока/37 событий), нет глубины 5 лет и **нет старых TI/Major** (они вне rolling-окна). Плюс career стягивается, но **не эмитится** во фронт (см. под-задачу C). Цель: честно собрать 1y/2y/5y + valve_legacy, чтобы режимы просто **резали** готовый пул по формату.
> **Ключевое ограничение источника:** `/proMatches` — это rolling-лента по времени (пагинация `less_than_match_id`); достать матчи конкретной старой лиги back-пагинацией нереально (десятки тысяч страниц через не-tier-1). Нужен **league-targeted discovery**.
> ✅ **ШАГ-0 verify (2026-07-13, живые запросы к `api.opendota.com/api/explorer`, free-tier, HTTP 200):**
>   - матчи по league_id достаются даже для старья: `SELECT match_id, start_time, leagueid FROM matches WHERE leagueid = 5157` → Kiev Major 2017 отдался (match_id+start_time);
>   - **батч-окно работает**: `SELECT match_id FROM matches WHERE leagueid IN (…) AND start_time >= <unix>` → сразу набор tier-1 лиг за период (тест: 351 матч), **заменяет сотни страниц** proMatches;
>   - TI/Major league_id находятся по имени: `SELECT leagueid, name FROM leagues WHERE name ILIKE '%The International 202%'` → TI2021=13256, TI2022=14268, TI2023=15728, TI2024=16935, TI2025=18324, TI2026=19719 (+ квал-мусор → фильтр `tier1Exclude`);
>   - **вывод:** explorer — основной discovery для обеих осей (A rolling + B valve_legacy); details по-прежнему `/matches/{id}`. Зафиксировать лимиты/паттерн в `external-data-etl` при реализации.
- ✅ **A. Rolling-окно = last_5y через explorer.** [коммит ниже] `client.ExplorerMatchIDs` (SQL по набору league_id, chunked), `collect.OpenDotaExplorer` — discovery по tier-1 лигам (`tier1.IsTier1`) за окно, без пагинации proMatches. Воркфлоу переведён на `last_5y` (1y⊂2y⊂5y вкладываются `formats.Assign`). Details `/matches/{id}` — тем же resumable-циклом (`collectDetails`), raw-кэш копится между прогонами.
- ✅ **B. valve_legacy = отдельная ось по league_id.** [коммит ниже] Вторая ось `OpenDotaExplorer` (since=0, вся история) по лигам `tier1.IsValveLegacy` = все The International + курируемые Valve/DPC Major — достаёт старые TI/Major вне rolling-окна (verify: Kiev Major 2017 отдался). Merge+dedupe с осью A, общий details-кэш/normalize/aggregate. Тесты `collect` (explorer discovery + resume), Go build/vet/test/gofmt зелёные.
- ✅ **C. Эмит career-глубины (чинит Yatoro/Hero Synergy).** [c96825d] Проведено через контракт: `schema/careerPlayerHeroStats.schema.json`, `model.Dataset.CareerPlayerHeroStats`, `domain.Build` прокидывает `aggregate.CareerPlayerHeroStats`, `emit` пишет `careerPlayerHeroStats.json`, TS-тип + `DataSource` (грузит **опционально** — деплой фронта не зависит от тайминга data-refresh), мок-генератор. `heroStatsForAssignment`: career — широкая база player×hero, окно/событие уточняют свежесть. `PlayerInspector` читает реальный career. Бамп `ratingModelVersion` v1.2.0→v1.3.0 (вход Hero Synergy изменился; сейвы инвалидируются). Go build/vet/test + gofmt, tsc, verify, validate:data (career-схема), build, антипаттерны — зелёные. **Эффект появится после первого прогона пайплайна с этим кодом** (career-файл наполнится).
  - **Решение 2026-07-13 (после анализа реальных данных 322-0): для Classic оставляем LIFETIME «на сейчас» (парити с 322-0 — у них тоже пожизненный `playerHeroStats`, один блок на игрока, не по датам; OVR при этом per-event).** Пробную **point-in-time (as-of-event)** реализацию откатили ([revert a2321f2]) — она тянет за собой переделку Chemistry и прочего, и для Classic избыточна. **Отложено (обе реализации point-in-time):** пригодится позже для **Real Tournament** (там эпохо-точность требует PRD §5.9.1). Код buildCareerToEvent/эвент-keyed схему держим в истории (a2321f2) для будущего возврата.
- ✅ **D. Кап матчей на лигу 25 → 150.** [коммит ниже] Замер по explorer: TI = 121–151 матч на событие, т.е. кап 25 отбрасывал ~80% (каждая команда ~2 игры → тонкие ростеры/пулы). 150 покрывает полный TI/Major целиком (каждая команда ~15-20 игр → плотные player×hero и стабильные топ-5 ростеры). Обновлены `.github/workflows/data-refresh.yml` (input+fallback) и CLI-дефолт `cmd/build/main.go`. Объём вырастет → cold-конвергенция за несколько дневных крон-прогонов (details resumable, кэш копится).
- **E. Деление по режимам = фронтовый фильтр по формату (уже есть механизм).** Датасет несёт `events[].formats` + valve_legacy-флаг; фронт уже выбирает по оси `Format`. Когда данные наполнятся: Classic 1y/2y/5y и «все мейджоры/инты» (valve_legacy) — просто срез существующим фильтром; Real Tournament — реальные `packs` события (см. `modes-scenarios.md §2`); Manager — весь пул + синтет-цены. Т.е. новый код деления почти не нужен — нужны **данные**.
- **Бюджет/операционка:** дневной крон 2000 req + persistent raw-кэш; широкое окно + все Major сойдутся за N прогонов, дальше держится complete и переэмитится. Следить за 7-дневным вытеснением actions/cache (если пауза >недели — пересбор).
- **Файлы:** `pipeline/internal/opendota/client.go` (explorer/league-matches), `internal/collect/*` (league-axis discovery + valve-axis), `internal/pipeline/pipeline.go` (окно=5y, две оси, career-эмит), `internal/domain/{build,events}.go` + `internal/model` + `schema/` + `web/src/{types,game/score.ts}` (career-контракт), `.github/workflows/data-refresh.yml` (окно/кап).
- **DoD:** `players/packs` реально наполнены на 1y/2y/5y и valve_legacy (TI+Major присутствуют как события); `careerPlayerHeroStats` эмитится и используется в назначении (пожизненная глубина, напр. Anti-Mage у Yatoro); JSON Schema зелёная; сбор resumable и сходится в рамках дневного бюджета; фронт-режимы режут пул по формату без нового движка.
- **Deps:** TDATA1 (tier-1 фильтр ✅, pack-only ✅), `external-data-etl` (verify explorer), `data-contract` (career-поле), T4.3 (курируемый valve-набор).
- **Цель:** собрать tier-1 срез за несколько событий/окон так, чтобы `squadSynergy`/`teammates` содержали **пожизненные кросс-командные co-games**, а `playerHeroStats`/`eventHeroStats` — достаточную глубину player×hero.
- **Данные/эндпоинты (OpenDota, source-of-truth — Datdota не используем):**
  - `/proMatches` → фильтр по tier-1 лигам (`/leagues.tier == "premium"` + курируемый TI/Valve список для `valve_legacy`) за окно (`--as-of` + `last_1y/2y/5y`);
  - `/matches/{id}` → per-event перформанс игроков (Base/OVR по событию);
  - `/players/{id}/peers` → пожизненная матрица совместных игр (Chemistry);
  - `/players/{id}/heroes` → career player×hero (Hero Synergy).
- **Файлы:** `pipeline/internal/{opendota,aggregate,domain,formats}/*.go`; при изменении формата — сначала `schema/`, затем Go `model` + TS `types` (инвариант `data-contract`).
- **Окна:** агрегаты `1y/2y/5y/valve_legacy` строим из match-level данных в пайплайне (детерминизм + кэш), а не из «career»-эндпоинтов; вложенность окон сохранить.
- **DoD:** реальный emit с ≥N событий, где `squadSynergy` содержит кросс-командные пары с ненулевым сигналом и Chemistry на живом драфте перестаёт быть ≈0; JSON Schema зелёная; `manifest` версионирован; детерминизм (raw+версия ⇒ тот же output); бюджетный `--collect-window` прогон описан операционно.
- **Deps:** M2.5/S1–S4, T1.2 (resumable window), T4.3 (курируемый tier-1 список для valve_legacy). **Разблокирует:** TREF6, реальный scoring.

### TDATA-SCORE1 — Скоринг-parity с 322-0: per-event OVR + games-driven synergy + chem-калибровка ✅
> Из аудита [audits/2026-07-16-scoring-parity.md](audits/2026-07-16-scoring-parity.md). Три подтверждённых дефекта закрыты (`ratingModelVersion v1.6.0`).
- ✅ **#1 Base/OVR → per-event (P0).** `domain.BuildEventRatings` — OVR/IMP/ECO/REL считаются из матчей ТОЛЬКО этого события (когорта = участники события), ключ `(eventId→accountId)`; `BuildPacks` берёт event-scoped рейтинг, глобальный `BuildRatings` удалён. Тест `TestBuildEventRatingsPerEvent` (сильное событие OVR > слабого). Чинит «всегда выгодно брать только Save-/Noone». **Эффект — после прогона пайплайна** (форма данных та же, `packs[].players[].ovr`).
- ✅ **#2 Hero Synergy value → games-driven (P1).** `assign.pairScore` = насыщение по pro-играм (`2·g/(g+25)`), не centered-winrate; `heroSynergyBonus` = сумма по 5. Матчинг не тронут (по играм) — value и matching согласованы, как в 322-0.
- ✅ **#3 Chemistry величина (P2).** `SCORING.chemMaxPerPair` 7→4.3 — под реальные величины 322-0 (498 игр→~2.2). Форма/структура (co-games saturating) без изменений.
- **Файлы:** `pipeline/internal/domain/{players,packs,build}.go`, `internal/rating/rating.go`, `web/src/game/{assign,score}.ts`. Go+tsc+vitest(86)+golden+build зелёные.

### TDATA3 — Качество пула: стаки и слабые розыгрыши попадают в паки ✅ (Ревизия статусов 2026-08-31: закрыт пунктом 1 — гейт присутствия `packs[].formats` — ещё 2026-08-05; пункты 2–4 сознательно условные «если пул снова поедет», отдельного хвоста нет) (плейтест 2026-08-05)
> Пункт 1 плана (гейт по присутствию команды в окне) реализован 2026-08-05 — итог в конце задачи.
> Пункты 2–4 не понадобились в этом заходе; оставлены как следующий шаг, если пул снова поедет.

**Симптом.** В драфте регулярно выпадают составы вроде `TpaBoTeaM`, `Paper Tigers`,
`Legends Rebooted` на «Games of the Future 2025 Abu Dhabi». Пользователь: «это турнир даже близко
не тир-1».

**Корень найден, посылка фильтра неверна.** `Games of the Future` внесён в курируемый список
`tier1Series` ([tier1.go](../pipeline/internal/tier1/tier1.go)), поэтому событие получает
`type: tier1` — фильтр отработал ровно как написан. Проблема в том, что **имя классифицирует СЕРИЮ,
а качество является свойством КОНКРЕТНОГО розыгрыша**: серия настоящая, а поле розыгрыша 2025
собрано из приглашённых стаков. Никакой regexp по имени этого не увидит.

**Замеры на датасете `b43cec5` (1415 паков, 320 команд):**

| команда встречается в | паков | средний OVR пака |
|---|---|---|
| 1 событии | 205 | 71.6 |
| 2 | 68 | 71.4 |
| 3–4 | 73 | 70.8 |
| **5+** | **1069** | **75.0** |

- **205 команд из 320 существуют ровно в одном событии** — это и есть разовые стаки.
- 166 команд из 320 (52%) вообще без имени (`Team 9997048`): их нет в топ-списке `/teams`, средний
  OVR их паков 71.6 против 74.6 у названных.
- 54% всех паков имеют средний OVR ниже 75; средний по пулу 74.1.

Разрыв «5+ событий» против остальных устойчив и получен ИЗ ДАННЫХ, а не из списка имён, — поэтому
годится как критерий.

**План (порядок важен):**
1. **Гейт по присутствию команды в окне** — главный рычаг. Команда входит в пул, только если
   встречается минимум в N событиях ЭТОГО окна. Работает во всех временных рамках автоматически,
   курации не требует. Начать с N=2 (уходит 205 паков, 14%), замерить; N=5 отрезает 346 паков (24%).
   ⚠️ **Порог обязан считаться отдельно на окно:** в `valve_legacy` (только TI и мажоры) команда
   законно бывает в одном событии — там критерий сломает пул, нужен свой порог либо замена на
   плейсмент. В коде это НЕ проверялось.
2. **Гейт по силе поля события** — отбрасывать розыгрыш целиком, если медианная сила участников
   ниже распределения окна. Именно это поймало бы GOTF 2025.
3. **Курируемый список имён остаётся, но перестаёт быть единственным гейтом:** он отвечает «tier-1
   ли серия», новые гейты — «был ли tier-1 этот розыгрыш и эта команда». Сейчас первый вопрос
   подменяет оба, отсюда дефект.
4. **Взвешивать `generatePack` по силе — НЕ делать** (по крайней мере первым). Это прячет проблему
   данных за игровым RNG и требует калибровки симулятором. Сначала пул, потом распределение.

**Цена.** Правка в `pipeline/internal/domain` меняет состав паков ⇒ сдвигается `dataHash` ⇒
инвалидируются сохранённые забеги и share-ссылки, поедут golden. Нужен прогон `data-refresh`,
обновление golden и прогон симулятора: пул станет сильнее, забег легче.

**Побочно (сделано в коде, ждёт прогона):** `enrichTeamLogos` дотягивает `/teams/{id}` и для
незнакомых команд кладёт карточку целиком, поэтому следующий `data-refresh` заодно починит имена —
проверено живьём: `/teams/9997048` отдаёт `TpaBoTeaM` + тег + логотип.

**Сделано 2026-08-05 — гейт присутствия (пункт 1).**
- `domain.minEventsInWindow = 2`, `packFormats` в [packs.go](../pipeline/internal/domain/packs.go):
  пак получает **своё** поле `formats` — подмножество окон события, где команда отыграла ≥2 события.
  Пак без единого окна не эмитится; тем же гейтом сужен `PackPlayerIDs`, чтобы сетевой бюджет
  обогащения не тратился на выброшенные паки.
- **Контракт:** `formats` — обязательное поле пака ([packs.schema.json](../schema/packs.schema.json),
  `model.Pack`, `types/data.ts`). Пул строится по нему, а не по окнам события: `packInFormat` в
  `game/packs.ts` (им же пользуется `teammateGraph` — связи с недоступными игроками только шумят).
  Инвариант «окна пака ⊆ окна события» проверяет `validate.Dataset`.
- **Опасение из плана снято замером, а не рассуждением:** в `valve_legacy` разовое участие
  оказалось НЕ законным исключением — там N=1 самый слабый бакет из всех (68.0 против 75.5 у 5+).
  Отдельный порог на окно не понадобился, но порог **считается** на окно: пак живёт в last_5y и
  выпадает из last_1y, если в узком окне команда разовая (тест `TestPackFormatsNarrowPerWindow`).
- **Пункт 2 (гейт по силе поля) не понадобился:** турнир из одних разовых стаков уходит целиком
  сам — GOTF 2025 потерял все 8 паков, потому что каждая его команда существует ровно в одном
  событии. Отдельное правило про розыгрыш добавило бы второй порог без нового покрытия.
- **Эффект на датасете `8b4815a`:** 1415 → 1208 паков. По окнам (1y/2y/5y/legacy): паков
  232/483/912/458, команд 37/56/81/75, средний OVR 73.9→74.6 / 74.0→74.4 / 74.1→74.4 / 74.0→74.7.
  Слабый хвост (пак <65 OVR) в last_1y 14.1%→10.8%. Сильный хвост (>82) не двинулся — гейт срезает
  снапшоты команд, о которых окно ничего не знает, а не «слабые команды».
- **Цена уплачена:** `dataHash` сдвинулся ⇒ сохранённые забеги и share-ссылки прошлых сборок
  инвалидированы; golden перегенерены. Датасет в репозитории обновлён тем же правилом офлайн
  (репликация формата и хеша `emit.WriteAll` проверена байт-в-байт на нетронутых файлах);
  авторитетно его пересоберёт ближайший `data-refresh`.
- ✅ **Мёртвые метаданные закрыты 2026-08-18.** `domain.Build` фильтрует события, у которых гейт
  присутствия унёс все паки (`eventsWithPacks`), вместе с их `eventHeroStats` (недостижимы —
  кандидаты приходят только из паков); `validate.Dataset` получил инвариант «событие обязано
  иметь ≥1 пак», чтобы регрессия фильтра ловилась, а не копилась. Тест
  `TestBuildDropsEventsWithoutPacks` (розыгрыш из одних разовых стаков исчезает целиком).
  Датасет репозитория переписан тем же правилом офлайн (round-trip через `emit.WriteAll`,
  нетронутые 8 файлов байт-в-байт идентичны; ушёл ровно GOTF 2025, events 88→87) — авторитетно
  пересоберёт ближайший `data-refresh`. **Цена уплачена снова:** `dataHash` сдвинулся ⇒ сейвы и
  share-ссылки прошлой сборки инвалидированы; golden не тронуты (mock-baseline), сиды целы —
  `packs.json` не изменился.

⚠️ **Забег стал заметно легче — нужна калибровка (замер 2026-08-05).** `npm run sim -- 300` на
пуле с гейтом против последнего записанного прогона b1.21.0 (400 сидов, см. таблицу A/B в T6.3):

| агент | b1.21.0, пул без гейта | пул с гейтом | дельта |
|---|---|---|---|
| **synergy-build** (целевая полоса PRD) | 37.8% | **48.3%** | **+10.5pp** |
| greedy-oracle | 10.3% | 9.0% | −1.3pp |
| greedy-power | 5.5% | 7.3% | +1.8pp |
| random | 1.0% | 1.0% | — |
| static / naive-ovr / economy-first | 0% | 0% | — |

Двинулся ровно тот агент, который играет как задумано, и на величину, которой шум сидов не
объясняет; остальные стоят. Это ожидаемое следствие гейта (слабый хвост пула срезан ⇒ стартовый
ростер в среднем сильнее), но целевая полоса PRD пробита вверх. Сравнение НЕ строгое: 300 сидов
против 400 и разные наборы сидов — прежде чем крутить коэффициенты, нужен A/B на ОДНИХ сидах
(тем же способом, что в b1.20.0 → b1.21.0: датасет откатывается, код не трогается).
**Кандидаты на подкрутку:** лестница `ANTE_TARGETS` / сила поля, не состав пула — пул теперь
честный, и возвращать в него стаки ради сложности было бы шагом назад.
→ ✅ **Закрыто 2026-08-23 (`b1.36.0`):** к этому моменту профиль уехал до 64.3%; откалибровано
множителем поля по актам, A/B на одних сидах — R10, «Калибровка 2026-08-23».

**Скиллы:** `external-data-etl`, `data-contract`, `scoring-model`. **Deps:** нет.

## M5 — Полный Roguelite Run
### T5.1 — Stage engine + win/loss ✅
- **Цель:** результат Classic draft провести через воспроизводимый турнирный цикл: 18-team field → две группы → double-elimination playoffs → Grand Final → итоговое место.
- **Файлы:** новый слой orchestration в `web/src/game/` поверх существующего `RunEngine`; UI этапа/результата; тесты.
- **Скиллы:** `discovery-before-code`, `plan-first-communication`, `scoring-model`, `reference-parity-audit`.
- **DoD:** ✅ отдельный чистый `TournamentEngine`; state machine `field → groups → playoffs → final → complete` без перескоков; 2×9 BO2, маршруты 4 UB / 4 LB / 1 out, полная сетка и BO5 Grand Final; каждая из 18 команд получает ровно одно место; seed воспроизводит весь run; шаг турнира сохраняется и replay-ится. Инварианты — `web/scripts/verify_tournament.ts`.
- **Deps:** T3.10–T3.13, M2.

### TREF-TOUR1 — Parity турнирного цикла с 322-0 ✅ (P1 закрыт ревизией 2026-08-18)
> Из аудита [audits/2026-07-12-tournament-cycle-parity.md](audits/2026-07-12-tournament-cycle-parity.md) (живые проходы 322-0). Codex-реализация считала турнир мгновенно и против реальных команд. Статус на 2026-07-12 (правки в рабочем дереве, ждут коммита/деплоя пользователем).
- ✅ **Фэнтези-боты**: соперники Classic — рандомные бот-команды (имена из seed, сила из OVR-распределения), не реальные ростеры; реальные команды остаются для режима Real Tournament (`game/tournament.ts`).
- ✅ **Result → турнир**: убраны «New run» и preview-поле с итога драфта; основная кнопка «Start tournament» → турнир; seed и неинформативная подпись заменены (`features/result/*`).
- ✅ **Field-этап**: подсветка своей команды заливкой без скруглений (без «YOUR TEAM»-тега), выравнивание колонки силы, «Projected finish» → пояснение про прогноз места; кнопка «Draw the groups» → «К групповому этапу».
- ✅ **Сетка**: секции Upper/Lower, **Grand Final в верхнем ряду**, колонки равной ширины во всю ширину с древовидным центрированием (space-around) и коннекторами; своя команда в зелёной рамке, лого-бейджи, победитель ярко/проигравший приглушён.
- ✅ **Консолидированный итог (как 322-0)**: убраны отдельные экраны Grand Final и «complete»; стадии `field → groups → playoffs`, где **playoffs — терминальный экран**: место + чемпион + сетка + итоговая таблица + твой состав (роли/ники/герои + Base/Hero Synergy/Chemistry/Team OVR). `verify_tournament` обновлён (3 стадии).
- ✅ **P0 — live-симуляция как процесс**: движок считает результат детерминированно, а UI **проигрывает** его прогрессивным reveal (презентационный слой, движок чистый). Группа: BO2-матчи падают в фид по одному (A/B чередуются), standings наполняются live, route (upper/lower/out) открывается по завершении группы. Плей-офф: серии раскрываются пораундово в зависимостном порядке до Grand Final; чемпион/итоговая таблица/твой состав скрыты до конца сетки. Индикатор **LIVE** + **Skip** прыгают к финалу; переход к след. стадии заблокирован до доигрывания/Skip. Reveal эфемерный (не в persist), сбрасывается по смене стадии, prefers-reduced-motion. **Файлы:** `features/tournament/{TournamentScreen.tsx,tournament.css}`, `i18n/core.ts` ([6df86ab]).
- ✅ **P1 — полировка сетки: закрыта позднейшими заходами, сведено ревизией 2026-08-18.** Полные elbow-коннекторы давно реализованы SVG-слоем `.bracket-connectors` (пути `M…L…L…` с вертикальными коленами, draw-in по stroke-dasharray, accent-вариант ведёт путь юзера) — замер на живом забеге: 20 путей, соединяющих пары матчей во всех раундах UB/LB/GF. «Кто кого» по картам закрыт фидом результатов группы (`group-results`: 11 строк BO2 со счётом A–B, сигилами и подсветкой исхода юзера) — та же информация, что у референса, в подаче ленты.
- **DoD:** группа/сетка/standings раскрываются как процесс (LIVE+Skip) ✅, детерминизм сохранён ✅; parity-матрица с 322-0 закрыта ✅.

### TREF-TOUR2 — Seamless Classic run flow (бесшовный забег) ✅ (реализован 2026-07-15, статус сведён ревизией 2026-08-18)
> **Сведение 2026-08-18:** ядро реализовано ещё [75302ea] (seamless TI sim, 2026-07-15) и дособрано T7.8 (камера турнира): фазы `result`+`tournament` слиты в единый run-вид (отдельного phase `result` в `runStore` нет, `features/result` остался одним css-файлом, который импортирует `TournamentScreen`), от конца драфта до итога — одна CTA `tournament-simulate` (+`Show result` как Skip из R1.1), стадии field→groups→playoffs идут подряд без ручных advance, камера ведёт к активной секции (широкий/узкий разведены в T7.8). Живой прогон 2026-08-18: полный забег десктоп+мобила, ни одного stage-гейта, терминальный вид = место+чемпион+сетка+standings+ростер+career; mobile 375 без горизонтального оверфлоу. DoD-пункты закрыты; запись ниже — исторический контекст.
> Из аудита [audits/2026-07-15-classic-seamless-flow.md](audits/2026-07-15-classic-seamless-flow.md) (живой проход 322-0 2026-07-15). TREF-TOUR1 закрыл **контент** стадий; здесь — **оркестрация/подача**. В 322-0 весь пост-драфт — одна непрерывная страница без гейт-экранов: правая колонка морфится паки→field, одна CTA `Simulate` проигрывает group→playoffs→standings подряд, «камера» (авто-скролл) ведёт к активной секции. У нас — 3 клика-гейта (`start-tournament`, `advance→groups`, `advance→playoffs`) между 4 полноэкранными видами.
- **Цель:** убрать гейт `ResultScreen` и ручные stage-кнопки; свести пост-драфт в один непрерывный run-вид с авто-скроллом к активной стадии. Одна CTA запускает турнир; live-reveal+Skip переиспользуются as-is.
- **Не-цель:** менять движки `RunEngine`/`TournamentEngine`, формулы счёта, контент стадий, career-панель, «Save as image» (T3.9). Только phase-машина + презентация.
- **Подход (к согласованию):** свернуть фазы `result`+`tournament` в единый run-вид; разбор счёта из `ResultScreen` — в левую (постоянную) колонку драфта; поле+CTA — справа; стадии `field→groups→playoffs` авто-продвигаются подряд (без ручных `advance`), секции стекаются вертикально, `scrollIntoView` ведёт камеру. Сохранить manual hero-swap (было на `ResultScreen`). Resume открывает нужную секцию сразу; `prefers-reduced-motion` отключает авто-скролл-анимацию.
- **Файлы:** `web/src/state/runStore.ts` (phase-машина), `web/src/app/App.tsx` (взаимоисключающие вью → единый run-вид), `web/src/features/{result,tournament}/*` (слияние/переиспользование), возможно новый `features/run/*`; `i18n/core.ts`.
- **DoD:** от конца драфта до результата — **одна** CTA (+опц. Skip), без ручных stage-гейтов; авто-скролл ведёт к активной стадии; детерминизм и завершаемость забега не затронуты (`verify_tournament`, `verify_career` зелёные); границы game/≠ui/ соблюдены; resume открывает корректную секцию; `prefers-reduced-motion` ок; mobile — одна колонка без горизонтального оверфлоу; typecheck/build/tests зелёные.
- **Deps:** TREF-TOUR1 (контент стадий ✅), TREF-CAREER1 (career-панель ✅).

### TREF-CAREER1 — Career / история забегов (parity с 322-0) ✅
> Gap 2026-07-12 (скрин 322-0 career-панели). Сейчас забег завершается терминальным экраном, но **накопительной статистики нет**: сколько раз какое место занял, games won/lost, undefeated/flawless, last N runs с ростерами. В PRD задекларировано только строкой (§5.10 «история забегов», §6.2 «Сохранение забегов/история») — конкретной спеки/задачи не было.
> **Решения C-A…C-E зафиксированы 2026-07-12 (ниже). Кода пока нет.**
- **Природа:** это **пользовательское накопительное состояние**, а не игровые данные (static-first не трогаем). Пишется **один раз** при завершении забега (терминальный playoffs).
- **Хранение (C-D — локально, per-device):** история **у каждого устройства своя** (ПК и телефон — разная статистика, это ок и ожидаемо, как в 322-0). Новый persisted-стор `state/careerStore` по паттерну `runPersist` — versioned localStorage, ключ `aegis:career:v1`. **Сервер не нужен** → едет сразу с фронтом, без зависимости от T8.x. Записи крошечные → храним все (career-счётчики нужны по полной истории; «last N» — срез). Форма записи спроектирована server-ready — **если** позже появится opt-in cross-device sync (T8.4), это отдельная надстройка (merge/replace), а не переделка.
- **Запись (компактная, versioned), добавляется идемпотентно:** `{ v, finishedAt, seed, datasetSchemaVersion, ratingModelVersion, configLabel{format,difficulty,scoring,draftStyle}, placement (PlacementKey из движка), score{base,heroSynergy,chemistry,teamOvr}, roster[5]{role,nickname,accountId,heroId}, results{gamesWon,gamesLost,groupClean,undefeated} }`. `results` считаем из уже готового `TournamentEngine`-снапшота (есть `groupMatches` + все серии + `userPlacement`) — храним производные числа, чтобы не реплеить позже. (Ре-симуляция/анти-чит не нужны: это личная per-device статистика, а не соревновательный лидерборд.)
- **Идемпотентность:** аппенд ровно один раз; дедуп по стабильному `runId = hash(seed + datasetVersion + configLabel)` (resume/повторный показ завершённого забега **не** дублируют запись).
- **Career-счётчики = ПРОИЗВОДНЫЕ от записей** (не храним агрегат отдельно → нет рассинхрона):
  - **(C-A) бакеты места:** `1st`, `2nd`, `3rd`, `4th`, `5–6`, `7–8`, и **остальное (9–18) одним счётчиком** (не как 322-0 «Top 8 / Last» — отдельного «Last» нет, всё ниже 8-го места сливается в один бакет);
  - **(C-B) Undefeated / Flawless Group — по КАРТАМ:** Undefeated = за весь забег `gamesLost == 0` (ни одной проигранной карты), Flawless Group = в группе `0` проигранных карт (`groupClean`); Games Won / Games Lost = Σ карт по истории;
  - Runs = длина истории.
- **UI (C-C — на экране завершения, ниже нашей статистики):** career-панель рендерится **под** блоком результата забега на терминальном playoffs-экране (счётчики мест/undefeated/flawless/games + last N runs с ростером и героями, как в 322-0). Отдельный Career-экран из меню **не** делаем. Реюз `StatTile`/`RoleTag`/`HeroThumb`/`Surface`.
- **(C-E) версии:** историю **храним сквозь** bump `datasetSchemaVersion`/`ratingModelVersion` (career не обнуляется при апдейте данных, как в 322-0), но **каждая запись тегируется версиями** — так можно позже отфильтровать/сегментировать при желании, не теряя данные.
- **Файлы:** `web/src/state/careerStore.ts` (новый), `web/src/features/tournament/*` (панель), `i18n/core.ts`.
- **DoD:** запись добавляется один раз на завершённый забег и переживает reload (per-device); счётчики/last-N выводятся из истории по правилам C-A/C-B; дедуп при resume; private-mode localStorage не роняет (graceful, как в `runPersist`); детерминизм забегов не затронут.
- **Реализовано 2026-07-13:** отдельный `careerStore` хранит versioned записи в `aegis:career:v1`; терминальный переход в playoffs и resume вызывают один идемпотентный `record`; агрегаты вычисляются только из записей. Career-панель под итогом показывает 12 счётчиков и последние 8 ростеров с героями. `verify_career.ts` фиксирует все placement buckets, map-based результаты, replay-детерминизм и повторный `record` без роста истории.
- **Deps:** TREF-TOUR1 (терминальный экран ✅). Опциональная cross-device sync — позже поверх T8.4, форму записи под это уже заложили.

### T5.2 — Награды, валюта и Camp/Market ✅ (Ревизия статусов 2026-08-31: DoD полностью выполнен срезами 2–3 T5.7 — `game/anteEconomy.ts`/`anteMarket.ts`, resume, e2e camp-флоу; калибровка ушла в T6.3/balance config)
- **Цель:** замкнуть переход `Stage → Reward → Camp/Market → следующий Stage`: после этапа дать **выбор 1 из 3** экономических наград (решение 2026-07-23) и trade-off «потратить сейчас / накопить». Здесь же заложить общий reward-offer контракт; карточки подключит T6.1, не блокируя экономический срез.
- **Экономика v1:** одна мягкая валюта; market reroll тратит её и не конвертируется в стартовые draft rerolls. Минимум три категории покупок как **in-place рычаги** над слагаемыми (без swap игроков): усиление Base, Hero Synergy, Chemistry текущего ростера, у каждого свой trade-off. Редкость героев и карточки подключаются следующими срезами.
- **Резерв — это срез 3, не T5.2 (решение 2026-07-23).** Резервный игрок, резерв hero pool и замена/re-pick со свапом (пересчёт потери/прироста Base/Hero Synergy/Chemistry) перенесены в срез 3, чтобы срез 2 был чистым экономическим скелетом. Раньше тело T5.2 упоминало «Camp v1 с резервом» — это противоречило разбивке срезов; побеждает разбивка.
- **DoD:** экономика детерминирована и не допускает отрицательного баланса; reward/market offer воспроизводимы по seed; UI до покупки показывает цену и breakdown `до → после`; можно пройти минимум два этапа с сохранёнными покупками; resume восстанавливает валюту, offers и покупки.
- **Deps:** T5.1.

### T5.3 — Boss conditions ✅ (срез 5, 2026-07-24)
- **Цель:** специальные заранее видимые условия этапов, заставляющие адаптировать ростер/героев/Tactics через Market, резерв и Scouting.
- **Разведка:** до необратимых покупок игрок видит следующий boss condition целиком либо получает достаточную информацию через Camp Action `Scouting`; скрытый контр без возможности подготовиться запрещён.
- **DoD:** минимум 5 условий, каждое меняет оптимальное решение и покрыто тестом; нет boss-а, который только умножает target; UI показывает влияние условия на текущий билд `до → после`.
- ✅ **Реализовано 2026-07-24.** Чистый слой `game/bossConditions.ts` (как `tactics.ts`, поверх `score.ts` ⇒ `ratingModelVersion` не бампался, golden не сдвинут, Quick Draft чист). **5 условий по одному на рычаг:** `baseFloor` (Base), `heroSynergyDemand` (Hero Synergy), `chemistryBlackout` (Chemistry), `unbalancedRoster` (форма ростера — разброс OVR), `heroBan` (hero pool — забаненные герои штрафуют Hero Synergy). Босс **не поднимает числовой порог места** (PRD запрещает): даёт **условный штраф к силе состава на этот этап**, если ростер не подходит; штраф пересчитывается от текущего ростера (условие, не разовая дельта), адаптируется через Market/резерв/Tactics. Боссы с этапа index 2 (первые два — онбординг), детерминированы по seed; в Династии (T5.8) индекс не ограничен, типы циклятся. Store: `boss: BossEvaluation` в сторе, пересчёт на swap (как tactics); штраф вычитается из силы поля через общий `stageStrength()` в `advanceAnteStage`/`swapHeroes`/resume/finishTournament; на экране этапа штраф также вычитается из центра радара, чтобы `pentagon-team-ovr === tournament-user-strength` (инвариант проверен e2e). UI: заранее видимое правило + met/`до→после` в Буткемпе (`camp-boss`, превью следующего этапа) и на активном этапе (`ante-boss`). heroBan-баны берутся из стабильного `engine.allFormatHeroes` (детерминизм независимо от ростера). Scouting остаётся free-reroll (правило и так видно); тесная связка scouting↔boss — потенциальный полиш. i18n RU+EN. Тесты: `bossConditions.test.ts` (10, все 5 условий + полнота каталога + детерминизм банов), e2e «boss condition виден заранее и на этапе» (превью в Буткемпе + активное условие + инвариант радар=поле). Полный `test` (293)/`test:e2e` (16)/`tsc`/`build`/golden зелёные, датасет/схема не тронуты.
- **Балансовый прогон (`npm run sim -- N`, `web/scripts/sim_run.ts`) — прототип T6.3.** Наивный авто-игрок (жадный best-OVR драфт + жадная покупка лучшего прироста Team OVR, без адаптации к боссу) на 500 сидах: **win-rate ~8%** с боссами (12% без — боссы честно давят наивную игру, осмысленная адаптация выигрывает чаще). Забег **выигрываем**. Наблюдение для T6.3: ~1/3 наивных забегов гибнет уже на этапе 0 (top-10, онбординг) — базовая сложность среза 1/2 (placeholder), не боссы. Тул гоняем после каждой правки орка/экономики/боссов, чтобы «выигрываемо» не сломать.
- **Fix (срез-4 регресс, найден на live-забеге 2026-07-24):** Camp Action `Stand-in` (бесплатный свап игрока) не давал купить дорогую карту игрока, если цена выше золота — UI-проверка `cost<=gold` игнорировала `freePlayerSwaps`, хотя движок списал бы 0. Вынес правило в чистую `playerOfferAffordable(cost,gold,freeSwaps)` (юнит-тест) + карта показывает «Бесплатно»; e2e «stand-in делает замену игрока бесплатной» покрывает ровно этот кейс.
- 🔁 **Пересмотрено 2026-07-27:** `BOSS_FIRST_STAGE = 2` даёт босса на каждом этапе с третьего (3 из 5) — противоречит «босс = редкое событие». Cadence меняется на **один босс в финал акта** (`R6.2`), Scouting перецеливается на нераскрытую информацию (`R9.4`), а условный штрафной слой боссов сохраняется как есть.
- **Deps:** T5.1, T5.2.

### T5.4 — Mode shell: Classic / Manager / Real Tournament ✅ (Ревизия статусов 2026-08-31: шелл несёт все пять режимов (+Arena/Duel), mode входит в seed/share для каждого исполняемого — "run" с T5.7, "tournament" с T5.6; SOON/сеть-гейты честные; хвостов в тексте не осталось)
- **Цель:** вынести верхнеуровневый режим отдельно от `DraftStyle`; Classic сохраняет Team Packs/Mixed, остальные режимы подключают собственные конфиги и orchestration.
- **Файлы:** `web/src/game/`, `web/src/state/`, start UI; при добавлении DTO — сначала `schema/`.
- **DoD:** выбранный режим входит в seed/share state; недоступные режимы честно помечены SOON; переключение не теряет совместимые настройки Classic.
- **Deps:** T5.1.
- **Статус 2026-07-11:** ✅ отдельная стильная развилка режимов и собственные landing-состояния; Classic ведёт в рабочую конфигурацию, Manager/Tournament — в локализованные продуктовые заглушки. ✅ mode в seed/share state включён по мере появления исполняемых модулей: `"run"` — с T5.7, `"tournament"` — с T5.6 (срез 1, 2026-08-19; ссылка дополнительно несёт `e` — событие поля).
  - ✅ Контекст выбранного режима хранится отдельно от конкретного run: завершение или подтверждённый выход без сохранения сбрасывают движок, но возвращают в конфигурацию Classic, а не на общую развилку.

### T5.5 — Esports Manager vertical slice 🟨 (срез 1 сыгран 2026-08-12)
- ✅ **Срез 1 (2026-08-12): играбельная сезонная петля по образцу 322-0.** Онбординг (имя/6 регионов-flavor/сложность = доход $80–120k) → трайауты 8×5 из реальных pack-игроков со **скрытыми зарплатами** ($-бенды) + 1 реролл → пул 12 героев (4×3) → переговоры: раскрытие зарплат + 5 дешёвых филлеров по ролям → отбор пятёрки 1C/1M/1O/2S под доход (подписать дороже дохода нельзя) → сезон: 5 циклов «2×tier2 → квалификация(top-2) → онлайн → LAN» + отбор(top-1) + финал «Aegis Championship»; мгновенный розыгрыш (KO-сетка, ELO-формула 322-0 `10^(−Δ/22)`), призовые по измеренным таблицам, ELO-рейтинг 17 бот-оргов, лента, календарь → оффсезон: дрифт ±3, пересмотр зарплат, release с заменой филлером → Season N+1.
  - **Реализация:** `game/manager/{economy,engine}.ts` (чистый движок, потоки Rng `${seed}:<цель>`, снапшот-сериализация), `state/managerStore.ts` (long-save `aegis:manager:v1` через persist-слой, совместимость schema/rating/dataHash/`MANAGER_ECONOMY_VERSION`), `features/manager/` (один экран по фазам), карточка режима активирована (App перехватывает `selectedMode==="manager"` до фазовых экранов classic). Счёт — тот же `scoreTeam` (Base+Synergy+Chemistry), кандидат = свежайший pack-снапшот игрока в окне last_2y, героика lifetime.
  - **Решения среза (план 2026-08-12):** M-A конечный сезон+продолжение (не дивизионы); M-B пул = pack-игроки окна; M-C зарплаты В MVP (322-0-ядро; §1.8 «MVP без зарплат» — override); M-D сейв локальный (сервер не задеплоен; формат готов к T8.4). Регионы — flavor (сид поля). Финал называется «Aegis Championship» — нейминг Valve не используем.
  - **Тесты:** `web/test/managerEngine.test.ts` — 9 кейсов: детерминизм (трайауты/календарь/дрифт/банк), пул «одна свежайшая форма на человека», гейт квалификаций на полном сезоне, оффсезон-replace той же ролью (пойман баг: замена выбирала самого отпущенного), JSON round-trip персиста. Живьём: полный флоу Playwright (онбординг→сезон→3 события→reload→resume), обе темы, 375px без горизонтального переполнения (шишка: nowrap-подписи календаря распирали грид — `minmax(0,1fr)`).
  - ✅ **Срез 2 (2026-08-12): слой «жизни орга» по 322-0** (`MANAGER_ECONOMY_VERSION m1.0.0→m1.1.0`, старые сейвы честно инвалидируются). **Rival:** ближайший по ELO орг на сезон, форсится в поле каждого события, место выше него = +$10k (у 322-0 +$25k — взяли скромнее до калибровки), метка RIVAL в таблицах. **Random events:** шанс 0.25 после события (поток `:re:<slotId>`), 4 вида (кэш ±, настроение ±), модалка «Событие», эффект применяется в движке до показа. **Fame/Happiness (константы 322-0):** старт 70, титул +8/топ-3 +3/дно LAN −4/мимо финала −6; слава за титулы по тиру (финал 2★…tier2 0.25★), decay −0.5★/сезон, +4%/★ к пересмотру зарплаты; настроение смещает оффсезонный дрифт (±1) и решает **уходы**: ретайр 2% (+3% ветерану 3+ сезонов, +5% несчастному) и 35% ухода несчастного — departures в оффсезоне force-release без тоггла. **UI:** ростер показывает назначенного героя (bestAssignment), славу ★ и настроение ♥/☹. **Тесты:** 15 в managerEngine (детерминизм rival/событий/уходов, кламп, слава-зарплата); живой сезон Playwright: 4 rival-бонуса, 4 события, оффсезон, Season 2.
  - ✅ **Срез 3 (2026-08-13): Manual, события-выборы, сетка результата** (`m1.1.0→m1.2.0`: новый вид события меняет роллы `:re:` — сейвы инвалидируются). **Manual-назначение героев:** клик по строке ростера → пикер пула орга (career-игры игрока на каждом герое, «сейчас у {nick}»); pin через `scoreTeam(..., fixed)`/`assignWithFixed` — герой один, забирается у прежнего владельца, авто дораздаёт остальным; «Авто-подбор» снимает pin; метка ✎ в ростере; pins переживают персист. **Событие-выбор** (Bootcamp Opportunity 322-0): `bootcampOffer` — заплатить $20k за +6 настроения всему ростеру либо отказаться; accept без денег не проходит (кнопка disabled, движок возвращает false). **Мини-сетка результата:** simKnockout отдаёт раунды (QF/SF/GF), панель результата рисует их над таблицей мест, юзер и победители подсвечены. **Тесты:** 19 в managerEngine (pin/steal/auto, персист pin, accept/decline/бедность, сетка согласована с местами) — зелёные на real И mock. Живой прогон: pin «Tiny ✎», сетка, событие-выбор с оплатой.
  - ✅ **Срез 4 (2026-08-13): экономика по-настоящему + Hall of Legends** (`m1.2.0→m1.3.0`).
    - **Месячный тик:** `доход − зарплаты` начисляется при смене месяца календаря (раньше НЕ начислялся вовсе — «Net/mo» был декорацией, difficulty не работала). Оффсезонный пересмотр может увести net и банк в минус — давление на release дорогих.
    - **`npm run sim:manager`** (`scripts/sim_manager.ts`): N карьер × S сезонов, стратегии cheap (дешевейшая пятёрка) и greedy (максимум OVR под кап, полный перебор комбинаций). Сразу вскрыл два дефекта: (1) поле строилось «вокруг силы игрока» — усиление догонялось полем, cheap и greedy проходили квалы одинаково; (2) зарплаты слишком дёшевы — профицит $70k/мес обесценивал экономику.
    - **Калибровка m1.3.0:** сила бота — от ЕГО ELO + тир (`botStrength`: 1240→60, 1320→72, tier2 −6 … финал +8), мир фиксированный; зарплаты подняты (60→~11k, 75→~33k, 87→~59k — 322-0-масштаб «подписи впритык к доходу»). После: greedy 2.2/5 квалов и 5.1 титула против 0.7/5 и 1.4 у cheap, отбор финала 16% vs 3% — сила окупается. Титул финала ~0% — осознанно мечта до межсезонной прогрессии (трансферы). Известное: cheap копит больший банк (некуда тратить) — решится трансферами/спендингом.
    - **Hall of Legends** (322-0-парити по духу, БЕЗ шардов/перков — сила меты за T6.4): межкарьерный персист `aegis:manager:hall:v1` (не инвалидируется версиями данных/экономики), запись на переходе сезон→оффсезон (ростер ещё сезонный), рекорды (карьеры/сезоны/титулы/финалы/лучший ELO) + коллекция игроков (peak OVR, сезоны, титулы); модалка из онбординга и футера сезона. **Решение:** история сезонов Manager живёт в Hall; в общий careerStore сезонные записи НЕ пишутся (форма CareerEntry — под забег).
    - Тесты: 22 в managerEngine (тик/бот-сила/зал), оба датасета; живой прогон: тик $0→$58k, зал после сезона (5 игроков, рекорды).
  - ✅ **Срез 5 (2026-08-15): трансферное окно — межсезонная прогрессия** (`m1.3.0→m1.4.0`).
    - **Рынок на экране Review:** 6 оферов, стратифицированных по качеству (2 звезды из топ-10% пула / 2 крепких топ-25% / 2 бюджетных топ-50%), без игроков ростера, детерминирован `:transfers:<season>`. **Взнос из банка** (`transferFeeK`: кривая круче зарплатной — 65→~90k, 75→~215k, 85→~400k), зарплата ложится в фонд; замена только той же роли, ушедший покидает орг (manual-pin снимается); **лимит 2 сделки за окно**. UI: секция в Review + модалка «кого заменит».
    - **Штраф за долг** (322-0 `Sd`, замер): минусовый банк в месячный тик — happiness −6 и fame −0.25 всему ростеру; спираль «долг → несчастье → уходы» тормозит зарплатную массу.
    - **Sim после среза:** greedy с трансферами растёт 69→79 OVR за 4 сезона, отбор финала 16→38%, **титул финала 0→7%** — межсезонная прогрессия работает; cheap-контроль копит банк без славы. Осталось мечте место: жадный агент живёт в минусе (−$650k к S4 при 84% отрицательных) — реальный игрок обязан балансировать release'ами; жёсткость (запрет трансферов в минусе, insurance-перк 322-0) — по живому плейтесту.
    - Тесты: 25 в managerEngine (рынок/своп/лимит/нехватка/чужая роль/очистка окна, штраф долга с точным ожиданием), оба датасета; живьём: 6 оферов при банке $1055k, сделка 1/2, ростер сменился, Season 2.
  - ✅ **Срез 6 (2026-08-15): финал сезона — настоящий 18-командный турнир с live-reveal.**
    - **`TournamentEngine` научился явному полю:** аддитивный параметр `opponents` (17 команд) обходит генерацию ботов; без него поведение байт-в-байт прежнее — golden Classic/Roguelite не тронуты (проверено). Развязка TournamentScreen от runStore НЕ понадобилась: reveal у манагера свой.
    - **Финал = группы + double-elim + Гранд-финал** с НАСТОЯЩИМИ оргами мира (сила — от их ELO, `botStrength(elo,"finale")`), сид `:finale:<season>`; placement-ключи классики маппятся в места 1–18, призы по полной таблице. Полный `TournamentResult` уезжает в `EventResult.finale` (персистится — reload переигрывает подачу).
    - **`FinaleReveal`** (features/manager): раскадровка готового результата — группы построчно → маршруты (▲ верхняя/▼ нижняя/✖ вылет, паттерн T7.10) → раунды сетки по одному → чемпион; Skip = «Показать результат»; reduced-motion сразу итог; строки результата и Continue скрыты до конца подачи.
    - Sim: титул финала через double-elim 2–3% (поле — все 17 оргов; редок, но жив). Тесты: 27 managerEngine (585 всего; поле 18 с rival и всеми оргами, согласованность standings/приза, детерминизм чемпиона), оба датасета; живьём: форс финала патчем сейва → reveal → skip → чемпион → оффсезон.
  - ✅ **Плейтест-фиксы 2026-08-15 (после живой карьеры пользователя)** (`m1.4.0→m1.5.0`).
    - **Спонсорский доход от ELO** — ответ на главный дефект плейтеста: чемпион мира (#1, ELO 1642) жил на стартовых $100k и тонул в −$82k/мес, выигрывая почти всё — успех наказывался, доход не рос вовсе. Теперь `sponsorBonusK`: +$0.12k за очко ELO над стартом, потолок +$80k (1300→+24k, 1642→+65k); кап подписи на старте не меняется (ELO 1100 → бонус 0). Sim: greedy к S4 — OVR 85, отбор финала 58%, титул 23%, банк положителен — петля «успех → спонсоры → звёзды» работает.
    - **Баг рейтинга:** юзер с рангом #1 показывался ПОД топ-8 ботов отдельной строкой. Теперь единый отсортированный список: в топ-8 юзер стоит на своём месте, ниже — топ-8 + его строка с настоящим рангом.
    - **Стабильные кнопки:** панель результата получила пару в фиксированном месте — «Дальше» (secondary) и «Сыграть следующее →» (primary, continue+play одним кликом; при выпавшем random event не проскакивает модалку). Раньше одиночная кнопка «прыгала» между панелями и быстрые клики промахивались.
    - **Тир-цвета OVR** (словарь `ovr-tier--*` из T7.6): номера окрашены на трайаутах, контрактах, ростере, трансферном рынке и в Зале легенд; плитки счёта получили правильные kinds (synergy/chemistry). Живьём: weak/low/mid читаются с карточки.
  - ✅ **Срез 7a (2026-08-18): события-выборы расширены** (`m1.5.0→m1.6.0`: рулетка `:re:` выросла 5→7 видов — сейвы честно инвалидируются). Выборы различаются ОСЬЮ, а не числами: `streamDeal` — зеркало буткемпа (+$25k ЗА СЧЁТ −3 настроения), `heroClinic` — покупка героя в пул орга за $15k (глубина matching; конкретный герой роллится при создании события и виден в превью ДО решения — превью обязано совпасть с эффектом). Ось славы сознательно не использована: fame в этой экономике только удорожает пересмотр зарплаты, «награда славой» была бы ловушкой. `RandomEventDef.choice` генерализован (`costK/cashK/happiness/hero`), `resolveRandomEvent` применяет разрешённый эффект целиком; на вычерпанном справочнике heroClinic исключается из рулетки до ролла. UI: превью выбора собирается из разрешённых чисел (включая имя героя), кнопка accept без платежа — «Принять предложение». Тесты: 31 в managerEngine (3 новых: streamDeal accept/decline, heroClinic превью→эффект→нехватка денег, исключение на вычерпанном пуле), оба датасета; живьём: «Мастер-класс от легенды» → «−$15k · +Chaos Knight to hero pool» → банк $180k→$165k, пул орга 12→13 с Chaos Knight в пикере.
  - ⬜ **Осталось (срез 7+):** шард-мета поверх Hall (связка с T6.4 Stakes); жёсткость долга (запрет трансферов в минусе / insurance) — решить живым плейтестом; live-reveal финала обогатить (пошаговый счёт серий из `frames`, тайминги 322-0) — по фидбеку.
- **Прежний контекст:**
- **Живой проход референса (2026-08-11):** [audits/2026-08-11-322-0-em-live-walkthrough.md](audits/2026-08-11-322-0-em-live-walkthrough.md) — полный флоу EM 322-0 (онбординг → tryouts со скрытыми зарплатами + fillers → hero pool 4×3 → салари-кап отбор 5 → сезон 5 циклов с гейтом квалификаций → ELO world ranking, rival, random events, fame/happiness, шард-мета). Константы — в [reference-322-0.md](reference-322-0.md) §Esports Manager. `unknown`: где в сезоне живут апгрейды/окна ростера (за 3 цикла не встречены — вероятно offseason).
- **BA-сценарий (2026-07-12):** [docs/modes-scenarios.md §1](modes-scenarios.md) — питч, экономика (цены/зарплаты), дивизионы, идеи-улучшения, MVP-срез. **Открытые решения** (к согласованию до кода): M-A длина сейва, M-B пул игроков, M-C зарплаты в MVP, M-D онлайн vs локальный сейв.
- **Цель:** выбор организации/региона → бюджет и контракты → ростер → квалификация.
- **DoD:** минимум 3 региона и разные стартовые ограничения; контракты имеют цену/срок; невозможно выйти за бюджет; сезон детерминирован по seed. Это отдельный цикл, а не reskin Classic.
- **Данные:** цена/зарплата игрока **синтезируются** из OVR/престижа/окна (детерминированно, версия `economyModelVersion`) — **не** Liquipedia-salaries (их нет). Сейв — сервер по ADR 0002.
- **Deps:** T5.2, T5.4. (Liquipedia-контракты **не** нужны — цены производные от нашей рейтинг-модели.)

### M-ECON — Экономика Manager: оффсезонный кап + тренировочный сбор ✅ (m1.7.0, 2026-08-24)
Замер `sim_manager 150×6` (m1.6.0) показал вырождение обоих концов: **cheap** копил $7.1M к S6 при
нуле титулов финала (деньгам не на что влиять), **greedy** жил при банке **−$2.0M** (банк<0 в 90%
месяцев S6) и брал 22% титулов финала — штраф долга (−6 настроения/мес) полностью компенсировался
титулами, а кап «зарплаты ≤ дохода» проверялся только при ПЕРВОЙ подписи: fame-бампы пересмотров
уводили wages до $333k при доходе ~$180k без всякого гейта. Два рычага, оба — расширение уже
существующих правил:
1. **Оффсезонный кап** (`offseasonBudget()` + гейт в `confirmOffseason`): прогнозные зарплаты
   нового сезона (пересмотры остающихся + оценка филлеров `FILLER_WAGE_ESTIMATE_K`) обязаны быть
   ≤ дохода — «пять звёзд недоступны по построению» действует всю карьеру, а не один экран.
   UI: строка бюджета + причина + disabled confirm; release пересчитывает на лету.
2. **Тренировочный сбор** (`OFFSEASON_BOOTCAMP` $150k, раз в оффсезон, в долг не продаётся):
   дрифт формы каждого игрока +1 (кламп ±3 остаётся) — первый синк, покупающий РАЗВИТИЕ.
A/B `150×6` на одних сидах: greedy — банк<0 90% → **1%**, банк стабилен ~$1.1M; цена честности —
OVR 88 → 81, титул финала 22% → 9% (вершина снова редкая). cheap — деньги конвертируются: OVR
64 → 67, квалы 0.9 → 1.3/5, титулов/сезон 1.7 → 2.7, отбор финала 3 → 7%. Остаток m1.7.0 (копилка cheap росла до $6.6M — один сбор дешевле профицита) закрыт в **m1.8.0**:
сбор стал **лестницей уровней** `costsK [150, 450, 1000]` — каждый уровень ещё +1 к дрифту всех
(кламп ±3 режет верх, отдача убывает по построению), полный сбор $1.6M за оффсезон. A/B 150×6:
банк cheap **$6.58M → $2.91M и выходит на плато** (S4≈S5≈S6 — расход лестницы сравнялся с
профицитом), деньги конвертируются: OVR 67.3 → 70.3, титулов/сезон 2.7 → 4.3, зарплаты 79 → 91k
из ~105k дохода — оффсезонный кап зарплат становится естественным потолком богатства (сцепка
систем, а не новый лимит). Greedy не задет (его банк ниже буфера верхних уровней). Живой прогон:
3 уровня подряд, счётчик +1/+2/+3, «Сбор на максимуме», confirm. `MANAGER_ECONOMY_VERSION m1.8.0`.
Инфраструктура орга как отдельная система остаётся возможной большой фичей, но необходимость
отпала: плато достигнуто существующими механизмами.
`MANAGER_ECONOMY_VERSION m1.7.0` (карьера-сейвы m1.6.0 честно инвалидируются). Тесты: гейт/release,
одноразовость и кламп сбора, недоступность в долг; sim-агенты релизят дорогих и покупают сбор.

### T6.4 — Stakes ✅ срез 1 (2026-08-25): добровольное правило сезона
Реализация принятого решения 2026-08-09 «**мутаторы = Stakes**, одна система правил сложности»:
стартовый Stake — добровольный выбор ОДНОГО правила из тех же четырёх определений LG3
(`tighterTargets` / `doubleBans` / `expensiveMarket` / `uncappedBoss`), под которым играется
**весь сезон** Roguelite Run. Стек не заводим (константа LG3): в Династии продолжает действовать
только мутатор круга — Stake считается сыгранным вместе с сезоном.
- **Механика:** `mutatorForStage(seed, index, season, stake)` — единственная точка правды
  получила 4-й параметр; circle 0 возвращает Stake, круги — как раньше. Все рычаги пришли
  бесплатно теми же функциями: порог (`effectiveStageTarget` + `AnteRunEngine.stageAt`), цены
  рулетки и стат-карт (`marketCostFactor`; в `RunEconomy` — транзиентный `setStake`, в сейв
  экономики не пишется — конфиг уже в SavedRun), баны (`bannedHeroesForStage`), потолок штрафа
  (`BossContext.stake`). Дефолт `null` ⇒ поведение без Stake байт-в-байт прежнее: golden и
  e2e-сиды не тронуты (smoke+anteRun 24 passed).
- **Конфиг и воспроизводимость:** `RunConfig.stake` (опционально, как hardMode), кодек RunLink —
  поле `k` (мусор молча отбрасывается, старые ссылки читаются без Stake), SavedRun/resume —
  бесплатно через конфиг; `configLabel.stake` в карьере + бейдж ☄ на записи. С Cheat Mode
  взаимоисключение в обе стороны (несоревновательный забег не носит соревновательную метку).
- **Мета-гейт:** `stakesUnlocked` — первый ЧЕСТНО выигранный сезон run (cheat-победы исключены
  `competitiveEntries`, DoD R2.3). До анлока выбор виден, но заперт с подписью-причиной.
- **UI:** OptionGroup «Stake» в Особых правилах (описания — те же `mutator.desc.*`), метка ☄ в
  сводке запуска; строка-предупреждение лагеря (LG3) показывает и сезонный Stake — тем же
  `mutatorForStage`.
- **Замер (300 сидов, synergy-build):** без Stake 31.3%; `tighterTargets` **23.3%** (−8pp —
  полноценный hard-режим, жмёт с первого этапа); `expensiveMarket` 33.0% (в шуме — профицит
  золота покрывает; мягкий). Числа правил — по-прежнему placeholder LG3: **калибровка стейков
  как лестницы сложности — отдельный заход** (вместе с наградой за Stake — метка уже есть,
  вопрос «что сверх метки» открыт: кандидаты — слот анлоков/косметика, НЕ +OVR по PRD).
- **Сим:** `STAKE=<id> npm run sim -- N` — замер любого правила на сезоне.
✅ **Калибровка стейков (b1.40.0, 2026-08-25).** Замер всех четырёх (300 сидов, база 31.3%):
`tighterTargets` 23.3% ✓, а `doubleBans` ×2 (32.0%), `expensiveMarket` ×1.25 (33.0%) и
`uncappedBoss` (31.0%, boss-death не сдвинулся) — неотличимы от отсутствия правила. Подкрутка:
`expensiveMarket` 1.25 → 1.5 дала **25.0%** (работает, средняя жёсткость); `doubleBans` 2 → 3 —
по-прежнему 32.0%: бан переживается пересадкой героев бесплатно (тот же структурный вывод, что
у отвергнутого RT-контрпика), дальнейшее накручивание числа бессмысленно. Решение: **стартовыми
выпущены только работающие правила** — UI-лестница по замеренной тяжести `Дорогой рынок
(средняя) → Жёстче пороги (высокая)` с подписью тяжести в hint; `doubleBans`/`uncappedBoss`
остаются кругам Династии (там боссы под давлением реальны) и НЕ предлагаются стартовыми —
пустое правило с меткой было бы бесплатным престижем. Ссылка с «невыпущенным» стейком
по-прежнему валидна и играется (механика поддерживает все четыре — это осознанно). Контроль
Династии на общих числах: сезон 32.5%, глубина 5/18/27 (шум выборки 200), смерти под боссом
10.8% — круги живы. Числа doubleBans ×3 оставлены (в кругах длиннее бан уместен).
✅ **Пересмотр семантики doubleBans/uncappedBoss (b1.41.0, 2026-08-26).** Оба правила
перепроектированы формой (числа только калибруют её) и **выпущены стартовыми** — лестница
теперь из четырёх ступеней: `uncappedBoss 27.7%` и `doubleBans 27.7%` (умеренная),
`expensiveMarket 25.0%` (средняя), `tighterTargets 23.3%` (высокая); база 31.3%, 300 общих сидов.
- **uncappedBoss → «правила судят все турниры выше обычных»**: elite + playoffCheck + финал —
  три судимых этапа на акт вместо одного, потолок штрафа по-прежнему снят. Итерации: один
  elite — 29.7% (в пределах шума, мало для честной метки), elite+playoffCheck — **27.7%**,
  boss-death 7 → 28.7% (давление реально, смерти переезжают под правила). Разведка (R9.4)
  переведена с «ближайший финал» на «ближайший этап с НЕИЗВЕСТНЫМ правилом» (bossForStage —
  единственный источник истины cadence).
- **doubleBans → «баны повсюду»**: вне финалов КАЖДЫЙ турнир судится правилом heroBan с
  бан-листом из `banCount` героев, ротация по этапам — одноразовой адаптацией не обходится;
  реролл правила (T5.9) пересматривает СПИСОК, а не снимает правило (ключ shuffle уже включал
  rerolls — механика босса переиспользована целиком, нового судьи нет). Калибровка: 18 банов —
  31.3% (ровно база: ~1 OVR/этап поглощается, хотя boss-death 35.3%), 36 — **27.7%**
  (boss-death 55.3%).
- **Два тупика задокументированы** (оба — реализованы, замерены, откачены в рамках захода):
  (1) удаление СЛУЧАЙНЫХ 45 героев из снабжения (драфт+рынок) — 32.7%, поглощается пересборкой,
  тот же вывод, что у штрафных банов b1.40.0; (2) удаление ТОП-30 меты по популярности
  сигнатурок — **42.0%**, игра стала ЛЕГЧЕ базы на 10 п.п.: сим-агент драфтит героев не
  оптимизируя (`packHeroes[0]`), и фильтр случайно улучшает его пики. **Урок инструмента:
  supply-правила (сокращение пула) текущим сим-агентом не измеряются** — для оптимизирующего
  игрока сокращение пула строго не может помочь, то есть знак эффекта у агента и человека
  разный; правило с таким свойством выпускать как «тяжесть» нельзя. Судимые правила (пороги,
  цены, штрафы) агент отыгрывает честно — все ставки построены на этих осях.
- Контроль Династии на общих числах (200 сидов): см. замер ниже — круги живы, глубина конечна.
✅ **T6.4-2: комбинации Stakes + награда сверх метки (2026-08-26).** `RunConfig.stakes` —
СПИСОК правил вместо одиночного поля (legacy `stake` из сейвов/ссылок b1.41.0 читается через
единственную точку `stakesOf`; в ссылке `k` — id через точку, старый одиночный `k` валиден).
Источник истины «какие правила действуют на этапе» — `stageMutators` (массив; в Династии
по-прежнему ровно один мутатор круга, стек с Stakes не заводится). Взаимодействие
doubleBans+uncappedBoss: на elite/playoffCheck приоритет у РОЛЛА (амбиентные баны — на обычных
этапах), два правила на одном этапе машинерия сознательно не поддерживает.
- **Лестница прогрессии:** победа сезона → Stakes; победа СО ставкой → комбинации (до того клик
  по правилу заменяет выбранное — прежняя одиночная семантика). Гейт `multiStakesUnlocked` —
  производная карьеры, как `stakesUnlocked`.
- **Награда сверх карьерной метки — мастерство, не сила (по PRD «НЕ +OVR»):** победы под каждым
  правилом считает `stakeWinsByRule` (победа с N правилами засчитывает каждое), в hint ставки —
  «✓ пройдено ×N». Отдельного хранилища нет — всё производные карьеры.
- **Замер кумулятивной лестницы** (300 общих сидов, база 31.3%): uncappedBoss 27.7 → +doubleBans
  28.3 (правила перекрываются: оба бьют по судейству этапов) → +expensiveMarket 23.3 → **все
  четыре 16.3%** (boss-death 61.7%) — свободная комбинация даёт честную «золотую ставку» без
  отдельного механизма уровней. Уровни как named-пресеты не заводим: лестница читается из самих
  комбинаций.
✅ **Sim-агент с оптимизирующим драфтом героев + агентский плейтест roguelite-хвостов
(2026-08-31).** Первый заход по всем пунктам «ждёт живого плейтеста» (Wide Pool / Stakes /
Editions / PF-2); прогоны — сим, оффлайн-проба и Playwright-проход по UI на 5273.
- **Инструмент (закрыт остаток T6.4):** агент `synergy-opt` в `scripts/sim_run.ts` — тот же
  synergy-build, но герой драфтится по маргинальному `pairScore` (лучшее улучшение поверх уже
  покрытых игроков), а не `packHeroes[0]`. Цена осознанного хиро-драфта: win 36.7% → 39.3%
  (+2.6пп), выживаемость ранних этапов 72→81 (этап 4), boss-death 7.0→9.7%. Supply-правила
  теперь измеримы этим агентом. **Wide Pool не измерим и им** (A/B minTags 99: 39.0% ≈ 39.3%):
  условие ортогонально synergy-оптимуму — карта чистый build-around, грейд только руками.
- **Wide Pool откалиброван пробой (`b1.43.0`):** намеренно широкий драфт (герой = максимум
  новых тегов) достигает 10+ архетипов в **96%** (11+ — 73%) ценой ~1.1 Team OVR против
  комфорт-драфта; случайный комфорт-драфт даёт 10+ в 22%. При perTag 0.8 медианные +1.6 почти
  съедались ценой широты — карта была постной даже для того, кто под неё играет. Стало
  perTag 1.2 / max 3.6 (медиана +2.4, нетто ~+1.3 early; потолок ~oldTeammates); поздняя игра
  по-прежнему вытесняет карту фактором редкости — арка «ранний рычаг» сохранена. Контрольный
  сим: строки всех агентов байт-в-байт (условие не отыгрывается — искажения нет).
- **Легибельность Wide Pool (реализовано):** до порога карта была полностью немой («условие не
  выполнено» без числа) — теперь счётчик «Разных архетипов: N из 10» в idle-слоте билда и на
  карточке награды (`widePoolProgress` в tactics.ts — отдельный чистый хелпер, НЕ source с
  delta 0: запись в sources сделала бы невыполненную карту «активной» для зарядов/рейла).
- **Editions живы — через канал улучшений:** cheat-прогон до акта 4 — 3/5 карт билда Charged
  (дроп идёт на офферах улучшения предметов), НО заряды копятся медленно (максимум 1/2 к этапу
  16) и Tempered не встретился ни разу. Усиление dropChance (R13.5-вопрос) по этому прогону не
  требуется; кандидаты на подкрутку — темп зарядов и видимость Tempered, решать живой игрой.
- **Stakes-лестница читается** (подписи тяжести, «✓ пройдено ×N», «можно комбинировать», гейт
  с причиной на чистом профиле) — правок не нужно. **PF-2 (слоты):** потолок акта 4 совпадает
  с записанным профилем (резерв сплошь минусовой, «осмысленно» 42% в акте 5) — новых аргументов
  против 5+1 слотов нет.

### T5.6 — Real Tournament + roster lock 🟨 (срез 1 играбелен 2026-08-19)
- ✅ **Срез 1 (2026-08-19): режим играбелен конец-в-конец.** Решения зафиксированы по данным:
  **RT-A — выбор события списком** (каталог `realTournamentEvents`: события с ≥17 реальными
  составами; на текущем датасете 18 турниров — TI 2017/2022/2023, мейджоры, EWC, DreamLeague);
  **RT-B — форма своей эпохи как есть** (сила поля и челленджеров = event-снапшоты, без
  нормализации; дисбаланс эпох виден через projection — underdog это фича);
  **RT-C — challenger-пул = пак-снапшоты выбранного формата** (ось Format = «эпоха пула легенд»)
  **минус ВСЕ аккаунты события** (лочится событие целиком, не только топ-17 поля).
  - **Реюз по плану modes-scenarios §2.3 — нового движка нет.** `game/realTournament.ts`:
    каталог + `buildRealField` (топ-17 паков по ЧЕСТНОЙ силе — тот же `scoreTeam`, что считает
    пятёрку игрока: их Base/сигнатурки/пары; fail-fast на тонком событии, молча lock не
    ослабляется). Поле уезжает в существующий параметр `opponents` `TournamentEngine`
    (срез 6 менеджера); challenger-драфт — обычный mixed-пак `RunEngine`, lock сажается в
    существующий `usedPlayers` (один механизм закрывает и паки, и рынок). RT-скоринг: mixed по
    механике, но base = event (`isRealTournament` отключает team-success-override и его гейт).
  - **State/persist/share:** `realEventId` — mode-shell-состояние (переживает reset);
    `SavedRun.realEventId` (resume пересобирает поле+lock из события; событие выпало из данных →
    честный отказ resume); `RunLink.e` (tournament-ссылка без события — битая; seed-код под
    другое событие — config-mismatch в SeedField). Реролла поля нет (реальность не рероллится) —
    кнопка скрыта, экшен guard'ится. Карьера: свой бакет `tournament` (не подмешивается в Quick
    Draft), заголовок панели RT. T5.4-хвост «mode в seed/share state» для tournament закрыт.
  - **UI:** карточка режима активна; конфиг-экран = селект события (дефолт — свежайшее) + оси
    Format/Difficulty/Allocation (draftStyle/scoring зафиксированы, hardMode скрыт в v1); подпись
    «Реальное поле · симуляция <событие>» на стадии field — реальный исход не реплеится (честность
    §2.4). Тесты: `realTournament.test.ts` (8: каталог/поле/lock/скоринг/кодек/карьера, на mock
    dataset-dependent skip) + e2e `realTournament.spec.ts` (полный флоу с TI 2023 + resume,
    desktop+mobile; на mock честно скипается). Живой прогон: TI 2023 — поле Spirit/Liquid/LGD/GG/
    Tundra..., жадный автодрафт финишировал 18-м, чемпион симуляции — Team Spirit.
  - ✅ **Срез 2 (2026-08-19): underdog-подача (§2.5.1).** Прогноз стал явным вызовом: на стадии
    поля строка «Прогноз посева — {место}. Финишируй выше» (`real-challenge`), на терминале —
    суд прогноза: «Прогноз был {место}» + вердикт `beat/met/missed` (`underdogVerdict` —
    чистое сравнение ИНТЕРВАЛОВ бакетов: финиш целиком выше прогноза — «пробит», пересечение —
    «точно в прогноз», ниже — «мимо»; цвет — токены brand-green/danger). PRD §5.9.1 и
    modes-scenarios §2.6 синхронизированы с решениями RT-A/B/C. Тесты: +2 unit (границы
    интервалов), e2e дополнен ассертами вызова и вердикта.
  - ✅ **Срез 3 (2026-08-23): RT-D — поле без Chemistry + сила поля в селекте.** Аудит баланса
    (300 сидов, жадный челленджер): против EWC 2026 / DreamLeague S27 — **0% побед, ≤4% топ-8,
    33–57% последних мест**; играбельны были только слабые события (FISSURE: 47% топ-8).
    Разложение показало, что дело не в OVR (base поля 75.6 против 77.8 у челленджера), а в
    **Chemistry +7.4 (топы +13) и Hero Synergy +6.4** реальных составов против 0.5/3.6 у
    челленджера. Драфт-сторона разрыв не закрывает: chem-aware драфт с безлимитными рероллами
    дал chem ≤ 1.0, «стак из одного исторического ростера» (2–3 игрока из пака) — ≤ 2.6:
    сыгранность (≥230 общих игр на пару) есть только у долгих топ-кор, и ровно они залочены.
    Решение: `realPackStrength = base + heroSynergy` — event-OVR состава уже содержит игру с
    этими тиммейтами, Chemistry это драфт-механика «собери сыгравшихся», полю она — двойной счёт.
    Замер после: EWC 2026 — 2% / 11% топ-4 / 36% топ-8 / 9% последних; DreamLeague — 0.3 / 5 /
    26 / 8; FISSURE — 12 / 48 / 84 / 0 (слабое событие = лёгкий режим). Чтобы выбор события был
    выбором сложности осознанно, каталог отдаёт `fieldMedian/fieldTop`, конфиг показывает «Сила
    поля: медиана N, лидер M» (`real-field-strength`). Альтернативы, отвергнутые замером:
    chem×0.5 (EWC 0% побед, 17% топ-8), только больше рероллов (+4 OVR, химии нет).
    ⬜ Следующий шаг агентности — **буткемп челленджера перед событием** (переиспользовать Camp:
    фикс. бюджет, Tactics без предметных множителей) — отдельное продуктовое решение.
    → решено иначе, см. срез 4 (RT-E): не Camp, а одна фаза подготовки без экономики.
  - ✅ **Срез 4 (2026-08-23): RT-E — подготовка к событию, срез 1 (сыгровка + тренировка героя).**
    Агентность растёт из того, чем RT отличается: поле известно заранее, а дефицит челленджера —
    сыгранность и героика (не OVR). Поэтому не «второй рогалик» (Camp: золото, рынок, предметы,
    множители), а **одна фаза между драфтом и посевом** с фиксированным бюджетом `PREP.budget = 5`
    недель, детерминированная (сид по-прежнему решает только симуляцию), два рычага ровно в
    дефицитные слагаемые: **сыгровка** пары = `scrimGames 175` виртуальных co-games той же кривой
    `pairChemistryBonus` (+0.76 Chemistry, потолки пары/суммы держатся); **тренировка героя** =
    `practiceGames 18` виртуальных игр игрок×герой той же кривой `pairScore` (+1.1 на холодном
    герое, 0 на потолке — в этом и выбор; может сменить назначение). Никаких слоёв Tournament Power —
    бонусы идут в те же слагаемые Team OVR, что у поля, честное поле остаётся честным.
    Реализация: `game/prep.ts` (план/бюджет/наложение `ScoreOverlay`), `scoreTeam(…, overlay)` +
    рёбра/строки химии и `withHeroGamesOverlay` видят те же виртуальные игры (радар и плитки не
    разъезжаются); план живёт **внутри RunEngine** как ручная аллокация (`addPrep/undoPrep/
    previewPrep/previewWithoutPrep`), в лог пишется `prep/prepUndo/prepDone` ⇒ resume восстанавливает
    фазу и бюджет replay'ем без нового поля в SavedRun; стор — фаза `prep` (только
    `selectedMode === "tournament"`), `PrepView` с превью каждой недели тем же scoreFor (как
    previewTactic); экран `features/prep/PrepScreen` — радар + бюджет + два списка «+N», разведка
    поля (лидер/медиана/твоя сила), откат стеком, «К посеву». Замер (300 сидов, жадный драфт):
    жадная подготовка даёт **+4.5 p50 (4.1–5.0)**; EWC 2026 — win 1.7 → **5.3%**, топ-4 11 → 31%,
    топ-8 39 → 68%, последних 6 → 0%; DreamLeague — топ-8 26 → 52%; FISSURE — win 13 → 26%. Только
    сыгровка — +3.8 (разрыв с оптимумом 0.7: решение есть, но мягкое — ужесточать будет срез 2
    через патч/бан, где выбор завязан на поле). Тесты: `test/prep.test.ts` (наложение, потолки,
    гейты движка, бюджет/откат, детерминизм), e2e RT дополнен фазой (неделя → бюджет → откат →
    resume в prep → посев).
  - ✅ **Срез 5 (2026-08-23): RT-E срез 2 — разбор соперника.** Планировался «патч/бан героя из
    сигнатурных пулов всего поля» — **отвергнут замером**: при 10 сигнатурках на состав назначение
    переезжает почти бесплатно, лучший герой давал −0.14 к среднему полю (−0.4..−0.8 лидеру) против
    +0.76 сыгровки — рычаг доминировался бы всегда. Вместо него **разбор соперника**: неделя на
    демки ОДНОГО состава поля → его сигнатурные герои прочитаны, состав теряет
    `PREP.scoutSynergyCut = 50%` Hero Synergy (топам −3…−3.7); не больше `scoutMax = 2`, повторно
    один состав не разбирается, свой счёт не меняется. Поле пересчитывается теми же 17 составами
    (`rescoreRealField`; порядок по силе обновляется — разобранный лидер честно слетает с вершины),
    строки экрана — `scoutOptions` (сила → после разбора → потеря). Замер (300 сидов): разбор
    лидера — ситуативный размен «титул против проходимости» (FISSURE win 26→30%, но топ-8 на EWC
    68→58: −1.5 своего прироста за −3.3 лидеру), два разбора доминируются везде — потолок 2
    оставляет эксперимент, дизайн не ломается. Плитки поля на экране подготовки считаются от
    эффективных сил. Тесты: +3 unit (гейты движка, rescore, options), e2e — шаг разбора во флоу.
  - ⬜ **Дальше (срез 3+):** тематические фильтры пула (§2.5.2) — «только TI-чемпионы» требует
    placements (Liquipedia, T1.3) либо курируемого списка; alt-вариант «прими реальную команду»
    (§2.5.3) — отдельное продуктовое решение; point-in-time career для героики эпохи (отложено из
    TDATA2-C); реальные placements рядом с симуляцией — после Liquipedia (T1.3).
- **BA-сценарий (2026-07-12):** [docs/modes-scenarios.md §2](modes-scenarios.md) — поле = реальные `packs` события (roster lock по `accountId`), challenger из легенд/ветеранов, реюз `TournamentEngine` (opponentPool = реальные паки вместо ботов). **Открытые решения:** RT-A snapshot по seed vs выбор ивента, RT-B кросс-эра рейтинг, RT-C размер challenger-пула.
- **Цель:** выбрать реальный tournament snapshot, показать известных соперников и собрать challenger roster только из игроков, не заявленных за поле турнира.
- **Данные:** реальные ростеры поля **уже есть** в `packs` (пак = топ-5 состав команды на событии) → жёсткой зависимости от Liquipedia нет; реальные placements/исход отложены → поле **симулируем** движком, а не реплеим (проговорить в UI). locked canonical `accountId`, historical eligible pool.
- **DoD:** 16–20 фиксированных соперников; locked player никогда не появляется в pack/market пользователя; nickname collision не влияет на lock; historical rating берётся из своей эпохи; seed+dataset version воспроизводят поле и пул; генератор fail-fast при невалидном ролевом пуле.
- **Deps:** T5.1, T5.4, M4 historical windows. (T1.3/Liquipedia — опционально, только для реальных placements «как было».)

### T5.7 — Roguelite Run: режим + ante-петля ✅ (Ревизия статусов 2026-08-31: срезы 1–5 + Династия (T5.8) + мета (T6.4) реализованы; помеченные в теле баги R3.1/R4.1/R5.1/R9.1 закрыты 2026-07-27–30; единственный живой хвост — пере-калибровка playerCost в R5.3, он учтён там)
> Продуктовое решение 2026-07-22 (сессия дизайна ante-арки), зафиксировано в [PRD §5.9.2](PRD.md). Путь A: забег = последовательность этапов с растущим порогом места и смертью при промахе; между этапами — усиление. Quick Draft (текущий Classic) **остаётся** отдельным коротким режимом; Roguelite Run — новый пункт мод-шелла рядом, переиспользует Quick Draft как кирпич (этап = один `TournamentEngine`).
> **Границы (скилл `game-state-architecture`):** stage-orchestration — **отдельный чистый слой поверх** `RunEngine`/`TournamentEngine`, не вливать в них; новый `RunMode` (напр. `"run"`); поле растёт по индексу этапа через смещение `userStrength`; детерминизм `seed + dataset + версия` сохраняется (этап входит в seed-состояние); формула `Team OVR` и `ratingModelVersion` не меняются.
> **Прогрессия** привязана к слагаемым `Team OVR = Base + Hero Synergy + Chemistry` (каждая покупка поднимает одно слагаемое, у каждого trade-off) — детали в [PRD §5.9.2](PRD.md).
- ✅ **Срез 1 — петля дышит (2026-07-22).** `game/anteRun.ts` (`AnteRunEngine`): лестница порогов `[10,6,4,3,1]`, растущее поле (`fieldBoost` по индексу этапа), смерть при промахе, ростер персистит; чистый слой поверх `TournamentEngine` (`RunEngine` не тронут). `TournamentEngine` получил опциональный `fieldBoost` (0 = Quick Draft байт-в-байт, доказано тестом). Store: `anteRun`/`ante`, `advanceAnteStage`, ветки в `finishTournament`/`swapHeroes`/`resumeRun`, persist `anteStageIndex` (+resume через `jumpToStage`). Mode-shell: одна карточка Classic → шаг выбора **Quick Draft / Roguelite Run** (двухшаговый вход). Roguelite: рероллы фиксированы (2, сложность скрыта), хардкор = «вслепую» (закрытый справочник, рероллы не трогает). UI забега: статус этапа, баннер исхода (пройден/победа/вылет), CTA «Следующий этап», career-панель только на конце забега. Карьера: бейдж `ROGUELITE` + этап `N/5`. Гамма режима: Roguelite фиолетовая на всём опыте (app-shell `data-accent`), Quick Draft зелёная, Manager/Tournament — заготовки orange/blue. i18n RU+EN. Тесты: `anteRun.test.ts` (10), `anteRun.spec.ts` e2e (этапы+исход, quick-draft-без-ante, **ante-resume после reload**; desktop+mobile), Quick Draft/golden/regression не сдвинуты; tsc/build/антипаттерны зелёные. Фиолетовая гамма проверена в тёмной и светлой теме (glow токенизирован через `--brand-glow`).
  - **DoD:** можно пройти 2+ этапа подряд с растущим порогом; промах порога завершает забег; тот же seed даёт ту же последовательность полей/исходов; Quick Draft не затронут (его тесты/golden зелёные); границы game/≠ui/ и mode shell ≠ RunConfig ≠ engine соблюдены; `tsc`/`test`/`build`/антипаттерны зелёные.
- ✅ **Срез 2 — Reward/Camp/Market = T5.2 (2026-07-23).** Чистый слой `game/anteEconomy.ts` (`RunEconomy`) поверх `AnteRunEngine`: валюта «золото», reward (выбор 1 из 3), market (3 in-place рычага над `Base/Hero Synergy/Chemistry` + reroll), покупки = дельты слагаемых (не мутация игроков), детерминизм офферов по `seed+campId+rerollN`, запрет отрицательного баланса. Store: фаза `"camp"`, `economy`/`economyView`/`camp`, действия `enterCamp/chooseReward/buyMarket/rerollMarket`, ветки в `finishTournament` (проход → призовые + Буткемп) / `advanceAnteStage` (выход → пересбор поля под `effectiveTeamOvr`) / `swapHeroes` / `resumeRun` (resume-в-Буткемп); persist опц. `economy`. UI `features/run/CampScreen.tsx` (примитивы `ui/`, токены режима, breakdown `до→после` на каждом оффере, resume-safe). i18n RU+EN. **Difficulty-фикс (§5.9.2/§10.E):** лестница `[10,6,4,3,1]` + сдвиг поля `idx·3−12` — было ~0% побед (teamOvr ниже медианы поля), стало осмысленной кривой (статик умирает в середине, победа требует апгрейдов); Quick Draft не затронут. Побочно: `decodeRunLink` теперь принимает mode `"run"` (seeded рогалик; было — забыт). Тесты: `anteEconomy.test.ts` (12), e2e camp-флоу + resume-в-Буткемп (детерминированный seed через run-link), обновлён `anteRun.test.ts`; Quick Draft/golden/regression не сдвинуты; tsc/build/e2e (44) зелёные.
  - **DoD:** ✅ экономика детерминирована, без отрицательного баланса; reward/market офферы воспроизводимы по seed; UI до покупки показывает цену и breakdown `до→после`; проходятся 2+ этапа с сохранёнными покупками; resume восстанавливает валюту/офферы/покупки (и Буткемп); границы game/≠ui/ и mode shell ≠ RunConfig ≠ engine соблюдены.
  - **Playtest-баланс 2026-07-23:** плоские выплаты заменены прогрессией. Призовые этапов имеют базу `3/4/5/6` + нормализованный placement-бонус `0…3`; золотые Reward-карты растут little `3/4/5/6`, large `6/8/10/12`. Финальная калибровка цен/инфляции остаётся за T6.3.
- ✅ **Срез 3 — реальные рычаги + резерв (2026-07-23).** Market теперь состоит из двух детерминированных паков строго по пять карт: пять замен игроков и пять разных hero re-pick; неполный ролевой/геройский пул считается ошибкой данных, общий реролл обновляет оба пака. Ни один пак не скрывает варианты по принципу «только положительный gain»: слабые карты остаются честными ловушками с точным preview. Каждая карта считается через существующий `RunEngine.score()` и до покупки показывает Team OVR и полный breakdown `Base / Hero Synergy / Chemistry до→после`. Покупка сразу делает swap: каждый снятый игрок добавляется на скамейку, снятый герой попадает в малый reserve pool (до 3); в Буткемпе любую сохранённую сущность можно бесплатно вернуть, поменяв с активным слотом. **UX после playtest:** Буткемп постоянно показывает тот же radar-пентагон, назначения героев, Hero Synergy и Chemistry, что драфт/турнир; player-offer — компактная полная карточка реального игрока (`role/team/IMP/ECO/REL/OVR/hero`). Для каждого входящего игрока перебираются активные слоты его роли и выбирается лучший по итоговому Team OVR; два support-оффера поэтому могут целиться в одного и того же слабого саппорта. Hero-offer начинается с входящего героя и для него перебирает все пять возможных удалений: на карточке остаётся лучший по итоговому Team OVR вариант после полного Hungarian matching, явно показаны вытесняемый герой, будущий получатель и его игры на герое. Поэтому сильная связка вроде `33 + Doom` больше не маскируется случайной парой `Muerta → Doom`; несколько офферов могут честно предлагать убрать одного и того же слабого героя. Резерв героев читается и считается в направлении `входящий → заменяемый`; у каждой перестановки заранее виден точный breakdown, после клика radar обновляется сразу. Офферы фиксируются в economy snapshot и после соседнего swap сохраняют входящего игрока/героя, но пересчитывают лучший вытесняемый слот и preview. Action log (`replace/swap reserve player/hero`) воспроизводит активный ростер и резерв; accountId проверен через Camp → reload/resume → следующий stage в desktop/mobile e2e. **Chemistry-fix после playtest:** вложенные группы 3–5 больше не суммируются поверх пар (это повторно учитывало одни связи и заранее забивало cap 13); `ratingModelVersion v1.13.0`, тест фиксирует класс замены Noticed→33: три связи по 166 игр теперь повышают Chemistry.
- ✅ **Срез 3b — редкость героев (2026-07-24).** Чистый слой `game/heroRarity.ts` поверх `score.ts` (как tactics/bosses): scoreTeam не тронут ⇒ `ratingModelVersion` цел, golden цел, Quick Draft чист (мандат PRD §5.9.2). Редкость `common/unique/mythic/immortal` — **третий слой модификаторов**, вложен прямо в `effectiveModifiers` (все места сборки силы + `TournamentScreen`/`CampScreen` получают его; инвариант радар=поле держится): heroSynergy-бонус за назначенного героя + маленький `+OVR` (Base) у immortal. **Источник — лут с рынка (решение playtest 2026-07-24, форк подтверждён):** стартовый драфт весь common; hero re-pick роллит редкость по этапу (`rollRarity`, ранние ~все common, поздние — шанс mythic/immortal), детерминизм seed+heroId+stage → превью на карте = результат покупки. **Два действия рынка героев:** реролл (замена, роллит редкость) ≠ **улучшение** (`upgradeHeroRarity`: бампит тир текущего за золото, растущая цена; реролл того же героя качество НЕ поднимает). **Мета-гейт (T6.4-lite):** первый-когда-либо roguelite-забег весь common (careerStore `run`-записей = 0), редкость активна со второго; гейт ставится на старте (`setRarityEnabled`), персистится. Состояние: `heroRarity` map + `rarityEnabled` в `RunEconomyState` (persist/resume напрямую, без ре-ролла). UI: секция «Улучшение героев» в Буткемпе (бейджи `--rarity-*` в отдельном неймспейсе токенов, не смешан с `--tier-*`; превью редкости на re-pick картах), скрыта вне гейта. `BALANCE_CONFIG_VERSION b1.1.0→b1.2.0`; `heroes.json`/`schema` не тронуты. i18n RU+EN. Тесты: `heroRarity.test.ts` (7), доп. `anteEconomy.test.ts` (+1: гейт/ролл/улучшение/персист), e2e «редкость скрыта в первом забеге» + «со второго активна и улучшается». `test` (303)/`test:e2e` (20)/`tsc`/`build`/golden зелёные. **Разблокирует Wide Pool (T6.1)** и даёт ось прогрессии для PF-1.
  - 🐛 **Баг, найденный playtest 2026-07-27 (`R3.1`/`R3.2`):** мета-гейт сделан **одним** флагом `rarityEnabled`, который глушит не только случайные дропы, но и `rarityUpgradeCost`/`upgradeHeroRarity` и весь UI-блок. Из-за этого в первом забеге качество героев вообще недоступно — вручную прокачать common нельзя, хотя намерение было «чистый вход по дропам, ручное улучшение работает». Лечится разделением на `rarityDropsEnabled`/`rarityUpgradesEnabled`.
  - 🐛 **Цена re-pick не зависит от качества (`R4.1`):** hero-оффер берёт цену generic-оффера Hero Synergy (`anteMarket.ts:176`), поэтому common и immortal стоят одинаково — при том что редкость на карте уже показана.
  - **Осталось (полиш, за T6.5):** редкость на драфт-паке тоже (сейчас лут только с рынка); foil/particle-эффект каст-эджа T7.9 на карточках (пока плоский бейдж); реролл качества как отдельное действие; когда встанет T6.4 — гейт переезжает в Штаб без переделки механики.
- ✅ **Срез 4 — карточный билд = T6.1/T6.2 (2026-07-24).** Чистый слой `game/tactics.ts` (`evaluateTactics`) + `game/campActions.ts` поверх `score.ts`: формула Team OVR не тронута ⇒ `ratingModelVersion` не бампался, golden не сдвинут, Quick Draft чист. **Tactics ≠ покупки:** покупка рынка — разовая дельта в `economy.applied`, тактика — УСЛОВИЕ, пересчитывается от текущего ростера при каждом swap; поэтому отдельный модуль без состояния, а не запись в `applied`. Набор — 5 карт PRD §5.10.3 (`Signature Specialists / Old Teammates / Fresh Project / No Superstars / Last Dance`); **Wide Pool отложен** (его trade-off «вклад редкости героев слабее» опирается на редкость = срез 3b). Каждая карта условная, с trade-off (Old Teammates дорожит замену игрока, Last Dance сужает пак рынка). Camp Actions — 2 слота одноразовых `scrim/bootcamp/heroPractice/scouting/standIn`: статовые дают ВРЕМЕННЫЙ эффект на один следующий этап (сгорает на `openCamp`), `scouting` перецелен на «раскрыть след. этап + бесплатный реролл» (боссов нет до среза 5), `standIn` = одна бесплатная замена. Store: `economy` расширен слотами/`ownedCards`/`temporary`, новые действия `equip/discard/playCampAction`, снимок `tactics` в сторе; `effectiveTeamOvr` = `score.teamOvr + economy.modifiers() + tactics.modifiers` собирается в трёх местах (`advanceAnteStage`/`swapHeroes`/resume) + `TournamentScreen`/`CampScreen`. UI: билд-панель Буткемпа (3+2 слота, breakdown с сработавшим условием на карточке), карточка в reward третьим оффером (`OfferKind` += `tactic/action`). Reward-карта фиксируется на `openCamp` (`preparedRewardCard`) — иначе после взятия «переезжала» под тем же id (пойман в браузере). i18n RU+EN. Тесты: `tactics.test.ts` (13), доп. `anteEconomy.test.ts` (+8, вкл. регресс card-morph), e2e «экипировка тактики и розыгрыш действия»; полный `test`/`test:e2e`(12)/`tsc`/`build`/golden зелёные, датасет не тронут.
  - **DoD:** ✅ 3 слота Tactics + 2 Camp Actions с курируемым набором; каждая карта условная с trade-off и прозрачным `до→после`; вклад тактик пересчитывается при swap и входит в поле этапа так же, как в радар; resume восстанавливает экипировку/владение/временные эффекты; Quick Draft/golden не сдвинуты; границы game/≠ui/ и mode-shell ≠ RunConfig ≠ engine соблюдены.
- 🐛 **Баг среза 3, найденный playtest 2026-07-27 (`R5.1`/`R5.2`): того же игрока в лучшей форме получить нельзя.** `marketPlayerCandidates` (`game/engine.ts:161`) сворачивает все snapshot'ы игрока до максимального по OVR (`bestByPlayer`) **и** отбрасывает любой `accountId` из `usedPlayers`. Две половины дефекта: (1) выбранного игрока нельзя позднее улучшить до более сильной турнирной формы; (2) для ещё не выбранного рынок сразу показывает его максимум вместо честной рулетки форм. Лечится разделением «личность» / «форма» — часть инвариантов (`один accountId не в двух активных слотах`, перенос Chemistry по accountId) уже обеспечена кодом.
- 🐛 **Last Dance систематически срезает саппортов (`R9.1`):** пак строится в порядке `ROLE_SEQUENCE`, а сужение делает `splice` по хвосту (`anteMarket.ts:174`) — уходят оба support-оффера, а не случайные два.
- **Срез 5 — боссы = T5.3:** заранее видимое условие, Scouting и адаптация через Market/резерв/Tactics; по одному условию на рычаг.
- **Срез 6 — бесконечная Династия = T5.8:** пять этапов становятся первым кругом; первый Aegis — milestone, после него тот же состав продолжает круги без лимита до первого проваленного порога.
- **После проверки баланса = T6.4:** Штаб между забегами, коллекция открытий, Playbook и Stakes без постоянного `+OVR`.
- **Файлы (ожидаемо, срез 1):** `web/src/game/anteRun.ts` (+тест), `web/src/state/{runStore,runPersist}.ts` (новый mode + ante-состояние в seed/persist), `web/src/features/run/*` (UI прохода этапов), `web/src/i18n/core.ts`, mode-shell UI выбора режима.
- **Скиллы:** `game-state-architecture`, `discovery-before-code`, `scoring-model`, `plan-first-communication`.
- **Deps:** T5.1 (TournamentEngine ✅), T5.4 (mode shell ✅). **Разблокирует:** T5.2 (экономика), T5.3 (боссы), T6.1 (тактики).

### Playtest-фидбэк 2026-07-24 (после боссов + первой калибровки) — триаж, реализация позже
Живой прогон Буткемпа/рынка/тактик/боссов. Каждый пункт сверен с BACKLOG/PRD; где не покрыто — заведено здесь. **Ничего не реализовано, только зафиксировано.**
- **(PF-1) Прогрессия ощущается конечной, «бесконечно» играть нечем.** Нет компаундящихся/бесконечных апгрейдов — только аддитивные `+OVR` с caps, поэтому забег быстро упирается в потолок и поле обгоняет. Игрок предлагает: **либо** явный конечный горизонт (~15–20 этапов), **либо** системы бесконечного роста. **Частично покрыто:** T5.8 уже фиксирует «конечный потолок команды, штатный финал = Loss», т.е. бесконечный `+OVR` намеренно исключён (PRD §5.9.2). НО глубины прогрессии под интересный длинный подъём пока мало. **Решение к согласованию (двигает T5.8):** целевая длина «хорошего» забега (сколько этапов до естественного поражения) и набор осей роста, делающих подъём осмысленным до потолка (см. PF-4). Не «бесконечный `+OVR`», а бесконечная **вариативность/сайдгрейды** + растущая угроза.
- **(PF-2) Мало слотов под пассивки (3 Tactics / 2 Camp Actions).** Ощущается тесно, билд не раскрывается. **Не покрыто как настраиваемое:** PRD §5.10.1 фиксирует 3/2 как дизайн-решение. **Заводим open-question:** число слотов — кандидат в balance config (T6.3) и/или мета-анлок в Штабе (T6.4: больше слотов как постоянное открытие, но без прямого `+OVR`). Требует пере-калибровки (больше слотов = сильнее билд).
- **(PF-3) Награды скучные: брать не золото почти нет смысла; ценность карты-награды нелегибельна.** На экране Reward карта (Tactic/Camp Action) показывает только описание, БЕЗ числового `до→после`, поэтому её нельзя сравнить с «+N золота». **Не покрыто.** Нужно: (а) на reward-карте показывать конкретный эффект на текущий ростер (как на market-карте) или ожидаемую ценность; (б) сбалансировать ценность карт против золота (T6.3). Частично пересекается с T6.5 («больше разнообразия наград»), но легибельность ценности — отдельный UX-гэп. **Deps ценности карт:** PF-4.
- **(PF-4) Нет экономической глубины в духе Balatro — кандидат на новый класс пассивок/систем.** Игрок предлагает изучить экономику Balatro (проценты на золото/interest, множители, компаундящиеся эффекты) и добавить экономические пассивки (напр. **множители золота**, доход за held-gold, «проценты»). **Не покрыто.** Заводим дизайн-исследование + кандидатный набор economy-tactics в T6.1 (сейчас набор §5.10.3 — только про слагаемые OVR, ни одной экономической карты). Это же питает PF-1 (бесконечная вариативность вместо бесконечного `+OVR`) и PF-3 (интересные не-золотые награды). Реализация — в рамках T6.1/T6.3, дизайн — отдельная спека (Balatro-парити для экономики).
- **(PF-5) Баланс trade-off тактик (пример Last Dance) не сходится.** Last Dance даёт +2.1 Base, но убирает из рынка 2 игрока + 2 героя (≈−40% опций) — цена явно больше выгоды; аналогично вопросы к соотношению bonus/penalty у прочих карт. **Покрыто механически, не по числам:** калибровка коэффициентов — T6.3 (balanceConfigVersion, `npm run sim`). Помечаем как приоритетную мишень следующей калибровки; sim должен считать win-rate «с тактикой vs без», чтобы trade-off был честным.
- **(PF-6) Легибельность market-превью (ложная тревога, НЕ баг).** Проверено: 300 превью замен игроков против фактического результата — **0 расхождений**; показанный `TEAM OVR` уже включает Chemistry, отрицательные карты — честные ловушки (напр. снять Boxi с 1241 co-games рушит Chemistry). Реального рассинхрона нет. **UX-гэп:** не очевидно, что дельта уже учитывает химию → игрок ждёт апгрейд по индивидуальному OVR и удивляется. Заводим UX-полиш (T6.5/T7.3): яснее показывать, что `до→после` — итоговый, и почему «сильный игрок» может быть даунгрейдом.
- **(PF-7) Качество/редкость героев — ✅ СДЕЛАНО 2026-07-24 (Срез 3b).** Редкость `common/unique/mythic/immortal` реализована: лут с рынка + улучшение за золото, баф Hero Synergy (+OVR у immortal), мета-гейт со второго забега. Даёт ось прогрессии для PF-1. 🐛 *Дефект реализации найден 2026-07-27: гейт сделан одним флагом и заодно отключил ручное улучшение — `R3.1`.*

> **Статус триажа после 2026-07-27:** PF-1 получил ответ (конечный сезон `5×5` + добровольная Династия — `R6.1`/`R6.3`); PF-3 закрывается `R4.3` (убрать доминируемую пару Small/Large, содержательно разные награды); PF-4 — `R8.3` (economy-предметы) поверх контракта `R8.2`; PF-5 — сначала фикс `R9.1` (Last Dance убирала не случайные карты, а обоих саппортов), потом пере-калибровка в `R10`; PF-2 и PF-6 без изменений.

### Playtest-фидбэк 2026-07-27 (роглайт-сессия + бриф по Balatro) — триаж
Живой прогон + [дизайн-бриф](roguelite-balatro-brief.md). Два бага от пользователя **подтверждены по коду**, остальное — продуктовое направление, разложенное в веху **M5R** выше.
- **(PF-8) В первом забеге нет качества героев.** Ожидалось: случайные дропы отключены, но вручную качать можно. Фактически один флаг `rarityEnabled` глушит и дропы, и `upgradeHeroRarity`, и весь UI-блок Буткемпа. → **`R3.1` + `R3.2`** (P0).
- **(PF-9) Нельзя найти того же игрока в лучшей форме.** Рынок сворачивает все snapshot'ы до максимального и навсегда исключает использованный `accountId`; поэтому ни апгрейда своей звезды, ни честной рулетки форм у чужой. → **`R5.1` + `R5.2`** (P1).
- **(PF-10) Забег ощущается бесконечным без конечной цели.** → конечный сезон `5 актов × 5 этапов` с терминальной победой и **добровольной** Династией (`R6.1`, `R6.3`); Династия перестаёт быть единственным финалом.
- **(PF-11) Смотреть турнир целиком каждый этап — долго.** Текущий Skip перематывает только текущую фазу. → **`R1.1`** `Show result` в панели действий турнира (P0); это же делает 25-этапный сезон реалистичным по времени.
- **(PF-12) Хочется песочницу без экономики.** → **Cheat Mode как правило конкретного забега** (`R2.*`), не глобальная настройка; забег помечается несоревновательным и не открывает мета-прогрессию.

### T5.8 — Endless Dynasty loop ✅ (Ревизия статусов 2026-08-31: вход добровольный (R6.3), контент реализован 2026-07-29 — титулы кругов/milestone-награды, мутаторы кругов LG3, шестой слот LG2, зачарование LG6; глубина и «смерть неизбежна» держатся ростом угрозы — подтверждено `--dynasty`-симом, p50 ~9, потолок замера 25+)
- **Продуктовое решение (playtest 2026-07-23):** фиксированные пять этапов слишком коротки для режима, смысл которого — улучшать одну команду до естественного потолка и однажды проиграть более сильному полю. Этап 5 остаётся первым Aegis и onboarding-milestone, но больше не переводит забег в терминальную фазу `won`.
- **Цикл:** абсолютный `stageIndex` не ограничен; `cycle = floor(stageIndex / 5)`, внутри каждого круга повторяется лестница `[10,6,4,3,1]`. После победы в пятом турнире круга растут `aegisCount` и уровень Dynasty, затем открывается обычный Reward/Camp и начинается следующий круг без повторного драфта.
- **Кривая угрозы:** ранние offsets `[-12,-9,-6,-3,0]` переиспользуются как локальная рампа круга, поверх них добавляется растущий `cycle·dynastyStep`. Каждые круг/несколько этапов подключаются boss condition или Stake. `dynastyStep`, cadence и экономика — только через T6.3/balance config; индивидуальные OVR-карты не раздуваются выше своего диапазона.
- **Конечный потолок команды:** player pool конечен, hero rarity имеет максимум, Tactics/Camp Actions ограничены слотами, все прямые stat-эффекты имеют caps. После заполнения билда Reward/Market предлагают replacement/sidegrade/reroll/economy, а не бесконечный бесплатный `+OVR`. Угроза поля продолжает расти, поэтому штатный финал — только Loss/добровольный Give up.
- **State/UI/persist:** `AnteRunEngine` остаётся отдельным orchestration-слоем и получает бесконечный индекс вместо массива как terminal condition; Quick Draft и `RunEngine` не меняются. UI заменяет `Stage N/5` на абсолютный Stage + Dynasty + число Aegis. Resume обязан восстанавливать stage/cycle/aegisCount; Career записывает максимальный Stage, Aegis count, финальный билд и причину поражения. Seed/share включает `balanceConfigVersion`, чтобы бесконечная последовательность была воспроизводима.
- **DoD:** после Stage 5 забег гарантированно переходит в Camp и Stage 6; можно детерминированно пройти 10+ этапов в тестовом сценарии; нет верхней границы индекса и терминального `won` от номера stage; поражение/выход записывает один career entry; reload на Stage 6+ восстанавливает тот же рынок, награды, поле и условия; массовая симуляция подтверждает, что сильные сборки живут несколько кругов, но ни один uncapped эффект не позволяет расти быстрее угрозы бесконечно.
- **Не делать раньше вертикального контента:** бесконечно повторять нынешние две золотые reward-карты и одинаковый турнир — только растянуть пустоту. Реализация после T5.3 + T6.1/T6.2; коэффициенты и целевой survival profile — T6.3.
- **Playtest 2026-07-24 (PF-1):** живой прогон подтвердил риск — прогрессии под длинный подъём пока мало (только аддитивные `+OVR` с caps), поэтому «бесконечность» ощущается пустой. **Решение к согласованию до реализации:** (а) целевая длина «хорошего» забега (сколько этапов до естественного Loss); (б) оси роста, делающие подъём осмысленным до потолка — редкость героев (3b), economy-tactics/множители (PF-4, T6.1), больше слотов через Штаб (PF-2, T6.4), Stakes (T6.4). Не бесконечный `+OVR`, а бесконечная **вариативность/сайдгрейды** + растущая угроза. Возможен и компромисс: явный конечный горизонт ~15–20 этапов вместо истинной бесконечности, если контента роста не хватит.
- ✅ **Контент Династии реализован 2026-07-29 (после `R6.3`, который сделал вход в неё добровольным).**
  - **Титул за каждый пройденный акт ЗА пределами сезона** (`grantsDynastyTitle` — одно правило, которое
    читают и стор, и симулятор). Внутри сезона титула нет: финал акта уже оплачен растущими призовыми и
    премией за место (`R6.4`). Награда — `ECONOMY.dynastyMilestone`: золото + готовое улучшение качества,
    то есть ровно то, чего на этой глубине уже не купить рынком. Идемпотентно по лагерю (список выданных
    титулов в сейве), поэтому resume её не удвоит.
  - **Счётчик титулов выводится из индекса**, а не хранится счётчиком: попасть на этап N можно только
    пройдя все предыдущие, и второй источник правды был бы лишним местом для рассинхрона.
  - **Симулятор играет Династию** (`npm run sim -- N --dynasty`, потолок глубины 25 — бесконечная фаза
    не должна означать бесконечный прогон) и меряет глубину + покупки на лагерь отдельно для Династии.
- 📊 **Замер опроверг исходную гипотезу задачи.** «Продолжение осмысленно на пару этапов» — неверно:
  билд-агент доходит до Династии в 18 забегах из 60 и живёт там **медиана 8 этапов, p90 = 19, max 19**.
  Титулы глубину не изменили (8/19/19 до и после) — и это ожидаемо: одно улучшение раз в пять этапов
  против ускоряющейся угрозы профиль не двигает, оно даёт веху, а не силу.
- ⚠️ **Что замер вскрыл вместо этого: рынок в Династии почти мёртв — 0.18 покупки на лагерь против 0.90
  в сезоне** (127 замеренных лагерей). Это не дефект правил, а конечность контента: пул игроков конечен,
  редкость героев и тир карточек имеют максимум — то есть Буткемп на глубине превращается в клик «дальше».
  Лечится не новым правилом рынка, а поздними синками (booster packs, снятие негативных свойств, boss
  reroll, premium scouting — они уже перечислены как «не входило» в `R4.3`). **Отдельная задача, числа для
  неё уже измерены.**
- **Deps:** T5.3, T6.1, T6.2, T6.3. Не требует нового режима, backend или изменения rating formula.
- 🔁 **Пересмотрено 2026-07-27 (`R6.3`).** Династия перестаёт быть единственным финалом: сезон получает терминальную победу на Stage 25, после которой продолжение — добровольный выбор. Механика самой петли (сохранение билда, растущая угроза, штатный финал = Loss) сохраняется без изменений. Целевая длина «хорошего» забега (вопрос из PF-1) отвечена гипотезой 25 этапов — подтверждается `R10`.

### T5.9 — Поздние синки Буткемпа ✅ (P2, 2026-07-29)
- **Откуда задача:** прямое следствие замера `T5.8` — «рынок в Династии почти мёртв (0.18 покупки на лагерь против 0.90)». Была сформулирована как «нужны booster packs, снятие негативных свойств, boss reroll, premium scouting».
- 🔬 **Сначала диагностика, потом решение.** Симулятор научили печатать состояние лагеря НА ВХОДЕ, а не только покупки: обычные метрики отвечают «сколько купили», а нужен был ответ на «почему не купили». Что вскрылось (`npm run sim -- 150 --dynasty`, 323 лагеря Династии):

  | | сезон | Династия |
  |---|---|---|
  | золото на руках в лагере | 142.3 | **836.2** |
  | карт рынка | 9.9 | 9.4 |
  | из них с плюсом | 2.25 | **0.62** |
  | лучшая дельта Team OVR | 1.15 | **0.18** |
  | качество героев на максимуме | 38% лагерей | **95%** |
  | слоты карточек полны | 23% лагерей | **100%** |

  Это меняет постановку: рынок не «тонкий», а **полностью насыщенный**. Купить нечего ни за какие деньги, поэтому **booster packs из исходного списка отброшены** — добавлять карты в пул, где лучшая карта даёт +0.18 Team OVR, значит удлинять клик «дальше», а не создавать решение.
- ✅ **Реализовано: три расходуемые покупки с геометрически растущей ценой** (`ECONOMY.prep` / `bossReroll` / `scoutPrice`).
  - **Усиленные сборы** — `+1 Base на ОДИН следующий этап`, цена `20 · 2ⁿ` внутри лагеря, счётчик обнуляется в следующем. Переиспользует механику `temporary` разыгранных Camp Actions: эффект сгорает на следующем `openCamp`, второй копии этого поведения нет.
  - **Смена правила этапа** — `bossForStage(seed, stage, n)`, цена `12 · 2ⁿ` по реролам ЭТОГО этапа. Реролл выбирает из правил **без текущего**: при пяти типах случайный повтор выпадал бы каждый пятый раз, а платить за «то же самое» игрок не должен.
  - **Разведка за золото** — та же `scoutedCamps`, что и у карточки Scouting, но без бесплатного реролла (карточка — награда, это трата) и одна на лагерь.
- 🔑 **Геометрия цены — несущее условие, а не украшение.** Доход растёт линейно по этапу, угроза акта — квадратично. Линейный по цене синк либо не поглощает накопленное, либо превращает золото в бесконечный `+OVR` и ломает главную посылку Династии («штатный финал — Loss»). При `base · 2ⁿ` накопленные 900 золота покупают пять подготовок (`20+40+80+160+320`), а не сорок пять.
- 🔑 **Курс намеренно плохой:** 20 золота за `+1 Base` на один этап против ~8 за `+2..3` навсегда с рынка. Инвариант зафиксирован тестом (`синк заведомо хуже рынка по курсу`) — если подготовка станет выгоднее покупки, лагерь превратится в «купи +N», и калибровка сезона поедет молча.
- 📊 **Замер A/B на общих сидах и агентах** (`npm run sim -- 150 --dynasty` против того же с `--no-sinks`):

  | | без синков | с синками |
  |---|---|---|
  | золото в лагере: сезон / Династия | 142.3 / 836.2 | **46.0 / 95.9** |
  | золото `p90` у билд-агента | 647 | **37** |
  | смертей под боссом: билд / оракул | 24.7% / 32.0% | **11.3% / 14.7%** |
  | win% билд / оракул / жадный | 29.3% / 2.0% / 0.0% | 32.7% / 9.3% / 4.7% |
  | глубина Династии (билд, p50/p90/max) | 5/15/26 | 5/15/21 |
  | сборов на лагерь: сезон → Династия | — | 0.82 → **1.85** |

  Три вывода, каждый важнее предыдущего. **(1)** Убегающее золото исчезло — попутно закрыт пункт `R10` про `p90` в 300–600. **(2)** Глубина Династии НЕ изменилась: синк не растягивает забег, он возвращает лагерю решение — ровно то, за чем его делали. **(3)** Смертность под боссом упала вдвое, и это же объясняет почти весь прирост win% — деньги теперь тратятся там, где забег и обрывался, на финалах актов.
- ⚠️ **Синк сдвигает профиль вверх, и это ожидаемо:** тратить ранее мёртвые деньги = выигрывать чаще. Компенсация — работа `R10` (пороги и `ANTE_THREAT`), а не подгонка цены синка задним числом; прецедент — та же развилка в `R4.3`. Верхняя граница полосы PRD (30–40% для осмысленной игры) при нижней границе 32.7% стала теснее — это вход в `R10`, а не повод занижать синк.
- **Покрытие:** юниты на геометрию цены, сгорание эффекта, отказ без золота, поэтапный счётчик реролов, разведку за золото и курс-инвариант; юнит на смену правила (другое правило, детерминизм, нулевой реролл не сдвигает существующие сиды, баны следуют за перекупленным правилом); e2e «подготовка дорожает, правило этапа меняется».
- **Не входило:** «снятие негативных свойств» (trade-off'ы тактик — конечный и маленький набор, синка из них не выходит) и `trade-in coupon` (требует системы продажи, которой нет).
- **Deps:** T5.8, R4.3. **Числа:** `R10`.

---

## M5R — Roguelite Run v2: конечный сезон + Balatro-парити (бриф 2026-07-27)
> Источник: [docs/roguelite-balatro-brief.md](roguelite-balatro-brief.md) (бриф + **ревизия при приёмке**: каждое утверждение проверено по коду, семь пунктов исправлено). Продуктовые решения — [PRD §5.9.3](PRD.md). Веха идёт **параллельно** M6 и переопределяет часть T5.8/T6.3.
>
> **Изоляция Classic — сквозное требование каждой задачи.** Ничего из M5R не меняет `scoreTeam`, `ratingModelVersion`, генерацию пула, поле Quick Draft, career-запись Classic и golden-фикстуры. Общими могут быть только UI-примитивы, optional-поля конфига с default `false`, локализация и чистые presentation shortcut'ы.
>
> **Сквозная цена, которую нельзя забыть при оценке.** e2e Буткемпа держатся на захардкоженном проходном seed, а golden-фикстуры ломаются от сдвига потока `Rng`. Любая правка порогов, кривой поля, cadence боссов, состава паков рынка и порядка роллов редкости их подвинет. Это не регресс — переподбор seed/обновление фикстур входит в DoD каждой задачи, где поток `Rng` меняется.
>
> **Версионирование.** Run-only правки чисел → bump `BALANCE_CONFIG_VERSION` **в задаче реализации**. Структурные правки сейва → миграция или новая save-версия. `ratingModelVersion` не бампает ни одна задача вехи.

### Порядок реализации
- **P0 — баги и безопасные UX-фичи:** ✅ **закрыт 2026-07-27** — `R1.1` → `R1.2` → `R9.1` → `R3.1`+`R3.2` → `R6.2` → `R9.3` → `R2.1`+`R2.2`+`R2.3`.
- **P1 — экономика и рынок:** ✅ **закрыт 2026-07-27** — `R4.1` → `R4.2` → `R5.1` → `R5.2` → `R5.3` (частично: trade-in есть, пере-калибровка `playerCost` за `R10`) → `R4.3`.
- **P2 — корректная сложность:** ✅ **закрыт 2026-07-29** — ✅ `R7.1` → ✅ `R7.2` (аддитивная часть; мультипликаторы ждут `R8.2`) → ✅ `R10` → ✅ `R6.1` → ✅ `R6.4` → ✅ `R6.3`.
- **P3 — полноценные билды:** `R8.1` → `R8.2` → `R8.3` → расширение боссов → `R8.4`.
- **P4 — реиграбельность:** Stakes/Challenges (T6.4) → daily/leaderboard (M8) → расширение пула предметов → `R1.3`.

**Гейт:** массовую реализацию предметов (`R8.3`) не начинать до готовности контракта Tournament Power (`R8.2`), схемы hero tags (`R8.1`) и full-run симулятора (`R10`).

### R1 — Управление проигрыванием турнира
#### R1.1 — `Show result`: полный пропуск турнира ✅ (P0, 2026-07-27)
- **Цель:** мгновенно довести турнир до финального snapshot и показать итоговую таблицу. Это **не** текущий `Skip`, который перематывает только текущий визуальный reveal (`useReveal(...).skip()`, по одному на стадию `groups`/`playoffs`).
- **Задача дешевле, чем кажется:** `TournamentEngine` считает весь результат в конструкторе (`buildResult`), `advance()` двигает только презентационную стадию. Поэтому «не пересчитывать другим RNG», «не менять seed», «не создавать второй быстрый симулятор» выполняются автоматически. Остаётся довести `tournamentStep` до конца reveal и стадию до терминальной.
- **Файлы:** `state/runStore.ts` (generic action `completeTournamentPlayback()`), `features/tournament/TournamentScreen.tsx` (кнопка в `tournament__actions` рядом с Live), `tournament.css`, `i18n/core.ts`.
- **DoD:** полный просмотр и `Show result` дают идентичный `TournamentSnapshot`; `finishTournament()` срабатывает ровно один раз (уже защищён `resultsSeen` + `canAdvance` — покрыть тестом); Classic golden path не сдвинут; Roguelite после `Show result` корректно открывает Reward/Camp; resume не выдаёт двойную награду; mobile/TMA — кнопки не перекрывают safe area.
- **Deps:** нет. **Разблокирует:** приемлемое время прохождения 25-этапного сезона (`R6.1`).
- ✅ **Реализовано 2026-07-27.** `runStore.completeTournamentPlayback()` крутит `advance()` до терминальной стадии и двигает `tournamentStep` (он же уезжает в сейв). Ни исход, ни seed не трогаются — движок посчитал турнир в конструкторе, поэтому шорткат физически не может разойтись с просмотром. В UI reveal получил флаг `instant`: вместо второй ветки рендера тот же `useReveal` сразу объявляется доигранным. Кнопка стоит **в двух местах**: на стадии field рядом с «Начать турнир» (решение сыграть или пропустить принимается до старта) и в live-панели рядом со `Skip phase`. Сброс — на входе в новый турнир (любой начинается со стадии field), поэтому следующий этап забега снова играется вживую. Награда по-прежнему за `finishTournament()` (идемпотентен по `resultsSeen` + `canAdvance`). Тесты: `tournamentPlayback.test.ts` +4 (идентичность snapshot с полным просмотром, терминальная стадия и повторный вызов = no-op, доигрывание с середины, однократный `finishTournament`), e2e `smoke.spec.ts` «Show result выдаёт итог одним кликом и пишет карьеру один раз» (desktop+mobile). Classic golden не сдвинут (шорткат презентационный).

#### R1.2 — Уточнить существующий Skip ✅ (P0, 2026-07-27)
- **Цель:** переименовать текущую кнопку в `Skip phase` (RU/EN), чтобы две функции не путались; проверить mobile-раскладку пары кнопок. Скорость по умолчанию не меняется.
- ✅ `tournament.skip` → «Пропустить фазу» / «Skip phase». На узком экране (`≤680px`) две кнопки в одну строку с подписью выжимали её в столбик по слову — подпись переведена на свою строку, кнопки делят ширину поровну (`min-height: 44px` под палец). Проверено живьём: desktop/mobile, светлая и тёмная тема, горизонтального оверфлоу нет (0px в обоих).
- **Deps:** R1.1.

#### R1.3 — Playback preference (опционально) ⬜ (P4)
- `Full / Fast / Results only` в Settings. Делать **только** после R1.1 и живого playtest; автоматический `Results only` без явного согласия не включать.

### R2 — Cheat Mode
#### R2.1 — Конфиг забега и модалка ✅ (P0, 2026-07-27)
- **Цель:** `cheatMode?: boolean` в `RunConfig` (optional ⇒ старые сейвы читаются как `false`), отдельная визуально отделённая секция `Special rules` на экране конфигурации Roguelite Run — **не** в глобальных Settings (иначе непонятно, к какому seed и сейву относится правило).
- **Правила:** показывать только для `mode === "run"`; default `false`; после старта не меняется; взаимоисключающ с Hard Mode (включение Cheat гасит Hard либо блокирует его с понятным hint); переход `Off → On` требует подтверждения локализованной модалкой (тексты RU/EN — в брифе §8.3).
- **Файлы:** `game/packs.ts` (`RunConfig`), `features/start/StartScreen.tsx`, `state/runLink.ts` + `state/runPersist.ts` (флаг входит в seeded contract и share-link), `i18n/core.ts`.
- **DoD:** флаг в ссылке и сейве; старый config/ссылка читается как `false`; Hard+Cheat одновременно невозможны; модалка не пропускается молча.
- ✅ **Реализовано 2026-07-27.** `RunConfig.cheatMode?: boolean`; секция `Special rules` (отделена пунктиром, `Eyebrow` + `OptionGroup`) рендерится только при `mode === "run"`. Включение идёт через модалку и само гасит `hardMode`; обратная опция хардкора при активном Cheat Mode `disabled` с подсказкой «Недоступен вместе с Cheat Mode» — интерфейс не обещает одновременно соревновательный и читерский забег. В кодеке ссылки ключ `x` (не `c` — он уже занят `scoring`), пишется только когда включён, поэтому round-trip старых ссылок точен. e2e покрывает: секции нет в Quick Draft, включение без модалки невозможно, взаимоисключение в обе стороны.

#### R2.2 — Бесконечное золото ✅ (P0, 2026-07-27)
- **Цель:** `isUnlimitedGold` в экономике — **булевым флагом, не числом `Infinity`** (оно не переживает JSON, грабля уже ловилась на `rerolls`).
- **Правило (решено при приёмке):** Cheat Mode обходит **только** проверку и списание золота. `freeMarketRerolls` / `freePlayerSwaps` / слоты / interest ведут себя как обычно; операции по-прежнему валидируют payload, слоты и структурную допустимость. Одно правило — один тест.
- **DoD:** `canAfford` всегда true; покупка и reroll не уменьшают `gold`; UI показывает `∞`; persist/resume сохраняет режим; ни одна операция не проходит валидацию слотов «за компанию».
- ✅ **Реализовано 2026-07-27.** В `RunEconomy` появились две приватные точки — `affordable(price)` и `spend(price)` — и **все** платные пути (покупка оффера, reroll рынка, улучшение качества, `canReroll`) ходят через них. Так правило «Cheat Mode обходит только золото» существует в одном месте, а не размазано по четырём условиям. `playerOfferAffordable` получил тот же флаг: иначе карта выглядела бы недоступной, хотя движок списал бы 0 — ровно класс бага, который уже ловили на stand-in. UI показывает `∞` вместо числа. Тесты: покупки при нулевом балансе проходят и не двигают его, валидация payload и лимит слотов не отключаются, resume сохраняет режим, обычный забег ведёт себя как раньше.

#### R2.3 — Несоревновательная маркировка ✅ (P0, 2026-07-27)
- **Цель:** постоянный бейдж `CHEAT MODE · ∞ GOLD` во время забега; запись карьеры помечена и исключена из агрегатов; share-link несёт явный `cheatMode=true` с видимой маркировкой.
- **⚠️ Конфликт, найденный при приёмке:** мета-гейт редкости считает записи карьеры (`careerEntriesForMode(entries,"run").length >= 1`, `state/runStore.ts:395`). Пока cheat-запись пишется как обычная, читерский забег **откроет редкость** следующему честному. Cheat-запись обязана исключаться и из агрегатов, и из этого счётчика.
- **Файлы:** `state/careerStore.ts` (флаг в `CareerEntry` + фильтр в агрегатах и в счётчике режима), `state/runStore.ts`, `features/run/*`, `i18n/core.ts`.
- **DoD:** cheat-забег не двигает ни один career-счётчик; следующий честный забег остаётся первым для мета-гейта; забег сохраняется/resume как обычный; не открывает Stakes/достижения; не идёт в лидерборд/дейлик; тест закрывает именно связку «cheat-run → гейт редкости».
- ✅ **Реализовано 2026-07-27.** `CareerConfigLabel.cheatMode`; фильтр `competitiveEntries` применён **внутри** `summarizeCareer` и `careerEntriesForMode`, а не у вызывающих: агрегат — единственный источник career-счётчиков, и забыть фильтр в одном из мест значило бы тихо испортить статистику. Запись остаётся в истории с меткой (её видно), но не входит ни в один счётчик и ни в счётчик мета-гейта. Новый примитив `ui/CheatBadge` (токен `--gold`, не `--danger`: бейдж висит постоянно) показывается на статусе этапа и в шапке Буткемпа. Тесты: `summarizeCareer([honest, cheat]) === summarizeCareer([honest])`, `careerEntriesForMode` не считает cheat-забег — то есть следующий честный остаётся первым для гейта редкости.
- **Deps:** R2.1, R2.2.

### R3 — Баг: флаги редкости (баг №1 из отчёта пользователя)
#### R3.1 — Разделить флаги ✅ (P0, 2026-07-27)
- **Баг подтверждён по коду.** Один `rarityEnabled` глушит сразу три вещи: `rollHeroRarity` (`anteEconomy.ts:568`), `rarityUpgradeCost` (`:577`), `upgradeHeroRarity` (`:584`) и весь UI-блок (`CampScreen.tsx:654`). Поэтому в первом забеге Common-героя нельзя прокачать вручную, хотя продуктовое намерение было противоположным.
- **Цель:** независимые `rarityDropsEnabled` / `rarityUpgradesEnabled` + производный `rarityUiVisible = drops || upgrades`. `rollHeroRarity` смотрит только на drops; `rarityUpgradeCost`/`upgradeHeroRarity` — только на upgrades; `campView` отдаёт оба (или derived).
- **Миграция не нужна (уточнено при приёмке):** `SavedRun.balanceConfigVersion` уже инвалидирует несовместимый roguelite-resume, а разделение флагов бампает версию по контракту `game/balance.ts`. Legacy `rarityEnabled` читается как fallback для обоих новых флагов.
- **Файлы:** `game/anteEconomy.ts`, `game/heroRarity.ts`, `features/run/CampScreen.tsx`, `state/runStore.ts`, `game/balance.ts` (bump).
- ✅ **Реализовано 2026-07-27.** `rarityEnabled` → `rarityDropsEnabled` + `rarityUpgradesEnabled` в `RunEconomyState`/`CampView`; `setRarityFlags({drops, upgrades})`; старт забега ставит `drops: rogueliteRuns >= 1, upgrades: true`. Производный `rarityUiVisible` **не заводили** — у него не осталось ни одного потребителя: блок улучшения смотрит на `rarityUpgradesEnabled`, а бейдж снимаемого героя читает реальную карту `heroRarity` (в первом забеге дропов нет, но вручную поднятый тир существует, и его потеря при замене обязана быть видна в дельте). Legacy `rarityEnabled` поднимается в обе оси через `normalizeEconomyState` — чисто оборонительно, реально такие сейвы отсекает bump `BALANCE_CONFIG_VERSION b1.2.0 → b1.3.0`.
- **Deps:** нет.

#### R3.2 — Поведение первого забега ✅ (P0, 2026-07-27)
- **Acceptance criteria (дословно из брифа §9.5):** (1) в первом-ever Roguelite Run все случайно полученные герои `common`; (2) после первого пройденного турнира в Буткемпе виден блок улучшения качества; (3) при наличии золота `common` можно улучшить до `unique`; (4) бонус `unique` применяется к следующему турниру; (5) со второго забега повышенные качества снова могут выпадать случайно; (6) Quick Draft не показывает качество и не меняет score; (7) resume первого забега сохраняет вручную улучшенные качества.
- **DoD:** тесты покрывают первый и второй забег + resume; e2e «в первом забеге качество можно поднять вручную» заменяет текущий e2e «редкость скрыта в первом забеге».
- ✅ **Реализовано 2026-07-27.** Все семь критериев закрыты. Юниты: `anteEconomy.test.ts` +2 (первый забег роллит common на любом этапе, но качает руками и переживает resume; legacy-сейв поднимается в обе оси). e2e: «первый забег — дропы common, но улучшать можно руками» (все карты рынка героев имеют `data-incoming-rarity="common"`, блок улучшения виден, common→unique применяется, reload сохраняет тир) + переименованный «со второго забега открываются случайные повышенные качества».
- 🐛 **Баг, пойманный этим e2e (иначе уехал бы в прод).** Превью редкости на карте рынка звало `rollRarity` напрямую и было завязано на общий UI-флаг: после разделения карта обещала `unique`, а покупка (`economy.rollHeroRarity`, гейт по `drops`) выдавала `common`. Превью и покупка теперь смотрят на ОДИН флаг `rarityDropsEnabled`.
- **Deps:** R3.1.

### R4 — Статичные цены с учётом качества
#### R4.1 — Цена героя по качеству ✅ (P1, 2026-07-27)
- **Дефект:** hero-оффер берёт цену generic-оффера Hero Synergy (`anteMarket.ts:176`), поэтому common и immortal стоят одинаково — при том что редкость на карте уже показана.
- **Цель:** базовая цена по тиру `common 4 / unique 7 / mythic 12 / immortal 20`, **не зависящая от номера этапа** (этап влияет на odds качества, доступный контент, доход и boss pressure — но не на базовую цену). Не повышать цену за то, что герой удачно усиливает состав.
- **Инвариант в тест (найден при приёмке):** `price(тир) = price(common) + Σ upgradeCost(common→тир)` — `4+3=7`, `7+5=12`, `12+8=20`. Купить готовый тир стоит ровно столько же, сколько вырастить его из common; калибровка не должна ломать это молча. Плюс `common < unique < mythic < immortal`.
- **DoD:** превью показывает редкость **и** её цену до покупки; оба пути к immortal равноценны по золоту; цена одна и та же на Stage 2 и Stage 22.
- ✅ **Реализовано 2026-07-27.** `RARITY.heroPrice` (`4/7/12/20`), цена берётся от качества входящего героя. Ключевое сопутствующее решение: **выпавшее качество едет на самом оффере** (`HeroSwapEffect.incomingRarity`), а не роллится независимо в трёх местах. Цена, превью карточки и результат покупки читают одно значение — тот самый класс расхождения, который был багом первого забега, больше невозможен структурно. `refreshAnteMarketOffers` сохраняет качество и цену (identity карты не меняется). Тесты: монотонность, инвариант «купить тир = вырастить из common», цена не зависит от этапа, закрытый мета-гейт даёт common по базовой цене.

#### R4.2 — Дорожающий reroll рынка ✅ (P1, 2026-07-27)
- **Цель:** `rerollCost = base + marketRerollsInCurrentCamp` (`2 → 3 → 4 → 5…`), сброс при открытии следующего Буткемпа. Ограничивает принудительный поиск идеальной карты (принцип Balatro-магазина).
- **DoD:** взаимодействие с `freeMarketRerolls` (scouting) явно определено и покрыто тестом; `openCamp` сбрасывает счётчик; resume восстанавливает текущую цену.
- ✅ **Реализовано 2026-07-27.** `ECONOMY.rerollCostBase/Step` + чистая `rerollCostFor(rerollsInCamp)`, которую одинаково зовут движок и `campView` (UI не может показать цену, отличную от списанной). `2 → 3 → 4 → …`, сброс на `openCamp`; счётчик уже жил в сейве, поэтому resume восстанавливает цену без новых полей.

#### R4.3 — Ревизия экономики ✅ (P1, 2026-07-27)
- **Цель:** убрать доминируемую пару Small/Large Gold; призовые начисляются **автоматически**, затем игрок выбирает одну из содержательно разных наград (Item/Tactic, Camp Action, booster pack, улучшение качества, Form Upgrade offer, золото + reroll-токен, scouting, trade-in coupon), затем открывается Market.
- **Плюс:** interest за накопление (`min(floor(goldBeforeReward / threshold), cap)`, числа — из `R10`; в Cheat Mode не начисляется) и дорогие late-game sinks, чтобы поздние деньги покупали доступ к сильным формам/редким предметам/снятию негативных свойств, а не тот же common в десять раз дороже.
- **Закрывает:** PF-3 (нелегибельная ценность карты-награды) вместе с T6.5.
- ✅ **Реализовано 2026-07-27.** Призовые и раньше начислялись автоматически, поэтому суть работы — сделать сам ВЫБОР содержательным. Доминируемая пара «мало/много золота» убрана: осталась одна золотая карта, а конкурируют с ней три разных вида пользы — **деньги** (`gold`), **билд** (`tactic`/`action`, fallback — stat-рычаг) и **утилита-токен**: `reroll` («Скауты»: бесплатные реролы + доплата) либо `quality` («Тренировочный блок»: бесплатное улучшение тира героя). Утилита выбирается детерминированно по seed+camp и уважает мета-гейт улучшений. Тест фиксирует инвариант «три награды — три разных вида»: пока виды не повторяются, «строго лучше» структурно невозможно.
- ✅ **Проценты за накопление.** `interestFor(gold) = min(cap, floor(gold / perGold))`, начисляются автоматически вместе с призовыми и считаются с баланса, **донесённого** до Буткемпа — так «накопить» становится решением, а не побочным эффектом. В Cheat Mode не начисляются. Выплата показана разложенной («Начислено +6 призовые · +2 проценты») — иначе проценты невидимы и решение не читается.
- ✅ **Бесплатное улучшение как токен.** `freeRarityUpgrades` повторяет уже существующий паттерн `freePlayerSwaps`/`freeMarketRerolls`, и UI-доступность учитывает токен — иначе карточка выглядела бы заблокированной при нулевом золоте, хотя движок списал бы 0 (тот же класс бага, что ловили на stand-in).
- 🐛 **Найдено при реализации: симулятор мерил не ту игру.** `sim_run.ts` звал `buildAnteMarketRoulette` без `stageCount`, поэтому прогресс сезона всегда был 0 и кривая нижней границы рынка (`R5.1-fix`) в замерах не участвовала. Исправлено; **числа b1.5.0/b1.6.0 в истории `balance.ts` помечены как недостоверные**. Честный замер текущего конфига: naive **26.7%**, итоговый OVR 89.4, покупок за Буткемп 2.32, золото 8.3 (тратится, а не копится).
- ⚠️ **Профиль у верхней границы полосы.** 26.7% наивной игры при PRD-цели 30–40% для *осмысленной* означает, что skilled уйдёт к 35–45%. Не компенсировал: это работа `R6.4`/`R10` по измерению, а не подгонка плейсхолдеров. Главные мишени — `FORM_ODDS`, `FORM_FLOOR`, `interestCap`.
- ⬜ **Не входило:** late-game sinks (booster packs, снятие негативных свойств, boss reroll, premium scouting, trade-in coupon) — они требуют систем, которых ещё нет; остаются в `R8.3`/`T6.5`.
- **Deps:** R4.1, R4.2. Числа — `R10`.

### R5 — Формы игроков (баг №2 из отчёта пользователя)
#### R5.1 — Сохранить snapshot'ы ✅ (P1, 2026-07-27)
- **Баг подтверждён по коду.** `marketPlayerCandidates` (`game/engine.ts:161`) сворачивает все snapshot'ы игрока до максимального по OVR (`bestByPlayer`) **и** отбрасывает любой `accountId` из `usedPlayers`. Отсюда обе половины бага: своего игрока нельзя улучшить до лучшей формы, а чужого рынок сразу показывает на максимуме вместо честной рулетки форм.
- **Цель:** убрать `bestByPlayer` для Roguelite; отдельные `CandidateRef {accountId, teamId, eventId}` одного человека сосуществуют; рынок выбирает форму по tier/odds, а не всегда максимум.
- **Модель odds (не жёсткая привязка тиров к актам!):** eligibility с первого этапа, вероятность лучших форм растёт по забегу. Стартовая таблица `Standard/Strong/Elite/Peak` — в брифе §11.3, числа — placeholder под `R10`. Тиры определяются **percentile внутри роли и формата**, а не одним универсальным порогом OVR; сырой OVR всё равно показывается игроку.
- **DoD:** детерминизм по seed сохранён; ранняя Peak-форма возможна, но редка и дорога; Quick Draft/`bestByPlayer` в Classic не затронуты.
- ✅ **Реализовано 2026-07-27.** `bestByPlayer` удалён; пул рынка вырос с 357 свёрнутых карт до 2656 реальных форм (до 28 снимков на человека). Введены тиры формы по **percentile внутри роли** (`formTiersOf`) и взвешенный по прогрессу сезона выбор (`FORM_ODDS`, 5 строк из брифа, индексируются прогрессом `0..1` — таблица одинаково работает и на пятиэтапном сезоне, и на будущем 25-этапном). Равномерный `rng.pick` по пулу был бы прямым смещением: он показывал бы «кто чаще играл», а не «кто сильнее». Сортировка пула — по полному ключу формы (`accountId, teamId, eventId`), иначе детерминизм ломался.
- ✅ **Нижняя граница рынка (playtest 2026-07-27).** Честная рулетка форм оказалась абсолютно-перцентильной: замер показал, что на последнем этапе **25% карт — это 56–74 OVR**, ещё 35% — 74–82. Против состава 85+ это не ловушки, а шум, съедающий дорожающий реролл (`R4.2`). Ловушка обязана быть соблазнительной и неправильной; карта 60 рядом с составом 85 никого не соблазняет. Введён `stockedForms`: рынок не выставляет формы ниже **строгого из двух** порогов — кривая по этапу (`FORM_FLOOR.endPercentile`, предсказуема и калибруется симулятором в отрыве от стратегии) и «явно хуже своего в этой роли» (`rosterGapOvr`, страхует забег, ушедший сильнее кривой). Верх пула не срезается никогда, пул не сжимается ниже `minPoolSize`, а фильтры ослабляются ступенчато — пустой пул означал бы исключение и сорванный Буткемп. Замер после: слабый состав на финале видит от 74, состав 85/86 — от 79, состав 90/91 — от 84.
- ✅ **Своя форма — только строгий апгрейд.** У формы того же человека меняется **только Base**: Chemistry и Hero Synergy считаются по `accountId` и переносятся. Значит форма не сильнее текущей — доказуемо мёртвая карта, а не ловушка. Ровно так на рынок попадал «Nisha 90 → Nisha 90» с нулевой дельтой (найдено на playtest).
- ⚠️ **Замер: забег стал заметно труднее.** `npm run sim -- 300`: наивный win-rate **24.0% → 12.7%**, итоговый OVR `88.5 → 85.9`. Причина понятна и ожидаема: свёртка `bestByPlayer` была скрытым источником силы — рынок всегда показывал **пиковую** форму каждого игрока. Теперь это честная рулетка. Вместе с `R6.2` (+4.7pp) итог по сессии: 19.3% → 12.7%. Компенсировать «на глаз» не стал. **После нижней границы рынка профиль вернулся: 21.0%**, итоговый OVR 87.9, покупок за Буткемп 1.79 → 2.05, золото перестало копиться (13.2 → 10.6) — то есть рынок снова стоит своих денег. `FORM_ODDS`/`FORM_FLOOR` — мишени калибровки `R10`.

#### R5.2 — Form Upgrade того же игрока ✅ (P1, 2026-07-27)
- **Цель:** разделить «использованная личность» и «использованная форма»: `activeAccounts` / `ownedAccounts` / `seenSnapshots`. Один `accountId` не занимает два активных слота; тот же snapshot не повторяется бесконечно; **другой** snapshot уже имеющегося игрока приходит как `Form Upgrade`/sidegrade.
- **Часть инвариантов уже в коде (уточнено при приёмке):** `assertPlayerReplacement` уже запрещает один `accountId` дважды в активном составе, а Chemistry считается по `accountId` и переносится сама. Реальная работа — снять фильтр `usedPlayers` для *другого snapshot уже владеемого* аккаунта и решить два вопроса явно:
  - **старая форма уходит на скамейку** (рекомендация — да, как любая замена: не заводим второе правило рядом с существующим резервом);
  - **manual-назначение героя при апгрейде той же личности сохраняется** (рекомендация — да; сейчас `manualWithoutPlayer(outgoing.accountId)` его сбросил бы, потому что accountId совпадает).
- **DoD:** нет активного дубля личности; team/event-зависимые параметры формы обновляются; Chemistry не «перезапускается»; action log воспроизводит апгрейд при replay/resume; тест на «купил форму → reload → тот же активный ростер и резерв».
- ✅ **Реализовано 2026-07-27.** Разделены `usedPlayers` (личность — правит драфтом) и `seenSnapshots` (форма — правит рынком). Три неочевидные вещи, всплывшие при реализации:
  1. **Проверка «личность уже в составе» должна игнорировать заменяемый слот.** Без этого Form Upgrade невозможен в принципе: входящая форма имеет тот же `accountId`, и апгрейд в свой же слот падал бы как «игрок уже в составе».
  2. **Активную личность нельзя банить в пуле рынка** — сначала я это сделал, и ни у одного из пяти активных игроков не оказалось альтернативной формы. Ограничение живёт в проверке замены (`canReplacePlayer`), а не в фильтре пула.
  3. **Кросс-ролевая коллизия.** Человек в составе как offlane, а в пуле есть его mid-форма — девать её некуда, и рынок падал с «Нет активного слота роли mid» (поймано симулятором на 300 сидах, не на 5). Такие карты отсекаются в пуле.
  4. **`snap()` обязан быть тотальным** (баг, найденный пользователем на live-забеге). Он строил превью возврата запасного во ВСЕ слоты его роли; после Form Upgrade на скамейке лежит старая форма человека, чья личность активна, и превью во **второй** слот той же роли бросало «игрок уже в активном составе». `buyMarket` глотал исключение своим `catch`: золото списано, ростер изменён, а `set()` не выполнен — UI заморожен, кнопка «не работает». Задевало только роли с двумя слотами: **support** ломался, carry/mid/offlane апгрейдились нормально. Лечится предикатом `canSwapReservePlayer` в `snap`; регресс-тест проверяет и ростер, и снимок стора, и однократное списание золота.
  Плюс: manual-назначение героя переносится на новую форму (`manualAfterSwap`) — иначе Hungarian переназначил бы героя заново; скамейка держит **одну** форму на человека, потому что резерв адресуется по `accountId` в том числе в логе действий. UI: карточка помечена «Другая форма» + событие исходной формы (формы различает событие, а не команда). Тесты: 6 юнитов в `engine.test.ts`, e2e resume перенастроен покупать карту с другой личностью.
- **Deps:** R5.1.

#### R5.3 — Цена формы и карточка ✅ (P1; trade-in и происхождение 2026-07-27, цена звёзд b1.45.0 2026-09-02, карточка до → после с правилами 2026-09-05)
- **Цель:** цена зависит от внутренней силы формы, не от этапа; `playerCost(ovr)` — основа, но требует пере-калибровки (сегодня игрок 95 стоит подозрительно дёшево для длинного забега). Для same-player апгрейда — trade-in: `upgradeCost = max(minimumUpgradeCost, incomingFormCost − floor(currentFormCost · tradeInRate))`.
- **UI:** карточка объясняет **происхождение** формы (команда · событие · год), а не только итоговый OVR; показывает `до → после` по слагаемым и явное правило по Chemistry/герою.
- ✅ **Trade-in и происхождение формы сделаны 2026-07-27.** `formUpgradeCost(incoming, current) = max(minCost, playerCost(incoming) − floor(playerCost(current) · tradeInRate))`: за человека уже заплачено, иначе апгрейд формы всегда проигрывал покупке нового игрока той же силы. Карточка показывает событие исходной формы и её OVR.
- ✅ **Пере-калибровка `playerCost` (b1.45.0, 2026-09-02).** Линейная база `(ovr−60)/4` оставлена до 85 OVR, сверх — «звёздная премия» `(ovr−85)²/starDivisor` (`ECONOMY.playerCost`). Свип на 300 сидах с `select-build` (∞ / 12 / 8 / 5): win 35.0 / 32.7 / 32.0 / 32.3%, покупок звёзд ≥90 за забег 1.64 / 1.62 / 1.55 / 1.33 (новая метрика сима «Звёзды»). Исход к цене малочувствителен даже при 29 золота за 95-го — премия про напряжение выбора, не про сложность; взят делитель 8: 90 → 11, 95 → 21, 97 → 27 (было 8/9/9), звезда стоит 2–3 лагеря накоплений. Форма-апгрейд той же личности идёт через ту же функцию — trade-in автоматически дорожает для звёзд.
- ✅ **Карточка `до → после` с происхождением (2026-09-05).** Карточка игрока на рынке подписана «команда · событие · год» (`CampPlayerCard.origin`), форма-апгрейд показывает происхождение обеих форм; оверлей замены сверх разложения по слагаемым получил явные правила (`playerOfferDetails`): герой после замены с числом pro-игр на нём, пары сыгранности с составом ПОСЛЕ замены (топ-3, игры и бонус — тем же `chemistryPairEdges`, что счёт) и кто уходит. R5.3 закрыт.
- **Deps:** R5.2. Числа — `R10`.

### R6 — Конечный сезон 5×5
#### R6.1 — Акт-модель ✅ (P2, 2026-07-29)
- **Цель:** пять актов по пять этапов; тип этапа (`regular / elite / playoff-check / boss`) и порог — из конфига акт-модели, а не из плоского массива `ANTE_TARGETS`. UI показывает `Акт N · Этап M`.
- **Граница:** «25» не должно стать константой победы в коде — длина сезона конфигурируется, чтобы `R10` мог сравнить `20 / 25 / 30` без переписывания оркестратора.
- ✅ **Реализовано 2026-07-29.** `SeasonModel` в `game/anteRun.ts`: `buildSeason({ acts })` разворачивает `SEASON_TEMPLATE`
  (`regular, regular, elite, playoffCheck, boss`) в дескрипторы этапов `{ index, act, stageInAct, kind, target }`.
  `ACT_LENGTH` выводится из длины шаблона, а не записан вторым числом; `AnteRunEngine` принимает сезон вместо
  массива порогов, и проверка «порог = worst-rank реального бакета» (R9.3) теперь идёт по всем 25 этапам.
  Плоский `ANTE_TARGETS` удалён: порог считается из типа этапа (`regular 8 / elite 6 / playoffCheck 4`) и из номера
  акта на финалах (`4/3/2/1/1`).
- ✅ **Своей копии лестницы у симулятора больше нет.** До этой задачи `sim_run.ts` держал собственную `seasonTargets(acts)` —
  ровно тот класс дефекта «несколько копий одной модели», который R10/R11.2 уже ловили на композиции силы. Теперь
  `--seasons` строит сезоны тем же `buildSeason`, каким играет игра.
- ✅ **`seasonStage(index)` работает и ЗА пределами сезона** — арифметикой от шаблона, а не поиском в массиве. Это
  нужно Династии (T5.8): после Stage 25 акты продолжаются, а не упираются в конец массива.
- ✅ **Elite-этап получил надбавку к полю (`ANTE_THREAT.elite = 3`).** PRD определяет Elite как «усиленное поле, но не
  босс», а числа не давал: у этапа нет правила, поэтому вся его сложность обязана быть в поле. Плейсхолдер, калибровка — `R6.4`.
- ✅ **Тип этапа виден игроку** (`ui/StageKindBadge` рядом с «Акт N · Этап M» на этапе и в Буткемпе). Без метки
  усиление поля было бы невидимой механикой — тот же дефект, что R11.7 чинил у тегов.
- **Замер `npm run sim -- 100` на реализованной модели (b1.15.0):** synergy-build **30.0%**, greedy-oracle 2.0%,
  greedy-power 0%, naive 0%, static 0%, боссовых смертей 15–34%. Это ровно целевая полоса PRD «хороший состав с
  апгрейдами 30–40%», причём выигрывает только билд-агент: жадность по OVR/силе 25 этапов не проходит. Сравнение с
  прогнозом ДО реализации (`--seasons`, 60 seeds, без elite-надбавки): synergy-build 28.3%, greedy-power 1.7% —
  профиль совпал, надбавка Elite на этой выборке в пределах шума.
- **Сейвы/ссылки:** миграция не нужна — `BALANCE_CONFIG_VERSION b1.14.0 → b1.15.0` инвалидирует несовместимый
  roguelite-resume штатно (`isRunCompatible`). Старые career-записи держат свой `count: 5` и продолжают честно
  показывать «Stage 3/5»: это история забега, а не текущая модель.
- 🐛 **Цена, которую предупреждал бриф:** e2e пришлось перестроить. Cheat-тест опирался на то, что забег
  заканчивается за пять этапов, — в 25-этапном сезоне прокачанный cheat-забег на пятом этапе ещё жив, поэтому
  проверка «вне статистики» вынесена в отдельный короткий тест со статичным ростером. Тесты больше не знают «25»
  отдельно от игры: длина берётся из `SEASON`.
- ⬜ **Не входило:** `R6.3` (терминальный экран победы сезона + выбор Династии), кривая порогов и пере-калибровка
  под акт-модель (`R6.4`), названия актов из таблицы PRD (Open Qualifiers / Regional Circuit / …), Stakes.
- **Deps:** R1.1 (иначе 25 турниров непроходимы по времени), R7.1.

#### R6.2 — Частота боссов ✅ (P0, 2026-07-27)
- **Дефект:** `BOSS_FIRST_STAGE = 2` даёт босса на **каждом** этапе начиная с третьего — 3 боссовых этапа из 5, при том что PRD описывает босса как редкое событие.
- **Цель:** ровно один Boss Tournament на финал акта (пять на сезон, последний — Showdown). Босс виден заранее в Буткемпе: имя, правило, затронутые механики, требуемое место, сила поля, награда.
- **DoD:** код и PRD синхронны (закрывает `R9.2`); превью следующего босса не ломается на не-боссовых этапах; e2e «boss condition виден заранее» обновлён под новую cadence.
- ✅ **Реализовано 2026-07-27.** `BOSS_FIRST_STAGE` удалён; cadence — `anteRun.isActFinale(stage)` от `ACT_LENGTH = 5`, поэтому переход на 25-этапный сезон (`R6.1`) её не тронет, а в Династии она продолжится сама. Длина акта живёт в `anteRun` (структура сезона), `bossConditions` её импортирует — один дом у понятия.
- ⚠️ **Замер: забег стал легче, и это не компенсировано специально.** `npm run sim -- 300`: наивный win-rate **19.3% → 24.0%**, статик 0.0% → 0.7%, гибель на этапе 2 упала 15 → 6 (там стоял босс). Это прямое следствие устранения дефекта; компенсировать другими плейсхолдерами «на глаз» нельзя — профиль пере-калибруют `R6.4`/`R10` по измерению. `BALANCE_CONFIG_VERSION b1.3.0 → b1.4.0`.
- ⚠️ **Побочный вывод в пользу приоритета `R6.1`:** в пятиэтапном сезоне после фикса остаётся ровно **один** босс, и он на последнем этапе — система боссов почти не играет. Полную ценность она возвращает только на 25 этапах (пять боссов).
- **Deps:** нет (можно делать до акт-модели, зафиксировав cadence на пятиэтапном круге).

#### R6.3 — Победа сезона и выбор Династии ✅ (P2, 2026-07-29)
- **Цель:** победа на последнем этапе сезона — терминальная (`phase = "won"`), затем выбор **«Завершить забег» / «Продолжить в Династии»**. Продолжение не отменяет засчитанную победу; поражение в Династии записывает, что основной сезон выигран.
- **Экран победы:** сезон, финальный Stage, титулы/Aegis, состав, качества героев, Tactics/Items, Tournament Power, ключевые синергии, использованный Stake, отметка Cheat Mode.
- **Career:** отдельно фиксируются основная победа и глубина Династии.
- ✅ **Движок.** `seasonWon` — липкий флаг: поражение в Династии победу не отменяет. `continueDynasty()`
  двигает индекс за конец сезона, где правила этапа считает та же арифметика актов, что и внутри
  (`seasonStage` за пределами `stages` — задел, заложенный в `R6.1`). Второй «победы» там нет:
  терминальный `won` возможен ровно на последнем этапе сезона, дальше штатный финал — поражение.
- ✅ **Победа банкуется СРАЗУ, до выбора.** Career-запись пишется в момент победы: факт от решения не
  зависит, а вкладку могут закрыть на экране итога. Продолжение — тот же забег (ростер, билд, золото),
  поэтому вход в Династию идёт через тот же переход «этап пройден → Буткемп», что и обычный проход
  порога; общий `openCampAfterStage` в сторе — чтобы второй копии этого события не появилось.
- ✅ **Глубина Династии — отдельная career-запись** с меткой `dynasty`, исключённая из агрегатов и из
  счётчика забегов (как cheat-записи): один забег не должен считаться дважды и открывать мета-прогрессию
  сам себе. В `careerRunId` добавлен признак `dynasty` — иначе дедуп молча схлопнул бы её с записью победы,
  при том что этап результата в id намеренно НЕ входит (это один и тот же забег).
- ✅ **UI.** Панель `SeasonVictory` не дублирует то, что уже стоит на экране турнира (ростер, синергии,
  разложение Tournament Power, итоговая таблица) — она показывает то, чего там нет: титулы актов,
  качества героев и собранный билд. «Завершить» ничего не разрушает: забег и так терминален, результаты
  и шеринг остаются на экране, поэтому это снятие предложения, а не confirm-действие.
  Попутно `RarityBadge` вынесен из `CampScreen` в `ui/` — он теперь нужен на двух экранах.
- ⚠️ **Известное ограничение:** выбор живёт в сессии. Сейв на победе очищается (забег терминален),
  поэтому после перезагрузки на экране итога победа остаётся засчитанной, но продолжить Династию уже
  нельзя. Сама Династия персистится штатно (`anteStageIndex` за пределами сезона + `anteSeasonWon`).
- ⬜ **Не входило:** контент Династии из `T5.8` (milestone каждые пять этапов, сдвиг рынка в сторону
  sidegrade) — здесь только добровольный вход и корректная запись глубины; Stakes (`T6.4`).
- **Deps:** R6.1. **Переопределяет:** T5.8 (Династия становится добровольным продолжением, а не единственным финалом).

#### R6.4 — Пороги и калибровка поля ✅ (P2, 2026-07-29; ложная подпись закрыта 2026-07-27)
- **Дефект (подтверждён):** `placementWorstRank("9-12") === 12`, поэтому `target = 10` не пропускает бакет `9-12` — подпись «Топ-10» врёт, фактически требуется топ-8. Остальные пороги `6/4/3/1` честные.
- **Правило шире, чем «убрать Top 10» (уточнено при приёмке):** легальны только пороги, совпадающие с worst-rank реального бакета — `1, 2, 3, 4, 6, 8, 12, 16, 17, 18`. Закрепить константой + тестом, чтобы будущая калибровка не завела новое ложное число.
- **Цель:** обычные этапы — топ-8; финалы актов ужесточаются `топ-4 → топ-3 → топ-2 → 1-е → 1-е`; подпись выводится из бакета, а не пишется руками.
- ✅ **Часть R9.3 закрыта 2026-07-27 (ложная подпись).** Введены `LEGAL_ANTE_TARGETS` (выводятся из нового runtime-списка `PLACEMENT_KEYS` в `tournament.ts`) и проверка в конструкторе `AnteRunEngine`: нелегальный порог теперь падает с явной ошибкой, а не превращается в тихую ложь. Первый порог записан как `8` вместо `10` — **поведение не изменилось ни на один бакет** (оба режут «9-12» и ниже), изменилась только подпись «Цель: топ-8». Тест фиксирует и список легальных значений, и отказ на `10`. Побочно: два теста `anteRun` использовали `target = 0` как «недостижимый» — заменены на слабый состав против `топ-1`, потому что 0 не является реальным бакетом.
- ✅ **Кривая под акт-модель закрыта `R6.1`** (обычные топ-8, elite топ-6, playoff check топ-4, финалы актов из номера акта), подпись выводится из бакета.
- ✅ **Открытый вопрос PRD §10.I закрыт замером 2026-07-29.** Ответ: **`топ-2` на Stage 20, `1-е` только на Stage 25, защитный ресурс не нужен** (`SEASON_ACT_FINALES [4,3,2,1,1] → [4,3,2,2,1]`).
  - **Как мерили.** Общий win-rate на этот вопрос не отвечает: он падает от любого ужесточения. Мерили **проходимость КОНКРЕТНОГО финала из числа дошедших** — это и есть «цена одной неудачной сетки» на данном этапе. Режим `npm run sim -- 60 --finales` гоняет кривые-кандидаты на ОДНИХ сидах и одних агентах, поэтому разница принадлежит кривой, а не выборке.
  - **Числа (билд-агент / жадные):** S20 `83.9% / 48.3%` при `1-е` → `93.5% / 62.1%` при `топ-2`. Общий win-rate билд-агента при этом **не изменился: 30.0% на обеих кривых**. Вывод, который и решил вопрос: требование чемпионства на S20 не добавляло сложности — оно переносило точку обрыва в середину сезона, где терялись 20 сыгранных турниров. Теперь забег доходит до Showdown и умирает там.
  - **Отвергнутые варианты:** `4/3/2/2/2` (без чемпионства вовсе) — 36.7%, но у сезона исчезает кульминация; `6/4/3/2/1` (мягкий вход) — 31.7%, поднимает выживаемость ранних актов, то есть лечит не ту болезнь.
  - **Mulligan не вводим:** коинфлип-стены в середине сезона больше нет, а страховка от финала обесценила бы сам финал.
- ✅ **«Чемпионство как бонус» сделано видимым.** Премия за место (`prizeForStage`, нормализованная, до `prizePerformanceMax`) существовала и раньше, но на финалах была мертва (`target <= 1` — перевыполнить нечего) и в UI сливалась с базой в одно число. Теперь выплата разложена: `lastPayout.performance` отдельной строкой Буткемпа («+3 за место»). Награда, которую не видно, наградой не является — тот же класс дефекта, что чинили в R11.7 с тегами.
- ✅ **Пере-калибровка после `R6.2` не потребовалась.** Профиль на акт-модели: билд-агент 30.0% (полоса PRD «30–40% для осмысленной игры», а агент — нижняя граница), жадность по OVR/силе 0%, статик гибнет в первом акте. Крутить `FORM_ODDS`/`interestCap` «на глаз» под это не стал: измерение не показывает проблемы, а лишний сдвиг коэффициентов обесценил бы все прошлые замеры.
- **Deps:** R10 (кривая — по измерению, а не на глаз), R6.1.

### R7 — Сила поля Roguelite
#### R7.1 — Разделить качество ростера и Tournament Power соперника ✅ (P2, 2026-07-27)
- **⚠️ Диагноз брифа исправлен при приёмке.** «Поле упирается в 99» — верно, но сегодня **не работает**: `fieldBoost = idx·3 − 16` в пятиэтапном забеге всегда отрицательный, поэтому режет **нижний** кламп. Замер 20k сэмплов:

  | Этап | boost | mean | sd | доля ботов ровно на 76 |
  |---:|---:|---:|---:|---:|
  | 1 | −16 | 76.3 | 0.99 | **90.2%** |
  | 3 | −10 | 78.0 | 2.93 | 53.6% |
  | 5 | −4 | 82.3 | 4.50 | 13.4% |

  На первом этапе поле — не распределение, а спайк из 17 команд на одном значении: матчи ботов между собой становятся монетками, место игрока определяется жеребьёвкой. Это и есть объяснение «~1/3 наивных забегов гибнет уже на этапе 0» из прогона T6.3. Корень общий — **сдвиг-и-кламп ограниченного распределения**.
- **Цель:** Quick Draft оставляет `76–99` без изменений (подтверждено golden/parity); Roguelite параметризует поле по этапу (`mean(stage)`, `sd`) и **не** клампит итоговую силу соперника. Качество ростера соперника остаётся ограниченным `60–99`, безграничен только Tournament Power.
- **⚠️ Жёсткое ограничение (найдено при приёмке).** Исход серии — ELO по основанию 10 с `ELO_DIVISOR = 22`, откалиброванным под шкалу `76–99`. Если сила инфлирует до ~180 при неизменном делителе, вероятность победы в каждом матче уходит в 1 и турнир перестаёт быть турниром. Либо шкала остаётся порядка `60–110` (множители малы), либо делитель масштабируется вместе со шкалой. Это часть DoD, а не деталь калибровки.
- **DoD:** Quick Draft байт-в-байт (golden зелёные); на любом этапе roguelite-поле сохраняет осмысленную дисперсию (`sd` не схлопывается); распределение мест при заданной разнице силы измерено, а не предположено.
- ✅ **Реализовано 2026-07-27.** Введён `FieldModel { mean, sd, min, max, threat? }`; `TournamentEngine` принимает модель вместо числового `fieldBoost`. Разделены **качество ростера** (сэмплируется и клампится в `[min,max]` — у оценки живых игроков есть естественный потолок) и **`threat`** (надбавка сверх качества, **не клампится** — здесь снимается потолок 99). `ANTE_FIELD_HANDICAP` удалён, поле этапа задаёт `ANTE_FIELD` (`meanBase 71`, `sd 5`, `60..99`). Quick Draft зовёт движок без модели → дефолт `QUICK_DRAFT_FIELD` = прежние параметры, те же роллы в том же порядке ⇒ **golden байт-в-байт**.
- **Замер до/после (20k сэмплов на этап + `npm run sim -- 800`):**

  | | было | стало |
  |---|---:|---:|
  | `sd` поля на 1-м этапе | 0.99 | 5.0 |
  | доля ботов на границе | 90.2% | 0.1% |
  | гибель наивной игры на 1-м этапе | 27% | 12% |
  | кривая вылета по этапам | 27/9/6/6 | 12/8/12/12 |
  | naive win-rate | 26.7% | 28.4% |

  Живая проверка первого этапа: 10 различных значений силы в диапазоне 64–89 при `sd 5.66` — таблица посева вместо стены одинаковых чисел.
- **Сложность держал константной намеренно.** `meanBase` подобран так, чтобы win-rate остался в пределах шума: R7.1 — фикс ФОРМЫ распределения, а изменение сложности принадлежит `R6.4` и гейтится измерением `R10`. Побочно ушёл главный артефакт диагноза: «~1/3 наивных забегов гибнет уже на этапе 0» было следствием спайка (место решала жеребьёвка, а не сила), теперь кривая ровная.
- ⬜ **Потолок снят структурно, но ещё не используется:** `threat` пока всегда 0 — акт/босс/Stake наполняют его в `R7.2`. Ограничение по ELO (делитель 22 откалиброван под шкалу 76–99) станет обязывающим там же, а не здесь.

#### R7.2 — Модель угрозы соперника ✅ (P2, 2026-07-27)
- **Цель:** `opponentTournamentPower = opponentRosterPower · opponentTeamMult · opponentXMult + actThreat + bossThreat + stakeThreat`; late-game ускорение угрозы, чтобы конечный потолок команды встречался с неограниченной угрозой (условие штатного финала Династии).
- ✅ **Реализовано 2026-07-27 в аддитивной части.** `anteThreat(stage, { stake })` = ускоряющаяся надбавка за **пройденные акты** + надбавка **финала акта** + `stake`; уезжает в `FieldModel.threat`, который не клампится, — потолок 99 снят по существу, а не только структурно. Проверено тестом: на 25-м этапе сила соперников выше 99, а итоговая таблица по-прежнему сходится (18 мест, уникальные команды).
- ⚠️ **Мультипликативная часть формулы намеренно НЕ реализована.** `opponentTeamMult · opponentXMult` требует слоя Tournament Power у игрока (`R8.2`): вводить множители только сопернику — это не модель угрозы, а произвольный сдвиг сложности. `stake` тоже оставлен **сидом снаружи** (параметр по умолчанию 0), а не выдуманной системой: Stakes появляются в `T6.4`.
  - ✅ **Реализована 2026-08-23 (`b1.36.0`).** `FieldModel.mult` = `(1 + ANTE_THREAT.multPerAct)^пройденные акты` (0.22), применяется к итоговой силе бота (качество + угроза) и к шкале ELO-делителя; Quick Draft множитель не задаёт (golden байт-в-байт). Повод и замер — R10, «Калибровка 2026-08-23».
- 🐛 **Найдено при реализации: рампа `mean` шла по абсолютному этапу.** На 25-м этапе она дала бы `mean = 143`, все боты уткнулись бы в потолок качества 99, и спайк, ради устранения которого делался `R7.1`, вернулся бы с верхней стороны. Рампа переведена ВНУТРЬ акта (`71 → 83`, повторяется каждый акт), а рост между актами несёт безлимитная угроза. Так у двух источников сложности разные роли и они видны раздельно.
- **Калибровка надбавки финала — по замеру, а не по вкусу.** Вся сегодняшняя угроза ложится на этап чемпионства (в односезонном забеге пройденных актов нет), то есть на самый чувствительный рычаг. Замер `npm run sim -- 600`: `boss=1` → 25.7%, `boss=2` → 21.8%, `boss=3` → 19.5% при базе 28.4%. Взят **1** — наименьшее значение, при котором надбавка наблюдаема, но не переворачивает профиль одним плейсхолдером.
- **Граница применимости ELO зафиксирована в коде.** Делитель 22 откалиброван под шкалу `76–99` и АДДИТИВЕН. Пока растёт только поле, это корректно: разрыв растёт потому, что соперник действительно сильнее. Как только силу начнут масштабировать обе стороны (`R8.2`, пример брифа даёт 178), одинаковое относительное преимущество станет давать разную вероятность, а при разрывах 40+ каждый матч станет детерминированным. Требование записано рядом с самим `ELO_DIVISOR`, где его и будут менять; трогать делитель заранее нельзя — сдвинет Quick Draft и golden.
- **Deps:** R7.1 ✅, R8.2 (мультипликаторы).

### R8 — Dota-слой билда
#### R8.1 — Версионированные hero tags ✅ (P3, 2026-07-27)
- **Цель:** `web/src/data/heroTags.v1.json`, три слоя (объективные / lore / gameplay — списки в брифе §12.1), **ручная курация**: динамический вывод из патча или матчей запрещён, иначе обновление данных сломает старые seed и понятные сборки. Для каждого тега — формальный критерий; спорные герои помечаются для review.
- **Решено при приёмке:** отдельный `heroTagsVersion` **не заводим** — определения входят в `BALANCE_CONFIG_VERSION`, которая уже сидит в `RunLink`/`SavedRun`. Вторая версия рядом = вторая точка рассинхрона.
- **DoD:** валидатор тегов; детерминизм; `heroes.json`/`schema` не трогаются.
- ✅ **Реализовано 2026-07-27.** `src/data/heroTags.v1.json` — все **127 героев** датасета; контракт и формальные критерии каждого тега — в `src/game/heroTags.ts`. Три слоя: объективный (`attr` × 4, `range`), lore (11 тегов), gameplay (13 тегов). Хелперы условий сразу пригодные для предметов: `hasTag`, `countTag`, `distinctGameplayTags`, `countAttr`. `heroes.json`/`schema/` не тронуты — теги это игровой конфиг, а не выход ETL.
- **Валидатор — это тест `test/heroTags.test.ts`**, а не отдельный скрипт: он гоняется в CI, поэтому новый герой после data-refresh или опечатка в словаре краснеют сразу. Проверяет: покрытие всех героев датасета и отсутствие лишних, закрытость словарей, заполненность объективного слоя, ≥1 gameplay-тег у каждого героя, отсутствие дубликатов, детерминизм чтения.
- 🐛 **Два дефекта моей же курации поймал собственный тест.** (1) Тег `control` стоял у **61%** ростера — как условие он ничего не различал; данные приведены к заявленному критерию «дизейбл как ОСНОВНОЙ инструмент» (снят у Drow, Bloodseeker, Riki, Dazzle, Lifestealer, Alchemist, Medusa, Troll, Abaddon, Oracle) → 54%. (2) Одна ассерция была просто неверной. Отсюда два постоянных инварианта в валидаторе: **каждый тег кем-то используется** (мёртвый тег хуже отсутствующего — под него можно написать предмет, который никогда не сработает) и **ни один тег не покрывает ≥60% ростера**.
- **Распределение (для обзора):** атрибуты `str 31 / agi 30 / int 30 / universal 36`; lore — самые широкие `beast 28%`, `dark 26%`, остальные 4–13%; gameplay — `control 54%`, `teamfight 37%`, `pickoff 30%`, `mobility 28%`, `scaling 27%`, далее до `illusion 7%`.
- ⚠️ **Что требует взгляда пользователя.** Объективный слой — **замороженный снимок**, а не зеркало живой Dota: Valve меняла атрибуты (реворк Universal), и файл может расходиться с текущим патчем. Это осознанно: воспроизводимость забега важнее синхронности, иначе data-refresh менял бы смысл уже выданных карточек. `review: true` стоит на трёх новых героях (`131 Ringmaster`, `145 Kez`, `155 Largo`), где классификация наименее уверенная. Lore/gameplay — **продуктовые решения**, а не факты: они определят, какие сборки вообще возможны, поэтому их стоит просмотреть до `R8.3`.

#### R8.2 — Tournament Power ✅ (P3, 2026-07-27; UI-разложение — вместе с R8.3)
- **Цель:** `rosterPower = teamOvr + flatPower`; `teamMult = 100 + additiveMult`; `tournamentPower = rosterPower · (teamMult/100) · Π xMult`. `Team OVR` остаётся объективной оценкой состава и предметами **не умножается**.
- **UI:** слои показаны раздельно (`Team OVR / Additive Mult / X Mult / Tournament Power`), порядок применения фиксирован и видим.
- **Ограничения:** обычные X Mult `×1.10–×1.50`; глобальные `×2` — только редкие risk/reward; босс может отключать отдельный тип множителя; число пассивных слотов ограничено; caps — из `R10`.
- ✅ **Реализовано 2026-07-27.** `game/tournamentPower.ts`: слои `flat` / `additive` / `xMults` с ФИКСИРОВАННЫМ порядком `(teamOvr + flat) × (100+additive)/100 × Π xMult`, капы (`xMultMin 1.10`, `xMultMax 1.50`, жёсткий потолок `2.0` для редких risk/reward), клампинг множителя <1 (источник, роняющий силу, — ошибка, а не «ослабление билда»), и `powerBreakdown` с флагом `trivial`. Team OVR остаётся слагаемым, а не множимым — инвариант закреплён тестом.
- ✅ **Главное содержание задачи — шкала ELO, а не сама формула.** Кривая аддитивна (смотрит на разность), а делитель 22 откалиброван под шкалу `76–99`. `Tournament Power` умножает силу обеих сторон, и на шкале ~180 разрыв в 40 очков означал бы вероятность ≈1: турнир превратился бы в сравнение чисел. `eloDivisorForScale` растит делитель пропорционально шкале **этапа**, поэтому одинаковое ОТНОСИТЕЛЬНОЕ преимущество даёт одинаковую вероятность на любой шкале.
  - Шкалу задаёт ПОЛЕ, а не сила игрока: (а) Quick Draft получает ровно 22 ⇒ golden байт-в-байт (проверено), (б) превосходство игрока над полем не разбавляется — сильная сборка обязана выигрывать. Нижняя граница `max(1, …)` не даёт сжать делитель на слабом раннем поле.
- **Замер.** Текущий пятиэтапный сезон **не сдвинулся ни на десятую** (n=200: naive 28.5%, greedy-power 34.0% — те же числа), потому что там `threat ≤ 1` и шкала ниже опорной. Правка включается ровно там, где сила инфлирует. Длинные сезоны стали труднее: 20 этапов 43% → 30%, 25 этапов 8.3% → 5.0% — на позднем этапе игрок выше поля, и масштабирование честно разбавляет его перевес. Это следствие заявленного принципа, а не побочный эффект; финальная калибровка длины сезона — `R6.4`.
- **Шов для источников.** `game/runStrength.ts` получил `stageStrength(teamOvr, input, { bossPenalty, power })`, через который считают силу и стор, и симулятор. Сегодня `power` пуст ⇒ итог совпадает с прежней суммой до последнего знака. Место подключения введено заранее осознанно: когда появятся предметы, им нужно наполнить слои, а не переделывать композицию силы в трёх местах и попутно шкалу ELO.
- ⬜ **UI-разложение (`Team OVR / Additive / X Mult / Tournament Power`) сознательно отложено до `R8.3`.** Источников у слоёв ещё нет, поэтому панель никогда бы не отрисовалась — это была бы мёртвая вёрстка. Презентационная часть готова (`powerBreakdown` + флаг `trivial`, по которому панель показывается только при активном слое).
- **Deps:** R7.1 ✅ (шкала и ELO-делитель — общий контракт). **Разблокирует:** R8.3 (первый набор предметов), R6.1/R6.4 (длинный сезон невозможен без множительного роста — вывод R10).

#### R8.3 — Первый набор предметов ✅ (P3, 2026-07-27)
- **Цель:** 25–35 качественно связанных Dota-предметов вместо всего списка с поверхностными `+N`. Категории: build-defining, economy, boss protection, scaling, copy/retrigger, risk/reward, scouting, hero-tag synergy. Направление уже согласовано: Hand of Midas, Aghanim's Scepter, BKB, Refresher Orb, Divine Rapier, Gem, Smoke, Helm of the Dominator, Aegis of the Immortal.
- **Закрывает:** PF-4 (economy-пассивки в духе Balatro) вместе с T6.1.
- ✅ **Реализовано 2026-07-27.** `game/items.ts` — **34 предмета** с реальными дотовскими названиями, эффекты выражены в слоях Tournament Power (R8.2) и условны по тегам героев (R8.1). Все шесть категорий представлены: `tagSynergy` (18), `buildDefining` (5), `economy` (4), `bossProtection` (2), `riskReward` (4), `copy` (1).
- **Ключевое проектное решение: предметы НЕ второй инвентарь.** PRD §5.10.1 прямо запрещает заводить рядом с Tactics ещё одно хранилище, поэтому предмет — такая же пассивная карточка и делит ТЕ ЖЕ три слота: тот же список в сейве, тот же карточный оффер в награде. Разница только в том, куда целится эффект — тактика двигает слагаемые Team OVR, предмет — слои силы, экономику или защиту от босса. Team OVR предметами по-прежнему не умножается.
- **Описания генерируются из данных эффекта** (`itemLabel` + шаблоны i18n), а не пишутся руками: иначе текст и число разъезжаются при первой калибровке и карточка начинает врать игроку.
- **Экономика и боссы проведены, а не оставлены декорацией:** `goldPerCamp` уходит в автоматическую выплату, `freeRerolls` начисляются на открытии Буткемпа, `interestCap` поднимает потолок процентов, `bossPenaltyFactor`/`bossPenaltyCap` смягчают штраф (но не отменяют правило).
- ✅ **UI-разложение силы зажглось** — вынесено в примитив `ui/PowerBreakdown` и показывается на экране Буткемпа и на турнирном, **только когда слой активен**. Центр радара теперь показывает Tournament Power: инвариант «видишь то, чем играешь» (`pentagon-team-ovr === tournament-user-strength`) сохранён и покрыт e2e.

**Замер — прямой ответ на блокер R10:**

| | было (без предметов) | стало |
|---|---:|---:|
| `synergy-build`, 5 этапов | 18.0% | **41.5%** (сильнейший агент) |
| `greedy-power`, 5 этапов | 34.0% | 34.0% |
| 25-этапный сезон | 5.0% | **30.0%** |
| 30-этапный сезон | 0.0% | 13.3% |

1. **Билд-архетип из доминируемого стал сильнейшим** — это снимает находку R10 «золотая награда доминирует карточки».
2. **25-этапный сезон стал проходимым.** R10 показывал, что длинный сезон упирался в отсутствие множительного роста; предметы это подтвердили. 30 этапов остаются тяжёлыми (13.3%) — то есть гипотеза PRD про 25 выглядит верной.
3. Смерти под правилом босса у билд-агента упали (`18.0% → 10.5%`) — защитные предметы работают.
- 🐛 **Дефекты, найденные замером и живой проверкой.** (1) `smokeOfDeceit` платил цену в 100% забегов, а выгоду давал при двух stealth-героях (тег у 9% ростера) — карта была не ловушкой, а просто плохой; порог снижен до одного героя, цена урезана. (2) На карточке-НАГРАДЕ предмет не показывал ни описания, ни чисел — сравнить его с «+12 золота» было нельзя (ровно проблема PF-3); теперь показывает эффект, цену и текущий вклад. (3) Слои `boss`/`economy` падали в общий fallback силового слоя, из-за чего `Linken's Sphere` (потолок штрафа босса = 2) подписывался как «Roster +2»; контракт «вид эффекта → слой» закреплён тестом.
- ⬜ **Не входило:** арт карточек (`R8.4`), расширение пула за 34 предмета, `Aegis of the Immortal` как защита от вылета (это правило, а не контент — отдельное решение), scouting-предметы (разведка уже есть Camp Action'ом).
- **Deps:** R8.1 ✅, R8.2 ✅, R10 ✅.

#### R8.4 — Арт карточек ⬜ (P3)
- **Цель:** контракт `artKey: string` в данных карточки сразу; до готовности ассетов — единый placeholder; игровая логика не зависит от наличия файла. Лицензионные ограничения на оригинальные Dota-иконки проверить **до** использования; без подтверждения — собственные стилизованные иллюстрации, вдохновлённые механикой, а не копия защищённого ассета.
- **Не блокирует** механику ни одной задачи вехи.

### R9 — Существующие дефекты
#### R9.1 — Last Dance: сбалансированный пак ✅ (P0, 2026-07-27)
- **Дефект подтверждён.** Пак строится в порядке `Safelane → Mid → Offlane → Support → Support`, а сужение делает `offers.splice(packSize)` по хвосту (`anteMarket.ts:174`). Это не случайное уменьшение рынка, а **систематическое удаление обоих саппортов**.
- **Цель:** тактика уменьшает **количество** вариантов, не запрещая роль: сбалансированная выборка (минимум один core и один support) либо выбор ролей **до** построения офферов.
- **Инварианты:** support-карта может появляться при активной Last Dance; та же `seed/config` даёт тот же сокращённый пак; полный пак без Last Dance остаётся прежним; trade-off не подменяет вероятности скрытым образом.
- ✅ **Реализовано 2026-07-27.** `offers.splice(packSize)` заменён на чистую `balancedPackSlots(roles, packSize, rng)` в `game/anteMarket.ts`: сначала детерминированно берётся один core и один support, остаток добирается шаффлом, результат сортируется по исходному слоту (порядок отображения не меняется). Свой Rng-неймспейс `…:pack-trim-${rerollN}` — поток остальных роллов не сдвинут. Тесты: 4 в `anteMarket.test.ts` (инвариант ролей на 40 seed'ах, вырожденные размеры пака 0/1/5/9, support выживает на каждом реролле живого рынка, сужение детерминировано и удержанные карты идентичны полному паку).
- **Связано:** PF-5 (цена Last Dance выше выгоды) — теперь тактика забирает то, что заявлено; пере-калибровать в `R10`.

- **R9.2 — Рассинхрон частоты боссов** ✅ 2026-07-27 → код и PRD синхронизированы в `R6.2`.
- **R9.3 — Ложные подписи порогов** ✅ 2026-07-27 → инвариант «порог = worst-rank реального бакета» введён и покрыт тестом (см. `R6.4`).

#### R9.4 — Семантика Scouting ✅ (P1, 2026-07-29)
- **Цель:** разведка раскрывает информацию, которой **ещё не видно**, а не повторяет уже показанное правило босса. Сегодня правило и так видно заранее, а scouting сводится к бесплатному рероллу — это честно, но это не разведка.
- ✅ **Что раскрывает теперь:** правило СЛЕДУЮЩЕГО боссового турнира — того, до которого ещё несколько
  этапов. Правило предстоящего этапа остаётся бесплатным и всегда видимым (иначе ломается требование
  PRD «контр-условия заранее адаптируемы»), поэтому разведка смотрит строго дальше: `nextBossStage()`
  ищет ближайший боссовый этап **после** предстоящего. Если предстоящий сам боссовый — раскрывается
  финал следующего акта, то есть карточка не может оказаться пустой.
- ✅ **Знание не теряется.** Раскрыт не «этот Буткемп», а конкретный турнир: панель держится во всех
  последующих лагерях до него, а счётчик «через N этапов» уменьшается. Формат сейва не менялся —
  `scoutedCamps` по-прежнему хранит индексы лагерей, просто читается как «какой этап был раскрыт».
- ✅ **Оценка против текущего ростера**, тем же вычислителем, что и обычный босс: игрок видит не только
  правило, но и `до→после` — то есть сразу понимает, что именно надо докупить за оставшиеся этапы.
  Панель босса вынесена в общий компонент — двух копий одного блока быть не должно.
- **Бесплатный реролл рынка карточка сохранила:** это её вторая, честная половина; убрать её значило бы
  оставить утилитарную карту без немедленной ценности. Подписи (`action.desc.scouting`, `camp.scouted`)
  переписаны — прежняя обещала «раскрывает следующий этап», хотя он и так был виден.
- **Покрытие:** юнит на `nextBossStage` (в том числе за пределами сезона, для Династии) + e2e на
  детерминированном seed `camp-e2e-150` (карточка Scouting выпадает наградой первого Буткемпа):
  до разведки панели нет, после — есть, и в следующем лагере это тот же босс.
- **Связано:** T5.3 («тесная связка scouting↔boss — потенциальный полиш»).

### R10 — Full-run симулятор ✅ (P2, 2026-07-27; расширение T6.3)
- **Цель:** симулятор обязан играть **легальный полный забег** до фиксации цен, odds и порогов сезона.
- **Должен учитывать:** качества героев и ручное улучшение, Tactics/Items, Camp Actions, формы игроков, резерв, дорожающий reroll, interest, boss conditions, Tournament Power, 25 этапов, Династию, Stakes. Cheat Mode — отдельный **исключённый** профиль.
- **Стратегии агентов (минимум 7):** random · greedy Team OVR · greedy Tournament Power · economy-first · synergy/build-aware · static roster control · oracle upper bound.
- **Метрики по каждому этапу:** survival rate; распределение мест; `p50/p90/p99` по Team OVR, Tournament Power и золоту; число покупок и реролов; средние качества; число активных пассивок; доля забегов с ранней Peak-формой; причины поражения; число решений до победы.
- **Калибрует:** `20 vs 25 vs 30` этапов · пороги · кривую поля · odds форм · цены · odds качества · reward-экономику · прогрессию reroll · severity боссов · Stakes.
- **Отдельно измерить (турнирная дисперсия ≠ Balatro):** вероятность топ-8 / топ-4 / топ-1 при заданной разнице силы, влияние seed и сетки, частоту поражения сильной сборки из-за одной неудачной симуляции. Если дисперсия окажется чрезмерной — отдельной задачей рассмотреть один защитный ресурс за акт, но **не добавлять заранее без статистики** (PRD §10.I).
- **Гейт релиза:** ни одно число из `R4`/`R5`/`R6.4`/`R7`/`R8.2` не фиксируется как финальное до прогона.
- ✅ **Реализовано 2026-07-27.** `scripts/sim_run.ts` переписан: играет легальный полный забег — берёт награду, разыгрывает Camp Actions, покупает на рынке, реролит, поднимает качество героев, и **считает силу тем же слоем, что игра**. Агентов семь: `static` (контроль) · `random` · `naive-ovr` · `greedy-power` · `economy-first` · `synergy-build` · `greedy-oracle`. Метрики: win%, survival по каждому этапу, `p50/p90/p99` силы и золота, покупки/реролы/улучшения на Буткемп, число тактик, доля смертей под правилом босса. Флаг `--seasons` сравнивает сезоны 20/25/30 этапов — прямой вход для `R6.1`/`R6.4`.
- 🐛 **Корневая причина недостоверных замеров устранена, а не залатана.** Сумма слоёв силы (`economy + tactics + rarity`) существовала **тремя** копиями: в сторе, в пути resume и в симуляторе. Копия симулятора не знала ни про редкость, ни про тактики — то есть он мерил заведомо более слабый билд, а по его числам калибровались коэффициенты. Композиция вынесена в `game/runStrength.ts`, все три потребителя зовут её, инвариант закреплён тестами.
- 🐛 **Дефекты агентов, пойманные до выводов.** Первый прогон дал «оракула» слабее наивного агента — это был не результат про игру: (1) выбор по отдаче-на-золото при бюджете Буткемпа 6–11 систематически набирал дешёвые улучшения качества вместо крупной замены — заменено на выбор по максимальному приросту; (2) приоритет карточек лишал агента золота. Пока агент не осмысленнее случайного, его числами калибровать нельзя.

**Измеренный профиль (текущая лестница, 5 этапов, n=200):**

| агент | win% | survival по этапам | сила p50/p90/p99 |
|---|---:|---|---:|
| static (контроль) | 0.0% | 100 89 66 31 7 | 80/86/89 |
| random | 3.0% | 100 89 72 36 16 | 82/89/94 |
| naive-ovr | 28.5% | 100 89 78 70 61 | 95/102/107 |
| greedy-power | **34.0%** | 100 89 78 68 59 | 97/105/109 |
| economy-first | 21.0% | 100 89 66 55 46 | 90/100/106 |
| synergy-build | 18.0% | 100 89 79 64 47 | 90/100/106 |
| greedy-oracle | 33.0% | 100 89 78 68 59 | 96/105/109 |

**Что это говорит про баланс (входы для калибровки, реализация — отдельными задачами):**
1. ⚠️ **Золотая награда доминирует карточки и токены.** Агент с приоритетом билд-карт (`synergy-build`) выигрывает 18% против 34% у того же агента с приоритетом золота. Структурно набор `R4.3` не доминируем (три разных вида пользы), но практически золото сильнее — это прямая мишень калибровки `T6.1`/`R8.3`, а не опровержение схемы наград.
2. **Учёт редкости в оценке покупки стоит ~5.5pp** (28.5% → 34.0%) — редкость реально работает как ось силы.
3. ⚠️ **Накопление ради процентов не окупается:** `economy-first` 21% против 34%. `interestCap = 3` слишком мал, чтобы оправдать удержание 12 золота.
4. **Смерть под правилом босса — 18–22% забегов** у сильных агентов: боссы давят, но не доминируют.

**Сравнение длины сезона (`--seasons`, n=60) — ключевой вход для `R6.1`:**

| сезон | greedy-power win% | greedy-oracle win% |
|---|---:|---:|
| 20 этапов (4 акта) | 43.3% | 41.7% |
| 25 этапов (5 актов) | 1.7% | 8.3% |
| 30 этапов (6 актов) | 0.0% | 0.0% |

⛔ **Вывод, который надо принять до `R6.1`: 25-этапный сезон на текущих коэффициентах непроходим.** Причина видна в метриках: сила билда **насыщается около 123–129** (p50/p99 почти совпадают) — потолок аддитивный и конечный (пул игроков, caps редкости, слоты тактик), — а угроза акта продолжает расти. Это ровно то поведение, которое задумано для Династии, но оно означает, что длинный сезон **невозможен без мультипликативного слоя роста игрока (`R8.2`)**. То есть порядок `P3` перед финальной фиксацией 25 этапов — не пожелание, а следствие замера.

Дополнительно: 🔸 **золото убегает** на длинных сезонах (`p90` доходит до 300–600) — сегодняшних sink'ов не хватает, это подтверждает отложенный в `R4.3` пункт про late-game sinks; 🔸 **лестница внутри акта почти не работает** — кривые выживаемости плоские внутри акта (`62 62 62 62 62`), все смерти приходятся на его финал, то есть пороги `8/8/6/4` для собранного билда бесплатны (мишень `R6.4`).
**Калибровка 2026-08-23 (`b1.36.0`, n=400, одни сиды).** Аудит баланса по запросу: `synergy-build` выигрывал сезон в **64.3%** (полоса PRD 30–40%), причём после 6-го этапа **не умирал вообще** — survival 64% плоско до 25-го, финалы актов S10–S25 по 100%. Дамп силы по этапам показал причину: Tournament Power билда к 25-му этапу ×2.65 p50 (additive +28%, X Mult ×2.07; p90 ×2.85 — Divine Rapier + Refresher + Aghanim's + Smoke), а угроза поля росла только аддитивно (+36 к 5-му акту) — поле отставало структурно, ровно та «мультипликативная часть», что R7.2 отложил до R8.2. Исправление — `ANTE_THREAT.multPerAct` (геометрический множитель поля по пройденным актам, `FieldModel.mult`). Офлайн-свип по дампу (логистическая модель «пройти порог ↔ z-разрыв») сузил кандидатов, подтверждение — реальным симом на тех же 400 сидах:

| `multPerAct` | synergy-build | greedy-power | survival st6→st25 (synergy) | финал S25 |
|---|---:|---:|---|---:|
| 0 (b1.35.0) | 64.3% | 8.3% | 64 … 64 (плоско) | 100% |
| 0.20 | 42.5% | 0.0% | 64 → 49 | 86.7% |
| **0.22 (взято)** | **35.8%** | 0.0% | 64 → 44 | 81.7% |
| 0.25 | 23.8% | 0.0% | 64 → 31 | 76.0% |

Агенты без предметов (`greedy-power`/`greedy-oracle`, плато ~128 без множителей) теперь гибнут в актах 2–3 — предметы обязательная ось поздней игры, как и задумано R8.3 (до предметов 25 этапов были непроходимы вовсе). Акт 1 не тронут (множитель = 1 до первого пройденного акта) — e2e-сиды камп-тестов и golden Quick Draft не двигаются. Побочно: лагеря актов 4–5 снова «осмысленны» (лучшая дельта 0.54/0.30 против 0.36/0.28 — деньги опять нужны).

🔎 **Две находки из дампа Династии (2026-08-24, 200 сидов, инструментированный sim).**
1. **Смерть стоит не на кульминации, а на первом этапе нового акта.** Из 69 смертей в Династии 30 приходятся на `stage % 5 == 0` — этап сразу после взятого титула, с самым мягким порогом (топ-8). Причина структурная: множитель поля растёт ступенькой на границе акта (+22%), а сила билда за один этап так не прибавляет — отношение «сила ÷ поле» падает с 1.21–1.25 до 1.06–1.11, и `pass` проваливается до 0.50–0.58. По порогам: топ-8 — 25 смертей, топ-6 — 21, топ-1 — только 12. Драматургически это худший вариант: игрок гибнет на проходном турнире после чемпионства. Кандидат на правку — распределить рост множителя по этапам акта с сохранением средней сложности (`q^(stage/actLength − 0.4)` вместо ступеньки); по свипу глубину это почти не двигает (эффект ±1 этап), то есть правка чисто про подачу, и делать её надо отдельным замером, чтобы не смешивать с калибровкой шага.
2. **Награда за титул Династии мертва в поздней игре.** `ECONOMY.dynastyMilestone` даёт золото и бесплатное улучшение качества, но в актах 4–5 качество уже на максимуме у 96–97% забегов, слоты полны у 100%, а золото копится (56 при 0.37 покупок на лагерь). То есть титул — главная награда фазы — не конвертируется ни во что. Кандидаты (PRD §5.9.3 разрешает только замены/sidegrade/экономику): бесплатный trade-in с переносом тира (LG1) вместо улучшения, либо перевод неиспользованных токенов в реролл мутатора круга. Требует продуктового решения, не подгонки числа.

✅ **Ступенька множителя сглажена рампой внутри акта (`b1.39.0`, 2026-08-24).** Закрывает находку «смерть стоит на первом этапе нового акта» (43% смертей Династии на самом мягком пороге, сразу после титула): `anteFieldMult` теперь рампа `q^(acts + (stageInAct − 0.6·L)/L)` вместо ступеньки. Инварианты: акт 1 ровно 1 (сезонное начало, e2e-сиды и golden не тронуты), кривая строго неубывающая (включая стык сезон → Династия: дробная часть первого акта Династии идёт династийным наклоном — симметричная версия давала микропровал), жёстче плоского уровня — только финал акта. **Урок калибровки:** симметричный центр 0.5 (чистое сохранение геосреднего акта) уронил полосу 35.8 → 26.0% — «жёстче хвост» бьёт по этапам с жёсткими порогами (финалы: топ-4…1) дороже, чем «мягче вход» компенсирует на топ-8; сохранение геосреднего ≠ сохранение сложности при нелинейной вероятности прохода. Центр откалиброван свипом реальным симом (400 сидов): 0.5 → 26.0, 0.55 → 28.7, **0.6 → 32.5%** (полоса 30–40 ✓), глубина Династии 5/20/31 (хвост не хуже LG6). Гистограмма смертей (200 сидов, контроль на зашитом центре): вход в акт **43% → 11%** в Династии и 0% в сезоне; модальная смерть — финал акта (23/65 и 36/61) — гибель переехала на этапы с именем. Итоговая цена: геосреднее акта мягче плоского на q^0.1 — это и есть возврат полосы, зафиксировано контрактом в тестах (`multRampCenter`).

✅ **LG6 — титул Династии платит токеном зачарования (`b1.38.0`, 2026-08-24).** Ответ на находку «награда за титул мертва» и настоящий рычаг хвоста после потолка `b1.37.0`: улучшение качества в `ECONOMY.dynastyMilestone` заменено **токеном зачарования** — игрок сам вешает Edition (⚡ Charged / 🛡 Tempered) на экипированную карту без Edition. Это единственная ось билда, которой в Династии ещё есть куда расти (рост 1.007/акт — потому что качество на максимуме у 97%, слоты полны); потолок естественный: слоты × 1 Edition, заряды капятся по тиру, а после trade-in (1.77/лагерь в Династии) новая карта приходит чистой — отложенный токен снова находит цель, оси начинают играть вместе. Реализация: `editionTokens` в `RunEconomyState` (optional — legacy-сейв читается нулём), `enchantCard(cardId, edition)` + `enchantableCards()` в RunEconomy, экшен стора с пересборкой рынка (зачарование меняет пул edition-офферов рулетки), UI — баннер токенов и кнопки выбора оси на карте во вкладке Build (кнопки видны только при токене и только у карт без Edition; после клика исчезают — это и есть подтверждение). Симулятор тратит токены той же минимальной эвристикой у всех агентов (Charged первой чистой карте). Замер (`sim -- 400 --dynasty`, одни сиды):

| версия | глубина p50 / p90 / max | сезон |
|---|---|---|
| b1.37.0 | 5 / 12 / 19 | 35.8% |
| **b1.38.0** | **5 / 17 / 31\*** | **35.8%** |

Сезон не тронут по построению (первый титул — этап 30) и подтверждён идентичным профилем. Медиана стоит (ранняя Династия решается дисперсией до первого титула), p90 12 → 17, а \*31 — **потолок окна замера** (guard цикла симулятора), то есть лучшие ~5% забегов переросли инструмент; контрольный прогон с окном 60 (200 сидов) подтвердил конечность: max 26 < 60, все 69 Династий закончились Loss — ось даёт хвост «исключительным» (20+ этапов достигнуты, цель PRD §5.9.3), но не бессмертие: заряды капятся, и после насыщения всех карт множитель поля снова обгоняет билд. Charged-охват вырос: 70 забегов с Charged, 2.19 карты в билде (было 36/1.12). Cheat Mode токены не трогает (это слоты/Edition, не золото).

✅ **Хвост Династии удлинён своим шагом множителя (`b1.37.0`, 2026-08-24, A/B 400 сидов).** Запрос: «исключительная сборка должна уходить дальше». Дамп 200 сидов показал, ПОЧЕМУ хвост короткий: сила билда прибавляет за акт `1.53 / 1.50 / 1.24 / 1.26 / 1.05` по актам сезона и **1.007** в Династии (слоты полны, качество на максимуме, живёт заменами) — то есть чистое давление `поле ÷ рост билда` в Династии `1.21` против `0.98–1.17` в сезоне, самое высокое в игре. Введён `ANTE_THREAT.dynastyMultPerAct` — тот же геометрический множитель, но своим шагом за пределами сезона; на границе сезона кривая непрерывна (уровень тот же, меняется наклон).

| шаг Династии | глубина p50 / p90 / max | сезон (synergy-build) |
|---|---|---|
| 0.22 (= сезонный, b1.36.0) | 5 / 10 / 16 | 35.8% |
| 0.16 | 5 / 11 / 18 | 35.8% |
| **0.14 (взято)** | **5 / 12 / 19** | **35.8%** |

Медиана не двигается ни при одном шаге (её решает дисперсия первых кругов) — растёт именно хвост, как и требовалось. Сезонная полоса не может поехать по построению (множитель внутри сезона не тронут) и подтверждена идентичным профилем во всех трёх прогонах. Фаза остаётся конечной: все 143 продолжения закончились Loss, смертей под боссом 4.2% → 5.6%. Ниже 0.14 не пошёл: `0.14/1.007 ≈ 1.13` ещё держит Династию тяжелее середины сезона (0.98), а более пологий шаг сделал бы её легче — это уже не «хвост для исключительных», а общее облегчение фазы. **Потолок числового рычага достигнут:** дальше глубину ограничивает не поле, а нулевой рост билда — см. находку про мёртвую награду за титул.

✅ **Династия под множителем конечна (замер 2026-08-23, `sim -- 400 --dynasty`).** Из 143 выигравших сезон Династия длится **p50 5 · p90 10 · max 16** этапов (акт–три), и **все 143 забега закончились поражением** — «штатный финал = Loss» (PRD §5.9.3) впервые обеспечен числами: на b1.35 Династии доживали до потолка замера 31 и фаза фактически не заканчивалась. Смерть приносит поле (под боссом лишь 4.2%): множитель к акту 8 — ×4.0 против потолка билда ×2.85. Экономика ведёт себя как задумано: покупки на лагерь падают 0.84 → 0.38 (билд насыщен), сборы/trade-in растут 0.41 → 1.64 — поздняя Династия живёт заменами, не аддитивным ростом. Ориентир PRD «исключительная сборка уходит на 20+» (текст эпохи 5-этапных кругов) в 400 сидах не достигнут (max 16 = 3+ акта) — если захочется длиннее хвост, рычаг отдельный (например, свой шаг множителя в Династии), не трогая сезонную полосу.

✅ **Полоса подтверждена независимым A/B 2026-08-23 (после RT-D/RT-E, тот же датасет).** Чистое дерево на `HEAD` против файлов `b1.35.0` (`anteRun/balance/tournament` из `e8ba37c^`), `npm run sim -- 400`, одни сиды: `synergy-build` **64.3% → 35.8%** — воспроизведено в точности (сим детерминирован; RT-правки roguelite-веток не трогают). Статистика: при n=400 станд. ошибка ≈2.4pp ⇒ 95%-интервал 31–41% — полоса PRD 30–40% выдержана, середина. Кривая наклонная во всех актах (64→61→57→53→44), финал S25 снова решает (81.7% из дошедших), смерти под боссом у билд-агента 0.8%. Профиль остальных без сюрпризов: random 3.0→0%, greedy-oracle 8.8→0% (умирают в актах 2–3), static/naive/economy 0→0. Деньги перестали копиться мёртвым грузом: золото в лагерях акта 4 — 64.8 → 32.4, акта 5 — 87.8 → 56.3.

- ⬜ **Не покрыто (систем ещё нет):** Tournament Power (`R8.2`), Stakes (`T6.4`), Династия (`T5.8`), Cheat Mode как исключённый профиль (он и так не влияет на баланс — золото бесконечно по определению).
- ✅ **Перекалибровка под агента с отбором карт (b1.44.0, 2026-09-02).** A/B Playbook вскрыл, что все билд-агенты брали карточные награды вслепую; `select-build` (карта только при приросте силы сейчас) выигрывал 52.7% при полосе PRD 30–40%. Свип `ANTE_THREAT.multPerAct` на 300 общих сидах: 0.22 → 52.7%, 0.25 → 45.7%, **0.28 → 35.0%** (S25 43%, boss-death 9.3%), 0.32 → 23.3%. Династия: `dynastyMultPerAct` 0.14→0.22 по свипу `--dynasty` (100 сидов): 0.18 → p50/p90 13/30, **0.22 → 10/26**, 0.26 → 10/24, во всех вариантах гибнут 35/35. Акт 1 не тронут (рампа с первого пройденного акта) — e2e-сиды и golden на месте. Побочный эффект, который надо знать: слепой synergy-opt упал 39.3% → 15.3% — игра стала требовать выбора карт, а не их сбора; живой плейтест на актах 3–5 — следующий гейт.
- ✅ **Агентский UI-проход актов 3–5 после b1.44–b1.46 (2026-09-05, Playwright на 5273, реальный датасет).** Гейт «живой плейтест» закрыт агентом лишь частично: бот с политикой «карта в награду, плюсовые покупки, качество, тир» без trade-in, синков, сборов и рероллов рынка. Честный забег (`camp-e2e-39`) без карт гибнет на 4-м этапе — как слепые агенты сима. Cheat-режим (∞ золото, `cheat-e2e-17` и `camp-e2e-39`): билд 5/5 refined уже к 5-му этапу, дальше 10 лагерей подряд без покупок (buys=0), Run power плато 172–193, гибель на этапах 15 и 18 (финал акта 3 / элита акта 4: поле 205–218 против 193). Это потолок бота, не баланса — сим `select-build` с trade-in/синками выигрывает 35%; **человеческий плейтест актов 3–5 по-прежнему нужен**.
  **Находки UI (кандидаты, по убыванию):** (1) ✅ 2026-09-05 — «+0.» вместо «+0.7» на пентагоне: не клип и не наложение подписей (bbox не пересекались), а цифра поверх пересекающей линии ТОГО ЖЕ цвета `--chem-line`; подписи вынесены отдельным слоем над всеми линиями и получили ореол цветом фона панели (`paint-order: stroke`); (2) ✅ 2026-09-05 — после поражения у баннера «Eliminated» теперь те же два действия («Новый забег · те же настройки / изменить»), что внизу экрана ~3800px; (3) описания карт в слотах билда обрезаются посреди слова («…gameplay ta») — резать по границе слова или клампить в 2 строки; (4) в cheat-режиме карьера на экране итога показывает нули и пустой список — по замыслу (чит вне статистики), но объяснения на месте нет; (5) резерв на глубине — все замены с отрицательной силой занимают панель целиком. Скриншоты — scratchpad сессии 2026-09-05.
- **Deps:** T6.3 (инструмент существует), R3–R7 ✅.

### R11 — Playtest 2026-07-28: мёртвые карты, качество пассивок, цена тира ✅
Три пункта из отчёта пользователя по скриншотам Буткемпа. Общая нить: качество (rarity) уже было
осью силы, но рынок про неё не знал, а карточки её не имели.

- ✅ **R11.1 — нижняя граница hero-пака (`HERO_FLOOR`).** У player-пака порог был с `b1.6.0`
  (`FORM_FLOOR`), у hero-пака — нет. Назначение героев оптимально по Hungarian, поэтому случайный
  герой из shortlist почти всегда даёт минус: на позднем составе пак вырождался в «−2 Team OVR за
  12 золота» и съедал дорожающий реролл (`R4.2`). Порог считается по **полной** дельте, включая
  редкость, и пак никогда не пустеет (не хватило проходных — добираем лучшими из отсеянных).
- 🐛 **R11.1 — рынок предлагал снести immortal.** `bestHeroOption` выбирал снимаемого героя по
  чистому `score.ts`, а вклад редкости живёт слоем поверх него. Из-за этого карты систематически
  целились в самого редкого героя: замена immortal→mythic читалась как выигрыш, хотя стоила −2.0.
  Тот же класс расхождения «превью считает не то, что применяет покупка», что уже ловили в `R4.1`.
  **Замер** (6 seed × 2 этапа, состав «immortal + 3 mythic»): мёртвых карт 26/60 → 0/60, карт со
  сносом immortal 10/60 → 0/60.
- ✅ **R11.2 — качество карточек-предметов (`ITEM_RARITY`).** Слотов три и они не растут, поэтому
  без тира билд замерзал после третьей карты — тот же потолок, в который упирается рынок игроков.
  Тир масштабирует **числа** эффекта; `drawback` не масштабируется, то есть высокий тир даёт лучшее
  соотношение пользы к цене, а не пропорционально раздутую карту. Лестница общая с героями
  (`game/rarity.ts`), мета-гейт тот же (`rarityDropsEnabled`). X Mult растёт избытком над 1 и
  клампится в `POWER_LIMITS.xMultHard`; антибоссовые карты не доходят до иммунитета.
- 🐛 **R11.2 — описание и вклад разошлись.** Карточка в слоте брала тир для описания, но не для
  разложения вклада: «+7.5% mult» в тексте против «Mult +6%» чипом. Поймано ручным проходом,
  закрыто e2e-тестом, который сравнивает первое число описания с первым числом вклада.
- ✅ **R11.3 — цены редкости героев.** Снят инвариант `R4.1` «купить готовый тир = вырастить из
  common»: он приравнивал пути по золоту, молча считая смену героя бесплатной. Она не бесплатна
  (пересборка matching + потеря career-связки), а стартовая пятёрка досталась даром, поэтому грайнд
  реально шёл от нуля. Плюс цена улучшения за единицу силы шла `5.0 → 6.25 → 4.0`: самый сильный шаг
  был самым дешёвым и доминировал любую трату. Теперь `upgradeCost` = `3/5/14` (за очко
  `5.0 → 6.25 → 7.0`), `heroPrice` = `4/6/10/20`, новый инвариант — **купить готовое дешевле, чем
  вырастить** (`6<7`, `10<12`, `20<26`): премия платится за гарантию.
- 🐛 **R11.2 — симулятор не видел тира карточек.** Четвёртое место, где `evaluateItems` звалось без
  редкости (`scripts/sim_run.ts`), — то есть `R10` калибровался бы по билду слабее играемого. Ровно
  тот же дефект «нескольких копий композиции силы», который `R10` уже чинил для редкости героев и
  тактик. Закрыто структурно: `ItemContext.cardRarity` сделан **обязательным**, так что забыть его
  в `src` теперь нельзя (ошибка компиляции). `scripts/` и `test/` вне `tsconfig.include` — там
  правится руками, это отдельная дыра.
- **Профиль почти не сдвинулся** (`npm run sim -- 300`, b1.12.0 → b1.13.0): naive 29.0% → 30.3%,
  greedy-power 34.0% → 33.0%, economy-first 22.0% → 22.7% — в пределах шума. Заметно вырос только
  билд-агент: synergy-build 43.3% → **45.0%** (он единственный берёт карточки, и тир теперь
  засчитывается). Это ожидаемо: правки чинят качество решений и цену выбора, а не сложность.
- ✅ **Платный тир предмета (b1.46.0, 2026-09-02).** В слоте билда — кнопка «Тир → Refined · N золота» с приростом силы; только standard → refined (×1.25), exotic/arcana остаются дропом/наградой-улучшением; цена 4 с эскалацией ×(1+0.75·n) за каждую купленную ступень забега (`ITEM_RARITY.refinedCost`, `ECONOMY.itemUpgradeEscalation`, `RunEconomyState.paidItemUpgrades`). Сим (300 сидов, `select-build`, `NOITEMUP=1` — A/B): любой платный путь до exotic давал **52–61%** и 5–12 покупок за забег при цене 4/7/12 … 12/21/36 и даже с гейтом по кривой редкости — золото уходило в тиры целиком, рычаг доминировал; refined-only с эскалацией — **42.3%** (было 35.0), а «слепой» synergy-opt **15 → 33%**: дешёвый ограниченный рычаг помогает слабым билдам сильнее, чем оптимальным. Первая кнопка в слоте вылезала за карточку под соседний слот (клик перехватывался) — вынесена в свою строку под шапкой. В отчёте сима — строка «Тиры предметов».
- ⬜ **Не входило:** тир у карточек Tactics (у них своя модель эффекта). Пере-калибровка самих чисел — `R10`.
- **Deps:** R4.1, R5.1, R8.2, R8.3.

### R11.4 — Верхние тиры были невозможны на ранних этапах ✅ (плейтест 2026-07-28)
- **Жалоба:** «редко падают пассивки с качеством», «вообще перестали падать герои разного качества».
- **Проверка сначала, вывод потом.** Мета-гейт исправен (`rarityDropsEnabled` ставится на старте
  забега, до любого Буткемпа), путь дропа исправен, распределение по рынку здоровое: на 200 картах
  этапов 1–5 было common 45.5% · unique 36.5% · mythic 14.5% · immortal 3.5%. Конкретный случай на
  скриншоте — обычная дисперсия: на этапе 1 шанс вытянуть 5 common подряд ≈13%, и реролл на том же
  этапе сразу дал unique.
- 🐛 **Но замер вскрыл настоящий дефект.** Веса были `mythic = max(0, s-1)`, `immortal = max(0, s-3)`:
  на первом Буткемпе mythic **невозможен**, immortal — до четвёртого этапа. Это ровно та «жёсткая
  привязка тиров к актам», которую `R5.1` уже отверг для форм игроков: редкая сильная карта обязана
  иметь шанс выпасть рано (принцип Balatro). Одна лестница не может следовать принципу для форм и
  нарушать его для качества.
- ✅ **Починено:** веса заданы «на сотню» с ненулевым полом верхних тиров и потолком роста (чтобы
  длинный сезон `R6.1` не выродился в immortal-фарм). Замер после: рынок common 38.5% · unique 38.5%
  · mythic 16.5% · immortal 6.5%; на первом Буткемпе mythic+immortal ≈4.7% вместо строгого нуля.
  `BALANCE_CONFIG_VERSION b1.13.0 → b1.14.0`.
- ✅ **Свечение по качеству.** Тир карточки читался только бейджем и тонкой рамкой. Введён общий
  `[data-rarity-glow]` — ОДИН блок на все карточки с тиром (предмет в награде, предмет в слоте,
  hero re-pick, улучшение героя), цвет только через токены `--rarity-*`; bespoke-правила на
  `.camp-slot--item` и `.camp-rarity-card` сняты в его пользу. Immortal светится заметно ярче
  остальных: это событие забега, а не «ещё один тир».
- **Deps:** R11.2.

### R11.5 — Своя шкала качества у пассивок и читаемые описания ✅ (плейтест 2026-07-28)
- ✅ **У предметов своя шкала имён и палитра.** Механическая лестница остаётся ОДНА (`rarity.ts`) —
  это рычаг баланса, раздваивать его нельзя. Отличается только чтение: `standard · refined ·
  exotic · arcana` и палитра `--card-tier-*` (бирюза → оранжевый → **красный** на вершине) против
  героической `--rarity-*` (синий → фиолетовый → золото). Иначе «мифический герой» и «мифический
  предмет» слипались бы в одну сущность. Красный больше нигде в гамме не означает «хорошо», поэтому
  верхний тир читается как исключение, а не как очередная ступень.
- ✅ **У тактик — свой цвет (`--card-tactic`), без градации.** Качества у них нет по построению
  (своя модель эффекта), и нейтральная рамка читалась бы как «предмет нулевого тира».
- 🐛 **Описание тактики печатало литеральный `{n}`.** Плейсхолдеру никто не передавал значение:
  строки были статическими, а числа жили в `TACTICS`. Предметы этот класс ошибки уже решили
  (описание собирается из данных эффекта) — тактики просто остались в стороне. Добавлен
  `tacticLabelParams`, тексты переписаны на конкретику («+2 Chemistry, пока в составе нет игрока с
  OVR 88+» вместо «состав без суперзвёзд получает Chemistry»). Тест проверяет, что ни в RU, ни в EN
  не остаётся ни одной фигурной скобки.
- ✅ **Тактика показывает, что даст ПРЯМО СЕЙЧАС** — как предмет. Без этого «+Chemistry за сыгранные
  пары» было не с чем сравнить при выборе против «+6 золота». Превью считает стор через тот же
  `buildTacticContext`, что и боевой расчёт: второй копии контекста заводить нельзя (R10).
- ⬜ **Не входило:** тир у самих тактик (их эффект — условие, а не число, которое можно
  отмасштабировать) и описания Camp Actions — у них плейсхолдеров нет.
- **Deps:** R11.2, R11.4.

### R11.6 — Вёрстка карточек Буткемпа при сжатии ✅ (плейтест 2026-07-28)
- **Жалоба:** «с этой карточкой в принципе проблемы» — на карточке улучшения героя кнопка `Upgrade`
  уезжала за границу, а в состоянии `Max rarity` портрет вылезал за левый край.
- 🐛 **Две причины, обе пойманы ЗАМЕРОМ, а не глазом** (на глаз это единицы пикселей, которые
  замечаешь только на конкретной ширине окна):
  1. `HeroThumb` (капсула `pill`) не имела `max-width`/`min-width: 0`, а имя — `white-space: nowrap`.
     Длинное имя («Shadow Demon») распирало капсулу шире карточки, и при `align-items: center`
     она вылезала в ОБЕ стороны. Починено в примитиве `ui/HeroThumb.module.css` — выигрывают все
     экраны, где он используется.
  2. Строка «цена + кнопка» не переносилась: при карточке 114px кнопка выходила за край на 23px.
- 🐛 **Корень глубже частных карточек:** `.camp__pack` и `.camp__rarity-grid` были жёстко
  `repeat(5, minmax(0, 1fr))`, поэтому между 980px и широким экраном пять карт ужимались до 76px,
  и содержимое честно вылезало. Переведены на `auto-fit, minmax(148px, 1fr)`: сетка переносит
  карты, а не давит их ниже читаемой ширины; на широком экране по-прежнему пять в ряд.
- **Проверка:** замер «выход любого потомка за границы карточки» на 375 / 1000 / 1100 / 1280 —
  везде 0 (до правки на 1100 было 23.1px), горизонтального скролла страницы нет.
- 🐛 **Догон 2026-07-29: `auto-fit` оказался неверным выбором на ряде переменной длины.** Он
  схлопывает пустые треки, поэтому после покупки игрока оставшиеся четыре карты растягивались на
  всю ширину ряда, пока соседний ряд героев стоял пятёркой. Ширина карточки не должна зависеть от
  того, сколько предложений осталось, → `auto-fill` в `.camp__pack`, `.camp__rarity-grid` и
  `.camp__reserve-grid`. Раскладку с полным рядом это не меняет: экономколонка Буткемпа ≤871px, а
  шестой трек по 148px требует ≥928px — то есть больше пяти треков не возникает ни на одной ширине.
- 🐛 **Догон 2026-07-29: карточка награды в диапазоне 430–680.** Там она раскладывается в строку, а
  `Button variant="primary"` живёт с `width: 100%` (примитив рассчитан на колонку). В строке этот
  процент становится флекс-базой: кнопка забирала всю карточку, тексту оставалось ~60px («Training
  block» ломался по слову в строку) и кнопка налезала на текст. В строчной раскладке кнопка идёт по
  контенту (`width: auto; flex: 0 0 auto`). Урок общий: **`width: 100%` у примитива — это контракт
  «я в колонке»**, и любой экран, кладущий его в строку, обязан его снять.
- ✅ **Заодно:** у предмета бейдж тира показывается ВСЕГДА, включая базовый. Отсутствие бейджа
  читалось как «у этой карточки качества нет вообще» — именно так игрок и понял standard-предмет
  (`Linken's Sphere`). У героя базовый тир по-прежнему скрыт: common — норма состава.

### R11.7 — Теги героев не видны в UI ✅ (плейтест 2026-07-28; все три пункта закрыты, статус сведён 2026-08-11)
- **Жалоба:** «карточка пишет, что нужны иллюзионисты, но у героя нет пометки, что он иллюзионист».
- **Суть:** теги (`R8.1`, 127 героев, три слоя) существуют только в данных и в условиях предметов.
  Игрок видит «+9.6% за героя с тегом illusion», но не может посмотреть на свой состав и понять,
  сколько таких у него есть, — то есть условие карточки непроверяемо глазами. Это делает весь
  tag-слой (18 из 36 предметов — `tagSynergy`) непрозрачным.
- **Предложение (не реализовано):** (1) чипы тегов на карточке героя в Буткемпе/драфте — только
  gameplay+lore, объективный слой уже виден по атрибуту; (2) на карточке предмета подсвечивать,
  КТО из активных героев подходит под условие, — это полезнее абстрактного списка тегов и напрямую
  отвечает на вопрос «сработает или нет»; (3) фильтр/подсказка по тегу в справочнике героев.
- **Риск, который надо решить до реализации:** у героя в среднем несколько gameplay-тегов, и
  вываливать их все на карточку — шум. Скорее всего показывать надо не «все теги героя», а
  «теги, которые сейчас во что-то играют» (есть карточка с таким условием).
- ✅ **Пункт (2) реализован 2026-07-28 — подсветка подходящих героев на карточке предмета.**
  `effectMatch(effect, ctx)` в `items.ts` — чистая функция, считает из ТЕХ ЖЕ `countTag`/`countAttr`/
  `distinctGameplayTags`, что и сам эффект, поэтому подсветка не может разойтись с числом. Карточка
  показывает портреты активных героев, включающих условие, — и в награде, и в занятом слоте.
  Отдельно разобраны все виды условий: «за каждого с тегом» (герои сверх `cap` подсвечены, но
  подпись честно говорит «N из M»), порог `xMultOnTag` («нужно N»), `xMultWithoutTag` (подсвечены
  НАРУШИТЕЛИ — именно они выключают карточку, подпись опасным цветом), `diversity` (счётчик разных
  тегов вместо портретов), и «условия нет» — тогда строки нет вовсе. У карточек с `drawback`,
  условным по героям, вторая строка показывает, за кого платится цена.
- ✅ **Пункт (1) реализован 2026-07-28 — чипы тегов на карточке героя, но с РАЗНЫМ правилом на
  разных экранах.** Риск выше («вываливать все теги — шум») подтвердился замером: у героя в среднем
  **4.12** тега (lore 1.22 + gameplay 2.9), максимум 6. Поэтому:
  - **справочник героев** — весь набор (атрибут + lore + gameplay). Здесь герой и есть предмет
    разговора, вопрос игрока — «какой это герой»;
  - **Буткемп (hero re-pick и улучшение героя, карточки ~148px)** — только теги, по которым СЕЙЧАС
    есть условие у экипированных карточек (`conditionAxes`). Обычно 0–2 чипа, чаще ноль: вопрос в
    Буткемпе другой — «этот герой кормит мой билд?». Проверено живьём: с Manta Style в слоте чип
    `illusion` виден ровно у одного героя из пяти, остальные карточки чисты.
  - Примитив `ui/TagChips` презентационный (локализация снаружи, как у `RoleTag`); решение «какие
    теги показывать» принимает экран, потому что оно зависит от экрана.
  - 🐛 Попутно: добавление чипа сдвинуло раскладку списка справочника — там жёсткая grid-сетка на
    6 детей и мобильные `grid-area` по `nth-child`. Winrate уехал на вторую строку; сетка и индексы
    обновлены согласованно, проверено на 375 и на десктопе.
- ✅ **Пункт (3) реализован 2026-07-28 — фильтр по тегу и модалка «все с этим тегом».** Два входа
  в один и тот же вопрос: селект в справочнике и клик по самому чипу (чип — самая естественная
  точка входа, поэтому он стал `<button>`, а не `span` с обработчиком: нужна клавиатура и фокус).
  В Буткемпе клик по чипу открывает `HeroTagInspector` — модалку со всеми героями тега, свои
  подсвечены и идут первыми («а у меня есть?» — раньше, чем «а кто бывает?»). Именно модалка, а не
  переход в справочник: вопрос возникает посреди незакрытого выбора награды и рынка, и уводить
  игрока с экрана значило бы терять контекст.
- 🐛 **Вёрстка списка справочника в диапазоне 680–1000.** Замер: колонка тегов схлопывалась до
  ~123px, чипы вставали по одному в строку, строка раздувалась до 198px, а селекты ужимались до
  83px и обрезали подпись. Точка перестроения поднята с `680` до канонического `bp.lg = 980`, доля
  колонки тегов увеличена. Плюс селект внутри пилюли теперь занимает всю строку: растягивалась
  только рамка, а селект держал `min-width` — и это оказался не «дожать ширину», а неверный
  механизм (у примитива грид `auto auto`, а на узком экране подпись прячется и селект переезжает в
  первую колонку, оставляя растянутую вторую пустой; переведено на flex).
- ✅ **Уточнение 2026-07-29 — теги в справочнике только в контексте Roguelite Run.** Тег читают
  предметы и тактики, то есть он существует как механика ровно в рогалике; в Quick Draft, Manager и
  Real Tournament чипы и фильтр по тегу — шум поперёк каждой строки списка. Правило вынесено в
  чистую `showsHeroTags(selectedMode, resumable)` рядом с `isCodexLocked` (`state/runStore`) и
  проверяется юнит-тестом. `resumable` учитывается по тому же доводу, что и у замка: после
  перезагрузки страницы забег ещё не возобновлён (`selectedMode` пуст), но игрок стоит в рогалике.
  Без тегов у списка исчезает колонка (её ширину забирает бар) и на мобильной раскладке — целый
  ряд: варианты сетки живут модификаторами `--no-tags`, а не переписыванием базовой сетки.
- ⬜ **Осталось от R11.7:** ничего — все три пункта закрыты.
- **Deps:** R8.1 ✅, R8.3 ✅.

### R12 — Плейтест 2026-07-30: рынок героев, качество пассивок, мёртвые боссы, потолок Династии ✅ (Ревизия статусов 2026-08-31: R12.6 закрыт — вся спека LG1–LG6 реализована, LG3-числа откалиброваны Stakes-заходами b1.40–41)
*(R12.1–R12.5 закрыты 2026-07-30, `BALANCE_CONFIG_VERSION b1.18.0 → b1.21.0`; R12.6 и R12.7 открыты)*

Полный забег до Stage 25 + Династия. Все пункты **воспроизведены замером**, не только глазами;
цифры ниже — из диагностических прогонов на реальном датасете (`web/test/helpers/data.ts`,
`format=last_2y`), чтобы не пересчитывать их заново при реализации.

- 🐛 **R12.1 — hero re-pick НЕ реролится вместе с игроками (главный баг).** Жалоба: «во время
  реролла вместе с игроками не реролляются герои», на скриншоте все пять карт заменяют одного и
  того же Kunkka с дельтами `−1.1…−1.5`.
  **Причина** — fallback в `anteMarket.heroOptions`. Порог `HERO_FLOOR.maxLossOvr = 1` отбраковывает
  карты, роняющие Team OVR больше чем на 1; когда проходных карт меньше размера пака, пак
  добирается из отсеянных **сортировкой по `ovrDelta`** — а сортировка не зависит от `rng.shuffle`.
  То есть в этом состоянии реролл меняет только порядок оценки, но не результат.
  **Замер (60 сидов × 6 рероллов = 300 сравнений):** пока порог проходят все 20 кандидатов, набор
  карт меняется в 300/300 случаев; как только активные герои несут редкость (в дельту входит ПОТЕРЯ
  редкости снимаемого, `−3.4` за immortal) и проходных становится `< 5` — набор совпадает
  **300/300**. Это же объясняет «свап то есть героев, то его нет»: при 2 проходных из 5 две карты
  меняются, три filler-карты стоят намертво.
  ✅ **Исправлено 2026-07-30.** Два разных механизма, потому что дефект был двойной:
  (1) кандидаты вытягиваются рулеткой из всего пула (см. R12.2), поэтому `kept` и `rejected` — выборка
  ЭТОГО реролла; (2) сам добор больше не `sort().slice()`, а рулетка по верхушке отсеянных
  (`HERO_POOL.fillerSpread`). Второй механизм обязателен: первого НЕ достаточно, и это вскрыл
  собственный тест — когда пул меньше лимита выборки, рулетка вытягивает его целиком, и
  детерминированная сортировка возвращает тот же набор. Качество добора сохранено (берётся верхушка,
  мёртвые карты со дна не всплывают). **Замер после фикса** на том же стенде (60 сидов × 5 сравнений,
  все активные герои immortal): идентичных наборов `300/300 → 0/300`, полностью разных 157/300,
  частично пересекающихся 143/300. Регрессия в `anteMarket.test.ts` проверяет ИМЕННО fallback-ветку
  (сначала утверждает, что в паке есть карта ниже порога, и только потом — что реролл меняет набор).
- 🐛 **R12.2 — за забег встречается 20 героев из 127.** Жалоба: «реролл героев не показывает всех
  127 героев; как собрать героев под теги, если я их элементарно не могу встретить».
  **Причина** — `engine.marketHeroCandidatesShortlist`: `slice(0, 20)` по сумме career pro-игр
  текущей пятёрки. Пул не только узкий, но и **детерминированный**: рулетки в нём нет, ось отбора
  (много игр у моих игроков) ортогональна оси, по которой игрок собирает билд (теги).
  **Замер:** в format-пуле 122 сигнатурных героя, к рынку допущено 117, показывается 20; за 40
  забегов объединение всех предложенных — 98 из 127. Узкие теги в 20-карточном пуле недостижимы:
  `heal` отсутствует в 8 забегах из 30, `stealth` в 8, `light` в 9, `illusion` в 4 — при том что
  Guardian Greaves/Shadow Blade/Holy Locket/Manta Style просят `cap 3` таких героев. `light` в
  среднем доступен в 0.9 экземпляра, то есть cap не выбирается никогда.
  ✅ **Исправлено 2026-07-30.** `marketHeroCandidatesShortlist` заменён на `marketHeroCandidatePool` —
  весь формат минус активные/резерв, с career-играми как ВЕСОМ, а не как допуском. Вес
  `minWeight + familiarBias · min(games, gamesWindow)/gamesWindow` (`HERO_POOL`): знакомый пятёрке
  герой встречается в 5 раз чаще незнакомого, но ни один не становится недостижимым. Ровно то же
  лечение, что `R5.1` применил к формам игроков (`FORM_ODDS` вместо жёсткого фильтра). Стоимость не
  выросла: рулетка вытягивает `drawFactor × packSize` кандидатов и оценивает лениво, то есть тех же
  ≤20 полных `scoreTeam`, что и прежний shortlist.
  **Замер после фикса:** пул `20 → ~115` героев; забегов, где тег недоступен вовсе, `8–9/30 → 0/30`
  для всех 16 тегов, которые читают предметы; `light` в пуле `0.9 → 8.8` экземпляра, то есть `cap 3`
  стал выбираемым. Инвариант в тесте сформулирован как «пул не усечён» (сравнение с
  `marketHeroCandidates`), а не абсолютным числом: в тестовом датасете format-пул заведомо меньше 127,
  и проверять размер значило бы проверять датасет, а не правило.
- 🐛 **R12.3 — тир пассивки не всегда усиливает эффект.** Жалоба: «есть такая же бутылка, только
  refined — как такое может быть?».
  **Причина** — `items.scaleEffect` округляет целочисленные эффекты: `Math.round(count * k)` при
  `magnitude = {1, 1.25, 1.6, 2}`. Bottle `freeRerolls: 1` даёт `1 / 1 / 2 / 2` — **standard и
  refined идентичны**, exotic и arcana тоже. Полный список сломанных карт:
  `bottle` (standard==refined, exotic==arcana), `magicWand` и `observerWard` (refined==exotic),
  `refresherOrb` и `blackKingBar` (exotic==arcana, упираются в потолок/floor).
  **Почему не поймали:** `validateItems()` проверяет монотонность только у `xMult` и
  `bossPenaltyFactor`; экономические целочисленные эффекты не проверяются вовсе.
  ✅ **Исправлено 2026-07-30.** Округление целочисленных эффектов подпирается снизу РАНГОМ тира
  (`scaleMagnitudeInt`): `max(round(value·k), value + rank)`. Ладдеры стали
  `bottle 1/2/3/4`, `magicWand 2/3/4/5`, `observerWard 2/3/4/5`, `handOfMidas 4/5/6/8`. Отдельно
  сдвинуты два базовых числа, чьи ладдеры упирались не в округление, а в потолок/пол:
  `refresherOrb.rate 0.7 → 0.5` (`0.5/0.63/0.8/1.0`, копировать больше 100% чужого множителя нельзя)
  и `blackKingBar.factor 0.4 → 0.55` (`0.55/0.44/0.28/0.15`, ниже — `bossFactorFloor`).
  **Главное — инвариант, а не пять правок:** `validateItems` теперь проверяет ПОПАРНУЮ строгую
  монотонность по всем четырём тирам для ЛЮБОГО вида эффекта через нормализованную `usefulness`
  (у защиты от босса полезнее меньшее число, поэтому она входит со знаком минус). `switch` без
  `default` делает новый вид эффекта ошибкой компиляции, а не находкой следующего плейтеста.
  Проверка попарная намеренно: слипались тиры именно в СЕРЕДИНЕ лестницы, и сравнение
  «immortal против common» их пропускало.
- ⚠️ **R12.4 — кривая редкости насыщается к этапу 5 и дальше не растёт.** Жалоба: «пассивки
  выпадали только refined, большего качества ни разу».
  **Замер** (`rollWeights`, 4000 роллов на этап): этап 1 — `75/21/3/1`, этап 3 — `41/37/15/7`,
  этап 5 — `6/54/27/13`, и дальше **этапы 6…25 стоят на `~4/53/29/14`**. То есть 20 из 25 этапов
  сезона имеют одинаковое распределение, а refined остаётся модальным до конца. Причина — линейный
  рост с шагом 17/8/6/3 и потолки `55/30/15`, рассчитанные на короткий сезон; после `R6.1` (25
  этапов) кривая упирается в них на пятом этапе. `R11.4` правильно ввёл ненулевой пол верхних тиров
  на ранних этапах, но верхнюю часть кривой под длинный сезон не растянул.
  ✅ **Исправлено 2026-07-30 — не растягиванием четырёх рамп, а сменой параметризации.** Растянуть
  шаг было бы лечением симптома: четыре независимые линейные рампы со своими потолками неизбежно
  упираются в них в разное время, и «правильные» числа пришлось бы искать заново при каждом
  изменении длины сезона. Теперь у распределения ОДИН центр, который едет по лестнице вместе с
  забегом (`RARITY_CURVE`: `startRank/perStage/maxRank/falloff`), а вес тира падает с удалением от
  центра. Нужные свойства получаются по построению, а не подбором:
  - модальный тир ПОДНИМАЕТСЯ по лестнице (`standard → refined → exotic`, смена около этапов 8 и 18)
    вместо «refined до конца забега»;
  - у каждого тира ненулевой хвост на любом этапе, то есть требование `R11.4` («редкая сильная карта
    обязана иметь шанс выпасть рано») выполняется автоматически, без отдельного пола;
  - насыщение — на этапе **23 вместо пятого**;
  - в Династии центр останавливается на `maxRank: 2`: качество — КОНЕЧНАЯ ось (там растёт угроза, а
    не команда), поэтому arcana не становится модальной. Это же отвечает на прежнее «направление»
    (поднять потолок arcana) отказом: потолок нужен, но не бесконечный рост.

  Замер новой кривой (20000 роллов на этап): этап 1 — `72/20/6/2`, этап 5 — `51/36/10/3`,
  этап 10 — `25/54/16/5`, этап 18 — `11/37/41/12`, этап 25 — `5/17/60/17`. Первый Буткемп сохранён
  почти прежним (`75/21/3/1`), то есть онбординг не тронут.

  🔎 **Побочная находка про механику ролла:** веса стали долями (сумма ≈1.5), а `rollRarity` брал
  `rng.int(total)` — целочисленный ролл по таким весам вырождается в «0 или 1». Переведено на
  `rng.float() * total`; из потока по-прежнему берётся ровно один float, поэтому длина
  последовательности сида не изменилась (golden не сдвинут).

  📊 **A/B на ОДНИХ 400 сидах** (`npm run sim -- 400` до и после, версия откатывалась через stash —
  сравнивать прогон на 120 сидах с прогоном на 400 было бы некорректно):

  | агент | b1.20.0 | b1.21.0 | дельта |
  |---|---|---|---|
  | synergy-build (целевая полоса PRD) | 38.3% | **37.8%** | −0.5pp |
  | greedy-oracle | 9.8% | 10.3% | +0.5pp |
  | greedy-power | 4.5% | 5.5% | +1.0pp |
  | random | 2.5% | 1.0% | −1.5pp |
  | static / naive-ovr / economy-first | 0% | 0% | — |

  Диагностика лагеря практически не двинулась (золото `45.7 → 45.5`, карт с плюсом `2.06 → 2.00`,
  лучшая дельта `1.11 → 1.11`, качество на максимуме 38%, слоты полны 23%).

  ⚠️ **Методическая заметка (стоила ложной тревоги).** Первый контрольный прогон на `n=120` показал
  `35.0% → 37.5%` и выглядел как заметное облегчение. Полноценный A/B этого не подтвердил: базовая
  версия на 400 сидах даёт `38.3%`, то есть «35.0%» само было низким выбросом. При `n=120` станд.
  ошибка около полосы 35% составляет ≈4pp — то есть **шум того же порядка, что и весь измеряемый
  эффект**. Для решений о балансе `n=120` недостаточно; сравнивать нужно одинаковые выборки одной
  и той же командой.
- ⚠️ **R12.5 — два боссовых условия из пяти мертвы к середине сезона.** Жалоба: «условие босса —
  полный ужас: base свыше 86, когда мы уже на такой стадии» (скриншот Stage 19: Base 95.6 против
  порога 86, «условие выполнено — штрафа нет»).
  **Причина** — пороги в `BOSSES` заданы абсолютными константами под диапазоны, из которых игра уже
  вышла: комментарий рядом с ними говорит «Base ~78–92, Hero Synergy ~0–8», а на Stage 19–25
  реально `Base 95–98`, `Hero Synergy 17–19`. Значит `baseFloor` (порог 86) и `heroSynergyDemand`
  (порог 4) выполняются САМИ СОБОЙ, и боссовый этап проходит без правила. `chemistryBlackout`
  масштабируется от фактической Chemistry и остаётся живым; `unbalancedRoster` (spread ≤ 8) и
  `heroBan` тоже.
  ✅ **Исправлено 2026-07-30, и замер оказался ХУЖЕ жалобы: сломаны были не два условия, а четыре.**
  Диагностика (1238 финалов актов, `npm run sim -- 120`) показала, что дефект структурный, а не
  «неудачные числа». Все судимые боссами величины монотонно ползут по забегу, поэтому константный
  порог пересекается РОВНО ОДИН РАЗ и делит сезон на «штраф всегда» и «штрафа никогда» — решением он
  не бывает нигде:

  | величина | этап 4 | 9 | 14 | 19 | 24 | старый порог | что получалось |
  |---|---|---|---|---|---|---|---|
  | Base | 80.8 | 86.2 | 91.0 | 94.6 | 96.6 | ≥ 86 | max штраф на первом финале → мимо с третьего |
  | Hero Synergy | 8.9 | 18.1 | 19.5 | 19.5 | 19.5 | ≥ 4 | выполнено ВСЕГДА |
  | разброс OVR | 14 | 12 | 11 | 9 | 7 | ≤ 8 | штраф почти всем → мимо к финалу |

  Лечение разное, и разница принципиальна — она зависит от природы величины, а не от боссa:
  - **Base** и **разброс OVR** двигаются без потолка в пределах забега ⇒ планка стала рампой по
    актам. Для Base рампа **вогнутая** (`ceiling − gap · decay^актов`, планки `80/87/91/94/96`):
    линейный вариант был измерен и отвергнут — он перелетает потолок качества 99 и даёт на финале
    сезона 2% выполненных условий, то есть ту же поломку с другого конца. Для разброса — сужающаяся
    линейная (`14 − 1.5 · актов`, пол 5).
  - **Hero Synergy** упирается в потолок (~19.5 уже к третьему акту) ⇒ никакая рампа не помогает,
    планку по величине выполняют все по определению. Условие переведено на **структуру состава**:
    «сколько активных героев вне репертуара своего игрока» (бар 40 pro-игр), штраф за штуки сверх
    допуска 2 — по образцу `heroBan`, единственного боссa, который никогда не ломался, потому что он
    тоже считает штуки, а не очки. Замер подтвердил, почему это работает: распределение «вне
    репертуара» (`0/1/2/3/4/5` героев с частотой `6/19/31/26/12/3%`) почти НЕ меняется по актам —
    это свойство формы состава, а не его величины.
  - **`chemistryBlackout.max` 8 → 6** — паритет капов. Условие по своей природе безусловное
    (выполнено в 2% случаев: Chemistry к середине сезона всегда выше порога), и это осознанный
    дизайн «снятие рычага, а не планка». Но при `max: 8` его средний штраф был 5.93 против 0.25–3.3
    у прочих, то есть забег решало то, КАКОЕ правило выпало, а не игра.
  - `heroBan` не тронут: он с самого начала считал штуки и потому не ломался.

  **Результат замера после фикса** (те же 120 сидов): доля выполненных условий
  `baseFloor 63% · heroSynergyDemand 66% · unbalancedRoster 69% · heroBan 71%` вместо прежних 100% и
  0%, средний штраф `0.55–0.97` — правило бьёт примерно раз из трёх, и адаптация его снимает.
  Сложность при этом не поехала: win-rate билд-агента `34.2% → 35.0%`, смертность под боссом у него
  `7.5% → 7.5%`. Планки видны в Буткемпе заранее и обновляются сами: UI печатает `reasonParams`,
  куда теперь уезжает вычисленное число (правок в UI не потребовалось).
  ✅ **Закрыто 2026-08-18 (продуктовое решение пользователя, `b1.35.0`): `chemistryBlackout`
  переведён на СТРУКТУРУ состава** — тем же рецептом, что вылечил `heroSynergyDemand` (штуки, не
  очки: величина Chemistry насыщается, и планка по ней мертва по построению). Правило: пара
  активной пятёрки с ≥100 совместных pro-игр — «сыгранная связка», первые 5 — норма, каждая сверх
  допуска штрафует 1.5 (кап 6). Адаптация на лагере существует: разбить плотные связки заменой
  игрока. Числа посажены на замер (CHEMDIAG-прогон, 1073 финала актов: распределение связок
  `0..10` = `4/9/8/14/16/6/33/6/2/1/2%`) — met ~57%, средний штраф ~0.95, полоса остальных боссов
  после R12.5. Вход `BossContext.pairCoGames` — из того же `buildTacticContext`, что
  `assignedHeroGames` (стор, сим и sweep обновлены синхронно). **A/B на одних 120 сидах:**
  win-rate всех агентов байт-в-байт (synergy-build 64.2%→64.2%) — сложность не поехала;
  boss-death неадаптирующихся агентов упал (naive 37.5→29.2%, oracle 14.2→7.5%) — безусловный
  налог перестал косить всех подряд. UI-превью само печатает новые `reasonParams` (n/max/games).
- ✅ **R12.6 — потолок билда наступает к этапу ~22 (вход в Династию). Спека согласована
  2026-08-09 — [roguelite-lategame-spec.md](roguelite-lategame-spec.md); реализована целиком
  (Ревизия статусов 2026-08-31: LG1 trade-in, LG2 шестой слот, LG3 мутаторы→Stakes с калибровкой b1.40–41,
  LG4 Tempered, LG5 инструментарий, LG6 зачарование токенами Династии).**
  Жалоба: «к этой волне я уже полностью уперся в потолок наших апгрейдов — мне даже героев нет
  смысла свапать» (Stage 22: слоты полны, золото девать некуда). Диагноз: исчерпан сам **набор
  осей роста** (тир героя/тир карточки/форма конечны и упираются одновременно); бесконечный
  `+OVR` запрещён — ответ «бесконечная вариативность при конечном потолке». Два решения приняты
  пользователем: **мутаторы Династии = Stakes** (одна система, закрывает развилку T6.4) и
  **trade-in карт с переносом тира −1** как главный сайдгрейд. Порядок работ из спеки:
  - ✅ **LG5 — инструментарий раньше чисел (2026-08-10).** Сим-отчёт получил: разбивку
    диагностики лагерей ПО АКТАМ + колонку «осмысленно» (покупка с плюсом по карману / доступное
    улучшение качества / trade-in с плюсом — метрика приёмки R12.6; trade считается лениво, только
    у «пустых» лагерей); причину смерти в Династии (доля «под боссом»); Editions-строку (забегов с
    Charged / заряды / доля этапов с активной); trade-in у агентов (`trd` в таблице) — конкурирует
    с покупками за то же золото через общий runStrength-слой.
    - 🐛 **Найден и починен реальный баг поздней игры:** глубокая Династия вычерпывает пул героев
      (герой уходит из рулетки на потолке качества — так задумано R14.8), и
      `buildAnteMarketRoulette` кидал исключение — живой забег на глубине 25+ ронял открытие
      лагеря. Теперь hero-пак честно сжимается вплоть до пустого (`anteMarket.heroOptions`);
      регресс покрыт Dynasty-прогоном сима (глубины до 31 без краша) — юнит-фикстура вычерпанного
      пула потребовала бы подделки внутреннего состояния движка.
    - 📊 **Базлайн b1.27 (400 сидов, `--dynasty`, до LG1):** «осмысленно» по актам —
      **100% → 98% → 62% → 34% → 23% (акт 5) → 18% (Династия)**: жалоба R12.6 теперь число.
      Династия synergy-build: глубина p50 9 / p90 24 / max 31, смерти 10% под боссом / 90% от
      поля. Charged у жадных агентов — 1 забег из 400 (reward-предпочтения агентов её почти не
      берут), но взятая копит 3/3 и активна 57% этапов. Полный отчёт — прогон
      `npm run sim -- 400 --dynasty` на b1.27.
  - ✅ **LG1 — trade-in карточки: реализовано 2026-08-10 (b1.28.0), цена откалибрована A/B
    (b1.30.0).** «Обменять» (⇄ рядом со сбросом ✕) на экипированной карте → тройка офферов из
    невзятого пула тактик+предметов (поток `:trade`, реролл по лестнице рынка со своим
    счётчиком), новый тир = текущий − 1 (пол common; тактика отдаёт common), Edition и заряды
    сгорают, отданная карта не выпадает больше никогда. Превью дельты на офферах — тем же
    `evaluateCampPower`, что текущая сила. Агенты сима меняются через общий runStrength-слой
    (`trd` в отчёте); «осмысленность» лагеря учитывает trade лениво. Тесты: 6 unit + e2e (обмен и
    реролл, оба датасета).
    - 📊 **A/B 400 сидов `--dynasty` (одни сиды, synergy-build):** цена 4 — win 46.3% → 78.5%
      (+32пп, смерть под боссом 15.5% → 3.5%) — trade-in вместо сайдгрейда стал прямым рычагом
      силы; при этом цель R12.6 подтверждена: «осмысленно» актов 3–5 выросло 62/34/23% →
      70/43/29%. **Цена 8 (принято, b1.30.0):** win 63.7% — такса на РАННИЙ перебор осей
      (выживание этапов 3–5 просело против цены 4), поздняя торговля почти не тронута
      (0.21 против 0.23 trades/лагерь), «осмысленно» актов 3–5 сохранилось (69/44/28%).
      Остальные агенты не сдвинулись ни в одной строке — изоляция подтверждена. ⚠️ Глубина
      Династии p50 упёрлась в потолок сима (31) при ЛЮБОЙ цене: trade-in бесконечно подкидывает
      положительные дельты, «смерть неизбежна» в Династии теперь держится только на росте
      угрозы — аргумент в пользу приоритета LG3 (мутаторы = Stakes). Отчёты: scratchpad
      `lg5_baseline.txt` / `lg1_trade.txt` (цена 4) / `lg1_trade_cost8.txt`.
    - 🐛 Попутно к UI: две угловые кнопки слота складывались в одну точку — крестик перехватывал
      клик обмена (поймано e2e); ⇄ сдвинут, под две кнопки зарезервировано место, длинные
      названия переносятся целиком (плейтест 2026-08-10, «Necronomicon»).
  - 🟨 **LG3 — мутаторы круга Династии (= Stakes): реализовано 2026-08-10 (b1.31.0), числа —
    placeholder до A/B и живого плейтеста.** Каждый круг (акт за пределами сезона) играется под
    ОДНИМ правилом, объявленным заранее: `tighterTargets` (пороги мест жёстче на шаг легальной
    лестницы бакетов), `doubleBans` (бан-лист heroBan ×2 — тот же shuffle, срез длиннее:
    детерминированное надмножество), `expensiveMarket` (все цены рынка ×1.25 на ГЕНЕРАЦИИ —
    превью, покупка и сим читают одну цену), `uncappedBoss` (потолок `max` штрафа снят). Выбор —
    новый Rng-поток `seed:dynasty:mutator:circle-N` (существующие не сдвинуты, e2e-сиды не
    пере-подбирались). Слои: определения/выбор — `dynastyMutators.ts` (data-driven, по образцу
    боссов), применение — у владельцев правил (порог в `AnteRunEngine.stageAt` +
    `effectiveStageTarget` для выплат, баны/кламп в `bossConditions` от обязательного
    `BossContext.seed`, цены в `anteMarket`/`marketOffers`); сим зеркалится общими функциями.
    UI: строка-предупреждение в шапке каждого лагеря круга + анонс первого круга на экране
    победы сезона (решение «продолжать ли» — с открытым правилом). Тесты: 10 unit + фикс
    boss-тестов; полный e2e. Позже те же определения — добровольные стартовые Stakes в
    `Special rules` (отдельная задача после обкатки).
    - 📊 **A/B 400×400 против b1.30 (2026-08-10, вместе с LG2).** Сезонные строки всех агентов,
      кроме random/synergy-build, — байт-в-байт; отличия этих двух полностью объяснимы шестым
      слотом LG2 (сила p50 129→126 — видимые −3 Base, тактик 3.7→4.3, смерть под боссом
      6.3%→4.0%, win без изменений 63.7%). Утечки мутаторов в сезон НЕТ. Династия: глубина
      synergy-build по-прежнему упирается в потолок сима (`DYNASTY_DEPTH_CAP`, ~6 кругов) —
      v1-числа мутаторов informed-агента внутри него не убивают; метрики приёмки спеки
      (p50 ≥ 1 круга, max ≥ 3) выполняются. Жёсткость v1-чисел — за живым плейтестом.
      ⚠️ Первый A/B-прогон был испорчен багом сима (`season is not defined` в shopCamp глотался
      `catch{break}` и обрубал покупки агентов) — починено в b1.32.0, catch теперь логирует под
      `SIMDEBUG=1`.
  - ✅ **LG2 — шестой слот тактик за перманентный минус (2026-08-10, b1.32.0).** Одноразовый
    reward-оффер (ЧЕТВЁРТАЯ карточка, не подмена утилиты): первый лагерь предпоследнего акта, в
    Династии — каждый лагерь, пока не взят; второй не приходит (слот один, гасится по выросшему
    `tacticSlots`). Обмен: +1 слот тактик и перманентные −3 Base (`ECONOMY.slotOffer`,
    applied-эффект — виден в разложении, как любая покупка). `tacticSlots` — поле состояния
    экономики (default `TACTIC_SLOTS`, legacy-сейв читается дефолтом); его читают `canTakeCard`,
    Буткемп, рейл экрана этапа и sim-агенты через общий campView. synergy-build берёт оффер,
    когда карточные награды отказали по полным слотам (порядок rewardPref). Rng не тронут.
    Тесты: 4 unit (окно оффера, обмен, шестая тактика, legacy roundtrip).
  - ✅ **LG4 — вторая Edition `Tempered` (2026-08-11, b1.34.0; гейт снят решением пользователя).**
    Защитная ось по переформулировке R13-триажа: пока карта экипирована и её условие РАБОТАЕТ
    (те же activeCardIds, что заряды и рейл), штраф босса этапа ×0.7 за карту (мультипликативный
    стак; та же точка композиции `protectedBossPenalty`, что BKB/Linkens — но Edition не занимает
    слот). Прямой ответ на «смерть под боссом» и мутатор uncappedBoss (LG3). Дроп — подпоток
    `:edition-t` ТОЛЬКО при не выпавшем Charged: charged-исходы сидов не сдвинуты; путь через
    оффер улучшения (как у Charged) НЕ заведён — v1-scope, arcana к Tempered пути пока не имеет.
    UI: стальной бейдж/щит-пипс (токены `--edition-tempered*`, вариант через локальную
    переменную бейджа), правило в инспекторе; сим считает Tempered в отчёте Editions. Попутно
    закрыт дрейф `sweep_seeds_both.ts` (tsx вне tsc): не получал seed в BossContext (LG3) и
    cardCharges (R13.5) — модель номинации сидов была слабее игры. Числа — placeholder до A/B
    и живого плейтеста. 522 unit + полный e2e 78 passed.
  Метрики приёмки и риски (пере-подбор сидов на обоих датасетах, bump версии на каждую механику,
  UI внутри существующих панелей) — в спеке.
- ✅ **R12.7 — качество данных тегов (2026-08-10, b1.33.0).** Жалоба: «tuskar — это pickoff, а
  shadow shaman — нет; теги героев не пересекаются».
  Часть про «не пересекаются» — не баг данных: в Буткемпе карточка показывает НЕ все теги героя, а
  только те, по которым есть условие у экипированных карточек (`conditionAxes`, решение `R11.7`).
  Замер словаря вскрыл реальный пробел: **19 героев из 127 не имели ни одного lore-тега** (невидимы
  для lore-оси — Bounty Hunter, Riki, Lina и др.). **Решение:** натягивать на смертных demon/beast
  значило бы врать таксономией — вместо этого новый lore-тег **`mortal`** («смертный без
  сверхъестественной природы и фракции») закрыл всех 19, lore-ось стала тотальной, и
  `validateHeroTags` теперь требует «≥1 lore-тег» (инвариант, а не надежда). **Shadow Shaman
  получил `pickoff`** (Shackles + Mass Serpent Ward — классический ганкер одиночной цели;
  silverEdge теперь его видит). Новый тест: каждому тегу, который читает предмет, хватает
  носителей на `cap + 1` (мёртвый потолок не выглядит контентом). Пока `mortal` не читает ни один
  предмет — ось закрыта на будущее; кандидат на предмет за смертных — вместе с ревизией скоса
  gameplay-тегов (`control` 68 против `illusion` 9) после R12.2 (рынок показывает 20 героев
  из 127 — без него идеальный словарь всё равно не виден).
- 📊 **A/B симулятора на общих сидах** (`npm run sim -- 120`, b1.18.0 против b1.19.0): целевой
  билд-агент `synergy-build` **34.2% → 34.2%** — сложность сезона не сдвинулась, то есть три фикса
  устраняют дефекты, а не облегчают игру. Единственное значимое изменение — `greedy-oracle`
  **10.0% → 15.8%**: это ЕДИНСТВЕННЫЙ агент, который активно платит за рероллы (1.38 на лагерь), и
  именно ему реролл раньше не давал ничего. Остальные агенты в пределах шума
  (`greedy-power` 5.0% → 5.0%, `naive`/`static`/`economy-first` 0%). Диагностика лагеря почти не
  двинулась (золото 45.6 → 45.2, карт с плюсом 2.27 → 2.18, лучшая дельта 1.17 → 1.17), что и
  ожидалось: рынок стал разнообразнее, но не щедрее.
- **Deps:** R8.1 ✅, R8.3 ✅, R11.2 ✅, R6.1 ✅.

### R13 — Триаж плана Codex «late-game scaling + переработка UI» (2026-07-30) ✅ (Ревизия статусов 2026-09-05: R13.3/R13.4 сыграны и закрыты R14, R13.5 — Charged b1.27.0 + Tempered LG4; открытых подпунктов нет)
*(R13.1–R13.4 закрыты полностью — механическая декомпозиция доделана 2026-08-31; R13.5 открыт)*

**Происхождение.** Внешний план (`aegis_draft_roguelite_ui_late_game_plan.md`), составленный по снимку
репозитория. Здесь — разбор: что подтвердилось кодом, что устарело, что противоречит уже принятым
решениям. Каждое фактическое утверждение плана проверено, а не принято на слово.

#### Подтвердилось кодом — берём

- ✅ **R13.1 — Item-награда не знает про занятые слоты. Исправлено 2026-07-30.** [`CampScreen.tsx:780`](../web/src/features/run/CampScreen.tsx:780):
  `slotFull` и `isCard` перечисляют `tactic` и `action`, но НЕ `item`. Движок при этом прав —
  `anteEconomy.canTakeCard` считает `item` наравне с `tactic`. Последствия ровно два, оба видны в
  плейтесте: предмет не получает бейдж вида карточки (игрок не понимает, что тот займёт пассивный
  слот) и при полных слотах кнопка остаётся активной, а клик **молча ничего не делает** —
  `chooseReward` возвращает `false` без объяснения. Мелкая правка, но это тихий отказ в ответ на
  действие игрока. **Deps:** нет.
- ✅ **R13.2 — пентагон подписывает Tournament Power как Team OVR. Исправлено 2026-07-30.** В Буткемп передаётся
  `power.total` ([`CampScreen.tsx:682`](../web/src/features/run/CampScreen.tsx:682) — и это ВЕРНО,
  инвариант «радар = сила поля» из `T5.3` проверяется e2e), но подпись в центре жёстко прибита к
  `common.teamOvr` ([`Pentagon.tsx:164`](../web/src/features/draft/Pentagon.tsx:164)). Пока
  множителей мало, числа близки и расхождение незаметно; на этапе 22 плейтеста радар уже показывал
  `160` при Roster `125.7`. Тот же компонент используется в драфте, где значение действительно
  Team OVR, — поэтому подпись обязана стать пропом, а не переименованием константы.
  **Как починено.** Заодно устранена причина, по которой баг стал возможен: проп назывался `teamOvr`,
  и передать в него Tournament Power выглядело нормально. Теперь у значения нейтральное имя
  `centerValue`, а подпись выбирает вызывающий экран через `centerLabelKey` (по умолчанию —
  `common.teamOvr`, поэтому драфт не изменился). Экранов оказалось ДВА, а не один: Буткемп
  (`power.total`) и экран этапа (`stagePower` — та же сила за вычетом штрафа босса); оба теперь
  подписаны существующим ключом `camp.power` («Сила забега» / «Run power») — нового термина не
  заводили. Проверено живьём на `5273`: на этапе и в Буткемпе центр радара совпадает с
  `tournament-user-strength`, подпись — «Run power». **Deps:** нет.
- ✅ **Верно и по делу:** карточки Буткемпа растягиваются под количество текста; нулевые дельты
  (`TEAM OVR 0`) — чистый шум; `CampScreen.tsx` разросся до 1384 строк плюс 795 строк CSS и держит в
  одном месте экономику, награды, два рынка, апгрейды, резерв, действия, тактики, подготовку к боссу
  и расчёт дельт. Всё три пункта подтверждаются глазами и `wc -l`.

#### Устарело — НЕ делать

- ❌ **Пункт 3.1 плана («R12.4 не реализована, в коде старая линейная формула») — неверен.** План
  писался по снимку до коммита `2329c8a`. Кривая переведена на центр (`RARITY_CURVE` в
  [`rarity.ts`](../web/src/game/rarity.ts)), `BALANCE_CONFIG_VERSION = b1.21.0`, тесты и BACKLOG
  синхронны. Пункт «этап 1 — завершить фактическую реализацию R12.4» из плана выполнять не нужно.
  То же про «проверить Chemistry Blackout» и «аудит hero tags» — первое разобрано в `R12.5`
  (безусловность осознанна, cap приведён к паритету), второе живёт как `R12.7` с уже измеренными
  цифрами.

#### Хорошо по существу — принимаем как направление

- ✅ **R13.3 — два уровня информации: карточка = решение, оверлей = математика.** *(закрыто
  2026-08-02)* Это прямой ответ на
  жалобу «слишком много надписей, карточки растягиваются». Ключевое в предложении — не «убрать
  данные», а РАЗВЕСТИ их: на карточке «что это, сколько стоит, одна главная дельта, есть ли риск», в
  инспекторе — полный `до → после` по слагаемым, assignment, теги, условие. Инвариант PRD «любая
  покупка показывает `до → после` и сработавшее условие» при этом не нарушается: он про доступность
  информации до покупки, а не про её одновременность на экране.
  - Фиксированный размер карточки и `SOLD`-заглушка вместо схлопывания — обязательная часть, иначе
    сравнение карт остаётся невозможным.
  - Отказ от обязательного flip обоснован верно (сравнение соседних карт, touch, accessibility).
  - Скрывать нулевые дельты.
  - **Обязательное ограничение наше, не из плана:** `OfferCard` собирается из примитивов `ui/`,
    цвета — токены `design/tokens.css`, строки — ключи `i18n/core.ts` (скилл `frontend-architecture`).
  - ✅ **Сделано для карточек рынка (2026-07-30).** Новый чистый слой `features/run/campPresentation.ts`
    отдаёт ДАННЫЕ разбора (`summandDeltas` → `{summand, from, to, delta}`), а не JSX: раньше разбор
    собирался прямо в `CampScreen`, и именно поэтому каждый новый параметр было проще вывести на
    карточку. Карточка теперь несёт ОДНУ цифру — сдвиг Team OVR, — и сама эта цифра является кнопкой
    в разбор (тот же приём, что чип тега в `R11.7`: точка входа — ровно то число, которое хочется
    объяснить). Этот промежуточный `OfferInspector` затем заменён whole-card оверлеем ниже.
    **Замер на живом Буткемпе (5273, сид `camp-e2e-3`):** карточки игроков `309px`, карточки героев
    `264px` — внутри пака ВСЕ одинаковой высоты (было: высота определялась количеством строк разбора,
    у героев доходило до ~450px при ширине 148px). Итог инспектора считается из тех же дельт, что
    показывает разбор, поэтому число на карточке и строки под ним не могут разойтись.
  - ✅ **Run Power вместо частичного Team OVR (2026-08-02).** Превью теперь повторно оценивает
    Tactics, редкость героев и предметные `flat / additive / X Mult` для состояния после покупки.
    Карточка называет именно ту величину, с которой игрок сравнивает результат в центральном радаре.
  - ✅ **Свёрнут разбор состава в левой панели (2026-07-30).** Полные таблицы Hero Synergy (5 строк) и
    Squad Chemistry (до 10) — самый крупный текстовый блок экрана, и в Буткемпе они отвечают не на
    тот вопрос: здесь игрок решает, что КУПИТЬ, а не изучает состав построчно. Свёрнуто в нативный
    `details/summary` (доступно с клавиатуры, без ещё одного `useState`) со сводкой, которая сразу
    называет проблему: «5 связей · слабых героев: 1». В драфте и на экране этапа разбор остаётся
    раскрытым — там он и есть содержание. **Замер:** левая панель `824px → 619px` (−25%).
  - ⛔ **`SOLD`-заглушка НЕ делается — замер показал, что чинить нечего.** Пак использует
    `grid-template-columns: repeat(auto-fill, minmax(148px, 1fr))`, поэтому при покупке оставшиеся
    карточки НЕ растягиваются: освобождается ячейка, ширина колонки не меняется. Заглушка дала бы
    только косметику («вот что я купил»), но потребовала бы протечки в движок: `consumed`-офферы
    сейчас отфильтрованы в `currentMarketOffers`, и UI о них не знает. Менять игровой слой ради
    косметики не стали.
  - ⚠️ **Плейтест 2026-07-31: сделанного НЕДОСТАТОЧНО, и приоритет был выставлен неверно.** Жалоба
    повторилась дословно: «осталось три миллиарда карточек, страница скроллится, будто смотришь
    инвентарь в китайской ММО». Замер по скриншотам: на одном экране одновременно **~29 карточек**
    (2 подготовки + 3 награды + 5 слотов билда + 5 игроков + 5 hero re-picks + 5 апгрейдов + 4 блока
    резерва). Снижение ВЫСОТЫ каждой карточки такую ленту не лечит — это было лечение симптома.
    Настоящее лекарство — навигация по разделам (`R13.4`), где на экране виден ТОЛЬКО активный
    раздел. Я записал `R13.4` как «чистую поддерживаемость, ничего видимого» — это неверно:
    поддерживаемость там побочна, а смысл в том, чтобы страница перестала быть лентой. Из-за этой
    ошибки раздел взяли последним и вынесли одну панель из четырёх.
  - ✅ **Whole-card overlay реализован 2026-08-02.** Убрана отдельная кнопка «?» на цифре:
    **кликается вся карточка целиком**, и она разворачивается в себя же большего размера со всей информацией.
    Форма — **оверлей поверх сетки с затемнением соседей**, а не раздвигание сетки на месте:
    раскладка не дёргается, соседние карточки не прыгают, и анимация получается одна короткая
    (подъём + масштаб), а не перекомпоновка ряда. `OfferInspector` заменён на `OfferOverlay`, но
    переиспользует `ui/Modal`: focus trap, Escape, возврат фокуса и блокировка скролла не дублируются.
    Вложенные `Buy / Upgrade / Swap`, tag chips и select остаются отдельными контролами поверх
    whole-card trigger. `campPresentation` и фиксированные размеры сохранены.
  - ✅ Reward-карточки трогать не потребовалось — они уже показывают «что делает + цена», а не
    `до → после` (проверено на живом экране).
- **R13.4 — разделение `CampScreen` — ЭТО И ЕСТЬ ответ на «страница как инвентарь в ММО», а не
  побочная поддерживаемость (переоценено 2026-07-31). ✅ Пользовательский срез реализован
  2026-08-01, декомпозиция доделана R13.4/63886bc.** Верхняя навигация
  `Reward ✓ · Market · Build 2/5 · Preparation 1/2`, ниже — только АКТИВНЫЙ раздел. Завершённые
  сворачиваются в строку (`Reward: +6 gold ✓`). `Next stage` живёт обычным футером сразу после
  активного раздела: разделение экрана уже убирает многосоставную ленту, а fixed/sticky-футер
  перекрывает нижний ряд карточек и ломает композицию. Постоянные пояснения-абзацы
  («Raises an active hero's rarity…») уходят в тултип по
  `?`. Ожидаемый эффект — один экран вместо нескольких viewport'ов; порядок работ ниже это учитывает.
  Механическая часть — разделение на `RewardPanel` / `MarketPanel` / `BuildPanel` /
  `PreparationPanel` + `campPresentation.ts` (чистое преобразование `Offer` → компактная UI-модель).
  Шов выбран правильно: вся математика остаётся в `Offer`, презентация не считает свою.
  - ✅ Верхняя навигация показывает статусы награды и слотов; одновременно рендерится только активный
    раздел. После выбора награды открывается Market, а повторный вход в Reward показывает одну
    сводную строку вместо трёх завершённых карточек.
  - ✅ **Уточнено плейтестом 2026-08-02:** `Next stage / Give up` возвращены в обычный поток отдельным
    футером после активного раздела. Fixed-вариант перекрывал hero re-picks и визуально выглядел
    чужой липкой панелью. Постоянные пояснения рынка, билда, подготовки и резерва перенесены в
    доступный с клавиатуры/touch `?`.
  - ✅ Карточки hero re-pick, rarity upgrade и reserve swap показывают только итоговую `Team OVR`
    дельту; частные `Base / Hero Synergy / Chemistry` полностью живут в связанном инспекторе.
    Редкость остаётся на карточке как identity покупки, а не как второе числовое разложение.
  - ✅ Состояние активного раздела осталось локальным UI-состоянием и не протекло в `RunEngine` или
    сейв. Переиспользованы существующие `PreparationPanel` и `campPresentation`; новый общий
    примитив не заводился, потому что существующий `OptionGroup` описывает настройку значения, а не
    навигацию со статусами.
  - ✅ **Полиш плейтеста 2026-08-02:** Reserve ограничен двумя видимыми рядами и скроллится внутри
    своей панели, поэтому поздний запас больше не растягивает весь Build. Теги hero-upgrade
    выровнены в стабильную строку и получили устойчивую палитру по назначению: mobility/global —
    синие, burst/pickoff — красные, sustain — зелёный, рост/юниты — золотые. Цвет переиспользуется
    общим `TagChips`, а не дублируется экраном.
  - ✅ Проверено на живом Буткемпе: desktop/mobile, dark/light, переход Reward → Market, свёрнутая
    награда, все четыре раздела и tooltip. Unit: 465 passed / 3 skipped; адаптированный camp e2e:
    17 passed (два долгих сценария подтверждены последовательным повторным прогоном).
  - ✅ Механическая декомпозиция доделана (2026-08-31): последние инлайновые блоки CampScreen
    вынесены по шву R14.2 (контракт `campMarketView.ts`, JSX перенесён дословно) — `BuildPanel`
    (слоты тактик/предметов + Editions/зачарование/trade-in), `ActionsPanel` (Camp Actions),
    `ReservePanel` (скамейка + reserve героев). CampScreen 1344 → 972 строк; поведение
    байт-в-байт: полный anteRun e2e (клики по всем трём панелям) и unit-набор на обоих
    датасетах зелёные без единой правки тестов.
- **R13.5 — Editions как ВТОРАЯ ось вместо новых тиров редкости. ✅ `Charged` реализована
  2026-08-09, `Tempered` — LG4 2026-08-10.** Совпадает с уже принятым
  решением: качество — конечная ось (`R12.4`, центр останавливается на `maxRank`), а бесконечный
  `+OVR` запрещён PRD §5.9.2. Edition меняет ПОВЕДЕНИЕ карточки, а не величину — это правильная
  форма ответа на потолок билда (`R12.6`).
  - ✅ **`Charged` (2026-08-09, b1.27.0).** Решения пользователя: заряд = +20% к эффекту карты
    (потолок 3 → до +60%), источник — дроп в карточных наградах актов 3+ (шанс 0.3, отдельный
    Rng-поток `:edition` — потоки `:card`/`:card-upgrade` byte-identical, seed-coupled тесты не
    сдвинулись). Механика: +1 заряд за пройденный этап с ВЫПОЛНЕННЫМ условием (те же sources, что
    боевой расчёт — общий `activeCardIds` в runStrength), поломка сжигает в 0; drawback НЕ
    масштабируется (иначе Edition наказывала бы за то, за что награждает); только тактики и
    предметы с силовым эффектом (economy/boss-картам заряд нечего усиливать — `hasPowerEffect`).
    Слой применения — внутри `evaluateTactics`/`evaluateItems` (обязательное поле контекста по
    уроку cardRarity), поэтому игра, превью, разборы и симулятор считают одним кодом; сим
    начисляет заряды тем же правилом (R10). UI: бейдж на награде/слоте билда, счётчик на рейле,
    правило и множитель в инспекторе; цвет — токены `--edition-charged*`, рамку не красит.
    Сейв: `cardEditions`/`cardCharges` в снапшоте экономики, legacy читается пустыми; bump
    `BALANCE_CONFIG_VERSION b1.27.0`. Замеры: 11 unit (заряды/дроп/roundtrip), anteRun e2e
    16 passed, живой прогон — Charged выпала на этапе 12 и накопила 0/3→3/3 с капом.
    - ✅ **A/B на ОДНИХ 400 сидах (2026-08-09, `NOEDITIONS=1` — поведенческий эквивалент b1.26).**
      `synergy-build` win 46.0% → 46.3% (+0.3pp при ст. ошибке ≈2.5pp — шум), проходимость S25
      86.0% → 86.4%, Династий 184 → 185; остальные агенты не сдвинулись НИ В ОДНОЙ строке —
      таблицы выживания идентичны, что заодно эмпирически подтверждает изоляцию потока `:edition`.
      **Вывод:** фича безопасна (инфляции силы нет), но на жадных агентах почти не играет — по тем
      же причинам, что card-upgrade в R14.3: агенты редко доживают до акта 3 с живыми условиями и
      не «держат» условие ради зарядов. Число НЕ заменяет плейтест: решение об усилении
      (dropChance 0.3→0.4 или bonus 0.2→0.25) — только после живой игры на поздних актах.
      Для следующего захода отчёту сима нужны edition-метрики (взято Charged / средние заряды /
      доля этапов с активной Charged) — сейчас их не видно, и калибровка полуслепая.
      *(Сделано в LG5 2026-08-10 — строка Editions в отчёте.)*
    - ✅ **Charged для УЖЕ взятой карты (вопрос пользователя 2026-08-10, b1.28.0).** Оффер
      улучшения предмета с акта 3+ может прийти заряжающим: для карт ниже потолка — «тир выше И
      Charged», для максированных (arcana) — чистый edition-оффер «та же карта становится
      Charged» (единственный путь роста arcana). Отдельный подпоток `:upgrade-edition` — потоки
      `:card`/`:card-upgrade` не сдвинуты; `chooseReward` требует хотя бы одну ось роста
      (тир и/или заряд) и применяет обе, что есть. Асимметрия «ранняя Charged дорастает до
      arcana, но выращенная arcana навсегда обычная» закрыта.
    - ✅ **Потолок зарядов растёт с тиром (решение пользователя 2026-08-10, b1.29.0).** Шкала
      standard 2 → refined 3 → exotic 4 → arcana 5 (+40…+100%); тактики без тира — фикс 3. Пол 2,
      а не 1: Charged на standard-карте обязана оставаться живым дропом, а не мёртвым слотом.
      Качество получает смысл ПОСЛЕ потолка величины: апгрейд тира заряженной карты поднимает
      ёмкость на месте, заряды сохраняются. Реализация: `chargeCapForRarity` в `editions.ts`,
      кламп при НАЧИСЛЕНИИ (`accrueCharges` → `chargeCapOf`), множитель `chargeFactor` от числа
      зарядов не изменился — в сейве заряды никогда не превышают потолок карты. UI показывает
      пер-картный потолок (инспектор, бейдж лагеря, подсказка). Rng-потоки не тронуты (потолок
      не роллится); 14 unit, полный e2e 78 passed.
  - `Crystal` (усиление + шанс `Cracked` + платный ремонт) — самый рискованный. Даёт поздний источник
    силы, риск и gold sink разом, но добавляет ВТОРУЮ систему, которая отключает куски билда помимо
    боссов. Брать последним и мерить симулятором отдельно.

#### Спорно — принимать с правками

- ⚠️ **`Tempered` в описании плана не ложится на нашу модель боссов.** План определяет его как «boss
  condition не может полностью отключить карту». Но наши боссы карточки НЕ отключают: они дают
  условный штраф к силе по конкретному слагаемому. А защита от штрафа уже есть и занимает слот —
  это `blackKingBar` (`bossPenaltyFactor`) и `linkensSphere` (`bossPenaltyCap`). В нынешнем виде
  `Tempered` дублирует роль существующего предмета. Либо переформулировать (например «штраф босса по
  слагаемому этой карточки уменьшается»), либо заменить третью Edition на другую идею.
- ⚠️ **`Hero Facets`: внутреннее противоречие.** План перечисляет три варианта
  (`Signature` / `Flexible` / `Anchor`) и тут же требует «вариантов всегда два». Нужно решить.
  Отдельно: `Flexible` («герой считается дополнительным тегом») обязан быть состоянием ЗАБЕГА, а не
  правкой словаря тегов — `heroTags.v1.json` заморожен намеренно (`R8.1`), и его изменение поменяло
  бы смысл уже выданных карточек в чужих сидах.
- ⚠️ **`Contracts` и `Dynasty mutators` пересекаются с уже запланированными Stakes (`T6.4`).** Stakes
  в PRD — это ровно «новые ограничения / boss / economy trade-off вместо роста OVR», то есть та же
  идея «выбираешь характер сложности». Заводить рядом две системы нельзя (тот же довод, по которому
  предметы делят слоты с тактиками, а не заводят второй инвентарь). Решение нужно ДО реализации:
  либо Dynasty-мутаторы — это и есть Stakes, применённые к Династии, либо Contracts поглощаются
  Stakes как их задачная часть.
- ⚠️ **`Reforge` как отдельный магазин после Act 3** противоречит главной цели самого плана —
  снизить сложность экрана. Новый экран в том же milestone, где мы убираем визуальный шум, — это шаг
  назад. Если Reforge нужен, он должен жить внутри Буткемпа как ещё один вид оффера.
- ⚠️ **Конфликт визуальных осей, который план сам же запрещает.** В §15 он верно предостерегает от
  «роли, редкости, Edition и дельты как четырёх ярких рамок одновременно», но в §8 предлагает именно
  четвёртую ось. Развести заранее: редкость владеет ЦВЕТОМ рамки (`--card-tier-*`, уже есть от
  `R11.5`), Edition — МАТЕРИАЛОМ/текстурой, роль — бейджем, дельта — текстом. Иначе получим
  ту же кашу, только цветную.

#### Порядок, который предлагаю (пересмотрен 2026-07-31 после повторной жалобы)

1. ✅ **R13.1 + R13.2** — два подтверждённых бага.
2. ✅ **R13.4** — пользовательская навигация по разделам; механическая декомпозиция JSX остаётся
   отдельным рефакторингом без изменения поведения.
3. ✅ **R13.3** — компактные карточки + взаимодействие «вся карточка → оверлей» вместо
   промежуточного `OfferInspector` (2026-08-02).
4. **Анимации** по таймингам из §14 плана (они разумные и совпадают с нашим правилом
   `prefers-reduced-motion`) — но только ПОСЛЕ того, как карточки станут фиксированными: анимировать
   растягивающиеся карточки бессмысленно.
5. **R13.5 `Charged`** — одна Edition, замеренная симулятором, прежде чем добавлять остальные.
6. **Решение по Stakes vs Contracts/мутаторы**, затем `R12.6` целиком.

**Deps:** R12.1–R12.5 ✅. Пересекается: `T6.4` (Stakes), `T6.5` (roguelite feel / UX-полиш) — R13.3/R13.4
фактически являются его вертикальным срезом и должны быть записаны туда же, а не рядом.

### R14 — Плейтест 2026-08-03: плотность карточек, анимации, арт ✅ (Ревизия статусов 2026-08-31: R14.1–R14.9 закрыты, сужение рынка отменено плейтестом)
*(R14.1–R14.7 закрыты; сужение пака отменено следующим плейтестом, рынок снова 5+5)*

**Происхождение.** Живой проход Буткемпа (draft → этап 1 → лагерь → этап 2 → live-турнир) плюс
жалоба пользователя: «не хватает классных анимаций, лучшей оптимизации пространства (минимализм в
карточках), картинок». Каждый пункт ниже подтверждён замером на живом экране, а не на глаз.

#### Что оказалось НЕ так, как я сначала записал

- ❌ **«Левая панель оставляет ~1300px пустоты» — неверно.** `camp__team` уже `position: sticky`
  ([camp.css:99](../web/src/features/run/camp.css:99)). Чернота в моём первом замере была
  артефактом виртуального экрана 1800px: при обычной высоте панель едет за скроллом. Пункт снят
  до реализации.
- ✅ **Проверять анимации через `getAnimations()`, а не `getComputedStyle`** — правило из
  design-language подтвердилось на практике: второй бодро показывает `running` у неиграющей
  анимации.

#### Сделано

- ✅ **R14.1 — карточки рынка перестали резать имена и прятать арт (2026-08-03).** Три дефекта
  плотности, пережившие R13.3/R13.4: (1) карточка игрока печатала роль ДВАЖДЫ — подпись слота и
  `RoleTag`, причём обрезалась именно подпись («SUPPO…»), отбирая ширину у ника; (2) карточка hero
  re-pick делила 148px между ДВУМЯ портретами, и имя героя обрезалось у обоих («Keep…», «Night …»,
  «Warlo…») — теперь один крупный портрет входящего, заменяемый строкой; (3) ряд «Улучшение
  героев» состоял из пяти карточек, отличавшихся только именем в 10px. **Замер:** обрезанных имён
  в Market было 5, стало 0; высота секции 940px → 1041px — рост осознанная цена за арт и
  читаемость, частично отыгран переносом «?» в строку заголовка.
- ✅ **R14.2 — `CampScreen` разобран на панели (2026-08-03).** Тот самый остаток R13.4. 1687 → 1151
  строк: `CampCards.tsx` (части без стора), `MarketPanel.tsx` + типизированный контракт
  `campMarketView.ts`, `RewardPanel.tsx`. Шов — «экран считает, панель рисует», тот же, что уже
  выбран у `campPresentation`. Build/Preparation/Reserve НЕ трогались намеренно: они делят один
  `<section>` с переключаемыми id/testid.
- ✅ **R14.3 — предмет можно найти лучшим качеством (2026-08-03).** Баг доступности из плейтеста:
  `cardOffer` отсекал взятый id целиком через `ownedCards` — правило верное для тактик и Camp
  Actions, но неверное для предметов, у которых есть ось качества (R11.2). Ранний `standard`
  навсегда закрывал ту же карту в `arcana`. Теперь предмет возвращается в пул строго лучшим тиром
  и поднимает качество НА МЕСТЕ (второй слот не занимается, `ownedCards` не растёт — это ход
  `upgradeHeroRarity`, перенесённый на карточки); полные слоты такую награду не блокируют.
  - **Отдельный ролл вместо записи в общем пуле.** Наивная реализация давала ~2% за лагерь (в пуле
    43 карточки) — ось роста, которой на практике нет. `ECONOMY.cardUpgradeChance = 0.35`
    (плейсхолдер до калибровки); поток `:card` остался прежним, поэтому сид без улучшаемых
    предметов выдаёт ровно прежние награды.
  - **Баланс, A/B на ОДНИХ 400 сидах** (b1.22.0 → b1.23.0): `synergy-build` 45.5% → 46.3% (+0.8pp
    при ст. ошибке ≈2.5pp — шум), `greedy-power`/`greedy-oracle`/`naive-ovr` не сдвинулись вовсе,
    золото 45.2 → 45.2. ⚠️ Агенты редко держат полный билд («слоты полны» 19%), поэтому путь
    улучшения задевают слабо — число не заменяет плейтест.
- ✅ **R14.4 — раздача карт и вспышка золота (2026-08-03).** В `camp.css` не было ни одного
  кейфрейма. Переиспользован `ui/Dealt` из драфта (15 карточек сквозным индексом, шаг 45ms вместо
  110ms — правило бюджета для плотной раскладки), в `CampView` добавлен `marketSerial` как ключ
  раздачи (смысл `packSerial`), вход раздела — глобальный `.enter`.
  - 🐛 **Набег ЧИСЛА у золота откатан по замеру.** Первая версия ставила `useCountUp` на значение,
    и живьём счётчик показал 6 при настоящих 7: набег идёт на `requestAnimationFrame`, в неактивной
    вкладке rAF тормозится, число застревает. Для Team OVR это косметика, для золота — цифра, по
    которой решают, хватает ли на покупку. Осталась вспышка направления, значение точное.
- ✅ **R14.5 — иконки предметов (2026-08-03).** Все 34 карточки каталога — настоящие предметы Dota,
  а рисовались текстом. Таблица `game/itemArt.ts` явная и покрыта тестом против `ITEM_IDS`: слаги
  НЕ выводятся из id механически (`shadowBlade` → `invis_sword`, `scytheOfVyse` → `sheepstick`,
  `eulsScepter` → `cyclone`, `aghanimsScepter` → `ultimate_scepter`), и наивное преобразование дало
  бы молча битые картинки у трети каталога. Слаги сверены загрузкой — 34/34 отдаются с CDN.

#### Осталось

- ✅ **R14.6 — build rail: билд виден на всех экранах забега (2026-08-04).** `BuildRail` —
  компактный ряд (иконка предмета, рамка по качеству, погашенная карточка = условие не выполнено,
  пунктир = свободный слот) в Буткемпе под навигацией разделов и на экране этапа над разложением
  силы. Активность берётся из ТЕХ ЖЕ `sources`, что и боевой расчёт, поэтому подсветка структурно
  не может разойтись с тем, что сработало; сборка списка — чистая `buildRailCards`, чтобы два
  экрана не завели каждый своё правило. Стили лежат рядом с компонентом: рейл рисуется и на экране
  турнира, который `camp.css` не подключает.
  - ✅ **Вспышка «вот что участвует» — реализована 2026-08-09 честным вариантом.** Тактика у нас —
    статический модификатор этапа, «срабатывания по ходу турнира» нет, поэтому вспышка играет
    ОДИН раз на старте симуляции: при уходе со стадии field активные карточки рейла вспыхивают
    каскадом (`rail-ignite`, 640ms + 90ms/карта; `ignite`-ключ BuildRail). Resume посреди турнира
    не переигрывает (ключ сравнивается с прошлым значением, а не с монтированием); неактивные
    карточки не вспыхивают — вспышка не врёт. Замер: класс и анимация пойманы живьём на этапе с
    активной картой; reduced-motion гасит.
- ↩️ **R14.7 — сужение рынка до трёх карт отменено плейтестом (2026-08-04).** Первоначально
  `MARKET_PACK.size = 3` заменил правило «карта на каждый ролевой слот»; сужение идёт тем же
  `balancedPackSlots`, что обслуживает Last Dance, поэтому
  роль не вымирает. Рынок 15 карточек → 11 (ряд улучшения качества это активные герои, а не
  предложения — сужать нечего). Освободившееся место ушло В КАРТОЧКИ: минимум трека 148 → 240px,
  ширина карточки 148 → 262px, портрет вдвое крупнее.
  - 🐛 **Найдено тестом: `Last Dance` нельзя было оставить как есть.** Её цена — 2 карты из пака.
    На базе 5 это «5 → 3», на базе 3 стало бы «3 → 1», а пак меньше двух `balancedPackSlots` не
    может сбалансировать по ролям — саппорт-слот снова стал бы неулучшаемым (дефект R9.1 через
    заднюю дверь). Цена уменьшена пропорционально: 2 из 5 ≈ 1 из 3.
  - **A/B на ОДНИХ 400 сидах (b1.23.0 → b1.24.0):** `synergy-build` 46.3% → 43.5% (−2.8pp при ст.
    ошибке ≈2.5pp), `greedy-oracle` 10.3% → 2.8%, `greedy-power` 5.5% → 1.0%, карт с плюсом за
    лагерь 2.03 → 1.53, золото 45.2 → 41.0. Дефицит наказывает «покупай лучшее каждый лагерь»
    втрое сильнее, чем игру от сборки, — направление то, которого добивались.
  - ⚠️ **Оговорка к замеру:** агенты почти не реролят (`rrl` 0.72), а вся задуманная контригра —
    покупка вариантов рероллом. Sim показывает цену сужения БЕЗ компенсации, поэтому по числам
    этот выбор не решается.
  - ✅ **Решение после плейтеста 2026-08-04: вернуть 5+5.** Компактные карточки снова помещают
    пятёрку в ряд, а потеря двух вариантов ощущалась хуже, чем прежняя плотность экрана.
    `BALANCE_CONFIG_VERSION` → `b1.25.0`; Last Dance остаётся единственным сужением рынка и снова
    снимает исходные 2 карты (`5 → 3`).
- ✅ **R14.8 — аватары игроков и логотипы команд (2026-08-04).** Поля `players.avatarUrl` и
  `packs.logoUrl` в схеме, Go-пайплайне (`FetchProPlayers` + поштучный `FetchTeam`), TS-типах, моке
  и UI. Мёртвый `logoId`, не заполнявшийся ни разу, убран.
  - **Покрытие замерено ДО реализации и определило форму задачи.** Логотипы: `/teams` даёт 48%
    (пять страниц — 62% и потолок), поштучный `/teams/{id}` отдал логотип у 11 из 12 «непокрытых»
    ⇒ ~95% за ~320 запросов (≈5 мин, только CI). Аватары: `/proPlayers` — 5081 аватар ОДНИМ
    запросом, но по нашим составам 35% (384 из 1096), потому что источник перечисляет ДЕЙСТВУЮЩИХ
    про. Поштучный `/players/{id}` дал бы ~100% за ~1100 запросов ≈ 18 минут пайплайна — **не
    берём**, это цена, несоразмерная 32-пиксельной картинке.
  - **Отсутствие картинки — норма, а не сбой**, поэтому фолбэк-монограмма выглядит законченной
    плашкой, а размер задан в CSS: картинка не двигает раскладку, когда доедет.
  - **Размещение выбрано по покрытию:** логотип — в паке (~95%, ряд однороден); аватар — в профиле
    игрока, где он ОДИН. В паке 35% дали бы рваный ряд из фотографий и монограмм.
  - 🐛 Две регрессии, пойманные замером: логотип приезжал 33px вместо 22 (правило портрета героя
    било по любому `img` в строке и выигрывало у CSS-модуля по специфичности); в строке
    идентичности знак отнимал ширину у ника и имена снова резались — знак переехал в верхнюю
    строку, где после R14.1 стоит один чип роли.
  - Данные заполнятся на следующем data-refresh в CI.
- ✅ **Переход этап ↔ Буткемп** — закрыт хвостом R15.2: `App.tsx` оборачивает экраны фаз в
  `enter-fade` с `key={phase}` — смена фазы переигрывает мягкий фейд (`fade-soft` 360ms) вместо
  мгновенной подмены. Замер 2026-08-10: анимация в `getAnimations()` на живом сервере.
  *(Пункт был устаревшим — реализацию закрыла веха R15.4/R15.6, запись не обновили.)*

- ✅ **R14.8 — резерв героев без лимита + улучшение своего героя прямо в ролле (плейтест 2026-08-05).**
  - **Симптом:** «в рюкзаке только три героя, приходится покупать одних и тех же».
  - **Корень оказался двойным.** Резерв резался `slice(0, 3)`, и покупка четвёртого молча
    выбрасывала оплаченного золотом героя. А вытесненный возвращался в пул рынка (снятые герои
    из него вычитаются) — и предлагался снова. То есть «одни и те же» были прямым следствием
    лимита, а не совпадением.
  - **Правило теперь одно на обе скамейки:** снятое не пропадает (как у игроков).
  - **Рынок:** свои герои больше не вычитаются из рулетки. Выпавший АКТИВНЫЙ герой приходит картой
    улучшения, если выпавшее качество строго выше текущего, и не приходит вовсе, если не выше.
    Пак остаётся пятикарточным — улучшение это второй ВИД карты, а не отдельная секция.
    Побочный эффект и есть цель: пул вычерпывается, потому что герой уходит из него, достигнув
    потолка качества.
  - **Экономика без второй лестницы:** цена карты = `upgradePathCost` — сумма шагов того же
    грайнда в Preparation. Инвариант «купить готового дешевле, чем вырастить» цел; мета-гейт
    первого забега общий с грайндом.
  - 🐛 Пойманное замером: пропуск неподходящего своего героя ВНУТРИ цикла рулетки съедал попытку
    вытягивания и молча сокращал пак до четырёх карт. Фильтр переехал ДО рулетки.
  - ⚠️ **Цена:** сдвиг предложений рынка развёл забег на захардкоженном `CHEAT_SEED` — два e2e
    упали не на регрессии кода (проверено возвратом лимита: тест сразу зелёный). `CHEAT_SEED`
    теперь читается из env, чтобы перебор не требовал правки файла.

- ✅ **R14.9 — резерв не копит слабые формы; блок улучшений не мигает на рерролле (плейтест 2026-08-05).**
  - **Форма своего игрока.** Апгрейд формы ТОГО ЖЕ человека больше не кладёт старую версию в
    резерв — она исчезает. Рынок выставляет свою форму, только если она сильнее текущей
    (`stockedForms`), а Chemistry и Hero Synergy считаются по `accountId` и переносятся: слабая
    версия отличается лишь Base и доказуемо хуже во всём. Возврат к ней — не выбор, а мусор в
    инвентаре. Прежнее правило («старая форма тоже уезжает на скамейку») отменено сознательно.
    Замена на ДРУГОГО человека работает как раньше — снятый уходит в резерв.
  - **Мигание.** Блок улучшений качества ключевался `campStageIndex:marketSerial`, поэтому реролл
    менял ключ, React перемонтировал неизменные карточки, и раздача `Dealt` переигрывалась. Ключ
    теперь только по лагерю. Проверено замером: узлы переживают реролл, а `currentTime` анимации
    монотонно растёт через него (при перемонтировании сбросился бы в ноль).
  - 🐛 **Дыра правила закрыта 2026-08-10 (плейтест: «Satanic 88 остался при активном 95»).**
    R14.9 чистил резерв при апгрейде формы, но слабая форма, попавшая в резерв РАНЬШЕ (заменой
    на другого человека), выживала, и резерв предлагал даунгрейд как выбор. Теперь
    `engine.replacePlayer` выметает со скамейки формы ВХОДЯЩЕГО человека не сильнее активной
    (более сильная — теоретический кейс — не трогается). Unit-тест воспроизводит полный путь
    бага; replay лога на resume применяет правило детерминированно.

**Deps:** R13.3/R13.4 ✅ (анимировать имело смысл только после фиксированных карточек).
Пересекается: `T6.5` (roguelite feel) — R14.1–R14.5 являются его вертикальным срезом.

### R15 — Аудит 2026-08-09: game feel / juice против Balatro ✅ (R15.1–R15.8 все закрыты; звук R15.5 — 2026-08-18)

**Происхождение.** [Аудит feel-слоя](audits/2026-08-09-roguelite-feel-audit.md): механика Balatro-парити
закрыта M5R, но **обратная связь на события цикла** осталась нулевой в трёх ключевых местах. У Balatro
juice — не украшение, а сам продукт: каждое событие получает слои отклика, и число слоёв растёт с
масштабом события. У нас после R14 есть раздача (`deal-in`), фольга редкости, вспышка золота — но самые
громкие моменты (покупка, «этап пройден», reveal турнира) немые. Правила motion уже зафиксированы в
[design-language.md](design-language.md) и скилле `game-feel-juice` — новые кейфреймы обязаны им следовать
(глобальный `base.css`, не CSS-modules; проверка `getAnimations()`; `prefers-reduced-motion` бесплатно
через правило по `*`).

**Сквозной принцип R15 — лестница эскалации.** Отклик пропорционален событию:
малое (обычная покупка) = 1–2 слоя (exit-анимация + вспышка числа); среднее (апгрейд редкости,
босс-этап) = +пульс рамки/синг; большое (этап пройден, Aegis, смерть забега) = полная секвенция
(перекрытие, счёт выплат, при желании shake). Одинаковый отклик на всё == отсутствие отклика.

- ✅ **R15.1 — отклик покупки/апгрейда (2026-08-09).** Реализовано с ДВУМЯ отличиями от плана,
  оба по замеру. (1) Не «задержать покупку до конца exit-анимации», а **ghost**: движок зовётся
  сразу (золото/радар вспыхивают в момент клика, e2e читают состояние синхронно —
  `anteRun.spec.ts:85` читает золото сразу после клика, задержка бы его уронила), а уход играет
  слепок карточки, замороженный в момент клика (`MarketGhost` в `MarketPanel`): повторный рендер
  оффера пересчитал бы превью по уже изменившемуся состоянию и текст менялся бы на глазах. Ghost
  вставляется на прежнюю позицию с ТЕМ ЖЕ key — узел не перемонтируется, `deal-in` не переигрывается;
  реролл/новый лагерь чистят ghosts; страховочный таймер на случай паузы CSS-анимаций в скрытой
  вкладке. (2) Вспышка радара **уже существовала** (Pentagon: `useCountUp` + `pentagon__ovr--up/down`,
  проверено по коду) — аудит её не заметил, пункт снят. Пульс BuildRail — по prev-ids (пульсирует
  только добавленная при живом рейле карта, не весь ряд при монтировании экрана).
  Замер: `getAnimations()` на живом 5273 показывает `camp-card-exit` при покупке и `rail-card-in`
  у fresh-карточки; `[data-leaving]` появляется и уходит. reduced-motion: ghost не создаётся.
- ✅ **R15.2 — секвенция «этап пройден» (2026-08-09).** `CampCelebration` поверх лагеря: заголовок
  «Stage N cleared» → «Finished: 3rd» → строки payout стаггером 120ms (переопределение
  `--motion-enter-stagger` на контейнере; значения из уже начисленного `lastPayout`, анимируется
  появление, не цифры). Триггер — транзиентный `campCelebration` в runStore: взводится ТОЛЬКО в
  `openCampAfterStage` (свежий проход порога/вход в Династию), в `SavedRun` не пишется — resume
  секвенцию не переигрывает и продублировать эффекты не может. Закрытие: клик в любом месте /
  Escape / Continue / **авто через 2.6s** — секвенция это переход, вся информация остаётся в шапке
  (`camp__payout`); авто-закрытие заодно оставило 20+ существующих e2e без правок (клики дожидаются
  ухода перекрытия штатным auto-wait). Cheat Mode прячет золотые строки («∞» делает выплату шумом).
  - **Смерть/победа — сознательно НЕ вторым перекрытием:** у них уже есть свои терминальные экраны
    (`ante-result`, `SeasonVictory`, champion-панель) — им добавлена вспышка вердикта и печать места
    (R15.3), а второе перекрытие поверх собственного экрана итога дублировало бы сущность.
  - ✅ Переход между фазами (этап ↔ Буткемп, драфт → турнир) — мягкий `enter-fade` на обёртке с
    `key={phase}` в `app/App.tsx` (2026-08-09): экраны и так меняют компонент при смене фазы,
    лишних перемонтирований обёртка не добавляет. Закрывает остаток R14.
- ✅ **R15.3 — reveal турнира как драматургия (2026-08-09).** Поправка к аудиту: вход строк
  результатов УЖЕ был (`enter-fade` на `.group-result` — живой замер его просто не поймал), поэтому
  сделаны три реально отсутствовавших слоя. (1) **FLIP пересортировки** таблиц групп:
  `useStandingsFlip` — WAAPI-анимация от прошлой позиции к новой по `data-flip-key`, `offsetTop`
  вместо `getBoundingClientRect` («камера» скроллит окно между рендерами — вьюпорт-координаты дали
  бы ложный сдвиг всем строкам), активен только после fill-фазы (иначе дерётся с входной fade-rise
  за transform). (2) **Вспышка своего матча** цветом исхода в момент появления строки
  (`user-result-flash`, ничья 1–1 нейтральна) — тот же кейфрейм у вердикт-баннера
  `ante-result--playing/won/lost`. (3) **Печать места** (`stamp-in`, scale 1.6→1) на «Your finish»
  и имени чемпиона со сдвигом 140ms. Синг босса не делался (опционален, ждёт звукового слоя R15.5).
  - 🐛 **Шишка каскада, пойманная замером:** модификатор той же специфичности, что `.enter`/
    `.enter-fade`, молча проигрывает им shorthand-войну (порядок инъекции base.css/feature-css не
    гарантирован) — `getComputedStyle` показывал только `fade-soft`. Селекторы подняты до двух
    классов; правило добавлено в скилл `game-feel-juice`.
  - Замер: `getAnimations()` на живом 5273 — `waapi-transform` (FLIP), `stamp-in`,
    `user-result-flash` (после фикса каскада), классы исхода на своих строках появляются (2/2).
- ✅ **R15.4 — shake/impact-бюджет (2026-08-09).** `screen-shake` (±3px, 280ms, transform-only,
  `base.css`) на `main.run` ровно в двух кульминациях: Aegis взят и смерть забега. «Босс завален»
  сознательно НЕ триггерит: после `finishTournament` store.boss уже переключён на превью
  СЛЕДУЮЩЕГО этапа (`campBosses`), и отдельного сигнала «этот этап был боссовым и пройден» нет —
  заводить его ради тряски значит протаскивать презентацию в оркестрацию. Тумблер в Settings
  («Тряска экрана», default on; персист `aegis-draft.screenShake` через `state/persist` — ключ
  добавлен в persist.test) + `prefers-reduced-motion` гасит глобально. Замер: `screen-shake` в
  `getAnimations()` на живой смерти забега; класс снимается по `animationend` с фильтром имени.
- ✅ **R15.5 — звуковой слой v1 (2026-08-18, по решению пользователя).** [`ui/sound.ts`](../web/src/ui/sound.ts):
  WebAudio, полностью **процедурный синтез** — ассетов нет вовсе (0 КБ против «<30KB», лицензий
  нет), каждый звук собран из голосов (осциллятор/шум через bandpass + экспоненциальная огибающая).
  Unlock на первом жесте (`initSoundUnlock` из main.tsx; до жеста тишина и ноль autoplay-ошибок —
  проверено консолью живьём), каждый вызов дополнительно пробует `resume`. Master-тумблер «Звук»
  в Settings тем же паттерном, что тряска (`useSoundSetting`, persist `aegis-draft.sound`) —
  off переживает перезагрузку (проверено живьём). В TMA отдельного mute-API у Bot API нет
  (проверено по типам SDK) — управляет наш тумблер. Набор v1 по лестнице эскалации: deal
  (пип на карту, питч по индексу — Balatro-приём; задержка = реальный CSS-стаггер узла, камп
  плотнее драфта автоматически; под reduced-motion раздача не озвучивается — пип принадлежит
  движению), buy (щелчок+блип: рынок, улучшения качества), reroll (свип: драфт и рынок),
  win/loss-стинги новых reveal-строк своей команды в группе (там же, где вспышка R15.3),
  boss-синг на входе в поле боссового этапа (редкое событие), cash-тики секвенции R15.2 (в такт
  enter-стаггеру строк выплат), sfxVerdict — победа/смерть забега (те же две кульминации, что
  shake R15.4; тумблеры независимы). Любой сбой WebAudio молча глотается (игра полноценна в
  тишине, a11y). Тесты: `test/sound.test.ts` (no-op без AudioContext = headless e2e, unlock без
  window, персист тумблера); полный e2e не слышит звук и зелёный.
- ✅ **R15.6 — hover tilt карточек (2026-08-09).** `ui/motion.useCardTilt` — один делегированный
  pointermove-слушатель на корне Буткемпа (карточки перемонтируются раздачей, вешать на каждую —
  утечка логики в списки); JS пишет только `--tilt-x/--tilt-y`, CSS (`camp.css`) —
  `perspective + rotate` под `@media (hover: hover) and (pointer: fine)`. Слоты билда не
  наклоняются (у мини-плиток эффект читается дрожанием); touch без tilt; reduced-motion выключает
  целиком; только мышь (`pointerType === "mouse"`).
- ✅ **R15.7 — «пропавшие кнопки» после reveal групп: НЕ баг (закрыто 2026-08-09).** Чистый repro
  (инструментированный прогон route-эффекта + диагностический спек) показал: групповая стадия
  штатно доигрывается, `advance()` вызывается, плей-офф ревилится до конца. «Тупик» аудита — это
  сумма двух наблюдений: (а) route-фаза распределения (~7s: подпись + построчная раскраска) идёт
  БЕЗ action-кнопок — сэмплы аудита попали в неё; (б) на cheat-сейве той сессии забег к этому
  моменту уже честно ПРОИГРЫВАЛ этап (см. R15.8) и показывал «Eliminated», а не Reward. P0 нет.

- ✅ **R15.8 — три красных e2e: пере-подбор сидов (долг R14.8/R14.9, закрыто 2026-08-09).**
  `anteRun` :100/:426/:535 падали ДО правок R15 (проверено stash-прогоном на чистом дереве):
  сдвиг рынка R14.8/R14.9 сделал `camp-e2e-3` непроходным на этапе 3, а `cheat-e2e-6` — до финала
  акта — **на реальном датасете**. По записанной конвенции («перебор, а не ослаблять проверку»)
  подобраны новые сиды: `CAMP_SEED = camp-e2e-26`, `CHEAT_SEED = cheat-e2e-15`.
  - 🐛 **Главная шишка: сид обязан проходить на ДВУХ датасетах.** Локально e2e играют на реальном
    OpenDota-слайсе, CI — на эфемерном mock (`gen:mock` перед `test:e2e`, ci.yml:82). Старые сиды
    были красными локально, но зелёными в CI; первый пере-подбор (по реальному) дал обратное —
    зелёно локально, 4 красных на mock (на mock драфт «первым доступным» собирает ростер 88+ OVR,
    и static-забег живёт 10 этапов — тесты «завершение забега» и «вне статистики» не влезают в
    бюджет `slow()`). Поэтому критериев стало четыре: 3 этапа с карточной наградой (CAMP),
    boost-выживание акта (CHEAT), **static-смерть ≤6 этапов (оба сида)** — и всё это на mock И
    на реальном.
  - Инструмент: `scripts/sweep_seeds_both.ts` — модельный свип по текущему датасету (гоняется
    дважды: после `gen:mock` и после `git checkout -- public/data`), слои силы — те же функции,
    что игра (урок R10). Модель отбирает кандидатов пересечения; boostInCamp она повторяет
    неточно, поэтому финальный отбор — живой прогон cheat-тестов по кандидатам (3/9/13 упали,
    15 прошёл). Полный `anteRun` chromium зелёный на обоих датасетах.
  - Урок первой версии свипа: `tsx` не типочекает — опечатка в API экономики молча превращала
    boost-модель в static через `try/catch`; проверять, что модель реально ПОКУПАЕТ.

- ✅ **R15.9 — плейтест 2026-08-09 после деплоя R15.1–R15.3: четыре правки по живой игре.**
  - **Дыра вместо переезда карточек.** Покупка на рынке оставляет ячейку «Куплено» до конца
    раздачи — соседние карточки не сдвигаются, позиции сравниваемых офферов стабильны. Это
    **отменяет вывод R13.3 «SOLD-заглушка не делается»** по прямой просьбе пользователя; тогда
    заглушка требовала протечки consumed-офферов в UI, теперь она бесплатна поверх ghost-слепков
    R15.1 (порядок ячеек фиксируется `dealOrder` на первом рендере раздачи; реролл чистит дыры).
  - **Секвенция «этап пройден» стала НЕПРОЗРАЧНЫМ интерстициалом.** Полупрозрачное перекрытие
    показывало под собой лагерь с тем же заголовком — дубль обесценивал момент. Теперь сплошной
    `--bg` + брендовое свечение: короткий собственный экран, лагерь появляется после.
  - **`Show result` без рывка.** Камера в instant-режиме целилась сразу в две точки (сетка
    плей-офф и итоговая таблица) в одном коммите — два smooth-скролла дрались. Скролл к сетке
    убран: единственная цель шортката — итог. Замер: scrollY монотонный, 0 реверсов.
  - **Card-модалка открывается щелчком.** 220ms + двойной rAF + АНИМАЦИЯ full-viewport
    backdrop-blur читались как «подлагивает» (blur-transition пересчитывает кадр целиком).
    Вход 140ms, подъём 18→10px, блюр статичен с первого кадра — анимируется только затемнение.
    Замер: полная видимость ≈370ms от клика включая накладные Playwright (было ≈500+).

**Чего в R15 сознательно НЕТ.** Расширение прогрессии новыми системами не заводим: путь уже записан —
`R13.5` Editions (`Charged` первым), `R12.6` потолок билда, `T6.4` Stakes. Juice-слой и рост контента —
разные оси; смешивать их в одну веху нельзя (тот же довод, по которому предметы делят слоты с тактиками).

**Deps:** R13.3/R13.4/R14.1–R14.5 ✅ (фиксированные карточки и раздача — фундамент). Пересекается:
`T6.5` (roguelite feel) — R15 и есть его основное тело; `M7` (полиш). Изоляция Classic — как во всей
M5R: правки презентационные, `Rng`-поток и golden не двигаются; ничего из R15 не бампает
`BALANCE_CONFIG_VERSION` (чисел баланса тут нет).

## M6 — Builds, контент и баланс
- **T6.1 Tactics system:** 5 общих ограниченных слотов пассивных Tactics/Items; reward предлагает 3 варианта, новый можно экипировать, заменить/отклонить по правилам экономики. Эффекты data-driven, условные и с trade-off; безусловные глобальные `+N%` не добавляем. Первый набор-кандидат: `Signature Specialists`, `Old Teammates`, `Fresh Project`, `Wide Pool`, `No Superstars`, `Last Dance` (описания — PRD §5.10.3). UI показывает `до → после`, слагаемое Team OVR и причину срабатывания. Тесты фиксируют порядок применения, caps, stacking и детерминизм offers. ✅ (базовый набор из 5 — срез 4; **Wide Pool доехал 2026-08-30, b1.42.0** — стартовый набор PRD §5.10.3 полон)
  - **Wide Pool (2026-08-30, b1.42.0):** +Hero Synergy лестницей за 10+ РАЗНЫХ gameplay-архетипов
    среди назначенных героев (`distinctGameplayTags`; замер: случайная пятёрка покрывает 8–9,
    10+ — лишь ~23% случайных наборов ⇒ порог требует намеренного «широкого» драфта); потолок 2.4.
    **Trade-off:** вклад редкости героев ×0.5, пока карта экипирована (безусловный, как сужение
    рынка Last Dance): ранний билд (все common) не платит ничего, immortal-билд платит дорого —
    ранний рычаг, из которого билд честно вырастает через trade-in. Фактор проведён ЕДИНОЙ точкой
    `tacticRarityFactor` во все места сборки силы (runStrength/runStore/TournamentScreen/сим) и в
    превью рынка (`bestHeroOption`/`heroOptions` — иначе рынок ранжировал бы по несуществующей
    цене снятия immortal). R11.7-легибельность: при экипированной карте карточки героев Буткемпа
    показывают всю gameplay-ось (`conditionAxes`). Нового UI нет — карта едет через общие
    компоненты по id.
    - 📊 **A/B 300 общих сидов (свежий датасет 2026-08-30):** без карты 32.7%, с картой 36.7% —
      но вся дельта оказалась ПЕРЕСДАЧЕЙ ландшафта сидов от расширения пула наград (неизбежна для
      любой новой карты: `:card`/`:trade`-потоки сдвинулись): при невыполнимом условии
      (порог 99) — те же 37.0%, при пороге 11 — 37.0%. Вклад самой карты в винрейт агентов ≈0 —
      **тот же класс, что supply-правила T6.4: сим-агент не драфтит героев намеренно и условие
      «разные архетипы» не отыгрывает.** Числа карты — placeholder до живого плейтеста (как
      Charged в своё время); контроль «фича не ломает баланс» пройден.
    - Сдвиг пула наград ПОЙМАЛ CI (mock): сиды «разведки» и «предмета в слоте» перестали давать
      нужную карту первым Буткемпом — пере-номинированы оффлайн-сканом на ОБОИХ датасетах с
      пересечением (`camp-e2e-150`→`161`, `camp-e2e-13`→`5`), живой прогон обоих тестов зелёный
      на real и mock. ⚠️ Шишка процесса: локальная проверка «на mock» дала ложное зелёное —
      `npm run gen:mock >/dev/null 2>&1 &&` в цепочке фонового Bash молча не отработал, и спека
      прошла по РЕАЛЬНОМУ датасету; проверяй `manifest.dataHash` перед прогоном, а не глуши
      вывод генератора. Попутно закрыты два дрейфа tsx-вне-tsc: `find_camp_seed.ts` падал без
      обязательного `cardCharges` (R13.5), `sweep_seeds_both` не передавал costFactor в
      `refreshAnteMarketOffers`.
  - **Playtest 2026-07-24 (PF-4, PF-5):** добавить **economy-tactics** (множители золота / interest / held-gold доход — Balatro-парити), сейчас набор только про слагаемые OVR; пере-калибровать trade-off'ы (Last Dance: цена «−2/−2 карты рынка» > выгоды +2.1 Base). Дизайн экономики — отдельная спека.
  - 🔁 **2026-07-27:** дизайн экономических пассивок оформлен — [бриф §13/§16](roguelite-balatro-brief.md), реализация в `R8.3` поверх контракта Tournament Power (`R8.2`). До фикса `R9.1` калибровать Last Dance бессмысленно: её trade-off сегодня убирает не «−2 случайные карты», а обоих саппортов.
- **T6.2 Camp actions ✅ (сделано в срезах 4–5; статус закрыт ревизией 2026-08-11):** 2 ограниченных слота одноразовых `scrim / bootcamp / scouting / hero-practice / stand-in-transfer`; применяются только между этапами, не во время симуляции турнира, и исчезают после Win/Loss. Реализация: `game/campActions.ts` (5 действий, `CAMP_ACTION_SLOTS = 2`, статовые эффекты с явным trade-off) + `RunEconomy.playCampAction` (временный эффект чистится на `openCamp`); Scouting раскрывает правило следующего боссового турнира (семантика уточнена в `R9.4`), Stand-in даёт бесплатную замену игрока. Тесты: `anteEconomy.test.ts` («разыгрывается на один этап и сгорает», stand-in регресс, слоты), e2e Scouting на `camp-e2e-150`.
- **T6.3 Balance simulator:** массовый прогон seeds, win-rate по этапам/стилям, outlier builds; версионирование balance config. Для Dynasty отдельно строит survival curve (доля живых по абсолютному Stage), распределение первого Aegis/числа кругов, инфляцию золота и момент насыщения билда; проверяет, что обычная удачная сборка видит второй круг, сильная проходит несколько, исключительная может уйти на 20+ этапов, но ни один билд не масштабируется бесконечно быстрее поля. ✅ (Ревизия статусов 2026-08-31: остаток «Dynasty-метрики за срезом 6» закрыт `--dynasty`-режимом и LG5 — survival по абсолютному Stage, глубина p50/p90/max, смерти под боссом, «осмысленность» лагерей, Editions-строка)
  - ✅ **Инструмент + версионирование + первая калибровка (2026-07-24).** `game/balance.ts`: единая `BALANCE_CONFIG_VERSION` + агрегатор `BALANCE` (числа принадлежат своим модулям, здесь версия и единая точка обзора); каждый config-const помечен «правишь → бампай версию». **Версия в воспроизводимом состоянии:** `RunLink.b` (кодек + issue `"balance"`, значима только для mode "run", старые ссылки lenient) и `SavedRun.balanceConfigVersion` (инвалидирует resume roguelite при смене коэффициентов; classic не трогает; legacy без ключа lenient) — по образцу schema/rating/dataHash; i18n RU+EN на новые причины. **Симулятор** (`npm run sim -- N`, `scripts/sim_run.ts`): 4 стиля (`static`-контроль / `naive-ovr` / `boss-adaptive` / `chem-lean`), win-rate + распределение вылета по этапам + draft→final OVR + золото/покупки на Буткемп; env `NOBOSS=1` для сравнения; Dynasty-метрики (survival по абсолютному Stage, первый Aegis) — каркас готов, включатся в срезе 6. **Первая калибровка (решение «править только при явном вылете»):** замер показал наивно-осмысленную игру ~8% при PRD-цели 30–40% и статик, гибнущий уже на этапе 0 (вместо «жил до середины»); единственный консервативный сдвиг `ANTE_FIELD_HANDICAP 12→16` (кривая `idx·3−16`) поднял наивный симулятор до ~20% (skilled-человек ≈ цель), статик остался ≈0%, форма кривой и «static умирает без апгрейдов» сохранены; `BALANCE_CONFIG_VERSION b1.0.0→b1.1.0`, PRD §5.9.2/§10.E синхронизированы. Тонкая настройка порогов/экономики/боссов и Dynasty-профиль — итеративно с живым playtest. Тесты: `runLink.test.ts`/`runPersist.test.ts` покрывают версию баланса; `test` (295)/`test:e2e` (16)/`tsc`/`build`/golden зелёные (кривая мягче → seed-coupled e2e стабильны), схема/рейтинг/датасет не тронуты.
  - **Осталось (за срезом 6):** Dynasty survival curve по абсолютному Stage, распределение первого Aegis/числа кругов, инфляция золота и точка насыщения билда на бесконечной петле; когда появится T5.8.
  - 🔁 **Расширено 2026-07-27 → `R10`.** Текущий симулятор играет **не ту игру**: он не учитывает качества героев, ручное улучшение, Tactics/Items, Camp Actions, формы игроков, резерв, дорожающий reroll, interest, Tournament Power и акт-модель, поэтому его win-rate нельзя считать финальным аргументом ни за длину забега, ни за цены. Полный список требований, стратегий агентов и метрик — `R10`. Первая находка уже есть: замер поля показал, что кривая `сдвиг-и-кламп` схлопывает 90% поля первого этапа в одно значение (`R7.1`) — то есть измеренные ранее 8%/20% отражали в том числе этот артефакт.
- **T6.4 Meta progression ✅ (Stakes ✅, Штаб ✅, Playbook ✅ — 2026-09-02):** постоянный **Штаб** хранит коллекцию открытых определений карточек, статистику и трофеи, но не усиленные экземпляры. **Playbook** (гипотеза ≈8 карточек) выбирается перед обычным забегом и ограничивает reward/market pool, не давая бесплатной силы со старта; daily/challenge получает фиксированный Playbook, seeded run учитывает `playbookId + balanceConfigVersion`. После первой победы открываются **Stakes**: новые ограничения/boss/economy trade-off вместо простого роста OVR и без постоянного `+OVR`. ⬜
  - ✅ **Штаб, срез 1 (2026-09-02).** `features/hq/HqScreen` (`#/hq`, ссылка в настройках рядом с историей): трофеи, мастерство ставок, коллекция всех 45 карт с пометкой «встречалась» и статистикой (взята/побед/лучший этап). Данные — производные `careerStore` (`collectionStats`, `hqTrophies`); Roguelite Run пишет `CareerEntry.build` (id карт/действий, тиры, editions) в `recordCareer`; карточка истории показывает билд чипами. Разбор карты — существующий `BuildCardInspector`. Тесты: `test/hq.test.ts`, smoke e2e. Не гейтим определения и пул — это Playbook.
  - ✅ **Playbook (срез 2, 2026-09-02).** Решения пользователя: добровольный фильтр (гейта новичку нет), 6–10 карт с подсказкой 8, Tactics + Items, дейлик без Playbook, сид несёт список. Реализация: `game/playbook.ts` (канонизация/фильтр), `RunConfig.playbook` → `RunEconomy.setPlaybook` → `cardOffer`/`tradeOffers`; `state/playbookStore` (черновик в Штабе, per-device); переключатель в «Особых правилах» старта + сводка; чип в Буткемпе; метка в истории; ключ `p` в runLink (битый набор = битая ссылка), `runConfigsMatch`; `PLAYBOOK=` в sim_run. Без Playbook офферы байт-идентичны (тест) — сиды e2e не тронуты. Тесты: `test/playbook.test.ts`, e2e anteRun «Playbook ограничивает награды…», smoke (сборка в Штабе). **A/B в симе (2026-09-02, 300 общих сидов, `PLAYBOOK=…`):**
    - Сначала A/B показал обвал у всех билд-агентов (36.7% → 0%) — артефакт агента: `takeReward` брал карту вслепую по типу, и фиксированный набор заставлял держать в слотах карты без прироста. Добавлен агент **`select-build`** (synergy-opt + карта берётся только при приросте силы прямо сейчас, `rewardPowerDelta` тем же `evaluateRunPower`, что trade-in). Уже на полном пуле он даёт **52.7%** против 39.3% у прежнего лучшего — «бери карту только если она помогает сейчас» сильнее всего, что сим играл (вход для перекалибровки `R10`: цель PRD 30–40% для осмысленной игры превышена).
    - С `select-build`: полный пул **52.7%** (S25 60%, boss-death 6.3%) · **risk** (rapier/radiance/desolator/smoke/helm/refresher + signature/widePool) **59.7%** (+7pp, S25 63%) · **synergy** (тег-предметы + signature/widePool) **0%** · synergy на 10 картах **0%** · **chemistry** (4 тактики + buildDefining) **0.3%** · **economy** (BKB/Linken/economy-предметы) **0%**. Причина нулей — не пустой пул (проба: 10 карт за сезон против 12), а состав: условные тег-карты не совпадают с ростером, который агент драфтит по pairScore, агент их пропускает, остаётся без силы (strength p50 104 против 122) и без золота на качество (qual 7.8 против 11.7).
    - **Выводы для продукта:** (1) Playbook из безусловных карт — реальное преимущество ≈+7pp: это и есть «награда за коммит», но «бесплатной силы» PRD не обещал — решить, нужен ли налог (напр. −10% золота наград в Playbook-забеге) или оставить как честную цену выбора; (2) Playbook из условных карт — ловушка без драфта под теги: в подсказке Штаба и на карточках стоит показывать условие карты рядом с переключателем (сегодня — только в разборе); (3) сим не умеет драфтить под Playbook — оценка человека с намеренным драфтом выше нулей, но не измерена.
  - 🔁 **Решение 2026-08-09 ([спека поздней игры](roguelite-lategame-spec.md)):** Stakes и
    «мутаторы Династии» — ОДНА система правил. Определения впервые появляются как мутатор круга
    Династии (R12.6/LG3), затем те же определения подключаются добровольными стартовыми Stakes в
    `Special rules` (по образцу Cheat Mode). Отдельные Contracts не заводятся (развилка R13.5
    закрыта).
  - ✅ **Решено 2026-08-02 (PF-2):** общий инвентарь Tactics/Items расширен `3 → 5`, Camp Actions остаются `2`. Это продуктовый ответ на тесный билд без отдельного второго инвентаря; `BALANCE_CONFIG_VERSION b1.21.0→b1.22.0`. Требуется следующий массовый прогон T6.3/R10: больше слотов повышает потолок силы и меняет ценность поздних карт.
- **T6.5 Roguelite feel / UX-полиш (горизонтальный рост, после вертикального) 🟨.** Обратная связь 2026-07-23: механики Буткемпа работают, но «тыкать на поля без анимаций скучно». Нужно **оживить** экраны рогалита: анимации при выборе героев, выборе награды, покупке (реакция карточки, счётчик золота, всплытие `до→после`), переходах этап→Буткемп→этап; больше **разнообразия наград/бонусов**; арт в дота-стиле (портреты/предметы/иконки героев на карточках вместо голого текста). Приоритет — после того как вертикальная петля (экономика/рычаги/боссы/мета) наберёт содержание. Не блокирует срезы, но фиксируем, чтобы не потерять.
  - **Playtest 2026-07-24 (PF-3, PF-6):** reward-карта (Tactic/Camp Action) на экране Reward показывает только описание без числового `до→после` — нельзя сравнить с золотом; показывать конкретный эффект/ценность. Market-превью верно (проверено, 0 расхождений), но не очевидно, что `TEAM OVR`-дельта уже включает Chemistry → пояснять, почему «сильный игрок» бывает даунгрейдом.
  - 🔁 **Уточнено 2026-08-03: вертикальный срез продолжен в `R14`.** Анимации Буткемпа (`R14.4`) и арт предметов (`R14.5`) закрыты; остались build rail (`R14.6`), сужение рынка (`R14.7`) и аватары/логотипы, требующие правки контракта данных.
  - 🔁 **Уточнено 2026-07-30: вертикальный срез T6.5 — это `R13.3`/`R13.4`.** Плейтест показал, что «оживить» экран нельзя, не починив сначала его информационную архитектуру: карточки растягиваются под объём текста, поэтому анимировать нечего — размеры прыгают при каждом реролле и покупке. Порядок обратный тому, что напрашивается: сперва фиксированная карточка + инспектор + разделение экрана на Reward/Market/Build/Preparation, и только потом анимации (тайминги и правила — в `R13`). Пункт про арт (портреты/иконки вместо голого текста) остаётся здесь и от `R13` не зависит.

## M7 — Полиш
- **T7.1 Шеринг-картинка + название команды.** ✅ (шеринг-картинка сделана 2026-08-11 — см. ниже) ✅ Редактируемое **название команды** (`ui/TeamName`, инлайн-правка по ✎) в заголовках draft/result, персист в localStorage (`state/runPersist`); ✅ **resume незавершённого забега** — на старте баннер «продолжить» (`features/start/ResumeBanner`), восстановление детерминированным replay лога действий на свежем `RunEngine` (реролл/пики/manual точно воспроизводятся; сейв версионируется по датасету и отбрасывается при апдейте данных). Проверено в браузере: имя переживает reload, resume восстанавливает пик + потраченный реролл + тот же пак. Тест детерминизма replay — в `verify_engine`.
  - ✅ **Шеринг-картинка (2026-08-11).** Кнопка «Сохранить картинку» рядом с «Скопировать ссылку» на терминальном экране: карточка 1200×630 (retina ×2) — бренд-знак как в шапке, конфиг забега, имя команды, место, пятёрка «роль/ник/герой», разбивка Base/Synergy/Chemistry + Team OVR, сид и хост. Реализация: `features/tournament/shareImage.ts` (рендер на canvas руками, без зависимостей) + `ShareImageButton.tsx`; на устройствах с share sheet (`navigator.canShare({files})`) — нативный шеринг, иначе скачивание PNG; тона — из живых design-токенов (следует теме). **Карточка намеренно текстовая, без портретов героев:** Steam CDN отдаёт `ACAO: https://www.dota2.com` (замер 2026-08-11), crossOrigin-портрет не грузится ни с одного нашего origin, а без crossOrigin canvas «пачкается» и toBlob падает; зеркала с `ACAO: *` не нашлось (api.opendota.com картинки не отдаёт). Если когда-нибудь захотим портреты — это отдельная задача про самохостинг арта (пайплайн + ~1.3МБ статики), не про этот модуль. **Заведена 2026-08-13 как `T11.2`** (зеркало арта ради офлайна, [ADR 0003](adr/0003-offline-first-pwa.md)): снятый tainted-canvas — её побочная выгода, после неё портреты в карточке становятся возможны. Тесты: `web/test/shareImage.test.ts` (чистые части: сборка строк, имя файла); рендер проверен живьём в обеих темах.
  - **Починка resume 2026-07-17 [602837d]:** сейв не доживал до конца забега — обрывался на старте драфта и на входе в плейофф. Причины и правила, зафиксированные фиксом:
    - **Момент очистки — `finishTournament`, а не вход в стадию.** Стадия `playoffs` с `canAdvance=false` — ещё **не** финал для игрока: идёт live-reveal. Сейв чистится и career пишется только когда UI доиграл reveal до экрана результатов (флаг `resultsSeen` в `runStore`). Раньше вход в стадию считался терминалом → reload на середине reveal терял забег.
    - **`Infinity` не переживает JSON.** `JSON.stringify({ rerolls: Infinity })` → `null`, и Easy после reload получал `rerollsLeft <= 0`, что блокировало replay: resume **молча** сгорал. Лечит `normalizeSavedRun` (null/не-конечное → `Infinity`) на входе `loadSavedRun`.
    - **Пустой `actions` — валидный resume.** Первый пак уже зафиксирован seed'ом, поэтому «только стартовали» тоже восстанавливается (`isSavedRunResumable` вместо прежнего `actions.length > 0`).
    - **Версия контента в сейве.** Первоначально к `schemaVersion`/`ratingModelVersion` добавили `dataBuiltAt`, потому что data-refresh меняет паки без bump версий. После BUG-2026-07-23 совместимость переведена на `dataHash`: timestamp хранится только для legacy/rollback.
    - **`frozenRoster`** — ростер на момент persist; replay обязан совпасть побайтно, иначе resume отбрасывается вместо тихой подмены состава.
  - ✅ **BUG-2026-07-23 (обнаружен на живом roguelite-забеге) — no-op data-refresh больше не стирает незавершённый забег.** Причина была в совместимости по `manifest.builtAt`: ежедневный крон менял timestamp даже при неизменных игровых JSON, а `loadData` удалял такой сейв. Исправлено сквозным `manifest.dataHash`: Go-эмиттер и mock считают SHA-256 по байтам всех игровых JSON в фиксированном порядке (без volatile `manifest.json`), `SavedRun` сохраняет хеш, а `isRunCompatible` сверяет его вместе со schema/rating versions. Новый `builtAt` при том же контенте сохраняет resume; изменение любого игрового файла честно инвалидирует. Legacy-сейв с `dataBuiltAt` мигрирует на hash, если timestamp ещё совпадает. `schemaVersion` и `ratingModelVersion` не бампались: формат расширен аддитивно, рейтинг не менялся.
    - **Dev-only:** `strictPort: 5173` в `vite.config.ts` — Vite уходил на 5174+, а localStorage привязан к origin, поэтому resume «терялся» при живом сейве. Playwright ходит на тот же 5173.
  - **Тесты:** `web/test/runPersist.test.ts` (10 кейсов) фиксирует Infinity-round-trip, пустой actions, совместимость по schema/rating/dataHash, legacy builtAt-fallback и очистку только после `resultsSeen`.
- **T7.2 — Локализация RU/EN ✅**
  - **Цель:** убрать смесь языков и дать базовый переключатель locale во всех фазах `loading/start/draft/result`.
  - **Файлы:** `web/src/i18n/*`, `web/src/App.tsx`, `web/src/ui/*`, `web/index.html`, тесты.
  - **DoD:** все пользовательские строки вынесены в типизированные RU/EN dictionaries; переключатель доступен из app shell; первый locale определяется предсказуемо (сохранённый → язык браузера → fallback), сохраняется между сессиями; `<html lang>` обновляется; missing key не показывает сырой идентификатор; unit/smoke проходят на обеих локалях.
  - **Не локализуем:** ники, названия команд/турниров и другие proper nouns из датасета, если у источника нет официальной локали.
  - **Реализовано 2026-07-11:** типизированные словари и provider, переключатель в shell, сохранение и browser fallback, динамический `html.lang`; RU/EN browser-smoke пройден на start/draft/result, pure-проверки добавлены в `npm run verify`.
- T7.3 UX parity pass: tooltips IMP/ECO/REL, источники/атрибуция, loading/error/empty states, responsive и keyboard flow. ✅ (закрыт 2026-08-18 двумя заходами)
  - ✅ **IMP/ECO/REL расшифрованы (2026-08-18).** Два слоя, потому что hover не существует на тапе: `title`-подсказки на `candidate__stats` карточки кандидата (desktop) + видимая секция «Оценки игрока» в `PlayerInspector` (значения + расшифровка каждой метрики + строка «0–100 относительно игроков той же роли на этом турнире») — инспектор общий для драфта/турнира/Буткемпа, объяснение приезжает во все три экрана. Тексты следуют реальным метрикам модели (PRD §5.2: IMP = KDA/участие/урон, ECO = GPM/XPM/ластхиты по роли, REL = выживаемость/консистентность) — менять формулу → менять подсказку. i18n RU+EN (`draft.stat*`), проверено на desktop и 375px.
  - **Атрибуция источников** уже была закрыта ранее: `settings.source` («Данные матчей — OpenDota…») на странице настроек; Liquipedia в данных пока нет (T1.3 ⛔) — атрибутировать нечего.
  - ✅ **Проход loading/error/empty + keyboard (2026-08-18).** Найден и закрыт один настоящий тупик: упавший `loadData` оставлял фазу `loading` навсегда — баннер ошибки висел над вечной орбитой без действия (первый визит без сети до T11.1-копии упирался намертво). Теперь при ошибке орбита сменяется кнопкой «Попробовать снова» (`retry-load`), повторный `loadData` чистит прошлую ошибку; e2e в smoke (route-abort манифеста → баннер+retry → unroute → старт-экран, desktop+mobile). Остальное прошло ревизию без правок: empty-states стоят по экранам (инспектор/герои/карьера), keyboard — фокус-ловушка и возврат фокуса в Modal (T7.8), Esc закрывает (проверено живьём вместе с ловушкой), `:focus-visible` outline глобален, combobox со стрелками (T7.10). Responsive закрыт ревизией T7.8.
- **T7.4 — Айдентика и visual refresh Aegis Draft ✅**
  - **Цель:** сформировать самостоятельный дизайн продукта; 322-0 использовать для UX-сравнения, а не как визуальный шаблон.
  - **Файлы:** `web/src/App.tsx`, `web/src/styles.css`, UI-компоненты, favicon/meta/brand assets; при необходимости отдельная design-spec.
  - **DoD:** header/title/metadata показывают **Aegis Draft**, пользовательская надпись/лого «322—0» удалены; нет копирования логотипа, ассетов и pixel-layout референса; введены семантические tokens, согласованные typography/spacing/states; start/draft/result визуально образуют одну систему; desktop/mobile и основные состояния задокументированы скриншотами.
  - **Граница:** упоминание 322-0 остаётся допустимым в README, PRD, audits и credits как источник вдохновения.
  - **Реализовано 2026-07-11, уточнено после visual review:** строгая editorial-система для Dota 2 roguelike: pure black + редкие animated green art-fields в dark; ivory + Anthropic-orange + black inserts в light. Старт явно показывает путь `groups → playoffs → final`, без вида B2B-dashboard/онлайн-курсов. Новый A-mark/favicon, единая система start/draft/result; co-brand `322—0` удалён. Desktop golden path и обе темы проверены в браузере.
- **T7.5 — Theme switch system/light/dark ✅**
  - **Цель:** базовое переключение темы поверх единого набора семантических design tokens.
  - **Файлы:** `web/src/theme/*`, `web/src/App.tsx`, `web/src/styles.css`, ранняя инициализация в `web/index.html`, тесты.
  - **DoD:** режимы `system/light/dark`; system реагирует на `prefers-color-scheme`; ручной выбор хранится локально и применяется до первого React paint без заметной вспышки; все interactive/disabled/error/graph состояния читаемы в обеих темах; keyboard/ARIA label у переключателя; unit + browser smoke.
  - **Deps:** semantic tokens согласуются вместе с T7.4; реализация может идти параллельно после фиксации token names.
  - **Реализовано 2026-07-11:** semantic tokens для обеих палитр, сохранение режима, реакция `system` на media query, ранний inline bootstrap до первого paint, theme-color и browser smoke светлой/тёмной темы.
- **T7.6 — Тир игрока читается с карточки пака ✅.** Сделано 2026-07-18. Номер OVR и сама карточка кандидата подсвечены по тиру: `ui/ovrTier.ts` (`playerOvrTier`) — единый порог для окраски, elite (88+) дополнительно переливается градиентом. Пороги калиброваны по реальному распределению pack-player OVR (54–99, медиана 74, p90 85), и это **не** та же шкала, что `scoreTier` КОМАНДЫ (80–96): смешать домены нельзя, иначе типовой 74-игрок красится как «weak». Цвета — токены `--tier-*` в обеих темах.
  - **Шишка:** новый блок `@media (prefers-reduced-motion: reduce)` для гашения шайна встал в `base.css` **перед** глобальным правилом по `*`, и регрессионный тест TREF9 (матчит первый такой блок) покраснел. Правило теперь одно: глобальный `*` и точечные отмены живут в одном блоке, глобальный — первым.
- **T7.7 — Сброс драфта на экране драфта ✅.** Сделано 2026-07-18. Рядом с «Покинуть забег» появилась кнопка «Сбросить драфт» (`draft.restart*` в RU/EN): новый seed, тот же `RunConfig` — как будто только что зашли в режим. Логики не добавляли: переиспользован `restartSameConfig` из `runStore`, который уже обслуживает «Новый забег · те же настройки» на экране итога.
  - **Границы:** кнопка живёт только в `DraftScreen` (после укомплектования состава фаза уже `tournament`, и она пропадает сама); подтверждение — тот же `ui/Modal`, что у leave. Асимметрия намеренная: на итоге турнира рестарт **без** confirm (забег окончен, терять нечего), в драфте — с confirm, по правилу CLAUDE.md «любой сброс с потерей прогресса через confirm».
- **T7.8 — Адаптив wide/narrow: канон breakpoints, мобильная модалка, камера турнира ✅ (остаток закрыт ревизией 2026-08-18).** 2026-07-18. Первый заход сделан в Cursor, ревизия и доводка — здесь.
  - **Канон.** `design/breakpoints.css` + `breakpoints.ts` — **sm 430 / md 680 / lg 980**; в `@media` литералы (MQ не резолвят `var()`). Разовые ширины сведены к канону: 620 → md, **900 → lg**. Последнее было не косметикой: тим-панель турнирного экрана ломалась на 980, а группы/отчёт/карьера — на 900, и в зазоре 901–980 экран разъезжался сам с собой. `isNarrowViewport()` — тот же порог для JS-решений, чтобы число не двоилось.
  - **Модалка** (`ui/Modal`) стала мобильной поверхностью: drag-to-dismiss (порог 88px либо скорость), липкая шапка у `layout="content"`, safe-area, `dvh`. Дозакрыто по ревизии: **фокус** (забираем на открытии, Tab заперт внутри, возвращаем на закрытии — до этого `aria-modal` был формальным, Tab ходил по экрану за диалогом), **скролл-лок фона** с компенсацией ширины скроллбара, снятие таймера выхода на unmount, один набор touch-слушателей вместо двух (head внутри panel — события и так всплывают, а onMove звался дважды).
  - **Камера турнира.** Группы — сразу к таблице со своей командой. Плей-офф разведён по ширине: на **широком** сетка видна целиком, поэтому камера ставится один раз на верх сетки и больше не дёргается (замер: 14 сэмплов подряд, scrollY неподвижен); на **узком** ведёт за текущей серией юзера — UB → LB при дропе → GF (`userPlayoffCameraTarget`, покрыт двумя тестами в `tournamentPlayback.test.ts`).
  - **Скроллеры.** Список забегов карьеры больше не добирает низ распоркой-пустышкой (`.career-runs__end` удалён): вместо неё обрезка по дуге рамки (`clip-path: inset(0 round …)`, как у `field-list`) плюс 1px под рамку последней карточки. Проверено на 375: список доезжает до конца, рамка не съедается, лишнего отступа под последним забегом нет.
  - **Прочее из захода:** `viewport-fit=cover` + safe-area в шелле, свечение радара через отдельный слой (Safari-паттерн с `clip-path`), зелёный winner-edge в сетке только от **выигранных** серий юзера, `make dev-phone` (один Vite с `--host` на 5173 для телефона в той же Wi-Fi).
  - ✅ **Остаток закрыт ревизией 2026-08-18 — оба пункта оказались уже неактуальны.** «Пустой блок под сеткой плей-оффа» устранён ещё третьим заходом T7.10 (padding-bottom 48→12px, зазоры до панелей 24px) — замер на живом 375px: слак внутри `.bracket` 12px (резерв под скроллбар), сетка→чемпион 24px, дыр >30px в run-виде нет. Узкий проход start (выбор режима, конфигурация, seed-карточка, футер) и draft (кандидаты, pack heroes, легенда счёта) на 375px: `scrollWidth == innerWidth`, элементов за правой кромкой нет. Статус задачи сведён в ✅.

- **T7.10 — Фаза распределения после групп + плотность турнирного итога ✅.** Сделано 2026-07-19. Замер референса — бандл `assets/index-BCFh8CR5.js`, фаза `quali`.
  - **Распределение объявляется, а не проставляется.** Было: булев `groupRoutesRevealed` красил все 18 строк одним кадром (стаггер `--route-i × 70ms` в CSS размазывал их одной волной, без привязки к смыслу). Стало — как в 322-0: маршрут за маршрутом, каждый со своей крупной подписью, под которую построчно красятся ровно его команды. Тайминги дословно из референса: лид 600мс → `▲ Проходят в верхнюю сетку` (8 команд × 140мс) → пауза 1100мс → `▼ Падают в нижнюю` → пауза → `✖ Выбывают` (2 команды) → плей-офф. Замер на живом DOM: подпись ▲ на 756мс, UB заполняется 1→8 к 1814мс, ▼ на 2872, ✖ на 5136, всего ~6.2с (у референса ~5.2с без лида). Подпись маршрута в строке приходит **вместе** с заливкой, а не по `groupsDone`.
  - **Почему не разом.** Красить всё одним кадром нечем объяснить игроку: он не видит, КТО поехал вниз, — а это единственный момент забега, где решается судьба его команды. Стаггер задаёт JS, не `transition-delay`: задержка по индексу не умеет группировать строки по маршруту.
  - **Узкий экран: подпись липкая.** В одну колонку она уезжает под обе таблицы и панель результатов, то есть за экран ровно в момент заливки. `position: sticky; bottom: 12px` — плашка цветом своего маршрута висит над таблицей, пока строки красятся.
  - **Итоговая таблица — две колонки (9+9), как `standings.slice(0,9)/slice(9)` у референса.** Одной колонкой 18 мест давали панель вдвое выше соседнего «твоего состава» — рядом стояли поля разной высоты. Разрыв 215px → ~70px (список 700+ → 394px). На узком строка была сломана правилом `74px 1fr`: 4 ячейки уходили в два ряда, имя переносилось, место занимало ~150px — **18 мест = 2700px прокрутки при пустой правой половине карточки**. Стало 32px на строку, 651px на всю таблицу, ноль переносов.
  - **Плотность групп.** Пустой `<small>` с nbsp держал 12px в каждой из 18 строк и ужимал имя до «Cursed Dra…» — подстрока события рисуется только когда она есть. Строка 42→36px (на узком 32px), отступы карточек ужаты; блок групп на узком 1450→1212px.
  - **История забегов на узком.** Ростер одной колонкой раздувал карточку до ~600px, и она вылезала за панель; пятью чипами роль обрезалась на «SUPPOR». Стало 3×2 (~86px на чип, 272px карточка), высота от контента, скролл на списке. `height` списка → `max-height`: при одном забеге фиксированная высота оставляла пустую панель на пол-экрана.
  - **Второй заход — пары панелей кончаются на одной линии.** Три пары run-вида равнялись по-разному, и все три чинились по-своему; замеры до → после:
    - **Радар / поле (713 vs 789).** Пара вообще не была растянута — `.run__team { align-items: start }`. Поставили `stretch`, а `.field-list` сделали амортизатором (`flex: 1 1 auto`, `max-height` снят на широком): высоту задаёт радар как контентная панель, список забирает остаток и скроллится. **713 = 713**, причём 18 команд влезают целиком без скролла.
    - **Итоговая таблица / твой состав (531 vs 531, но 94px пустоты слева).** Панели были равны формально — правая перебивала левую содержимым. Поджали ростер: карточка героя 60→48px (её ширина задаёт высоту строки, а строка — всей панели). **487 = 487**, пустота 94→50px.
    - **Career stats / last 8 runs.** Список забегов задавал высоту панели числом забегов. Теперь `.career-runs` — flex-колонка, список `flex: 1` без `max-height`: высоту диктует соседняя статистика, лишние забеги уходят в скролл. `--career-run-height` 174→143 подобрана так, чтобы **две** карточки закрывали панель ровно (замер: 298px карточек в списке 299px, ноль обрезки). **374 = 374** при двух забегах.
  - **Два отступа-дыры.** Сетка → панель чемпиона: 67px (28px `padding-bottom` у `.bracket` + слак `min-height` грида + gap секции) → **24px**; `padding-bottom` оставлен 8px только под горизонтальный скроллбар. Таблица мест → «Your run history»: 98px (`margin-top: 44` + `padding-top: 30` у `.career-panel` поверх gap секции 24) → **32px**.
  - **Третий заход — узкий экран и разделитель карьеры.**
    - **Регрессия скролла забегов (поймана ревью).** Заменил `max-height` на `flex: 1` — и при 8 забегах панель поехала вниз вместе с grid-row, скролл пропал. Нужны **обе** ручки: `max-height` — потолок (иначе контент растит строку грида), `flex: 1` — низ (иначе при более высокой соседке остаётся дыра). Проверено на 8 записях: список 298px, контент 1229px, скроллится, панели 373 = 373. **Правило:** правку «панель не должна задавать высоту» проверять на максимуме контента, а не на текущих двух карточках.
    - **Разделитель перед карьерой убран.** `border-top` + отбивки под него дублировали работу крупного заголовка «Your run history». Отбивку подбирали в два шага: `margin-top: 8px` слипался с панелями выше, прежние `44 + 30` под линию давали ~100px пустоты — остановились на **32px** (с gap секции ~56px).
    - **Career stats скроллится на узком.** 12 плиток в две колонки — шесть рядов, 438px: на 375 это отдельный экран прокрутки ради второстепенной статистики. Режем примерно пополам — `max-height: 246px` (3 ряда + краешек четвёртого) и скролл внутри. Ровная граница по ряду тут не годится: overlay-скроллбар на мобиле не виден, пока не тронешь, и обрезанный край — единственный признак, что список продолжается. На широком потолка нет, все 12 плиток влезают.
    - **Узкий экран — сложенные отступы.** `.run { padding-bottom: max(64px, safe-area+40px) }` складывался с тем же запасом у `.app-shell` (`max(56px, safe-area+32px)`) → ~120px пустоты между CTA и подвалом; свой убран, safe-area держит шелл. `.bracket` на узком имел `padding-bottom: 48px` (не тронутый правкой широкого) → 48→12px, место под горизонтальный скроллбар осталось. Замеры: сетка → чемпион 72→**24px**, CTA → подвал ~120→**28px**.

- **T7.9 — Края шкалы OVR читаются с карточки: фольга и «погасшая» ✅ (Ревизия статусов 2026-08-31: все пункты блока закрыты 2026-07-18; foil-эффект для карточек РЕДКОСТИ — отдельный полиш, учтён в T5.7/T6.5).** 2026-07-18. Тонировки по тиру не хватало, чтобы выцепить взглядом лучшего и худшего в паке — все пять карточек читались как «примерно одно и то же».
  - **Пороги — от данных, не на глаз.** Замер по `packs.json` (7075 значений OVR, 54–99, медиана 74): `immortal ≥95` = **0.13%**, `elite 88–94` = **4.6%**, `liability <60` = **1.9%**. Края редкие ⇒ эффект становится событием («редкий пул»), а не фоном. Специально НЕ вешали эффект на существующий `weak`: он один покрывает **29%** игроков, там это был бы шум. Ради этого в `playerOvrTier` добавлены отдельные крайние ступени того же домена «ранг игрока».
  - **Immortal — источник света, а не ещё одна фольга (2026-07-18).** Порог `≥95` даёт всего 9 слотов из 7075. Циан вынесен за зелёно-красную шкалу силы: «выше зелёного» внутри неё не выразить, а зелёный уже занят интерактивным состоянием радара. Крупная карточка получает двойной кант, пульсирующий номер и два слоя частиц разного размера/скорости без световых линий; hover гасит оба слоя, на мелком радаре остаётся статичная подсветка, `prefers-reduced-motion` полностью останавливает частицы и дыхание. Цвета задаются токенами обеих тем, всегда-тёмная панель ремапит их через общий `.on-invert-surface`.
  - **Метафора света, а не «больше красного».** Elite **отражает** свет: кант + медленный блик фольги наискось по всей карточке. Liability **поглощает**: холодная виньетка внутрь, глухой кант, ноль анимации. Разница по типу, а не по градусу — иначе `liability` и `weak` (оба красные) отличались бы только насыщенностью.
  - **Две шишки.** (1) Сперва приглушил ЧИСЛО у liability — на экране это прочиталось как «менее важный», а не «худший»; число вернул в полный `--tier-weak`, разницу несёт карточка. (2) Виньетка была одна на обе темы: на ivory затемнение дало грязно-серое пятно. Развели токеном `--tier-liability-veil` — на чёрном гасим в тень, на светлой «потухший» = выцветший (серо-бежевый налёт).
  - **Ритм.** Блик карточки 7.2s против 2.6s у номера: два разных ритма на одном объекте рябят, поэтому карточка втрое медленнее числа. `prefers-reduced-motion` гасит блик целиком (не через глобальный `.01ms` — он заморозил бы градиент на случайном кадре), статус остаётся на канте.
  - **Тесты:** границы всех семи тиров + проверка, что `immortal`/`elite`/`liability` остаются редкими на реальном датасете (если пайплайн сдвинет шкалу OVR, эффекты расползутся на полпака — упадёт здесь). Отдельный AST-тест держит объявления и ремап всех tier-токенов.
  - **Распространено на ростер и карьеру (2026-07-18).** Словарь тиров переехал в `design/base.css` — его делят пак, радар, ростер итога и карточки карьеры. Размер решает выразительность: крупная карточка получает кант + бегущий блик, мелкая (`.card-edge--flat`: нода радара, чип карьеры) — только кант, потому что блик на 76px превращается в мигание, а виньетка на тёмной панели уходит ниже порога. Кант элиты на радаре **золотой**, а не зелёный: зелёным там уже говорят «наведён / выбран для свапа».
    - **Попутно исправлен дефект:** ростер на итоге красил ИГРОКА командной шкалой (`scoreTier`, 78–90). На реальном датасете это красило **две трети** ростера в красный — типовой 74 попадал в «weak». Теперь `playerOvrTier`.
    - **Всегда-тёмные панели.** Радар получил `.on-invert-surface`: ремап `--tier-*` на инвертный набор один раз на контейнере, вместо второго набора классов или `html[data-theme]`-override в компоненте. Один и тот же `.ovr-tier--mid` даёт `#b07d0a` в паке на ivory и `#ffd66b` на чёрной панели радара (замерено в браузере).
    - **Карьера:** в `CareerRosterPlayer` добавлен опциональный `ovr` — записи, сделанные до него, просто рисуются без тира (ре-симулировать историю ради этого незачем). Чипы получили полный блик (не только кант): по фидбеку — на этом размере он читается. Фазы разведены каскадом, иначе у чемпионского состава (элитны все пятеро) строка мигает разом. Два параметра подобраны по фидбеку: (1) шаг **меньше** времени прохода блика по одной карточке (~2.9s из цикла 7.2s) — при большем соседи не передают свет друг другу и вспыхивают вразнобой (шаг 1.4s выглядел именно так); (2) порядок задержек **обратный** индексу — чем отрицательнее задержка, тем карточка дальше по циклу и вспыхивает раньше, поэтому самая отрицательная у первой, иначе волна идёт справа налево.
    - **Модификаторы разложены на независимые:** `.card-edge--gold` (кант золотой вместо зелёного — там, где зелёный занят смыслом или теряется) и `.card-edge--still` (снять движение — для совсем мелких карточек). Были склеены в один `--flat`, из-за чего «золотой кант» нельзя было взять без «без движения». Радар = `gold + still`, чип карьеры = `gold`.
  - **Две шишки этого захода.**
    - `BUG-2026-07-18` **сломанный CSS-комментарий молча съедает объявления.** Перечислил классы через слэш — звёздочка глоба вплотную к слэшу закрыла комментарий, остаток строки стал мусором и убил идущие следом `--tier-<tier>-invert`. Сборка ЗЕЛЁНАЯ (невалидные объявления просто отбрасываются), а наружу вылезло так: `var(--tier-elite)` пуст ⇒ градиент невалиден ⇒ `background-image: none` ⇒ при `-webkit-text-fill-color: transparent` число OVR у элитных игроков стало **невидимым**. Закрыто тестом `test/tokens.test.ts`: проверяет не текст, а разобранный postcss-AST (то же, что видит браузер) — каждый `var(--token)` без фолбэка обязан иметь объявление. Проверено, что тест падает на возвращённом баге.
    - **Общее правило не должно трогать `position`.** `.card-tint--elite` ставил `position: relative`, а ноды радара позиционированы `absolute` по вершинам — элитные карточки срывало с мест при пике. Контекст для `::after` теперь обеспечивает каждая поверхность сама.
  - **Диагностика:** вкладка preview-пейна уходит в фон (`document.hidden`), из-за чего CSS-переходы застывают на полпути, а скриншоты приходят чёрными. Значения со свойств, у которых есть `transition`, читать только сняв переход, иначе меришь промежуточный кадр.
- **T7.10 — Справочник и настройки: страницы вне забега + хардкор ✅ (Ревизия статусов 2026-08-31: все три захода сделаны — `features/settings`, `features/heroes` (страница героев), `features/teammates` (паутина тиммейтов по окнам); хардкор-замок покрыт `codexLock`-тестами).** Начато 2026-07-18.
  - **Пайплайн менять НЕ нужно — проверено на данных.** Тиммейты по окнам выводятся клиентом из уже эмитируемых файлов: `packs.json` (1415 ростеров, у каждого `eventId`) × `events.json` (89 событий с `year` и `formats`). Пара «были тиммейтами в окне W» = встретились в одном паке, чьё событие входит в W; окна уже нарезаны пайплайном — те же четыре, что в настройках (`last_1y` 18 событий, `last_2y` 37, `last_5y` 69, `valve_legacy` 30). Вес связи даёт `squadSynergy.json` (71540 пар), но lifetime. Популярность героев — агрегация `careerPlayerHeroStats` по игрокам; разбивка по эпохам при желании берётся из `eventHeroStats` (события знают год). `schema/` не трогается, `manifest` не бампается. Плоский `teammates.json` для окон не годится — в нём нет дат.
  - **Навигация без роутера.** `state/shellStore.ts` (`AppView` + `location.hash` + `pushState`): отдельно от `runStore`, потому что уход на страницу — не событие забега. Кнопка «назад» браузера работает (на телефоне это единственный выход со страницы), неизвестный хеш = игра, а не 404. Каждый новый view сбрасывает унаследованный `scrollY`: без этого после длинного справочника следующий экран мог открыться у нижнего края; переход держит browser-regression.
  - **Настройки.** Язык и тема уехали из топбара на свою страницу (`features/settings`): два селекта съедали всю ширину на телефоне, а меняют их раз в жизни. Там же паспорт датасета — дата сборки и обе версии, те самые поля, что решают совместимость сейва. Названия языков намеренно не переводятся.
  - **Хардкор.** `RunConfig.hardMode` (опциональное — иначе сломались бы уже сохранённые забеги). Закрывает ровно две вещи: профиль игрока (нода радара перестаёт быть кнопкой) и перевыбор поля соперников. Подсказка — через существующий `hint` у `OptionGroup`, новых примитивов не заводили. Забег помечается в истории карьеры (`configLabel.hardMode` → бейдж в строке конфига); `careerRunId` намеренно НЕ трогали, иначе поехали бы id уже сохранённых записей. Движок не затронут: ограничиваются доступные игроку действия, не RNG ⇒ golden на месте, `ratingModelVersion` не бампается.
  - **Заход 2 — страница героев ✅ (2026-07-18).** Популярность из lifetime `careerPlayerHeroStats`: 5246 игроков, 49671 пара игрок×герой, все 127 героев. Лидер — Rubick (5477 игр у 674 игроков, 49.6%). Считается один раз на датасет (`useMemo`), не на каждый ввод в поиске. Винрейт складывается **взвешенно по играм**, а не средним от средних: игрок с 3 играми не может весить как игрок с 300 — на это есть тест. Герои без игр остаются в списке с нулями, иначе непонятно, что герой есть и его просто не берут. Шкала бара считается от лидера ТЕКУЩЕЙ сортировки — иначе при сортировке по винрейту бары схлопываются (винрейты про-сцены жмутся к 50%: у каждой игры есть проигравший). Вход — кнопкой из настроек, плюс дип-линк `#/heroes`. Переиспользован осиротевший `ui/Select` под сортировку.
    - **Фильтр по про-игроку.** Тот же экран переключается с общего свода на career-героев выбранного игрока: `heroPopularity` получает срез одного `accountId`, поэтому второй агрегатор и новый формат данных не появились. Поиск — feature-комбобокс по нику: минимум 2 символа, prefix-совпадения выше substring, до 8 результатов, выбор мышью или стрелками+Enter, Escape/клик снаружи закрывают список. Игроки без career-игр не предлагаются; в выбранном режиме скрыты бессмысленные «число игроков» и сортировка по нему, очистка возвращает общий свод. Контрол выровнен с поиском героя, адаптивен, использует design tokens и типизированные RU/EN строки; видимый служебный label убран, доступное имя сохранено через `aria-label`. `schema/`, `manifest` и пайплайн не меняются.
  - **Заход 3 — паутина тиммейтов ✅ (2026-07-18).** Player-centric: выбранный игрок в центре, соседи кольцом, толщина луча = число совместных турниров, клик по соседу перецентровывает. Пайплайн не тронут — связь выводится из `packs.json` × `events.json` (совместный ростер на турнире, попадающем в окно); плоский `teammates.json` не годится, в нём нет дат.
    - **Почему радиальная раскладка, а не force-directed.** Замер: в окне 297–877 игроков, степень вершины медиана 4–8, p90 10–19, максимум 38. Вокруг центра умещается одно кольцо, так что физический движок и новая зависимость не нужны. При >18 соседях узлы расходятся по двум радиусам — иначе подписи наезжают (проверено на SumaiL-: 38 соседей, радиусы 168/134).
    - **`ui/PlayerPicker`** поднят из `features/heroes` в `ui/` (нужен двум экранам — правило дизайн-системы), стили переведены в CSS-модуль, место в сетке экрана задаётся через `className`: раньше `grid-area` героев жил внутри класса самого пикера.
    - **Шишка:** чип пикера искался в списке «доступных в этом окне», и при переключении на узкий период выбранный игрок оттуда пропадал — чип исчезал, хотя страница оставалась в режиме «игрок выбран», и было не понять, кто в центре. Теперь профиль центра строится от id, независимо от окна.
    - **Шишка в e2e:** `getByRole("option")` цепляет нативные `<option>` внутри `<select>` периода — они невидимы, и клик ждал их вечно (в одиночном прогоне проходило, в полном падало). Поиск опции ограничен областью пикера.
  - **Справочник закрывается хардкором ✅ (2026-07-18).** Решено прятать: страницы «герои игрока» и «паутина составов» показывают ровно то, что режим прячет в забеге, иначе он обходится в два клика через меню. Предикат — чистая `isCodexLocked(config, phase)`: закрыто, пока идёт хардкорный забег, и открыто вне забега (после финиша подсматривать уже нечего). Плитки справочника в настройках и поля выбора игрока внутри страниц НЕ прячем, а делаем недоступными; красная пометка — ПОД ними: так видно, что поле есть и почему закрыто. Общий список героев остаётся доступен — он ничего личного не раскрывает. На плитке справочника в настройках — замок.
  - **Хардкор включается через окно правил ✅.** Клик по «Вкл» больше не переключает режим сразу: открывается `ui/Modal` со списком того, что станет недоступно, и чекбоксом; кнопка подтверждения заперта, пока чекбокс не отмечен. Закрыть окно (крестик, Esc, свайп вниз) можно всегда — режим тогда просто не включается, чекбокс сбрасывается при повторном открытии. Выключение остаётся мгновенным: подтверждать нужно ужесточение, а не послабление.
  - **Лазейка через reload.** Перезагрузка возвращает `phase=start` и `config=null` — забег ещё не возобновлён, и справочник открывался: перезагрузился, подсмотрел, продолжил. Теперь предикат смотрит и на незавершённый сейв (`resumable.config.hardMode`), тест на это есть.
  - **Шишка (третий раз за проект):** селектор `.hard-gate .danger:disabled` не совпал — класс `Button` хеширован CSS-модулем. Цепляться нужно за элемент (`button:disabled`), а не за класс примитива. Заблокированная кнопка из-за этого выглядела активной.
  - **Про e2e-флак:** локально Playwright гоняет 5 воркеров без ретраев и тесты изредка падают по борьбе за ресурсы (каждый раз разные). В CI конфиг другой — один воркер и ретрай; последовательный прогон локально даёт 14/14 без ретраев.
- **T7.11 — Страница «Правила режимов» ✅ (2026-08-12, по запросу пользователя перед T5.5).** Вид `#/rules` (`features/rules/`), плитка в настройках (без замка хардкора — правила объясняют механику, не данные игроков). Общая формула счёта (реюз `draft.scoringLegend*`) + для реализованных режимов петля-диаграмма и «что решает» (Classic — flow паки→место; Roguelite — лестница порога с боссами), для нереализованных (Manager/Tournament/Arena) — питч + SoonBadge. Диаграммы — инлайн-SVG на токенах темы, на узком скроллятся при 560px (не ужимаются в нечитаемое). Реюз: `start.mode*Long`, примитивы `Surface/Eyebrow/SoonBadge/Button`, паттерн центрированной колонки настроек. Когда доедет новый режим — обновить его секцию здесь (иначе страница начнёт врать). **Ревизия 2026-08-30:** Arena стала полноценной секцией (петля общего драфта MP2 + «что решает»), добавлена секция Дуэли; у обоих онлайн-режимов вместо SOON — честная приписка «нужны интернет и сервер комнат»; мёртвые ключи `rules.*Soon` убраны.

## MREF — Reference parity gaps (аудит 322-0 Quick Draft, 2026-07-11)
> Источник: [docs/audits/2026-07-11-322-0-quick-draft-parity.md](audits/2026-07-11-322-0-quick-draft-parity.md). Матрица с доказательствами. Продуктовые решения по P1 — открытые вопросы PRD §10 G/H.

- **TREF1 — Драфт героев из паков (P1) ✅.** Реализованы 5 пиков игроков + 5 пиков героев, auto matching и инвариант «каждый новый пак показывает ровно 5 ещё не взятых героев». Повтор сигнатурного героя детерминированно добирается из текущего format-pool; внешний API во время забега не нужен. Отрицательные/edge-тесты в `verify_engine.ts`. Manual остаётся T3.10.
- **TREF2 — Итог: projected finish / вердикт (P1) ✅.** Итог драфта показывает воспроизводимый прогноз против 18-team field; это же поле без повторной генерации проходит группы, double-elimination и Grand Final, после чего пользователь получает фактическое место. Соперники — исторические pack snapshots, а не безымянные боты референса. Preview и симуляция используют единый `TournamentEngine`; тесты фиксируют детерминизм и полноту 18 мест. См. аудит `docs/audits/2026-07-12-tournament-cycle-parity.md`.
- **TREF3 — Арт героев (P2) ✅.** `HeroThumb` показывает портреты Valve CDN в паке, назначении и инспекторе игрока.
- **TREF4 — Имя команды + View hero stats (P2) ✅ (Ревизия статусов 2026-08-31).** ✅ Клик по игроку в пентагоне открывает event/career heroes `{games, winrate}` и ссылку DatDota; ✅ назначенная player×hero пара показывает games; ✅ редактируемое имя команды — T7.1 (`ui/TeamName`, 2026-07-18). Сериализация имени в sharing URL сознательно НЕ делается: ссылка несёт УСЛОВИЯ забега, а не чужой результат (решение T3.12), имя — localStorage получателя.
- **TREF5 — Раскладка драфта (P2).** ✅ Desktop переведён на компактные 2 колонки: sticky radar + pack panel; start/result используют ту же responsive surface-систему. На ≤980px раскладка становится одноколоночной. Отдельно в T7.3 остаются keyboard-flow и расширенный mobile QA; прежний скролл-таймаут в новом golden path не воспроизвёлся.
- **TREF6 — Chemistry + тиммейты (P1) ✅ (Ревизия статусов 2026-08-31: «фикс = данные» случился — TDATA1 peers влил пожизненные co-games, датасет вырос до ~89 событий/1415 паков ежедневным кроном; Chemistry на живом драфте давно не ≈0 — в плейтестах она +4…+17 и слагаемое билдов. Полная историческая точность ростеров — за Liquipedia/T1.3, отдельный хвост не нужен).** ✅ Вечное исключение команды заменено на `usedPlayers`; тиммейтов можно собирать. ✅ Промежуточный бонус теперь накапливается относительно 10 пар полной пятёрки (реальный Aurora smoke: `0 → 0.27 → 0.80 → 1.60 → 2.67`), финальный масштаб сохранён. ✅ Текущий snapshot содержит 240 squad-пар. ⬜ Полноценная историческая Chemistry всё ещё требует resumable multi-event last_2y и roster intervals; текущий deploy snapshot содержит только 1 событие. **Deps:** M2.5/S4 collect-window, T1.3, **TDATA1**.
  - **Root cause (аудит 2026-07-12):** формула корректна, но **данных нет**. Committed snapshot = 1 событие (EWC 2026), `squadSynergy` = 240 **внутрикомандных** пар с `winrate:0.5`-заглушками, ноль кросс-карьерных пар. Игрок берётся один на пак → две трети времени в составе нет ни одной пары с историей → Chemistry ≈ 0. 322-0 работает, потому что стоит на пожизненной матрице co-games (наблюдалось `Saksa+Watson·185·+0.8` для игроков из разных паков). **Фикс = данные (TDATA1), не код.**
- ✅ **TREF7 — Mixed: свободный порядок ролей (P2, продуктовое).** Убран строгий `1→5`: можно выбрать кандидата любой ещё незаполненной роли; взятая carry/mid/offlane блокируется, support доступен до заполнения обоих support-слотов. Поведение зафиксировано в PRD и отрицательных проверках `verify_engine.ts`.
- **TREF8 — Заголовок пака показывает название турнира, а не `eventId` (P2) ✅.** Было `league-19785`, стало имя события (`data.events[].name`) в `DraftScreen` — тем же паттерном, что `PlayerInspector`. Fallback на сырой id, если события нет в справочнике.
- **Отметки к существующим:** T3.10 (Manual allocation — референс имеет рабочим, у нас SOON) остаётся P1 и связан с TREF1 (привязка hero→player). T7.3 (responsive) — включает TREF5. T7.4 удаляет co-brand «322—0». T7.2/T7.5 — RU/EN и темы. Difficulty: «Easy» у нас = ∞ рероллов, у референса = 1 (P2).

### Аудит UI/анимаций Classic, 2026-07-17
> Источник: [docs/audits/2026-07-17-classic-ui-motion-parity.md](audits/2026-07-17-classic-ui-motion-parity.md). P0 нет. Рамка — [design-language.md](design-language.md) §Движение: 322-0 UX-референс, не pixel-copy.

- **TREF9 — Раздача пака (P1) ✅.** Пак возникает мгновенно: `getComputedStyle` по всем узлам драфт-экрана даёт **0** анимированных элементов. Из-за этого пик и «тот же пак» визуально неразличимы — после выбора экран меняется без сигнала. Референс раздаёт 10 карт (`rotateY(85deg→0)`, `.5s`, стаггер `0.12s`, игроки → герои, всего 1.58s) на каждый новый пак.
  - **Файлы:** `web/src/features/draft/DraftScreen.tsx`, `web/src/design/base.css` (общий keyframe + утилита, не bespoke-стиль в фиче), `web/src/design/tokens.css` (ease/длительность — токенами).
  - **Скиллы:** `frontend-architecture` (примитив в `ui/`, не в фиче), `discovery-before-code`.
  - **DoD:** новый пак раздаётся со стаггером; повтор при рероле и при пике; `prefers-reduced-motion` гасит (глобальное правило уже покрывает — **проверить тестом**, не глазами: у референса ровно тут опечатка, `.flip-in` вместо `.card-flip`); `tsc --noEmit` + `npm run test` чисты; скрины обеих тем.
  - **Прим.:** стаггер обязан работать на **вертикальном списке** — форму пака (список vs карты) в этой задаче не меняем, см. TREF11.
  - **Сделано:** примитив `ui/Dealt` (задержка = `index × --motion-deal-stagger`, чистый CSS без JS-таймеров) + keyframe `deal-in` в `design/base.css` + токены движения. Замер на живом DOM: 10 карт, шаг ровно 0.07s, игроки 0→0.28s, герои 0.35→0.63s, вся раздача ~1.0s (у референса 1.58s — шаг короче, потому что наш список плотнее их карт 3:4). `dealKey` = `picked:rerollsLeft`: React пересоздаёт узлы, анимация играет заново на КАЖДОМ паке (проверено: из 10 помеченных узлов пик пережило 0). Ключ по содержимому пака строить нельзя — реролл может выдать тот же первый игрок и раздача молча не сыграет.
- **TREF10 — Count-up для TEAM OVR (P2) ✅.** Число в центре пентагона — главный фидбек драфта, сейчас меняется скачком. У референса тоже скачок, то есть это улучшение **сверх** него, а не догоняние.
  - **Файлы:** `web/src/features/draft/Pentagon.tsx` (или общий примитив в `ui/`, если понадобится второй раз).
  - **DoD:** ✅ набег 320ms (`--motion-count`), `prefers-reduced-motion` → мгновенно, в конце ставится РОВНО target (golden 97/97 не поехал).
  - **Сделано:** `ui/motion.ts` — `useCountUp` + `motionMs` (читает CSS-токен, чтобы константа не двоилась между CSS и JS) + `prefersReducedMotion`. Последний был **скопирован в BracketConnectors и TournamentScreen**; третья копия и подтолкнула вынести — теперь media-query ровно в одном месте.
- **TREF11 — Форма пака: карты vs список (P2, продуктовое) ⬜.** Референс — горизонтальный ряд карт `aspect-[3/4]`; мы — вертикальный список. Не дефект: наш список информативнее (влезло название события, у них только `Pack: OG · manila2016`), их карта «игровее» и лучше приглашает выбрать. Решать продуктово, не в рамках аудита.
  - **Deps:** TREF9 (сначала движение на текущей форме, потом обсуждать форму).

### Аудит турнирного цикла, 2026-07-17
> Источник: [docs/audits/2026-07-17-tournament-cycle-parity.md](audits/2026-07-17-tournament-cycle-parity.md). P0/P1 нет. Live-симуляция и Skip — `parity` (закрыт `unknown` прошлого аудита). Структура групп, сетки и финальной таблицы совпадает полностью.

- ✅ **TREF12 — Знаки команд в турнире (P2).** Сделано 2026-07-17. Не копировали их зоопарк из 50 эмодзи: у нас **монограмма** («DW») в плашке цвета опознания. Монограмма уникальна в пределах поля (`botNames` отбирает имена с разными инициалами: «Divine Wards» и «Disconnected Wards» дали бы одинаковое DW), поэтому именно она опознаёт команду, а цвет — второй, быстрый признак. Палитра `--sigil-0..4` (5 хью) заведена **вне tier-шкалы**: та занимает зелёный→красный целиком, и синий знак иначе читался бы как «слабая команда». Своя команда — `--accent`.
  - **Реализация:** `TeamSigil` в `game/tournament.ts` (часть детерминированного поля), примитив `ui/TeamSigil.tsx`, токены `design/tokens.css` (обе темы), 6 мест в `TournamentScreen.tsx` — поле, группы, MATCH RESULTS, сетка, чемпион, финальная таблица.
  - **Попутно исправлено:** реролл поля менял только очки — имена шли от отдельного `metaRng` и переживали реролл (менялся лишь порядок строк). Теперь и имена, и очки от `fieldRng`, как у 322-0; кнопка честно называется «Перевыбрать соперников».
  - **Шишка:** `.field-list li > span` / `.final-table span` цепляли знак (он тоже `span`) и перебивали его цвет — селектор специфичнее, чем `.sigil` в CSS-модуле. Оба сузили до `:first-child`.
- ✅ **TREF13 — Плавное появление всех стадий Classic-прохода (P2).** Сделано 2026-07-17. Пост-драфт «выскакивал» кусками (пентагон+панель, поле/прогноз, таблицы групп, сетка, итог). Теперь каждая стадия мягко въезжает (fade + подъём) с каскадом по строкам, **тот же темп** — тайминги reveal/Skip/авто-переход не тронуты, движок/детерминизм/golden тоже (чисто презентационный слой).
  - **Механизм:** глобальный двойник `ui/Dealt` для feature-CSS, где обёртка-компонент ломает семантику (`<li>`, строка таблицы, колонка сетки): keyframes `fade-rise`/`fade-soft` + утилиты `.enter`/`.enter-fade` в `design/base.css`, каскад через `--enter-i` (как `--deal-index`), токены `--motion-enter`/`--motion-enter-stagger`. Reduced-motion гасит глобально.
  - **Две шишки:** (1) сетка плей-офф — только `.enter-fade` (opacity, без translate): коннекторы меряют геометрию через `getBoundingClientRect`, и transform сместил бы их концы (проверено вживую dark+light — координаты валидны). (2) `--enter-i` заведён через `@property inherits:false`, иначе вложенный `.enter` (`.group-result` в `.group-results`) подхватывал бы индекс предка.
  - **Файлы:** `design/{base.css,tokens.css}`, `features/draft/DraftScreen.tsx`, `features/tournament/TournamentScreen.tsx`.

## M8 — Backend (Go API, активна по [ADR 0002](adr/0002-backend-now.md))
> Решение 2026-07-12: заводим backend сейчас. Гибрид — игровые данные остаются static-first, сервер держит пользовательское/общее состояние. Скилл `backend-architecture`.
- ✅ **T8.0 — Решения по стеку:** auth = **Steam OpenID, опционально** (local-first по умолчанию); БД = **`sqlc` + `goose`**; router = **`chi`**. Зафиксировано в [ADR 0002](adr/0002-backend-now.md).
- ✅ **T8.1 — Скелет `server/`:** модуль `github.com/aegis-draft/server`, слои `internal/{transport,service,store,model}` + `apperr`/`config`, chi-router с middleware, `/healthz`, единый контракт ошибок, graceful shutdown. Живой smoke: `/healthz`→200, unknown→404. CI-джоб `server` (gofmt/vet/build/test). gofmt/vet/build/test зелёные.
- **T8.2 — Postgres + миграции 🟨 (2026-07-21: срез аккаунтов готов; saves/leaderboard/daily — за своими задачами).** Сделано: goose-миграция `users`+`identities` ([`server/internal/store/migrations`](../server/internal/store/migrations)), `sqlc` типобезопасные запросы (`internal/store/sqlcgen`, конфиг `server/sqlc.yaml`), репозиторий `store.UserRepo.FindOrCreateByIdentity` (идемпотентный, транзакция + гонка по UNIQUE), пул pgx + `store.Migrate` (embed, на старте при `DATABASE_URL`), `/readyz` с ping БД. Тесты стора против реального Postgres — в CI (postgres service-container, джоб `server`), локально скипаются без `DATABASE_URL`. `users.id` — личность приложения, отдельная от игрового `accountId`; вход через `identities` («любой один», ADR 0002). **Осталось (за T8.4/8.5/8.6):** таблицы `saves`/`leaderboard`/`daily` — доливаются новыми миграциями поверх, когда встанут их фичи. **Deps:** T8.1.
- **T8.3 — Auth + аккаунты 🟨 (2026-07-21: Telegram-вход готов; Google/Apple/Steam — за собой).** Анонимная игра работает без логина; вход — только для сохранности статистики, синхронизации и лидерборда. Сделано: `POST /api/auth/telegram` ([transport/auth.go](../server/internal/transport/auth.go)) → `service.AuthService` ([service/auth.go](../server/internal/service/auth.go)) связывает `telegram.Validate` → `UserRepo.FindOrCreateByIdentity("telegram", …)` → **сессионный JWT** (HS256, Bearer, `SESSION_SECRET` из env, TTL 30д; alg жёстко HS256 — [auth/session.go](../server/internal/auth/session.go)). Ответ `{token,user,created}`. Маршрут поднимается только при `DATABASE_URL`+`SESSION_SECRET`+`BOT_TOKEN`, иначе 404 (урезанный режим). Тесты: auth-пакет (round-trip/чужой секрет/истёкший/мусор), service (happy/bad-initData/no-user), transport (ok/400/401/маршрут-отсутствует). **Осталось:** провайдеры Google/Apple/Steam тем же путём (свой `Validate` → тот же issuer); middleware проверки Bearer на защищённых ручках — с первой такой ручкой (T8.4). **Решение 2026-07-20:** подходит **любой один** способ — OAuth (Google / Apple / …) **или** привязка Steam; Steam больше не единственный вход. Аноним продолжает писать карьеру в `localStorage`, но она **best-effort** (пропадает при чистке браузера/webview, не переезжает между устройствами, вне лидерборда) — и в UI подаётся именно так, а не как надёжное хранилище. Учесть: Sign in with Apple требует платного Apple Developer Program — это влияет на порядок включения провайдеров. Детали — [ADR 0002](adr/0002-backend-now.md). **Deps:** T8.0, T8.2. ⬜
- **T8.4 — Сейвы забегов 🟨 (2026-07-21: серверная часть готова; фронт-клиент — T8.7, живьём — Fly).** Cloud cross-device. Сделано: миграция `saves` ([00002](../server/internal/store/migrations/00002_saves.sql)) — blob на пару (user×kind), `kind`∈`run`/`career`; сервер payload **не интерпретирует** (непрозрачный JSON). `GET/PUT /api/saves/{kind}` под **Bearer** (`requireAuth` — первый защищённый маршрут, [middleware.go](../server/internal/transport/middleware.go)). **Конфликт двух устройств → 409** (версионный guard, решение 2026-07-21): монотонный `rev`, CAS одним `INSERT … ON CONFLICT … WHERE rev=base_rev`; при несовпадении — 409 с актуальным сейвом в теле, клиент мёржит. Учёт `schemaVersion`/`ratingModelVersion` (хранятся, совместимость решает клиент). Слои: `store.SaveRepo` → `service.SaveService` → transport; тесты стора (CAS/конфликт/not-found в CI-Postgres), сервиса (fakes) и транспорта (Bearer 401/ok/409). **Осталось:** фронт-API-клиент (T8.7) дергает эти ручки и хранит Bearer; живой эндпоинт — после Fly. **Deps:** T8.3. 
- **T8.5 — Дейлик-сид + серверная валидация** (ре-симуляция на Go, переиспользуя `pipeline/internal/{model,rating}`; анти-чит). **Deps:** T8.2, M2. ⬜
  - ⚠️ **`pipeline/internal/rating` для этого НЕ достаточно.** `Team OVR = Base + Hero Synergy + Chemistry`, и три из четырёх слагаемых живут на фронте намеренно (скилл `scoring-model`: «чтобы формула менялась без пересборки данных») — венгерское назначение героев (`game/assign.ts`), химия по co-games и сама свёртка (`game/score.ts`). С 2026-07-19 туда же добавился Mixed-base (`game/teamSuccess.ts`). Переносить их в Go **по одному не имеет смысла**: пока на фронте остаётся хоть одно, ре-симуляция всё равно не воспроизводит счёт. Решение принимать разом про все четыре — портировать клиентский счёт в Go целиком либо исполнять ту же реализацию на сервере, — и не раньше, чем лидерборд действительно понадобится (сегодня `server/` — скелет на 237 строк, `model` пуст до T8.2).
- **T8.6 — Лидерборд** (дейлик/seeded), защита от подделки результата. **Deps:** T8.5. ⬜
- **T8.7 — Фронт: API-клиент 🟨 (2026-07-21: клиент готов; оркестрация синхронизации — отдельно, поверх, после Fly).** Рядом с `DataSource` (статика ≠ динамика): [`web/src/data/api/`](../web/src/data/api/index.ts) — `authenticateTelegram(initData)→{token,user,created}`, `fetchSave`/`pushSave` (CAS: 409 → `{status:"conflict",current}`), `ApiError` из единого контракта, токен через `state/persist` (CloudStorage/localStorage). База — `VITE_API_BASE`; пусто = `isApiConfigured()===false`, приложение локально/анонимно (клиент спит до Fly). Тесты: `web/test/apiClient.test.ts` (auth POST/401, save 200/404, put 200/409, session round-trip, not_configured) — 9/9. **Осталось (отдельный шаг, нужен живой Fly + продуктовое решение «когда синхронизировать» и conflict-UX):** авто-обмен initData на токен на старте TMA; push сейва забега/карьеры при изменении; pull+merge на загрузке; выставить `VITE_API_BASE` в деплой-сборке. **Deps:** T8.1 (клиент), T8.3/T8.4 (контракт эндпоинтов), T9.0 (живьём).
- ✅ **T8.8 — nginx + Docker Compose (prod-like lab):** `infra/docker-compose.yml`, `infra/nginx/` (reverse proxy: `/` SPA, `/data/*` static JSON, `/api/*` Go API), `server/Dockerfile`. Не заменяет GitHub Pages; Postgres в compose для будущих миграций. **Deps:** T8.1.

## M9 — Telegram: бот + Mini App (по [PRD §5.11](PRD.md))
> Второй канал доставки той же сборки `web/`. Бот — вход и служебная информация; TMA — не форк фронта.

**Главный блокер, честно:** бота негде разместить. GitHub Pages отдаёт только статику, а `infra/` — это prod-like лаборатория на docker-compose, не хостинг. Пока Go-сервер не задеплоен публично, работает лишь long polling с чьей-то машины. Поэтому M9 начинается не с бота, а с деплоя.

- **T9.0 — Публичный деплой `server/` 🟨 (2026-07-21: конфиг и CI готовы, ждём первый запуск с аккаунтом).** Один контейнер по [ADR 0002](adr/0002-backend-now.md) — выбран **Fly.io** (деплоит наш `Dockerfile` напрямую, машины не «засыпают» агрессивно под будущий webhook бота; Render-free с cold-start ~50с отклонён). В репо: [`server/fly.toml`](../server/fly.toml) (internal 8080, `force_https`, health-check `/healthz`, `auto_stop=suspend`/`min=0` пока нет webhook) и [`deploy-server.yml`](../.github/workflows/deploy-server.yml) (путь-фильтр `server/**`, гейт `go vet/build/test`, `flyctl deploy --remote-only`, секрет `FLY_API_TOKEN`). **Осталось (на владельце аккаунта):** `fly apps create aegis-draft-api` → `cd server && fly deploy` → проверить `/healthz` снаружи; `fly tokens create deploy` → положить `FLY_API_TOKEN` в GitHub Secrets. Runbook — [server/README.md](../server/README.md).
  - **⛔ Блокер (2026-07-21): верификация карты у Fly.** Первая попытка не прошла — Fly пишет `declined` на любую карту (после перезагрузки страницы на карте bybit), аккаунт удалён. Повтор через пару дней (возможно, другой эмитент / без bybit). До заведения `FLY_API_TOKEN` deploy-джоб в CI **чисто пропускается** (skipped через job `check` + `if: needs.check.outputs.present`), не падает красным. Если Fly так и не пустит — фолбэк Render (cold-start ~50с терпим для health-only, пересмотрим под webhook). **DoD:** `/healthz` отвечает 200 снаружи; секреты из env; деплой воспроизводим командой/CI. **Deps:** T8.1 (готов). Блокирует всё остальное в M9.
- **T9.1 — Каркас бота внутри `server/` ⬜.** Не отдельный сервис: второй entrypoint (`cmd/bot`) либо webhook-хендлер на том же chi-роутере, чтобы переиспользовать `config`/`apperr`/`model` и остаться в одном контейнере. Оба режима доставки: **long polling** для разработки (публичный URL не нужен) и **webhook** в проде, переключение через env; у вебхука обязателен секретный заголовок `X-Telegram-Bot-Api-Secret-Token`. **DoD:** `/start` отвечает; токен только из env; в CI — сборка и тесты пакета. **Deps:** T9.0.
- **T9.2 — Служебные команды ⬜.** То, ради чего бот и заводится.
  - `/status` — сайт отвечает 200, `/healthz` API жив, **свежесть данных**: `manifest.builtAt` не старше N дней (data-refresh идёт кроном, «данные протухли» — реальный отказ), плюс `schemaVersion` и `ratingModelVersion` — те же поля, что на странице настроек.
  - `/data` — `manifest.counts` (события/паки/игроки/герои) и раскладка форматов; замер live 2026-07-17: `last_1y` 18 событий, `last_2y` 37, `last_5y` 69, `valve_legacy` 30.
  - **DoD:** ответ формируется из живых источников, а не из константы; недоступность источника — внятное сообщение, а не таймаут. **Deps:** T9.1.
- **T9.3 — Справочные команды ⬜.** `/heroes` (топ по играм), `/hero <имя>`, `/player <ник>`, `/teammates <ник>`. Считается по той же логике, что на страницах справочника, но в Go. **Помним:** это обратный лук-ап к тому, что закрывает хардкор; продуктовое решение — разрешаем (PRD §5.11), потому что бот не знает о забеге, а хардкор это договор с собой. **Deps:** T9.1.
- **T9.4 — TMA: подключение Telegram SDK во фронт ✅ (2026-07-20).** Адаптер `web/src/tma/` — единственное место, знающее про Telegram; `game/`/`ui/`/`features/` не тронуты. SDK грузится **лениво и только внутри Telegram** (детект по `tgWebApp*` в фрагменте URL / `TelegramWebviewProxy` / `__telegram__initParams`): статический `<script>` с telegram.org висел бы на критическом пути загрузки у всех, включая обычный веб, и при недоступном telegram.org сайт ждал бы таймаута. BackButton не заводит свою навигацию, а зовёт `history.back()` → `popstate` → `shellStore.syncFromHash` (тот же путь, что кнопка «назад» браузера); для случая «открыли ссылку сразу на справочнике» в `history.state` кладётся метка `aegisView`, иначе `back()` увёл бы из приложения. Проверено вживую со стабом WebApp: show/hide кнопки, возврат, deep-link. Тесты — `web/test/telegram.test.ts`. `telegram-web-app.js`, `WebApp.ready()`/`expand()`. Ключевое — **связать BackButton Telegram с нашим `shellStore`**: у нас навигация на hash+popstate, а телеграмная кнопка «назад» управляется явно, сама она про наши виды не знает. **DoD:** вход в справочник/настройки и возврат работают и в вебе, и в TMA; на узком экране ничего не перекрывается хедером Telegram. **Deps:** T9.0 (TMA требует HTTPS-URL; GitHub Pages подходит и без своего сервера — эту задачу можно начать раньше).
- **T9.5 — TMA: тема, safe-area, поведение ✅ (2026-07-21: проверено на живом клиенте — safe-area с хедером TMA, `viewportStableHeight` и тема в режиме system ок).**
  - Сделано: `expand()`, `disableVerticalSwipes()` (свайп вниз закрывал бы приложение поверх наших скроллов и drag-модалки), `setHeaderColor`/`setBackgroundColor` из токена `--bg`, `enableClosingConfirmation()` на время забега, хаптика на пик игрока/героя. Любой вызов SDK — через `tgSafe`: клиент старше вызова кидает `WebAppMethodUnsupported` и уронил бы эффект целиком.
  - **Тема: берём у Telegram РОВНО одно — `colorScheme` для режима «system»** (2026-07-20). Splash Telegram рисует по своей теме ещё до старта нашего кода, а `prefers-color-scheme` в webview следует ОС: у человека с тёмным Telegram поверх светлой системы splash был одного цвета, а приложение стартовало другим и перекрашивалось на первом кадре. Теперь внутри Telegram «системная» тема = тема Telegram (`watchTelegramColorScheme` + событие `themeChanged`). Палитру по-прежнему НЕ натягиваем: `themeParams` не трогаем, pure black остаётся наш. **Что при этом не лечится:** если игрок явно выбрал light/dark вопреки теме Telegram, splash всё равно мелькнёт чужим цветом — это его осознанный выбор, и переопределять его темой мессенджера неправильно.
  - **Грабля, пойманная вживую:** цвет читается из `--bg`, а `data-theme` на `<html>` ставит `ThemeProvider` — РОДИТЕЛЬ, и его эффекты React выполняет ПОСЛЕ эффектов детей. Эффект с зависимостью `[resolved]` присылал в Telegram старый `#000000` при переключении в light. Лечится не порядком хуков, а `MutationObserver` на атрибут.
  - **Launch Mode = Fullsize** (решение 2026-07-20, ставится в BotFather). Не Compact: мы всё равно зовём `expand()`, и первый кадр прыгал бы. И не **Fullscreen**: там приложение уезжает под статус-бар, а кнопки Telegram становятся ПЛАВАЮЩИМИ поверх контента — отступы тогда считаются по `safeAreaInset`/`contentSafeAreaInset` из SDK, а наша safe-area сделана на CSS `env(safe-area-inset-*)`, которая про эти контролы не знает: топбар с брендом и «Settings» окажется под ними. Fullscreen — только после того, как научимся читать телеграмные инсеты (отдельная задача, если вообще понадобится: режим рассчитан на игры во весь холст, а у нас своя шапка и скролл).
  - Осталось: проверить на живом клиенте safe-area с хедером TMA и `viewportStableHeight` — из браузера это не воспроизводится.
  - **Тему оставляем свою.** Наш pure black — часть айдентики; синхронизируем только `setHeaderColor`/`setBackgroundColor`, чтобы приложение не выглядело сломанным на фоне чрома Telegram. Слепо натягивать `themeParams` не будем.
  - Safe-area у нас уже сделана (`viewport-fit=cover` + `env(safe-area-inset-*)`, T7.8) — проверить с хедером TMA и `viewportStableHeight`.
  - `enableClosingConfirmation()`, пока идёт забег — тот же принцип, что наши confirm-модалки на выход с потерей прогресса.
  - Хаптика на пик игрока/героя.
  - **Известные грабли webview, уже пойманные в проекте:** плавный `scrollIntoView` — no-op (фолбэк уже есть в `TournamentScreen`), а при неактивной вкладке замирают CSS-переходы и анимации — значения свойств с `transition` читать только сняв переход. **Deps:** T9.4.
- **T9.6 — Хранилище в TMA ✅ (2026-07-20).** Взяли **CloudStorage** (сервер не нужен, см. разбор ниже). Слой — `web/src/state/persist.ts`, единственное место, знающее, КУДА мы пишем; `runPersist`/`careerStore`/`ThemeProvider`/`I18nProvider` знают только ЧТО пишут.
  - **localStorage не выброшен, а понижен до синхронного кэша.** Тема и язык нужны на первом кадре, до React, а облако отвечает асинхронно: рисуем по кэшу → дочитываем облако → правим, если разошлось. Вне Telegram поведение ровно прежнее.
  - **Чанки обязательны:** запись карьеры ≈873 байта, лимит значения 4096 ⇒ одно значение кончается на ~5 забегах. `persist` режет длинное значение по 3800 символов (`…_c0`, `…_c1`, заголовок `__chunks__:N`), лимит 1024 ключа даёт запас на сотни забегов. Проверено вживую: 40 909 байт → 11 чанков → побайтное восстановление после очистки кэша.
  - **Ключи пришлось маппить:** CloudStorage разрешает только `[A-Za-z0-9_-]`, а у нас `aegis:run:v1` и `aegis-draft.theme`. Маппинг обязан оставаться однозначным — на это есть тест.
  - **Гонка при гидрации:** флаг «игрок уже трогал» в Theme/I18n не даёт облаку перебить выбор, сделанный за те миллисекунды, пока оно отвечало. Карьера при гидрации **объединяется**, а не заменяется (дедуп по `runId` из `appendCareerEntry`), иначе забег, дописанный пока облако отвечало, потерялся бы.
  - **Молчащий клиент не вешает загрузку:** у каждого обращения таймаут 1.5с с фолбэком на кэш — иначе старый клиент без CloudStorage подвесил бы старт игры.
  - Проверено на живом Telegram (2026-07-21): тема и карьера пережили полный перезапуск мини-приложения.
  - **Что этому предшествовало (наблюдение 2026-07-20):** открыть мини-приложение → переключить тему на тёмную → выйти → зайти снова ⇒ тема снова светлая. То есть `localStorage` не пережил перезапуск webview, и под ударом был весь стейт: `aegis-draft.theme`, `aegis-draft.locale`, `aegis:run:v1`, `aegis:teamName:v1`, `aegis:career:v1`. Оговорка: между запусками правился конфиг бота в BotFather, что само по себе могло пересоздать webview — чистый повтор без правок конфига всё ещё стоит сделать.
  - **Почему CloudStorage, а не облачные сейвы T8.4:** хранит Telegram, ключ на пару «пользователь × бот», бэкенда не нужно вовсе. Ограничение выбора: сейв живёт **только внутри Telegram** — забег из TMA на сайте не подхватится. Общий для обоих каналов сейв это по-прежнему T8.4 и сервер, плюс аккаунты (ADR 0002, обновление 2026-07-20), где в TMA личность даёт `initData` (T9.8). **Deps:** T9.4.
- **T9.7 — Оформление бота в BotFather ✅ (2026-07-21: залито и настроено вручную в Telegram).** Аватар `web/public/bot-avatar.png` и **обложка `bot-cover.png` 640×360** рендерятся из `favicon.svg` командой `npm run gen:bot-assets` — DoD «один источник правды» закрыт. Залиты в BotFather, вписаны описания, включён Menu Button / Main App на URL GitHub Pages, Launch Mode = Fullsize. **Список команд НЕ заводим, пока нет T9.1:** меню команд у бота, который физически не может ответить, — обещание, которое не выполняется. **Deps (только для команд):** T9.1.
- **T9.8 — Валидация `initData` 🟨 (2026-07-21: чистый валидатор готов и юнит-покрыт; wiring в эндпоинт — с T8.3 auth).** HMAC-SHA256, ключ = `HMAC(bot_token, "WebAppData")`, проверка **только на сервере**. Реализовано в [`server/internal/telegram`](../server/internal/telegram/initdata.go) — пакет без HTTP/БД: `Validate(initData, botToken, maxAge)` строит data-check-string, сверяет подпись `hmac.Equal` (constant-time), проверяет свежесть по `auth_date`, разбирает минимум профиля (ПДн). Тесты: round-trip / tamper / чужой токен / истёкший / без hash — 8/8. Нужна, как только TMA начнёт что-то персонализировать (сейвы, лидерборд, дейлик): без неё клиент может назваться кем угодно. **Связано в эндпоинт (2026-07-21, T8.3):** валидатор дёргается из `POST /api/auth/telegram`, telegram-identity → `users`/`identities`, выдаётся сессия. Код готов; **живой** эндпоинт ждёт Fly (`BOT_TOKEN` через `fly secrets`). **Deps:** T9.0, T9.1 (для живого эндпоинта; сам валидатор от них не зависит).

- **T9.10 — Fullscreen-режим TMA 🟨 (2026-07-21: реализовано; ждёт живого теста на телефоне).** Включаем связкой (решение 2026-07-21): **BotFather Launch Mode = Fullscreen** (чистый старт во весь холст без прыжка Fullsize→Fullscreen) **+ runtime `requestFullscreen()`** как бэкап — на клиентах <8.0 и десктопе `tgSafe`/Telegram откатывают в Fullsize. Стало безопасно ставить Fullscreen ровно потому, что теперь читаем телеграмные инсеты (см. ниже). Сделано: тип `TelegramWebApp` расширен (fullscreen + `safeAreaInset`/`contentSafeAreaInset` + события); адаптер [`useTelegramShell`](../web/src/tma/useTelegramShell.ts) на старте зовёт `requestFullscreen`, раскладывает инсеты в CSS-переменные `--tg-safe-*` ([`telegram.ts`](../web/src/tma/telegram.ts) `telegramInsetVars`/`applyTelegramInsets`, по стороне = вырез + контролы Telegram) и пересчитывает по событиям `fullscreenChanged`/`safeAreaChanged`/`contentSafeAreaChanged`; вёрстка ([App.css](../web/src/app/App.css), [Modal](../web/src/ui/Modal.module.css)) читает `max(env(…), var(--tg-safe-*))` — топбар и модалка отодвигаются из-под плавающих кнопок. Вне Telegram переменные = 0 (поведение прежнее, покрыто тестом инсетов + tokens-AST). **Это закрывает блокер из T9.5** («Fullscreen — только когда научимся читать телеграмные инсеты»). **Кнопки не трогали:** close↔back — существующий BackButton-wiring, collapse — хром Telegram. **Осталось: живой тест на телефоне** (наложение плавающих кнопок и инсеты из браузера не воспроизвести, как T9.5) — топбар/«Settings»/модалка не под контролами Telegram; поворот пересчитывает; на клиенте <8.0 — корректный Fullsize. Что понадобится, если решим включать:
  1. **Инсеты Telegram, а не только CSS.** В fullscreen приложение уезжает под статус-бар и вырез, а кнопки Telegram («назад», «…») становятся плавающими поверх контента. Наша safe-area сделана на `env(safe-area-inset-*)` (T7.8) — она знает про вырез устройства и **ничего** не знает про плавающие контролы. Нужны `WebApp.safeAreaInset` и `contentSafeAreaInset` + события `safeAreaChanged`/`contentSafeAreaChanged`, разложенные в CSS-переменные (по образцу `--control-font`: значение приходит из адаптера `tma/`, а верстка читает токен).
  2. **Топбар.** `.topbar` с брендом и кнопкой «Settings» нарисован в самом верху страницы и окажется ровно под кнопками Telegram — ему нужен отступ на `contentSafeAreaInset.top`.
  3. **Модалка.** `Modal` считает высоту от `100dvh` и держит свою safe-area — перепроверить с новыми инсетами, иначе шапка модалки уедет под чром.
  4. **Переключение на лету.** `requestFullscreen()`/`exitFullscreen()` меняют геометрию без перезагрузки — инсеты обязаны пересчитываться по событию, а не только на старте.
  5. **BotFather:** Main App → Launch Mode → Fullscreen (сейчас Fullsize).
  - **Стоит ли:** режим рассчитан на игры во весь холст; у нас editorial-вёрстка со своей шапкой и скроллом, и выигрыш — только несколько лишних пикселей высоты. Браться, если появится полноэкранный игровой экран (например, драфт в отдельном режиме). **Deps:** T9.5.
- **T9.9 — `startapp` → забег по сиду ✅ (2026-08-18).** Direct Link умеет нести параметр: `t.me/aegis_draft_bot/play?startapp=<код>` приезжает во фронт как `tgWebAppStartParam`. У нас уже есть ровно та сущность, которую туда класть, — сид-код забега (T3.14) и кодек ссылки (`state/runLink`). Это делает «челлендж по сиду» нативным для Telegram: код кидают в чат ссылкой, а не текстом. **DoD:** параметр читается и попадает в тот же путь, что и `#run=` (через `pendingLink`), без второго механизма разбора. **Deps:** T9.4 (готов).
  - **Реализация:** извлечение строки — в адаптере [`tma/telegram.ts`](../web/src/tma/telegram.ts) (`telegramStartParam` + чистые `startParamFromHash`/`startParamFromInitParams`): фрагмент URL (мобильные клиенты/tdesktop) приоритетнее sessionStorage-дубля `__telegram__initParams` (Telegram Web); гейт по `tgWebApp` в hash, чтобы наш собственный hash-роутинг не читался как параметры Telegram. Разбор — существующий `decodeRunLink` в `runStore.loadData` (`runLinkFromHash(...) ?? runLinkFromStartParam()`), второго кодека нет; алфавит сид-кода (base64url `A-Za-z0-9_-`) — ровно тот, что Telegram разрешает в `startapp`. `syncLinkFromHash` намеренно не трогает start param: он существует только на холодном старте. Тесты: 7 кейсов в `test/telegram.test.ts` (фрагмент/sessionStorage/приоритет/мусор/приватный режим); живьём проверено на 5273 — модалка «Shared run» с конфигом из кода, «Play this run» стартует детерминированный драфт, предупреждение о потере идущего забега работает. **Оговорка:** телеграмный фрагмент не чистится (`clearRunLinkHash` — no-op для него), поэтому reload внутри TMA предложит ссылку снова; в TMA reload редкость, принято осознанно.

- **T9.11 — Матрица трёх контекстов запуска ⬜.** Одна и та же сборка открывается тремя способами, и каждый по-разному видит `window.Telegram.WebApp` — на этом стыке уже поймано **два** бага (оба в T9.5: splash-цвет по чужой теме; светлая тема во встроенном браузере, потому что там `colorScheme` по умолчанию `light`). Нужен один прогон по матрице «контекст × что проверяем», а не отлов по одному.
  - **Три контекста:** (1) **Mini App** — `platform` = ios/android/tdesktop, есть `tgWebApp*` в фрагменте URL, работает CloudStorage/BackButton/хаптика; (2) **встроенный браузер Telegram** — открытая из чата ссылка: `WebApp` существует, но `platform` = `unknown`, параметров запуска нет, `colorScheme` = `light` по умолчанию; (3) **обычный сайт** — `WebApp` отсутствует вовсе.
  - **Что проверять в каждом:** тема в режиме «system» следует нужному источнику (в Mini App — теме Telegram, в браузере и на сайте — `matchMedia`); тема/язык/забег/карьера сохраняются и восстанавливаются (CloudStorage только в Mini App, localStorage в остальных); BackButton, `expand`, `disableVerticalSwipes`, хаптика — активны только в Mini App и молча ничего не делают в двух других; нет перекрытия системной темы там, где мы её перекрывать не должны.
  - **Правило, ради которого задача и заводится:** любое обращение к `WebApp` в `src/tma/` обязано различать эти три случая — «объект есть» ≠ «мы в мини-приложении». Признак мини-приложения — `platform !== "unknown"`, а не просто наличие `WebApp`.
  - **Как гонять без телефона:** контексты (2) и (3) воспроизводятся в браузере подстановкой `window.Telegram.WebApp` со стабом (см. `test/telegram.test.ts` и ручные проверки в истории сессии); (1) — только на живом клиенте. **Deps:** T9.4 (готов).
- **T9.12 — TMA нативный хром: Back на все уровни + Settings в «…»-меню 🟨 (2026-07-21: сделано; живой тест на телефоне).** Баг (fullscreen, живой тест T9.10): на экране деталей режима телеграмная кнопка показывала «Закрыть» вместо «Назад». Корень — mode-навигация (`runStore.selectedMode`) не участвовала в решении «показывать ли Back» (реагировали только на `shellStore.view`). **Фикс:** единый источник правды о «назад» — [`state/navigation.ts`](../web/src/state/navigation.ts) (`canGoBack`/`navigateBack`): вид → назад по истории; экран деталей режима (mode выбран, `phase==="start"`) → в выбор режимов; в самом забеге (draft/tournament) Back НЕ показываем (там Telegram Close + closing-confirmation, не трогали). Телеграмный BackButton теперь делегирует в `navigateBack` и виден на всех уровнях. **Нативный хром (решение 2026-07-21):** в TMA прячем свои кнопки «назад» (`← All modes`/`Back to game`/`← назад`) и кнопку Settings — Settings уходит в системное «…»-меню через `WebApp.SettingsButton` (Bot API 7.0+; на старых клиентах API нет → наша кнопка остаётся фолбэком). Флаги в [`state/tmaChrome.ts`](../web/src/state/tmaChrome.ts) (`backNative` синхронно из `isTelegramLaunch`, `settingsInMenu` по факту проводки SettingsButton). Вне Telegram оба false — веб не меняется (проверено в превью: mode-навигация и все кнопки на месте). Тесты: `web/test/navigation.test.ts` (canGoBack/navigateBack по уровням). **Известное ограничение (не в scope):** браузерный «назад» на мобильном вебе с экрана деталей режима — mode-nav не пишет историю (предсуществующее); в TMA не важно (нет браузерного back), на вебе есть видимые кнопки. **Осталось: живой тест** — на скрине 3 «Закрыть»→«Назад» ведёт в выбор режимов; Settings открывается из «…»-меню; наши дубли скрыты. **Deps:** T9.10.

**Что НЕ делаем в M9:** отдельный фронт под Telegram (правка UI живёт в `web/` и приезжает в оба канала), второй бэкенд (бот ходит в тот же API и ту же статику), платежи и Stars.

**Нужен ли ADR.** Размещение бота внутри `server/` вторым entrypoint — решение уровня ADR 0002 (там уже зафиксировано «один контейнер, без k8s»), поэтому отдельный ADR заводим, только если выберем **не** этот путь (например, serverless-воркер).

---

## M10 — Arena: онлайн-турнир на 18 команд (по [PRD §5.12](PRD.md), форма уточнена 2026-08-10)
> НЕ дуэль (отменена решением 2026-08-10) — общий турнир-лобби: до 18 человек (число команд
> классики), недобор ведут боты на политиках sim-агентов; драфт из ОБЩЕГО пула одновременными
> раундами с приоритетом змейки (~8–10 минут, «скупить всех» невозможно по построению; игроки и
> герои уникальны глобально), затем один турнир на общем сиде — побеждает то, что надрафтил.
> UI драфта — стиль Dota ban/pick (пул по центру, таймлайн 18 команд по бокам, таймер раунда);
> карточка режима — красный акцент гаммы (`data-accent="arena"` в tokens.css, обе темы).
> Переиспользуем счёт/движок турнира/reveal/данные статикой/ботов из sim; новое — комнатный ws-слой
> в `server/` (ADR 0002) и state-machine драфт-раундов. Реализация не начата.

- ✅ **Карточка режима и красный акцент (2026-08-11, до MP0 по просьбе пользователя).** Четвёртая
  карточка Arena на главной (`RunMode "arena"`, сетка режимов — auto-fit: ряд на десктопе,
  столбик на мобиле без переполнения), клик ведёт в превью «Скоро» тем же паттерном, что
  Manager/Tournament. Акцент `data-accent="red"` в tokens.css: пастельный тон-в-гамму
  (#ffa9a0 dark / #b6392b light), НЕ сигнальный --danger — ошибки и шкала OVR не перекрашены;
  арт карточки — красные радиальные градиенты по образцу соседей. Замер живьём: shell/body
  несут accent=red, обе темы резолвятся, мобила в один столбик.
- **MP0 — ws-транспорт + комната по коду 🟨 (код готов 2026-08-21; живой прогон на проде ждёт T9.0).**
  - ✅ **Сервер.** Библиотека — `github.com/coder/websocket` (бывш. nhooyr; поддерживается,
    context-first, ws-клиент для тестов; gorilla отклонена — поддержка-заморозка). Слои по
    ADR 0002: state-machine комнат — [`service/room.go`](../server/internal/service/room.go)
    (CreateRoom/JoinRoom/Disconnect/Leave/Prune; вместимость 18; версии `manifest` +
    `BALANCE_CONFIG_VERSION` пинятся ПЕРВЫМ джойном, mismatch → отказ «обнови»; reconnect по
    токену ЗАМЕНЯЕТ участника — призраков нет; janitor чистит брошенные лобби >1ч);
    transport — [`rooms.go`](../server/internal/transport/rooms.go): `POST /api/rooms` +
    `GET /api/ws/rooms/{code}`, протокол v1 `{v,type,payload}` (hello→welcome, presence-рассылка
    joined/reconnected/disconnected/left, ping/pong; hub с per-соединение писателем — медленный
    клиент не тормозит комнату). **ws вынесен из-под `middleware.Timeout`** (30с убивал бы
    долгоживущее соединение); свои дедлайны: hello 10с, чтение 75с.
  - 🐛 **Две находки в процессе:** (1) `conn.Close()` делает closing-handshake и ждёт эхо пира
    до 5с — teardown-рассылки стояли в нём (пойман транспортным тестом; лечение `CloseNow`);
    (2) у сервера ВООБЩЕ не было CORS — браузер с Pages/localhost не мог позвать API
    кросс-ориджином (всплыло пробником связности T11.3; чинит `corsMiddleware`, wildcard
    безопасен — куки не используются, auth = Bearer). Это чинит и будущие вызовы auth/saves
    с Pages, не только комнаты.
  - ✅ **Фронт.** [`data/api/arena.ts`](../web/src/data/api/arena.ts) (кодек протокола v1 +
    REST-создание), [`state/arenaStore.ts`](../web/src/state/arenaStore.ts) (оркестрация;
    reconnection-токен в sessionStorage per-код — reload возвращает того же участника),
    [`ArenaLobby`](../web/src/features/start/ArenaLobby.tsx) за карточкой Arena — ТОЛЬКО при
    сконфигуренном `VITE_API_BASE` (на проде без сервера карточка остаётся «Скоро», поведение
    прода не изменилось). i18n RU+EN, ошибки version_mismatch/room_not_found/room_full — свои
    тексты.
  - ✅ **Проверки.** Go: 4 unit state-machine (пин версий/mismatch по каждой оси, reconnect без
    призраков, вместимость+leave, prune) + 3 транспортных с реальным ws-клиентом (два клиента
    видят друг друга, reconnect держит identity и место, mismatch/not_found отказы). Живой
    прогон: локальный `go run ./cmd/api` + два playwright-контекста против 5273 — комната
    HC5ZF, оба видят обоих, обрыв держит место (offline-точка), явный выход чистый, неизвестный
    код — честная ошибка.
  - ⬜ **Осталось (за T9.0 — Fly-карта на стороне пользователя):** прогон на живом HTTPS-сервере
    и из TMA-webview; выставить `VITE_API_BASE` в деплой-сборку. Код к этому готов.
- ✅ **MP1 — турнир комнаты на общем сиде, драфт из личных паков (2026-08-26).** Играбелен
  конец-в-конец локально (живой прод — за T9.0, как MP0): host выбирает оси (draftStyle+format,
  остальное фикс) и шлёт `start` → каждый драфтит СВОИ паки существующим `DraftScreen`
  (personal seed `seed:arena:{memberId}`; runStore: фаза `arenaWait` после драфта, long-save
  для арены не пишется) → экран ожидания сдаёт `roster` (refs+heroes+teamOvr) → host жмёт
  `lock` → каждый клиент строит ОДИН турнир: canonical-поле `buildArenaField` (сданные составы
  по memberId + боты `game/botDraft.ts` — порт жадного sim-агента — до 18; несдавшие честно
  заменяются ботами) → существующий `TournamentEngine` с явными opponents (путь RT) → общий
  reveal тем же TournamentScreen (реролл поля в арене скрыт — поле комнаты фиксировано).
  - **Транспорт — relay-лог M-DUEL как есть** (`game/arenaProtocol.ts` — детерминированная
    применялка: start/roster/lock, невалидное — молчаливый игнор у всех одинаково); сервер НЕ
    менялся вовсе.
  - **Кросс-клиентный детерминизм**: рассадка `buildResult` канонична (сортировка по силе),
    эпсилон по каноническому индексу исключает точные ничьи сил, на которых tie-break по id
    разошёлся бы (у зрителя «моя» команда — другой id). Закреплено тестом «два клиента с
    разными „я“ строят бит-в-бит один турнир» и живым прогоном: два ws-клиента + 16 ботов —
    финальные таблицы 18 строк идентичны до знака.
  - Career-запись видом `arena` (бакет истории отдельный, как у RT). Карточка режима теряет
    «Скоро» при сконфигуренном API; anti-cheat (teamOvr на веру) — MP3, refs+heroes уже в логе
    под будущую ре-симуляцию.
  - ⚠️ Отклонения от прежнего плана: таймаут-автопик заменён «host лочит, несданных ведут
    боты» (один механизм закрывает и AFK, и недобор); reconnect после reload теряет ЛОКАЛЬНЫЙ
    драфт (лобби честно говорит об этом) — переигровка драфта по своему же логу — кандидат MP2.
  - DoD-остаток: живой прогон на проде (T9.0) и e2e двумя Playwright-контекстами — вместе с
    прод-запуском.
- ✅ **MP2 — целевая форма: общий пул + одновременные раунды (срез 1, 2026-08-28).** Играбельно
  конец-в-конец локально (живой прод — за T9.0, как MP0/MP1): host шлёт `start` (сид + формат +
  снапшот участников на момент входа — резолв НЕ смотрит на живой presence) → 5 раундов игроков +
  5 раундов героев, все выбирают одновременно (пик + необязательный запасной), приоритет посадки
  роллится по сиду комнаты и змейка инвертируется каждый раунд; конфликт выигрывает лучший
  приоритет раунда, проигравшему — запасной или авто-пик; игроки и герои уникальны глобально.
  - **Движок** — [`game/arenaDraft.ts`](../web/src/game/arenaDraft.ts) (чистый): общий пул из
    `poolForFormat` (личность сворачивается к лучшей форме — рулетка форм это рычаг роглайта,
    не арены), гейт ёмкости `arenaPoolShortage` (18 команд = 18×3 кор-ролей + 36 саппортов;
    реальный датасет тянет во всех форматах — минимум last_1y: 38 mid / 81 support; mock — нет,
    и лобби честно отказывает вместо молчаливого игнора start), бот-политика = порт жадного
    агента (лучший OVR в открытую роль; герой — comfort по pro-играм пятёрки; `botDraft.ts`
    MP1 удалён — политика переехала сюда). Сила команд — тот же `scoreTeam`, base = event OVR
    (как в Дуэли: сборная из общего пула — не реальная команда, team-success ей не принадлежит).
  - **Протокол** — `game/arenaProtocol.ts` переписан на MP2-применялку relay-лога (start/pick/
    close): раунд резолвится в той точке лога, где сдал ПОСЛЕДНИЙ человек, либо по `close` хоста —
    одна и та же точка у всех клиентов; сервер по-прежнему НЕ менялся вовсе. Анти-чит стал
    структурно проще MP1: teamOvr больше не принимается на веру — каждый клиент считает все 18
    команд из лога сам; серверная валидация — MP3.
  - **MP1-флоу (личные паки, roster/lock, `arenaWait`/ArenaWait) удалён** — целевая форма его
    заменяет; синтетический снапшот команды уезжает в прежний `startArenaTournament` → тот же
    TournamentEngine/reveal/карьера (бакет `arena`). Reload теперь НЕ теряет драфт: reconnect
    реплеит лог и восстанавливает и раунды, и свою заявку (дефект MP1 закрыт по построению).
  - **UI** — `features/arena/ArenaDraftScreen.tsx`: пул по центру (игроки колонками по ролям,
    герои сеткой), посадка раунда с приоритетом, своя команда, лента резолвов «кто кого взял /
    перехвачен», таймер; зритель (вошёл после старта) остаётся в лобби с честным статусом.
  - ⚠️ **Отклонения от прежнего плана** (паттерн MP1 «host лочит»): таймер раунда — авто-`close`
    хоста (~30с, `ARENA_DRAFT.roundSeconds`), серверного таймера нет — host offline ⇒ раунд ждёт
    полной сдачи людей; свап героев до лока опущен — allocation=auto, венгерка и так оптимальна
    (свап был бы мёртвым действием), вернётся вместе с manual-alloc, если он понадобится арене.
  - **Проверки:** 8 unit движка (детерминизм бит-в-бит, глобальная уникальность, змейка,
    конфликт main/backup/auto, протухшая заявка, гейт ёмкости; поле 3 — гоняются на ОБОИХ
    датасетах) + 6 протокольных (полная сетка 18 на real, mock покрывает отказ тонкого пула;
    «два клиента с разными „я“ строят бит-в-бит один турнир»). Живой прогон: локальный
    `go run ./cmd/api` + два playwright-контекста против 5273 — комната HJZ2H, 10 одновременных
    раундов, поля 18 строк идентичны у обоих; соло-прогон до финальной таблицы пишет карьеру
    видом `arena`. 657 unit (real) / 647 (mock), smoke+runLink e2e 28, tsc/build/валидатор чисты.
  - DoD-остаток: живой прогон на проде (T9.0) и e2e двумя Playwright-контекстами — вместе с
    прод-запуском; полиш экрана до референс-плотности Dota ban/pick (лента прошлых пиков,
    таймлайн-заполнение) — по живому фидбеку.
- **MP3 — баны, рейтинг и честность ⬜.** 1 бан героя на команду перед драфтом (как в референсе
  «Запретить Shadow Fiend»); лидерборд Arena, матчмейкинг очереди, анти-чит серверной
  ре-симуляцией лога. **Та же дилемма «четырёх слагаемых», что T8.5** — решается разом для
  дейлика и Arena, раньше — не начинать. Deps: T8.5, T8.6.

- ✅ **Баг-репорт владельца 2026-08-31 (скрин mode-select): «Real Tournament» резался краем
  карточки; у Дуэли не было своей гаммы.** (1) Заголовок: двойная grid-грабля `min-width:auto`
  (и `__body`, и `strong`) не давала строке переноситься — узкая полоса ширин (~1500–1800)
  прятала хвост под `overflow:hidden`; лечение `min-width:0` + `overflow-wrap/hyphens` + мягкий
  перенос `Tourna­ment` в строке (headless-словаря переносов нет, дефис нужен свой; ключ
  живёт только в DOM — канвас шеринга и карьера не задеты). (2) Дуэль получила **бирюзу** —
  последнюю свободную пастель рядом с green/violet/orange/blue/red: `data-accent="teal"` в
  обеих темах + арт карточки + маппинг в App (внутренний акцент режима раньше просто
  отсутствовал в цепочке `modeAccent`). Замер живьём: карточки на 1600/2000, тил внутри режима.

**Сквозные границы M10.** Игровые данные — статикой (ws не раздаёт JSON сцены); `scoreTeam` и
`ratingModelVersion` не форкаются; протокол версионируется с первого дня; комнатная логика в
`server/internal/service` (transport только upgrade/кодек — слои ADR 0002 не пробивать);
бот-политики — порт политик `scripts/sim_run.ts`, а не новый драфт-ИИ. **Вход в режим гейтится
связностью** — `T11.3` даёт пробник и офлайн-экран; MP0 не изобретает свою проверку сети.

---

## M-DUEL — Дуэль: онлайн 1×1 капитанским драфтом (по [PRD §5.13](PRD.md), 2026-08-26)

✅ **Срез 1 (2026-08-26): режим играбелен конец-в-конец на relay-комнатах MP0** (проверено живьём:
локальный Go-сервер + два независимых ws-клиента доиграли Bo1 до идентичного финала).
- **Сервер:** универсальный relay поверх комнат MP0 — `AppendRelay/RelayLog` в
  `service/room.go` (лог `{seq, from, payload}` в памяти комнаты; from штампуется по токену
  слота, подделать нельзя), transport: `case "relay"` → broadcast, `relay_log` лично на
  входе/reconnect ДО presence. Слой mode-agnostic — Arena MP2 сядет на него же.
- **Клиент:** `game/duel.ts` — движок (змейка игроков 0-1-1-0…, общий used-набор, сетка
  хиро-драфта Б-Б-Б-Б + пики змейкой, пул = top-8 героев каждого игрока по pro-играм ≥10,
  ротация приоритета по играм, резолв `eloWinProbability` + `eloDivisorForScale` от средней
  силы); `game/duelProtocol.ts` — детерминированная применялка relay-лога (невалидное — молчаливый
  игнор у всех одинаково; свои действия применяются только с возвратом от сервера);
  `state/duelStore.ts` — оркестрация (создать/войти по коду, reconnect-токены как у Arena,
  реплей лога с нуля); `features/duel/DuelScreen.tsx` — setup → лобби (код крупно, участники)
  → драфты с гейтом «твой ход» → таблица серии. Пятая карточка режима (`needsNetwork`).
- **Решения:** дуэль НЕ пишет карьеру/рейтинги (анти-чит ре-симуляцией не нужен — комната
  вредит только себе); третий+ участник комнаты — зритель (его действия игнорируются
  протоколом); правила дуэли (`DUEL`) не входят в BALANCE_CONFIG_VERSION (PvE-баланс не трогают).
- **Тесты:** `test/duel.test.ts` (7: змейка/общий пул/сетка/детерминизм серии),
  `test/duelProtocol.test.ts` (3: start/чужие ходы/полный лог + реплей бит-в-бит),
  Go `TestRoomRelayLogOrderAndStamping`.
- ⬜ Живой прогон на проде ждёт **T9.0** (Fly-аккаунт: секрет `FLY_API_TOKEN` + `VITE_API_BASE`
  в Pages-сборке) — до него карточка честно показывает «нужен сервер».
- ✅ **Таймер хода + реванш той же комнатой (2026-08-28).**
  - **Таймер:** `DUEL.turnSeconds = 45` — отсчёт видят оба (внутри строки хода, краснеет на
    ≤10с), авто-ход по истечении шлёт клиент САМОГО актора (чужой ход применялка/сервер не
    примут — from штампуется по токену слота): `duelFallbackAction` — лучший OVR из пикабельных
    либо верхняя открытая клетка хиро-пула (он и так отсортирован по играм). Взвод — по подписи
    шага (`stepSignature`), поэтому мусор в логе отсчёт не сбрасывает, а реплей после reconnect
    не дублирует ход. Резолв/финал таймером не гонятся (там ничьего хода не ждут). Отключённый
    актор авто-ход не пошлёт — это честный кейс «обрыв связи», его закрывает reconnect.
  - **Реванш:** после `done` любой капитан жмёт «Реванш» — в лог уезжает новый `start` (новый
    сид, те же правила), применялка принимает start ПОВЕРХ доигранной партии (активную
    перезапустить нельзя; зритель не может ни стартовать, ни реваншировать). Стороны меняются:
    первый пик уходит бывшей стороне 1. Реплей лога с двумя партиями детерминирован.
  - **Проверки:** +2 unit (fallback-политика по фазам; rematch: капитан/зритель/активная
    партия), живой прогон двух ws-клиентов: таймер тикает у обоих, АФК-актор доигран авто-ходом
    через ~45с, реванш стартовал новую партию у обоих со сменой сторон. 659 unit (real) /
    649 (mock), tsc/build/скан чисты.
- ⬜ Дальше: пары зрителей; карьерная метка дуэлей (противоречит решению «дуэль не пишет
  карьеру» — сначала продуктовое решение владельца).
  Переиспользование relay в Arena MP2 — ✅ случилось (2026-08-28, слой остался mode-agnostic).

## M11 — Офлайн-игра (PWA, по [ADR 0003](adr/0003-offline-first-pwa.md))
> Поймано вживую 2026-08-13: игрок в самолёте не смог открыть игру **вообще**. Офлайна не было —
> ни service worker, ни `manifest.webmanifest`, 11 JSON тянутся `fetch`-ем, вся графика с чужого
> Steam CDN. Логику трогать не надо: геймплей уже чистый клиент (static-first, ADR 0001), сервер во
> фронт не подключён (`grep data/api` по `web/src` — ноль импортов). Это задача доставки ассетов.
>
> **Решения владельца 2026-08-13:** данные качаются **автоматически** при первом заходе (1.7 МБ gzip
> дешевле, чем игрок, узнавший о кнопке уже в самолёте); арт **зеркалим в git**, а не докачиваем в
> рантайме (офлайн-готовность не должна зависеть от того, какие экраны игрок успел открыть).
>
> **Порядок:** `T11.3` первой — она самая дешёвая и ни от чего не зависит; `T11.1` и `T11.2`
> независимы друг от друга и могут идти параллельно; `T11.4`/`T11.5` — поверх них.

- **T11.1 — Service worker: оболочка + автопрекэш датасета ✅ (2026-08-14).**
  - **Цель:** после первого захода приложение открывается и полностью играется без сети.
  - **Реализовано:** [`src/sw.ts`](../web/src/sw.ts) (обвязка Cache API) + [`src/sw/policy.ts`](../web/src/sw/policy.ts) (чистые решения, юнит-тест `test/swPolicy.test.ts`, 11 кейсов) + [`state/serviceWorker.ts`](../web/src/state/serviceWorker.ts) (регистрация, плашка обновления, команда «сверь датасет») + `vite-plugin-pwa` в режиме injectManifest и manifest PWA в [`vite.config.ts`](../web/vite.config.ts). Иконки 192/512/maskable рендерятся из того же `favicon.svg` существующим `npm run gen:bot-assets` — второго источника знака не завели.
  - **Состав датасета вынесен в общий список** [`data/dataFiles.ts`](../web/src/data/dataFiles.ts): его читают и `DataSource`, и SW, а компайл-тайм замок сверяет список с ключами `GameData` — добавить файл и забыть про кэш теперь нельзя (падает `tsc`, а не офлайн у игрока).
  - **Три шишки, найденные только живым прогоном** (сборка и юниты были зелёные во всех трёх случаях):
    1. **`cache.addAll` падает на дубликатах.** Иконки и `manifest.webmanifest` попадают в precache-манифест дважды (из `globPatterns` и из описания PWA) — install проваливался молча, и офлайна просто не было. Лечится дедупом адресов.
    2. **`Vary: Origin` ломает попадание в собственный кэш.** Модульные скрипты Vite запрашиваются с атрибутом `crossorigin` (то есть с заголовком `Origin`), а в precache файл клали без него: HTML офлайн отдавался, js и css — нет, приложение не стартовало. Лечится `ignoreVary: true` на всех наших `caches.match` (ключ у нас — адрес, и только он).
    3. **`caches.open` создаёт кэш.** Проверка «скачан ли набор» оставляла за собой пустое ведро несуществующей версии — теперь сначала `caches.has`.
  - **Dev-guard.** Dev и `npm run preview` живут на одном origin (5273), поэтому в dev-сборке воркер не просто не регистрируется, а **сносится**: unregister + удаление наших кэшей + одна перезагрузка (отписка действует лишь со следующей навигации). Без этого правка «не применяется» в dev, потому что страницей всё ещё управляет воркер прод-превью. Проверено на persistent-профиле: превью → SW и 3 кэша, переключение на dev → пусто.
  - **Цена зависимости, честно:** `vite-plugin-pwa` тянет `workbox-build` и с ним ~380 пакетов в dev-дерево (+5.3k строк в lock-файле) ради двух вещей — списка хешированных ассетов и сборки `sw.ts`. Пока терпимо (dev-only, кэш `setup-node`); если начнёт мешать, замена — локальный плагин на `esbuild`, который и так внутри Vite (~60 строк), логика SW при этом не меняется.
  - **Отклонение от плана:** `manifest.webmanifest` не лежит в `public/`, а генерируется плагином из `vite.config.ts` — иначе пришлось бы руками поддерживать пути под сабпуть GitHub Pages в двух местах.
  - **Файлы:** `web/vite.config.ts` (`vite-plugin-pwa`, режим `injectManifest`), `web/src/sw.ts`, `web/public/manifest.webmanifest`, `web/index.html` (link на манифест), регистрация в `web/src/main.tsx`.
  - **Стратегии:** hashed-ассеты — precache/cache-first (иммутабельны); навигация — network-first с фолбэком в кэш; `data/*.json` — прекэш **всем набором сразу**, автоматически, без действия игрока.
  - **Главное правило — атомарность датасета.** Ключ cache-bucket = `manifest.dataHash`; новый набор скачивается целиком в новый bucket и включается **одним шагом**, и только когда нет активного забега. Причина не гипотетическая: `dataHash` участвует в совместимости сейва ([`runPersist.ts`](../web/src/state/runPersist.ts), BUG-2026-07-23) — пофайловое обновление молча убьёт resume посреди сессии, а смесь старого `packs.json` с новым `players.json` — это рассинхрон `accountId`.
  - **Обновление приложения не самовольное:** `skipWaiting` по явному действию или на старт-экране, но не в драфте/турнире. Тост «доступна новая версия» — примитивами `ui/`, строки в `i18n/core.ts` (RU+EN).
  - **В dev SW не регистрируется** — иначе HMR и правило 5273 превращаются в отладку призраков; ручная проверка через `vite preview`.
  - **Скиллы:** `frontend-architecture`, `data-contract`, `discovery-before-code`.
  - **DoD:** ✅ прод-сборка открывается после `setOffline(true)` и полный классический забег (старт → драфт → турнир → итог) проходится без сети; ✅ новый `dataHash` во время незавершённого забега не качается и не включается, а сразу после — набор скачивается в новое ведро, указатель переключается, старое ведро сносится (замер на подменённом манифесте); ✅ плашка обновления в драфте не появляется (0), на старт-экране появляется (1); ✅ `npm run typecheck` (оба проекта, включая `tsconfig.sw.json`), `npm run test` 563 passed, `npm run build`, смоук-e2e 12/12, antipattern-скан чист.
- **T11.2 — Зеркало арта в репозитории ✅ (2026-08-14).**
  - **Цель:** портреты, логотипы и иконки предметов доступны офлайн и не зависят от чужого CORS.
  - **Реализовано:** [`scripts/mirror_art.mjs`](../web/scripts/mirror_art.mjs) (`npm run gen:art`) кладёт 268 файлов в `web/public/art/{heroes,teams,items}` — **1.8 МБ** вместо ~13 МБ оригиналов (портрет 61 КБ → 8.6 КБ, знак 53 КБ → 5 КБ). Перекодирование — canvas самого Chromium, тем же приёмом, что splash-иконки в `render_bot_assets.mjs`: нативный кодировщик в зависимости не тащим. Источник имён — те же файлы, что читает игра (`heroes.json`, `packs.json`, `ITEM_ART`), поэтому третьего списка сущностей не появилось.
  - **Порядок источников** — в одном месте, [`ui/artSource.ts`](../web/src/ui/artSource.ts): зеркало → CDN → фолбэк компонента (монограмма/имя). Хук `useArtSource` держит список **сломавшихся адресов**, а не индекс: при смене пропса (тот же компонент, другой герой) индекс пришлось бы сбрасывать эффектом. Используют все трое — `HeroThumb`, `TeamLogo`, `ItemIcon`.
  - **Схема не тронута.** `logoUrl` остался абсолютной ссылкой на CDN и работает как запасной источник; локальный путь собирается по `teamId`, для чего он добавлен в `DraftPack` (у Mixed его нет — там нет и общего знака). Ни `schema/`, ни Go-модель, ни TS-типы данных не менялись.
  - **Пополнение зеркала — руками (`npm run gen:art`), а не в кроне.** `data-refresh` гоняется ежедневно и не ставит зависимости web вовсе, а генерация поднимает Chromium. Вместо этого в крон добавлена **дешёвая проверка** `mirror_art.mjs --check` (ходит только по файловой системе, `continue-on-error`): новая команда без локального знака видна в логе, а в UI она всё это время работает через CDN-фолбэк. Playwright в скрипте импортируется лениво — именно чтобы `--check` работал без `npm ci`.
  - **`missing.json` ведёт сам скрипт:** у 5 исторических команд знака нет на CDN в природе, и без списка известных пробелов `--check` ругался бы на них вечно. Список переписывается целиком только когда прогон видел все цели — иначе в нём остались бы одни новички.
  - **Разблокировано попутно:** арт стал same-origin, то есть canvas больше не «пачкается» — портреты в шеринг-карточке (оговорка в `T7.1`) теперь технически возможны. Это отдельная задача, в M11 не входит.
  - **Грабля проверки (не кода), 2026-08-14:** офлайн-тест на проде падал при зелёном локально. Причина — `page.waitForFunction(async () => …)`: он **не ждёт промис**, объект Promise truthy сам по себе, поэтому гейт «дождись установки SW» проходил мгновенно и проба стреляла в середине install. На localhost установка занимает доли секунды и это не всплывало, на GitHub Pages — ~16 с (280 файлов), и всплыло сразу. Ждать состояние в браузере — только циклом с `await page.evaluate(...)`. Для таких багов заведена конфигурация превью `web-preview-pages` (`npm run preview:pages`): прод-сборка под сабпутём `/aegis-draft/`, где живут scope воркера и относительные пути манифеста.
  - **Почему не кэш чужого CDN:** замер 2026-08-13 — `ACAO: https://www.dota2.com` у обоих хостов, значит только opaque-ответы: captive-portal кэшируется под видом картинки, квота считается с паддингом, canvas остаётся tainted. Разбор — [ADR 0003](adr/0003-offline-first-pwa.md).
  - **Объём:** 127 портретов × ~55–63 КБ ≈ 7 МБ и 112 логотипов × ~54 КБ ≈ 6 МБ сейчас → после downscale в webp ≈ 1.3 МБ и ≈ 0.4 МБ. Разрешение брать из реальных размеров в `HeroThumb.module.css`/`TeamLogo.module.css` ×2 под retina: сегодня под плашку 40 px грузится полноразмерный PNG, так что зеркало ускорит и онлайн.
  - **Файлы:** `web/scripts/mirror_art.mjs` (+ `npm run gen:art`), `web/public/art/{heroes,teams,items}/`, резолв в [`HeroThumb`](../web/src/ui/HeroThumb.tsx) / [`TeamLogo`](../web/src/ui/TeamLogo.tsx) / [`ItemIcon`](../web/src/ui/ItemIcon.tsx).
  - **Схему не трогаем:** `logoUrl` в паках остаётся абсолютной ссылкой; клиент идёт в `art/teams/{teamId}.webp` и падает на `logoUrl` существующим `onError`-фолбэком. Ни `schema/`, ни Go-модель, ни TS-типы не меняются.
  - **Обновление:** герои — руками раз в полгода (новый герой), логотипы команд — джобой `data-refresh` (она и так коммитит данные), недостающий файл всегда деградирует в CDN-фолбэк.
  - **Побочная выгода:** снимает tainted-canvas → портреты в шеринг-карточке становятся возможны (оговорка «отдельная задача про самохостинг арта» в T7.1 закрывается этой задачей).
  - **Скиллы:** `frontend-architecture`, `discovery-before-code`.
  - **DoD:** ✅ офлайн-драфт идёт с портретами и знаками — замер **на живом проде** (`artemchikolaev.github.io/aegis-draft/`): 6/6 картинок из зеркала, 0 запросов к CDN, 0 битых, после `setOffline(true)` картина та же; ✅ порядок фолбэков покрыт юнит-тестом (`test/artSource.test.ts`, 6 кейсов), удаление файла из `art/` оставляет CDN, затем монограмму; ✅ прирост репозитория 1.8 МБ, precache вырос с 734 КБ до 2.0 МБ (280 записей); ✅ повторный `gen:art` ничего не качает (268 пропущено); ✅ typecheck, 569 unit, build, смоук-e2e 12/12, antipattern-скан чист.
- **T11.3 — Проверка связности и офлайн-состояние онлайн-режимов ✅ (2026-08-14).**
  - **Цель:** режим, которому нужен интернет, честно говорит об этом, а не молчит мёртвым кликом.
  - **Реализовано:** [`state/connectivity.ts`](../web/src/state/connectivity.ts) — чистое ядро `probeConnectivity` (вся политика: `onLine === false` ⇒ офлайн без запроса; пробник с `AbortController` на 3 с; сбой/отказ/таймаут ⇒ офлайн; нет пробника ⇒ `unknown`) + zustand-стор с подпиской на `online`/`offline`/`visibilitychange` (`startConnectivityWatch` из [`main.tsx`](../web/src/main.tsx)). HTTP не изобретён: `pingHealth` добавлен в существующий [`data/api`](../web/src/data/api/index.ts) поверх `apiFetch` (+ опция `cache` — `no-store`, иначе ответ из HTTP-кэша «доказал» бы связь). UI — в [`StartScreen`](../web/src/features/start/StartScreen.tsx): флаг `needsNetwork` у Arena, бейдж «НЕТ СЕТИ» вместо «СКОРО» и приглушение карточки, панель состояния сети на экране режима с кнопкой «Проверить снова». Строки RU+EN, цвет — новый токен `--danger-invert` (тема-зависимый `--danger` тонет на всегда-тёмной панели).
  - **Две шишки, пойманные живьём (обе — про честность промежуточных состояний):**
    1. **Молчащий API ⇒ мигание экрана.** Пока пробник ждал 3 с, экран показывал обещание режима и потом прыгал на «нет сети». Лечится третьим состоянием `checking` (панель «Проверяем…»), а не спиннером поверх готового контента. Поэтому в сторе `status` (последний вердикт) и `checking` (идёт ли проверка) — **разные поля**: сброс вердикта на время ретрая давал бы то же мигание.
    2. **Карточка узнавала об офлайне только после клика.** Событие `offline` при загрузке не приходит, а проверка стартовала на входе в режим ⇒ первый кадр обещал «СКОРО». Лечится синхронным начальным `status` из `navigator.onLine` (тот же приём, что флаги TMA в `tmaChrome`).
  - **`unknown` не гейтит.** Пока `VITE_API_BASE` пуст, проверять нечем, и это НЕ считается офлайном — иначе гейт срабатывал бы у всех на пустом конфиге. Обещать связь, которую не проверяли, тоже нельзя, отсюда третий вердикт вместо `boolean`.
  - **Ключевое:** `navigator.onLine === true` в самолётном Wi-Fi. Он валиден **только как отрицательный** сигнал (`false` ⇒ точно офлайн, в сеть не ходим); положительный ответ даёт только пробник `GET {VITE_API_BASE}/healthz` ([`router.go:61`](../server/internal/transport/router.go)) с `AbortController` ~3 с и `cache: "no-store"`, с перепроверкой по событию `online` и `visibilitychange` и коротким кэшем результата.
  - **Файлы:** `web/src/state/connectivity.ts` (+ хук), карточка режима в [`StartScreen.tsx`](../web/src/features/start/StartScreen.tsx), офлайн-состояние на примитивах `ui/`, строки в `i18n/core.ts`.
  - **Границы:** офлайн не блокирует ничего одиночного; Arena сейчас `available: false`, поэтому делаем задел, а не переписывание; экран «нет соединения» — из существующих `ui/`-примитивов с кнопкой «Повторить», без bespoke-разметки.
  - **Отдельно зафиксировать в [PRD §5.12](PRD.md):** обрыв связи **внутри** лобби/драфта — это не тот же случай, что вход в офлайне; реконнект должен проектироваться вместе с ws-протоколом (`MP0`), а не чиниться потом.
  - **Скиллы:** `frontend-architecture`, `game-state-architecture`.
  - **DoD:** ✅ при офлайне карточка Arena показывает причину и не ведёт в мёртвый экран (замер на 5273: бейдж и панель с ретраем, обе темы + мобила); ✅ при живом интернете и недоступном API — тот же честный экран (проверено на `VITE_API_BASE` в никуда: отказ соединения и молчащий адрес); ✅ одиночные режимы не задеты (`data-offline` только у Arena, смоук-e2e 12/12); ✅ юнит `web/test/connectivity.test.ts` (8 кейсов, включая «онлайн-флаг врёт, health не отвечает»). Прогон: `tsc --noEmit`, `npm run test` 552 passed, `vite build`, antipattern-скан чист.
- **T11.4 — Панель «Офлайн» в настройках + установка на устройство ✅ (2026-08-14).**
  - **Цель:** игрок до вылета знает, готов ли он к офлайну.
  - **Реализовано:** панель в [`SettingsScreen`](../web/src/features/settings/SettingsScreen.tsx) рядом с паспортом датасета (тот же датасет, но вопрос не «какой он», а «доедет ли со мной»): состояние, версия копии (`дата · короткий dataHash`), занятый объём, кнопки «проверить обновление» и «удалить копию» (с подтверждением). Чтение — [`state/offlineStatus.ts`](../web/src/state/offlineStatus.ts): смотрит НАСТОЯЩИЕ кэши через имена и ключи из `sw/policy.ts`, своей копии правды не заводит. Установка на устройство — [`state/installApp.ts`](../web/src/state/installApp.ts).
  - **Найден и починен настоящий дефект:** «удалить копию» сносила и оболочку, а кнопка «проверить обновление» восстанавливала только датасет — `install` у уже установленного воркера не повторяется, и офлайн оставался сломанным до следующей версии приложения. Добавлена дозаливка оболочки (`ensureShell`), сообщение переименовано в `ensure-offline`: оно теперь про всю копию, а не только про данные.
  - **Состояний четыре, а не три.** До первого чтения панель показывала «Недоступно» — то есть врала про самое интересное. Добавлено `checking`; кнопки до первого чтения заблокированы.
  - **Обновление во время забега — кнопка НЕДОСТУПНА с объяснением**, а не «нажимается вхолостую»: смена `dataHash` обнулила бы сейв (BUG-2026-07-23). Плашка говорит, что копия обновится после конца забега.
  - **Установка:** Chrome/Android — придержанный `beforeinstallprompt` (без `preventDefault` браузер показал бы свой баннер когда захочет); iOS — системного промпта не существует, поэтому честная инструкция «Поделиться → На экран «Домой»» и только на iOS-устройствах. Причина, почему это вообще важно: Safari чистит кэш сайта после ~7 дней без визита, у установленного приложения копия живёт дольше (ADR 0003).
  - **Файлы:** [`SettingsScreen.tsx`](../web/src/features/settings/SettingsScreen.tsx), `i18n/core.ts`, `web/public/manifest.webmanifest` (иконки/`start_url` с учётом `VITE_BASE`, `theme_color` в тон `index.html`).
  - **Содержимое:** статус («готово к офлайну» / «качается» / «нет»), версия закэшированного датасета (`dataHash` кратко + `builtAt`), занятый объём, кнопки «обновить» и «очистить кэш».
  - **A2HS:** на Android — `beforeinstallprompt`; на iOS его нет, поэтому своя подсказка «Поделиться → На экран «Домой»». Обоснование — Safari чистит кэш после ~7 дней без визита, у установленного приложения срок жизни заметно лучше, то есть установка это условие «работает в самолёте», а не украшение.
  - **Скиллы:** `frontend-architecture`.
  - **DoD:** ✅ статус читается из кэшей и меняется по ходу дела — замер **на живом проде**: первый заход «копии нет · 0.0 МБ» (пока идёт установка, ~16 с) → «готово к офлайну · 14.08.2026 · 4f5e032c · 22.0 МБ» → после удаления «копии нет» и ноль наших кэшей → после кнопки обновления снова «готово»; ✅ «удалить» освобождает место и гасит саму себя; ✅ во время забега обновление недоступно и объяснено; ✅ iOS-инструкция показывается на iPhone/iPad и не показывается на десктопе; ✅ юнит `test/offlineStatus.test.ts` (8 кейсов), 577 unit, typecheck, build, смоук-e2e 12/12, скан чист.
  - **⚠️ Не проверено мной:** установка живьём **на реальных Android и iOS** — headless-Chromium не присылает `beforeinstallprompt`, а iOS-инструкция проверена только рендером под iPhone-контекстом. Кнопку «Установить» и поведение установленного приложения (в т.ч. живучесть кэша через неделю) надо один раз проверить на устройствах.
  - **Deps:** T11.1.
- **T11.5 — Офлайн-регресс в тестах ✅ (2026-08-14).**
  - **Цель:** офлайн не отваливается молча при следующем деплое.
  - **Реализовано:** [`e2e/offline.spec.ts`](../web/e2e/offline.spec.ts) — три теста, закрывающие всю веху разом: офлайн-перезагрузка + полный забег без сети (T11.1), картинки только из своего зеркала и ни одной битой (T11.2), офлайн-состояние Arena с повтором (T11.3), панель настроек с версией копии, удалением и пересборкой (T11.4). Прогон — отдельный проект `offline` в [`playwright.config.ts`](../web/playwright.config.ts) со **своим сервером**: `npm run build && vite preview` на порту 4173 (5173 занят dev-сервером того же прогона, 5273 по правилу проекта оставлен под ручное превью агента). Сборка входит в команду сервера намеренно — спека обязана проверять текущий код, а не то, что осталось в `dist` от прошлого раза.
  - **Спека немедленно окупилась — нашла два дефекта, которые пережили ручную проверку:**
    1. **React error #310, экран настроек рушился.** В T11.4 я написал `useRun(...) !== "start" || useRun(...) !== null` — короткое замыкание пропускало второй хук, число хуков между рендерами менялось, и React сносил экран. Видно только при заходе в настройки **не со старт-экрана** (иначе первый операнд ложный и второй хук всё равно вызывается) — ручные проверки шли именно со старта. Хуки теперь вызываются отдельно.
    2. **Панель читала статус один раз при открытии.** Игрок, зашедший в настройки сразу после первого визита, видел «Копии нет» до самого ухода с экрана, пока копия качалась. Добавлен опрос раз в 2 с, останавливается на `ready`.
  - **Скиллы:** `frontend-architecture`.
  - **Файлы:** `web/e2e/offline.spec.ts`, юниты рядом с `connectivity.ts`.
  - **Сценарий:** загрузились онлайн → `context.setOffline(true)` → перезагрузка → старт и завершение классического забега; отдельно — вход в Arena в офлайне даёт офлайн-экран.
  - **Грабли, зафиксированные в самой спеке:** SW живёт только в прод-сборке, поэтому у проекта свой сервер и свой таймаут (150 с: сборка копии — это честные секунды, а не «медленный тест»); ждать состояние браузера — только через `expect.poll`, НЕ через `page.waitForFunction` с async-предикатом (тот не ждёт промис и проходит мгновенно — на этом уже потерян час в T11.2); прогон `--workers=1`.
  - **DoD:** ✅ спека зелёная на **обоих** датасетах — реальном и mock, которым CI подменяет данные (правило «гонять на обоих» из чек-листа); ✅ **краснеет, если убрать регистрацию SW** — проверено отключением `registerServiceWorker()`: первый же тест падает, после возврата снова зелено; ✅ полный e2e-набор зелёный.
  - **Deps:** T11.1, T11.3.

**Что НЕ делаем в M11:** офлайн-Arena с локальными ботами под видом онлайна (подмена сути режима); офлайн-очередь серверных записей (сейвы/лидерборд/дейлик — это M8, принцип «локальная игра работает всегда, записи синкаются при реконнекте» зафиксирован в ADR 0003); свой слой хранения данных в IndexedDB вместо Cache API.

## M12 — Ревизия кода и продукта 2026-09-02 (аудит трёх слоёв: game/state · UI · Go/infra)
Метод: три параллельных read-only аудита с доказательствами `file:line`, затем внедрение только подтверждённого. Базовая линия до/после: `tsc` чистый, 663→667 unit-тестов, Go оба модуля зелёные.

### T12.1 — Дейлик без сервера ✅ (2026-09-02, PRD §5.14)
`game/daily.ts` (сид дня по UTC + фиксированный конфиг), карточка под вариантами Classic, бейдж в карьере, статус «сегодня сыграно» по записи карьеры. Тесты `test/daily.test.ts` (детерминизм первого пака на общем сиде). Лидерборд — по-прежнему M8.

### T12.2 — Отложенная загрузка `eventHeroStats` ✅ (2026-09-02)
Файл 3.7 МБ читал только `PlayerInspector`; теперь `DEFERRED_DATA_FILES` + `useRun().loadEventHeroStats()` по первому открытию (в SW-ведро офлайна входит как раньше). Проверено сетью: на старте запроса нет, после открытия инспектора — есть. Следующий кандидат — `squadSynergy` (8.5 МБ, нужен только с первого пика): требует ожидания перед `start()`, отложено. ⬜

### T12.3 — Дедуп и мёртвый код (web) ✅ (2026-09-02)
Пересборка рынка Буткемпа в `runStore` — 4 копии → `syncMarketOffers`/`refreshMarketOffers`; общая обвязка relay-комнат Arena/Duel → `state/relayRoom.ts`; удалены агрегатор `BALANCE` (ни одного потребителя, тянул 10 импортов) и 9 мёртвых экспортов; 38 неиспользуемых i18n-ключей ×2 локали (первый заход снял 44 — шесть `tactic.*` оказались живыми через ключ с тернарным префиксом `${item ? "item" : "tactic"}.${id}`, CI это поймал: `translate` кидал исключение и ронял Буткемп; ключи возвращены, `translate` теперь отдаёт ключ вместо исключения, добавлен тест `test/i18nCardKeys.test.ts` на все id карт/боссов/мутаторов); 21 мёртвый CSS-класс; две русские строки в EN-локали (`packs.ts` sublabel, `formatBytes` «МБ») → i18n; `Button .danger/.leave` — на токены (`--danger-fill`, `--on-danger`, `--on-ember`, раньше кнопка была слепа к теме); эмодзи в кнопках Edition скрыты от скринридера.

### T12.4 — Go: баги и мёртвый код ✅ (2026-09-02)
- **WebSocket-hub:** `broadcast` закрывал outbox медленного клиента, а читатель той же сессии слал в него pong — send в закрытый канал = паника (select/default не защищает). Теперь hub сигналит `dropped`, канал закрывает только владелец; тест `TestRoomHubDropsSlowPeerWithoutClosingOutbox`.
- **Ключ raw-кэша** считался от URL с `api_key`: включение/ротация ключа делала весь кэш невидимым и сжигала бюджет. Хеш — от URL без auth-параметров, старые файлы мигрируют переименованием; тест.
- **`enrichTeamLogos`:** итерация по map (порядок случайный под бюджетом) → сортировка id, остановка по `ctx.Err()`/`ErrBudgetExhausted`.
- **Сервисный слой** терял причину `Internal`-ошибок (сбой БД был невидим в логах): `apperr.Error.Err` + `Wrap`, transport логирует причину 5xx.
- **nginx:** `add_header` в `location` отменяет наследование — ни один ответ не получал security-заголовки; вынесены в `security-headers.conf` и включены в каждый location.
- **data-refresh:** `builtAt` меняется каждым прогоном, guard «данные не изменились» был недостижим → сравнение без `manifest.json` (dataHash покрывает только файлы данных).
- Удалены: мёртвый пакет `internal/teamsuccess` (~470 строк, дубли `clamp100/round2/utcDate/finite`), `RoomView`, недостижимая ветка `Retry-After` в `backoffFor`.
- CI: кэш go-build для пайплайна (setup-go без go.sum ключ не строит), кэш Chromium Playwright; vendor-чанк React/Zustand со стабильным хешем (541+144 КБ вместо одного 689).

### T12.6 — Сиды anteRun.spec разъехались с реальным датасетом ✅ (обнаружено и закрыто 2026-09-02)
После data-refresh 2026-08-31/09-01 на РЕАЛЬНОМ датасете падают 10 из 18 сценариев `e2e/anteRun.spec.ts` (Буткемп/trade-in/cheat/resume — «camp-screen не появился»), на mock — зелёно; воспроизведено на коммите 483b943 с текущими данными, то есть к ревизии M12 не относится. CI видит только mock, поэтому дрейф незаметен. **Сделано:** `npm run sim:sweep` на real и mock → пересечение (CAMP 16 кандидатов, CHEAT 60+), живой прогон первой пары `camp-e2e-39` / `cheat-e2e-17` — real 17/17 (chromium), mock 34/34 (chromium+mobile). `camp-e2e-5` (предмет) и `camp-e2e-161` (Scouting) проверены на обоих датасетах: `find_camp_seed.ts` получил режим `--scouting`, `CAMP_SEED` (как и `CHEAT_SEED`) переопределяется env без правки спеки. Шаг CI добавлен тем же днём: джоб `web-e2e-real` гоняет `anteRun.spec` (chromium) по закоммиченному реальному датасету параллельно с `web`; в `needs` деплоя не входит — красный там значит «переподбери сиды», а не «не выкладывай данные».

### T12.7 — Второй проход по T12.5 ✅ (2026-09-02)
Взято из списка ниже, каждый пункт — отдельный коммит с tsc/unit/e2e: **OvrBadge** (9 копий → `ui/OvrBadge`), **единый штамп датасета** (`state/dataVersions`: runPersist/managerStore/relayRoom, тест на managerStore), **CampScreen** (guard в обёртке + `useMemo/useCallback`, MarketPanel кэширует превью на раздачу; anteRun e2e на mock 34/34), **разрезы**: `anteEconomy` → 4 модуля с реэкспортом, `ManagerScreen` → файл на компонент, `StartScreen` → `startOptions` + `ModeSelect`/`VariantSelect`/`ModePreview`, `manager/engine` → генерация мира в `manager/world.ts`.

### T12.8 — Отложенная загрузка `squadSynergy` ✅ (2026-09-02)
`DEFERRED_DATA_FILES = [squadSynergy, eventHeroStats]`, общий `DataSource.loadDeferred`. Стартовый экран открывается по ядру (~8 МБ вместо 20), файл едет фоном сразу после; барьер `useRun().ensureSquadSynergy()` стоит в `start`/`resumeRun` (фаза `loading` до готовности), `managerStore.startCareer/resumeCareer`, `connect` Arena/Duel. Потребители читают через `squadSynergyOf(data)` — падает понятной ошибкой, если движок создан до барьера. Проверено headless: порядок запросов и старт при искусственной задержке файла на 2.5с. SW-ведро офлайна включает файл как раньше.

### T12.5 — Кандидаты, не взятые в этот проход ⬜
- ~~Разрезы файлов~~ — сделано в T12.7.
- ~~`CampScreen` без мемоизации~~ — сделано в T12.7.
- ~~`OvrBadge`-примитив~~ — сделано в T12.7.
- ~~Три проверки совместимости сейва~~ — сделано в T12.7 (`state/dataVersions.ts` + тест managerStore).
- **Тестовые дыры:** `arenaStore`/`duelStore` (reconnect, таймеры, модульное состояние), `managerStore`, `data/api/arena.ts`, `server/internal/model`.
- **Сим-скрипты:** `sweep_seeds_both.ts` и `sim_run.ts` держат по 7 одинаковых хелперов и уже расходятся (stakes, useBoss) — общий `scripts/lib/sim_shared.ts`. Пока оба лишь подключены в `package.json` (`sim:sweep`, `sim:find-seed`).
- **Сервер:** нет капа длины relay-лога и числа комнат, `POST /api/rooms` без rate-limit; graceful shutdown не дренит ws-сессии; `log.Fatalf` в горутине слушателя обходит `defer db.Close()`.
- **Пайплайн:** `collectDetails` под `--match-detail-limit` берёт первые N матчей и оставляет `DetailsComplete=false` навсегда — семантика лимита («первые N» vs «N за прогон») не задокументирована; transient-ошибка источника маскируется под `ErrBudgetExhausted` (вечный «добор в след. прогоне» на одном битом матче).
- ~~Данные: `squadSynergy.json` 8.5 МБ~~ — сделано в T12.8 (отложен с барьером перед стартом; резать формат не понадобилось).

## M13 — Arcade: 2D survivors-роглайк по Dota (по [PRD §5.15](PRD.md), бриф [arcade-survivors-brief.md](arcade-survivors-brief.md), 2026-09-05)

> Идея владельца 2026-09-05: «ещё один 2D роглайк как Death Must Die, только с героями Dota и картой в её тематике».
> Исследование референса и оценка осуществимости — в брифе. Итог: **делаем срез 0 и принимаем go/no-go по плейтесту**;
> parity с Death Must Die не цель. Режим изолирован от драфт-ядра: `game/arcade/` + `features/arcade/` + `state/arcadeStore.ts`,
> своя `ARCADE_CONFIG_VERSION`. Перед любым кодом — `discovery-before-code` (что переиспользуем — бриф §0/§3) и
> `game-state-architecture` (mode shell ≠ конфиг забега ≠ сим). Рендер через DOM запрещён (PRD §5.15).

### T13.0 — Решения владельца до кода ✅ (2026-09-05: владелец сказал «действуй», решения приняты по рекомендациям брифа)
- **Цель:** снять вопросы брифа §5, которые меняют архитектуру среза 0.
- **Вопросы:** A go на срез 0 · B рендер (Canvas 2D без зависимостей — рекомендация / PixiJS сразу) · C арт-стиль среза 0 («жетоны» + VFX — рекомендация / ждать спрайты) · D название режима и продукта · E первый герой (Juggernaut — рекомендация) · F связывать ли режим с датасетом про-сцены («сигнатуры»).
- **Принято 2026-09-05:** A — go; B — Canvas 2D без зависимостей; C — «жетоны» (портрет-медальон + процедурные VFX); D — карточка режима «Аркада» (`arcade`), имя продукта позже; E — Juggernaut; F — сигнатуры про-игроков отложены. Владелец: «все герои по итогу» — см. T13.9 (шаблонные киты по архетипам) и T13.12 (косметика).

### T13.1 — Детерминированное ядро сима ✅ (2026-09-05, коммит a551f43/c5f7f0a)
- **Цель:** чистая real-time симуляция без DOM: фиксированный тик (30 Гц сим, рендер интерполирует), сущности массивами (SoA), spatial hash для коллизий, движение героя по вектору ввода, автоатака по ближайшей цели, снаряды, урон/HP/смерть, XP-шарды и уровень, спавнер по расписанию, Rng из `game/rng.ts`.
- **Файлы:** `web/src/game/arcade/{sim.ts,entities.ts,spatialHash.ts,spawner.ts,types.ts}`, `web/test/arcade/sim.test.ts`.
- **Скиллы:** `discovery-before-code`, `game-state-architecture`.
- **Правила детерминизма:** вход сима — только `seed` и input-лог `{tick, dx, dy, actions}`; внутри ни `Date.now`, ни rAF, ни `Math.sin/cos/exp/random` (таблицы или полиномы); snapshot сериализуем.
- **DoD:** два прогона одного сида и лога 10 000 тиков дают бит-в-бит одинаковые snapshot'ы; 500 врагов + 300 снарядов — тик ≤ 4 мс в Node на dev-машине; `tsc --noEmit` чист; `game/arcade` не импортирует `ui/`, `features/`, React.
- **Сделано:** `game/arcade/{sim,types,config}.ts` + `content/{enemies,schools}.ts`; сим 60 Гц (не 30: интерполяция не понадобилась), input-лог ключуется номером step() (тик стоит во время выбора карточки — на этом упал первый реплей-тест); `test/arcade.test.ts` — 7 тестов (детерминизм, реплей, пауза уровня, Рошан 7:00 глушит спавн, ≤3 школ, перф).

### T13.2 — Рендер Canvas 2D + HUD + ввод ✅ (2026-09-05)
- **Цель:** экран режима: `<canvas>` с камерой на герое и рендером из snapshot'а за интерфейсом `ArcadeRenderer` (Canvas2D сейчас, Pixi лениво потом); React-HUD (таймер, HP, XP-полоса, уровень, золото) и модалка уровня из `ui/`; ввод WASD/стрелки + мышь-прицел, геймпад, **виртуальный джойстик для тача** (TMA §5.11) — с первого среза; пауза по `visibilitychange` и Esc.
- **Файлы:** `web/src/features/arcade/{ArcadeScreen.tsx,ArcadeHud.tsx,renderer/canvas2d.ts,input.ts}`, строки в `i18n/core.ts` (RU+EN), цвета — токены.
- **Скиллы:** `frontend-architecture`, `game-feel-juice` (juice позже, но каркас эффектов сразу).
- **DoD:** 60 fps на десктопе при 500 сущностях (замер Performance panel, скрин в задаче); джойстик работает на `mobile`-пресете; ни одного hex-цвета в `features/arcade`.
- **Сделано:** `features/arcade/{renderer,input}.ts`, палитра `--arcade-*` в tokens.css (снимается getComputedStyle раз в секунду — canvas не наследует переменные); HUD/оверлеи React. Шишка: `setPointerCapture` джойстика съедал click по карточке уровня — исключены `button/a/input/.arcade-overlay`. ⬜ Осталось: замер fps на 500 сущностях и `mobile`-пресет живьём (headless-прогон 2026-09-05 прошёл на десктопном вьюпорте без ошибок).

### T13.3 — Контент среза 0: Juggernaut, лес Radiant, Рошан на 7:00 ✅ механика (2026-09-05) · ⬜ плейтест владельца
- **Цель:** первый играбельный забег на 7 минут: Juggernaut (автоатака, Blade Fury — спин с иммунитетом к магии, Healing Ward — сустейн, Omnislash — ульт по толпе на 6-м); враги — кобольды → тролли → сатиры → огры → кентавры по минутам, крип-волны каждые 30 с (осадная — каждая 5-я); **Рошан на 7:00** (спавны стоят, пока жив) с дропом **Aegis** — одно воскрешение; проигрыш = смерть без Aegis; победа среза = Рошан убит.
- **Файлы:** `web/src/game/arcade/content/{heroes.ts,enemies.ts,waves.ts,bosses.ts}`, арт — портреты из `web/public/art/heroes` как медальоны, VFX процедурные.
- **Скиллы:** `discovery-before-code` (иконки/редкости/звук — переиспользовать), `game-feel-juice`.
- **DoD:** забег проходится и проигрывается живьём на 5273 (Playwright-прогон с записанным input-логом воспроизводится бит-в-бит); первые 60 с читаются как «слаб и кайтишь», к 5:00 экран «взрывается» (субъективно, чек владельца).

### T13.4 — Уровни, таланты и школы (боги DMD) ✅ (2026-09-05; реролл/бан — T13.8)
- **Цель:** лестница Dota: очки в Q/W/E, R на 6/12/18, таланты на 10/15/20/25; **школы** — на уровне одна из выбранных (макс. 3 за забег) предлагает 3 апгрейда типа Attack/Strike/Cast/Power/Summon/Passive/Dash с редкостями `standard/refined/exotic/arcana`; срез 0 — три школы `Radiance` (горение), `Skadi` (заморозка), `Maelstrom` (цепная молния), статус-эффекты в симе; реролл/бан по золоту — позже (T13.8).
- **Файлы:** `web/src/game/arcade/{schools.ts,levelUp.ts,status.ts}`, `content/schools.ts`, модалка уровня в `features/arcade`.
- **Скиллы:** `discovery-before-code` (иконки `art/items`, `game/rarity.ts` — словарь), `frontend-architecture`.
- **DoD:** предложение уровня детерминировано по сиду; лимит слотов на тип соблюдается; 3 школы дают 3 различимых билда в headless-прогоне (T13.6).

> **Гейт go/no-go после T13.4:** плейтест владельца 5 минут. «Не весело» — режим замораживается с честной записью здесь; «весело» — срезы ниже.

### T13.5 — Mode shell, стор, карьера ✅ (шелл и стор — 2026-09-05; витрина в Штабе и Карьере — 2026-09-05)
- **Цель:** шестая карточка режима `arcade` (офлайн, без `needsNetwork`), `state/arcadeStore.ts` (старт с рангом/героем → бег → пауза → финиш), запись результата в карьеру `mode: "arcade"` (время, уровень, убийства, школы, ранг), экран итога через `features/result`-примитивы; exit с потерей забега — через confirm; reset не сбрасывает режим.
- **Файлы:** `web/src/state/{runStore.ts (RunMode),arcadeStore.ts,careerStore.ts}`, `features/start`, `features/career`.
- **Скиллы:** `game-state-architecture`, `frontend-architecture`.
- **DoD:** e2e: старт → смерть → итог → карьера показывает запись; resume не обещаем (сейва посреди забега нет), но перезагрузка страницы возвращает в шелл без падения.
- **Сделано:** `state/arcadeStore.ts` (сим вне React, `serial` для HUD, история `aegis-draft.arcade.history` local-first, лучший результат на экране настройки), карточка режима + янтарный акцент, `RunMode "arcade"`. **Решение (2026-09-05):** в общий `CareerEntry` аркаду НЕ пишем — тип заточен под драфт (placement, roster, score), а история режима уже своя (`aegis-draft.arcade.history`). Витрина: панель «Аркада» в Штабе (`arcadeTrophies`: забеги/победы/победы в полном акте/лучший ранг/лучшее время + разбивка по героям) и блок «последние забеги» в Карьере. e2e — `e2e/arcade.spec.ts`; юнит — `test/arcadeStore.test.ts`.

### T13.6 — Headless-сим и `ARCADE_CONFIG_VERSION` 🟨 (скрипт есть — 2026-09-05; калибровка — итеративно)
- **Цель:** бот-политика (кайт от центра масс врагов + сбор XP + жадный выбор апгрейда по школе) поверх ядра T13.1; `npm run sim:arcade` печатает кривые выживаемости по герою/школе/рангу и время смерти p25/p50/p75; коэффициенты — `ARCADE` в `game/balance.ts` с собственной версией (в записи карьеры).
- **Файлы:** `web/scripts/sim_arcade.ts`, `web/src/game/balance.ts`.
- **Скиллы:** `scoring-model` не нужен (другая модель) — правила калибровки из памяти Roguelite: дамп распределений + оффлайн-свип, симулятор — на финальную проверку.
- **DoD:** 1000 прогонов < 60 с; целевая полоса среза 0: бот доживает до Рошана в 60–80% на Herald и убивает его в 30–50%.
- **Замер a0.2.0 (2026-09-05, `npm run sim:arcade -- --runs 40`, две базы сидов):** до Рошана 70–75%, Рошан убит 42–55%, победа 35–52%, уровень p50 14, смерти размазаны по минутам 4–8 — в полосе. Путь: a0.1.0 давал 0% убийств Рошана — (1) мили-дальность 74 была меньше зоны контакта босса, теперь 88; (2) бот, а с ним и человек, мог бесконечно кайтить Рошана (68 px/s против 172) — добавлен рывок 150 px/s дальше 220 px; (3) окно наказания после удара (1.3 с стоит); (4) регенерация 1.6→4/с; (5) радиус сбора XP 64→112 (больше дальности удара) — это взорвало опыт до 30-го уровня, поэтому кривая XP получила квадратичный член (потолок ~20–22 к 9:00). Скрипт: `--verbose 1` — по забегу, `--trace N` — посекундный бой с Рошаном.

### T13.7 — Ранги сложности и риск-награда ✅ (2026-09-05, a0.3.0)
- **Цель:** лестница `Herald → Immortal × 5★` (40 ступеней), каждая ступень — именованный модификатор (HP/скорость/плотность/элита/новый статус у врагов), открывается победой на предыдущей; руны щедрости/стаки — 60 с двойного спавна и дропа за постоянный множитель силы врагов.
- **Файлы:** `game/arcade/content/ranks.ts`, `game/arcade/shrines.ts`, выбор ранга на старте.
- **DoD:** сим T13.6 показывает монотонный рост смертности по ступеням без «ступенек-обрывов» (> 15 п.п. между соседними — баг).
- **Сделано:** `content/ranks.ts` — 8 рангов × 5★ = 40 ступеней: множители HP +6%/ур., урон +5%, плотность +3.5%, скорость +0.8% и по одному именованному правилу на ранг (Guardian: големы парами; Crusader: волны ×1.5; Archon: стая троллей /45 с; Legend: осадный в каждой 3-й; Ancient: Рошан на 6:00; Divine: статусы −30%; Immortal: XP −20%). Открытие: победа на ступени N открывает N+1 (`maxUnlockedRank` по истории). Руна щедрости: с 0:50 каждые 100 с рядом появляется руна (живёт 40 с): взял — 60 с двойного спавна и опыта, враги навсегда +8% HP/урона за стек. Сид сима включает ступень (`arcade:<seed>:r<step>`).
- **Замер (бот, 30 прогонов):** победа 53% на ступени 0 → 23% на 5 → 0% на 12. Монотонно, но бот слаб (руны не берёт); крутизну 40-ступенчатой шкалы пересмотреть по плейтесту владельца (T13.3) — бот к Crusader 3★ уже не доходит до Рошана.

### T13.8 — Экономика: золото, Secret Shop, предметы ✅ (2026-09-05; нейтральные предметы — a0.7.0)
- **Продажа (2026-09-06, владелец: «нельзя поменять предмет в магазине»):** в лавке под предложениями — свои предметы с кнопкой «Продать · N» (половина цены с учётом редкости), слот освобождается; протокол ввода — `act = 10 + слот` (`SHOP_ACT.sellBase`), в лог реплея входит.
- **Цель:** золото за убийства и bounty-руны каждые 3 минуты; **Secret Shop** появляется на карте в окна 3:00/10:00/17:00 (реролл предложения школы и бан — за золото там же); предметы — редкость × тир × 1–2 аффикса, слоты экипировки; нейтральные предметы тирами по минутам (сжатая шкала Dota 7/17/27/37/60 → под 20-минутный акт).
- **Файлы:** `game/arcade/{economy.ts,items.ts}`, `content/items.ts` (иконки — `web/public/art/items`, словарь изданий `Charged/Tempered` — по решению).
- **Скиллы:** `discovery-before-code` (не клонировать `game/items.ts` — вынести общий словарь редкостей/изданий, если он понадобится обоим режимам).
- **DoD:** предметы переживают забег только как разблокировки в Штабе (без +статов, PRD §5.10).
- **Сделано:** `content/items.ts` — 12 предметов Dota (Magic Wand, Vladmir, Assault, Butterfly, Desolator, BoT, Heart, MoM, Midas, BKB, Battle Fury, Octarine) с эффектами в `PlayerStats` (регенерация, вампиризм, броня, скорость атаки/бега, крит, урон, HP, золото/опыт, иммунитет к стану, клив, КД); редкость масштабирует величину (×1/1.35/1.8/2.4) и цену (×1/1.6/2.5/4). Торговец появляется на 3:00 и 6:00 рядом с игроком (45 с), касание открывает лавку и ставит мир на паузу (как level-up): 3 предложения, реролл 40+25·n, 6 слотов. Bounty-руна каждые 3 минуты (+30 +6/мин золота). Действия магазина — поле `act` в `ArcadeInput` и input-логе (реплей воспроизводит покупки). Цены ×3 от первой прикидки: к 3:00 у игрока ~450 золота, дешёвые предметы обесценивали выбор.
- **Плотность (тот же коммит):** скриншот минуты 3 показал ~12 врагов на экране — не survivors; спавн 1.1+0.62/мин → 1.7+0.85/мин при HP-скейле 0.2→0.16/мин. Бот (30 прогонов ×2 базы): до Рошана 57–63%, убит 30–50%, победа 27–47%, уровень p50 15–16, убийств p50 ~1100.
- **Нейтральные предметы (a0.7.0):** `content/neutrals.ts` — 15 нейтралок в пяти тирах, токен тира появляется рядом на минутах 2/5/9/13/17 (живёт 60 с), касание ставит мир на паузу и даёт выбор из двух; один нейтральный слот, новая заменяет старую; эффекты — те же поля `PlayerStats`. Действия — те же коды `act`, что у лавки (реплей воспроизводит). ⬜ Издания `Charged/Tempered` — позже; общий словарь редкостей с `game/items.ts` пока не выносился (у Arcade свой `Rarity` из четырёх строк — слить при первом пересечении).

### T13.9 — Полный акт: Tormentor, второй Рошан, Древний ✅ (герои — a0.5.0; полный акт — a0.6.0; акт 2 Dire ночью — a0.8.0; акт 3 «река и яма Рошана» + Dire-крипы — a0.9.0, 2026-09-06)
- **Цель:** 20 минут: Tormentor как мини-босс (10:30), Рошан на 14:00 сильнее с дропом Cheese/Refresher Shard, на 20:00 хайграунд и Древний под мегакрипами (2 минуты на снос); акты 2–3 (лес Dire ночью с меньшим обзором; река и яма Рошана) — после первого акта; +героев: Crystal Maiden, Sniper, Axe, Zeus.
- **DoD:** каждый герой проходит акт 1 ботом на Herald в 20–40%, различие билдов видно в кривых T13.6.
- **Сделано (полный акт, a0.6.0):** акт стал опцией старта — «Разминка · до 9:00» (срез 0) и «Полный акт · 20 мин» (по умолчанию). Полный: Рошан на 7:00 и 14:00 (второй ×1.4 HP, ×1.25 урона), **Tormentor** на 10:30 (стоит на месте, как в Dota, отражает 25% урона с капом 30, не берёт статусы; награда — 60 с двойного опыта), на 20:00 — **Древний** (строение 9000 HP, стреляет с 560 px, каждые 15 с мегакрипы ×2 HP вокруг него; после 22:00 волны удваиваются и приходят осадные); победа — снести Древнего, ступень ранга открывает только победа в полном акте. Рошан звереет через 120 с после появления (раньше — по абсолютному 9:00). Скейл врагов после 9-й минуты пологий (`kneeMin`/`late*`): линейный до 20-й давал ×4 HP и 19 спавнов/с.
- **Баг, найденный на этом срезе:** пул врагов переиспользует объекты, а ссылка `roshan` оставалась на объекте, который после смерти босса становился кобольдом — «Рошан жив» глушил обычный спавн до конца забега. Затрагивал все замеры a0.2–a0.5 после 7:00 (фаза после Рошана была тише задуманного). Исправлено (ссылка снимается при смерти), короткий акт перемерен: Juggernaut 37.5%, Crystal Maiden 40%, Sniper 30%, Axe 30%, Zeus 21% побед бота.
- **Замер полного акта (бот, Herald):** Juggernaut 21% (24 прогона), Zeus 12.5% (16); смерти — первый Рошан (6–8 мин) и Древний. Для бота полный акт вдвое тяжелее разминки — ожидаемо; полоса для человека решается плейтестом владельца.
- **Акт 2 (a0.8.0, 2026-09-06):** опция `dire` — расписание акта 1, но ночь (рендер: радиальный туман за 440 px от героя, тёмная земля `--arcade-ground-night`/`--arcade-fog`; сим обзор не режет — враги идут как обычно) и лес Dire (+15% HP, +6% скорости). Открывается победой в полном акте 1; победы в нём поднимают ранг наравне с актом 1. Бот: 6% побед (акт 1 — 21%) — ожидаемо тяжелее, крутизна по плейтесту. Новых видов врагов у акта 2 пока нет — те же лагеря; отдельные Dire-крипы и акт 3 (река, яма Рошана) — дальше.
- **Акт 3 и Dire-крипы (a0.9.0, 2026-09-06):** `river` — река поперёк карты (bounty и руны щедрости появляются только в русле), яма Рошана в центре: босс появляется в яме и привязан к ней поводком 420 px — снаружи он идёт домой и регенерирует 0.4%/с, а обычный спавн не глушится (бой с Рошаном становится выбором момента, как в Dota); враги +30% HP / +8% скорости (множитель акта не трогает боссов и Древнего). Открывается победой в акте 2. Новые виды для актов 2–3: `dark_troll` (стрелок с 1:30) и `hellbear` (брут с 4:00) — пул спавна фильтруется по акту (`spawnPool(min, act)`). Бот в акте 3 убивает Рошана в 4% — не умеет «выбирать момент» (уходит при <30% HP, возвращается под спавн); крутизна актов 2–3 — по плейтесту владельца, не по боту. Headless-QA: яма/река/поводок/Рошан в яме отрисованы.
- ⬜ Живая проверка отрисовки Tormentor/Древнего — только через dev-хук с перемоткой таймера (headless-прогон 2026-09-05), акты 2–3 (лес Dire ночью, река) и обзор ночью — не начинались.
- **Сделано (герои, a0.5.0):** `content/heroes.ts` — кит героя стал контентом: способность = типовой вид (`AbilityKind`, 20 видов) с параметрами по уровню, механика видов — в `sim.ts` (`castAbility`/`wantsCast`/`tickActiveAbilities` + пассивки в `recomputeStats`, хуки `onAttackHit`/`damagePlayer`/`staticField`). Пять героев: Juggernaut, Crystal Maiden (Nova/Frostbite/Arcane Aura/Freezing Field), Sniper (Shrapnel/Headshot/Take Aim/Assassinate — дальний бой снарядами автоатаки), Axe (Berserker's Call/Battle Hunger/Counter Helix/Culling Blade), Zeus (Arc Lightning/Bolt/Static Field/Thundergod). Таланты стали общей лестницей (10 урон/скорость, 15 крит/HP, 20 броня/КД, 25 регенерация/ульт). Выбор героя на экране настройки, герой в истории и итоге, `sim:arcade --hero`. Бот держит дистанцию для дальнобойных (70% дальности). Замер после трёх итераций (24 прогона): Juggernaut 46%, Crystal Maiden 42%, Sniper 50%, Zeus 50%, Axe 33–50% побед на Herald — все в полосе 30–50%; Axe до правок брал 90% (Culling Blade с полным сбросом перезарядки + Counter Helix), теперь после добивания перезарядка 1.5 с.
- **Шаблонные киты (a0.9.0, 2026-09-06):** `ARCHETYPES` в `content/heroes.ts` — пять архетипов из уже реализованных видов способностей (blademaster: вихрь/жажда/крит/серия; frostfire: нова/разряд/аура/поле; marksman: осколки/хедшот/прицел/залп; warlord: клич/тотем/ответный удар/серия; stormcaller: дуга/обморожение/статика/гнев) и 10 героев-шаблонов поверх них (Phantom Assassin, Anti-Mage, Lina, Lich, Drow Ranger, Windranger, Bristleback, Sven, Storm Spirit, Leshrac) — портрет + параметры базы, кода сима не потребовалось. Тексты способностей — по ключу кита (`HeroDef.kit`), у шаблонов — архетип. Ростер 15 героев (2026-09-06 позже — 24: +Faceless Void, Ursa, Lion, Shadow Fiend, Pugna, Invoker, Tidehunter, Mirana, Clinkz). Бот в разминке после двух правок: blademaster 37–50%, frostfire 29–44%, warlord 37–50%, marksman 50–62%, stormcaller 50–58% — дальнобойные шаблоны у верхней границы полосы, дожать по плейтесту. Следующие герои добавляются одной строкой `templateHero(...)`.
- **Все герои (вопрос владельца 2026-09-05):** уникальные киты руками — только для узнаваемых (срез 2: +4). Дальше — **шаблонные киты по архетипам** (мили-керри, стрелок, кастер-AoE, танк, призыватель, ассасин) с параметрами на героя (урон/дальность/скорость/HP из атрибута) и ручными ультами для популярных; портреты на все 127 уже есть. Так «все герои» достижимы без 127 уникальных механик.

### T13.13 — Арт: анимированные персонажи и карта вместо кружочков (фидбэк владельца 2026-09-06) 🟨
- **Запрос владельца:** «полноценные 2D-герои, карта, анимации ударов и ходьбы, как в Death Must Die», а не кружки; плюс полноценный инвентарь предметов, падающих по ходу игры (T13.14).
- **Срез 1 (2026-09-06, сделано):** процедурные **риги** (`features/arcade/rig.ts`): тело, голова (портрет у героя; рога/уши у врагов), руки, ноги, оружие по киту/виду (меч, топор, лук, посох, дубина, когти, кинжал), циклы ходьбы и замаха, вспышка урона, оседание при смерти, направление взгляда; у врагов силуэт различается размером/толщиной/оружием (кобольд с кинжалом, кентавр на четырёх ногах, огр с дубиной, Рошан с рогами). **Ландшафт** (`features/arcade/terrain.ts`): процедурные чанки 512² в кэше — два оттенка травы, тропы, поляны земли, рощи, камни, пучки, цветы; ночные тона для акта 2; сид-детерминирован. Замер headless: ~120 fps при 45 врагах. Хитбоксы сима не менялись.
- **Срез 2 (2026-09-06, решение владельца — вариант 1, LPC/Kenney):** скачаны LPC Medieval Fantasy Character Sprites (wulax) + LPC Base Assets (тайлы, монстры) и Kenney Roguelike/RPG (CC0, пока не используется); в репозиторий положен нужный поднабор (`public/art/sprites/lpc`, ~1 МБ, `ATTRIBUTION.md` + оригинальные CREDITS/README, строка атрибуции на экране режима — CC-BY-SA обязывает). `features/arcade/sprites.ts`: слоёные композиты LPC (тело + одежда + оружие по README-порядку, оттенок «расы»/героя через source-atop), анимации walk/slash/thrust/bow/hurt по направлениям, монстры 3×4; враги сопоставлены (кобольды — скелеты, тролли/огры/големы/медведи — люди в броне с оттенком и масштабом, сатир — маг в робе, вайлдвинг — летучая мышь, осадный — тыква, лучник-тролль — скелет с луком), кентавр/Рошан/Tormentor/Древний — по-прежнему риги/фигуры; герой — набор брони по киту + оттенок по герою (`HERO_TINT`), смерть — кадры hurt. Ландшафт перешёл на тайлы LPC (трава с вариантами, автотайл троп, вода реки, кроны/ели, камни) с процедурным фолбэком до загрузки. Портрет героя в HUD. Headless: ~120 fps при 44 врагах.
- **Путь А выбран владельцем (2026-09-06): спрайты из моделей Dota 2.** Написаны инструкция [docs/arcade-dota-sprites.md](arcade-dota-sprites.md) (Source 2 Viewer CLI → glTF с анимациями и материалами → Blender) и скрипт `web/scripts/blender/render_dota_sprites.py` (лист PNG + JSON-мета: кадр, направления, строки анимаций, якорь, желаемый размер), загрузчик `dotaSheet()` в `features/arcade/sprites.ts` с приоритетом над LPC и ригами (герой, враги, смерть), текстуры земли Dota паттерном поверх тайлов (`dota/terrain/*.png`). Проверено headless на синтетическом листе (LPC-скелет как «модель»): загрузка, направления, кадры — работает; Blender на этой машине нет, сам скрипт запускается владельцем по инструкции. Ожидается спайк: Juggernaut, кобольд, Рошан, трава Radiant.
- **Спайк пути А выполнен (2026-09-06):** на этом Mac установлены Dota 2 (Steam), Source 2 Viewer CLI 20.0 и Blender 5.2; конвейер `dota_pipeline.sh` выгрузил и отрендерил **Juggernaut** (тело + отдельные модели штанов, маски, меча, наручей и плаща, пришитые к скелету параметром `--parts`), **кобольда** и **Рошана** — листы 3.9 / 1.2 / 4.7 МБ в `public/art/sprites/dota/`, в игре подхватываются автоматически. Шишки: модели Source 2 из VRF стоят верно и смотрят в камеру (мои первые «лежащие» рендеры — крутая камера 58° и поза бега; эвристики по габаритам меша и костей врут, калибровка теперь по силуэту пробных рендеров); root motion бега гасится по корневой кости; у частей героя в части кадров есть смещение (наручи) — следующий проход. Земля Dota: текстуры террейна лежат не в `materials/terrain/`, а в `maps/<набор>_assets/blends/` (наборы jungle/summer/cavern/reef/journey/ti10); взяты `jungle_assets/blends/plants_01_color` (трава) и `radiant_jungle_dirt_01_color` (тропы), уменьшены до 512 px — `public/art/sprites/dota/terrain/`. Летняя трава — белая маска под шейдерный цвет, не годится. Атрибуция Valve добавлена в строку под сценой. Дальше: деревья/камни из `models/props_tree/*` тем же конвейером (пока LPC), остальные крипы и герои — по манифесту, смещение частей героя в части кадров.
- **Фикс частей героя (2026-09-06, фидбэк владельца «бьёт рукой, а не мечом; два персонажа — статичный Джаггер и человечек внутри»):** причина — части (штаны/маска/меч/наручи/плащ) экспортировались без `--gltf_export_animations`, и Source 2 Viewer не писал для них скин (скелет + веса): части стояли в bind-позе, тело бежало отдельно. Второй слой — пересадка меша части на скелет тела: у тела кости без весов (`sword_1`) экспортируются с вырожденной позой покоя, меч уезжал от руки. Теперь часть оставляет свой скелет, каждая кость копирует мировую трансформацию одноимённой кости тела (Copy Transforms, имена без учёта регистра); служебная «Icosphere» VRF выкидывается; клип удара берётся частью (`attack@0.12-0.7` — замах/возврат вырезаны, удар совпадает с моментом урона); листы квантуются pngquant (6 → 1.1 МБ). Проверено headless: ходьба в 4 стороны — одна фигура, меч в руке; удар мечом. Осталось: кобольды-«десятники» и прочие враги пока LPC — батч по манифесту.
- **Батч по манифесту (2026-09-06):** `web/scripts/blender/dota_manifest.tsv` — все 15 врагов, у которых есть модель (kobold_foreman, hill_troll с топором, satyr, ogre, centaur, wildwing=gargoyle, dark_troll, hellbear, lane_creep, siege_creep, golem + прежние), Древний (`good_ancient001`), деревья (`tree_oak_01`, `armandpine_01`) и камень (`rock_ground001`); Tormentor'а в vpk нет — остаётся ромб. Рендерер: Древний/Tormentor берут лист, если он есть; декор карты рисует деревья/камни Dota вместо LPC-крон (листва и камень в экспорте белёсые — подкрашиваются `tint` в `drawDotaFrame`); тропы и вода — размытой маской вместо квадратов тайлов. Итого листов 20, ~7 МБ (pngquant). Дальше: остальные 23 героя (нужны списки частей по каждому), Roshan темноват, TMA/Android.
- **Иконки способностей (2026-09-06):** `scripts/dota_ability_icons.sh` → 96 иконок из `panorama/images/spellicons` (64 px, 432 КБ) в карточках прокачки, ките героя на экране настройки и под кнопками Q/W/E/R в HUD.
- **Все герои (2026-09-06):** 23 оставшихся героя отрендерены по манифесту с частями (штаны/оружие/плащи/маунт Мираны; списки частей — в `dota_manifest.tsv`); контактный лист проверен глазами: все узнаваемы. Выбор клипов ужесточён (не берём `@`-слои, arcana/alt/ward/pact/cc_20xx, синонимы die/death) — PA, AM, CM, Zeus, Clinkz, Axe перерендерены. Juggernaut получил клип `attack_spin` для Blade Fury (владелец: «крутится слишком быстро» — цикл был 90 мс, теперь клип в темпе листа, фолбэк 420 мс). Листы всего ~34 МБ (24 героя по ~1.1 МБ, грузятся лениво по герою). Открыто: Roshan темноват; у части героев кости частей без пары в теле (цепи Tidehunter, крылья SF, сигил Zeus — идут за родителем, видимых артефактов нет); PA/Roshan тёмные по материалу.
- **Дальше:** спрайт-пайплайн — загрузчик спрайт-листов (Aseprite JSON / сетка кадров) с теми же состояниями idle/walk/attack/hit/die, что у ригов; тайлсет для карты вместо процедурной травы. Источники: (а) CC0/CC-BY-SA пакеты (Kenney, LPC) как плейсхолдеры — требуют скачивания сторонних файлов (нужно явное разрешение) и атрибуции; (б) заказ художнику / генерация по спеке (размер кадра 64×64, 8 кадров ходьбы, 6 удара, 4 получения урона, 6 смерти, 4 направления или 2 + флип); (в) остаёмся на векторных ригах и доводим их (тени, экипировка по предметам). Спека для художника — по решению.

### T13.15 — Фирменные пассивки героев (владелец 2026-09-06: «больше особенностей под конкретного героя, пример — души Shadow Fiend») ✅ срез 1 (2026-09-06, a0.11.0) · ✅ волна 14: пассивка у всех 119 (2026-09-06, a0.19.0) · ✅ HUD-иконка (2026-09-06)
- **Волна 14 (2026-09-06, a0.19.0): пассивка у каждого героя.** Было 39 из 119, стало 114 — остальные пять (Juggernaut, Crystal Maiden, Sniper, Axe, Zeus) не нуждаются: их фирменные пассивки (Blade Dance, Arcane Aura, Take Aim/Headshot, Counter Helix, Static Field) заведены отдельными способностями в ките. Вид пассивки выбран по настоящей пассивке героя в Dota, а не «что подошло».
- **Пять новых видов**, потому что имеющимися эти пассивки было нечем выразить: `crit` — Blade Dance (шанс на усиленный удар: Chaos Knight, Naga, Tusk, Kez), `tough` — Kraken Shell (плоское снижение урона поверх брони, минимум 1 всегда проходит: Tidehunter, Timbersaw, Treant, Omniknight, Mars, Visage), `aura_burn` — Heartstopper Aura (урон вокруг героя без ударов: Necrophos, Venomancer, Phoenix, Leshrac, Death Prophet), `growth` — Flesh Heap (убийства навсегда прибавляют запас здоровья, элита впятеро: Pudge, Undying). Шестой вид `static` (Static Field) написал и выбросил: у Зевса это уже способность, а больше он никому не подходил — незачем держать мёртвый код.
- **Попутный баг:** счётчик критов увеличивался сразу после броска шанса из статов, поэтому усиленные удары от пассивок (Blade Dance, Меткость, Time Lock) в него не попадали — считается теперь перед нанесением урона.
- **Калибровка (20 прогонов, разминка, Herald; полоса 30–50%).** В полосе после правок: Tidehunter 40% (tough 7→4), Necrophos 35% (aura_burn 10/150 → 5/130), Mars 45%, Visage 40%, Omniknight 40%, Phoenix 40%, Venomancer 30%, Leshrac 45%, Doom 50%, Pudge 45%, Lycan 40%, Medusa 40%, Tusk 30%. Второй заход по копящим и защитным видам: Weaver 35%, Naga Siren 30%, Terrorblade 60→50% (вампиризм 0.1→0.07), Primal Beast 90→55% (иглы 16→7), Kez 55–60% (крит 0.18→0.14 — на 20 прогонах разница в шуме). Чуть выше полосы и оставлены: Treant и Timbersaw по 55%, Primal Beast и Kez 55–60% — у них сильны сами киты, а пассивка уже срезана до 4 и 3 (дальше снижать значит убрать её вовсе). Chaos Knight 20–25% — шум на 20 прогонах.
- **Два выброса ниже полосы вылечены китом, а не пассивкой.** Undying 20→45%: Decay и Tombstone били слабо для героя без мобильности. Invoker 5→45%: его Cold Snap бьёт одну цель, а это пустой каст в толпе — Q заменён на EMP (импульс по площади), метеор шире и чаще, Sun Strike чаще. Промежуточный вариант EMP на 230 радиуса дал 75% — урезан до 180.
- **Модель:** `HeroDef.signature = { kind, value, cap?, radius?, duration? }` (`content/heroes.ts`) поверх кита архетипа; состояние — `player.stacks / stackTarget / sigUntil / sigArmed`; хуки в симе — удар (`onAttackHit`), убийство (`killEnemy`), урон по герою (`damagePlayer`), каст, кулдаун атаки. Детерминизм не нарушен (тест digest), `ARCADE_CONFIG_VERSION` a0.11.0.
- **Срез 1 (10 героев):** Shadow Fiend — Некромастерия (душа за убийство, элита 6, +1.2 урона за душу, потолок 36, счётчик в HUD); Ursa — Fury Swipes (+4 за стак по одной цели, до 12, сброс при смене цели); Sven — Great Cleave (50% урона по соседям цели, r 85); Faceless Void — Time Lock (18%: стан 0.5 с, +20); Clinkz — Death Pact (убийство лечит 6, элита 30); Lina — Fiery Soul (6 с после каста атака на 30% быстрее); Storm Spirit — Overload (следующий удар после каста +45 по площади r 80); Drow — Marksmanship (+35% с дистанции ≥220); Bristleback — Quill Spray (залп 30 по r 130 при получении урона, раз в 0.5 с); PA — Blur (уклонение 22%). Строка «✦» в карточке героя на экране настройки, тексты RU/EN `arcade.sig.*`. Тесты `test/arcadeSignature.test.ts`.
- **Срез 2 (2026-09-06, a0.12.0) — собственные киты у всех 24 героев (владелец: «у Ursa Blade Fury Джаггера, SF стреляет жёлтым шариком и молниями — каждый герой должен быть уникален»):** архетипы blademaster/frostfire/marksman/warlord/stormcaller удалены, у каждого шаблонного героя четыре умения «как в Dota» (`content/heroes.ts` TEMPLATE_HEROES): SF — Shadowraze ×3 / Necromastery / Presence of the Dark Lord / Requiem of Souls (души уходят наполовину); Ursa — Earthshock / Overpower / Fury Swipes / Enrage; PA — Stifling Dagger / Phantom Strike / Blur / Coup de Grace; AM — Mana Break / Blink / Counterspell / Mana Void; Lina — Dragon Slave / Light Strike Array / Fiery Soul / Laguna Blade; Lich — Frost Blast / Frost Shield / Sinister Gaze / Chain Frost; Drow — Frost Arrows / Gust / Multishot / Marksmanship; WR — Shackleshot / Powershot / Windrun / Focus Fire; BB — Goo / Quill Spray / Bristleback / Warpath; Sven — Storm Hammer / Great Cleave / Warcry / God's Strength; Storm — Static Remnant / Electric Vortex / Overload / Ball Lightning; Leshrac — Split Earth / Diabolic Edict / Lightning Storm / Pulse Nova; Void — Time Walk / Time Dilation / Time Lock / Chronosphere; Lion — Earth Spike / Hex / Mana Drain / Finger of Death; Pugna — Nether Blast / Decrepify / Nether Ward / Life Drain; Invoker — Cold Snap / Sun Strike / Chaos Meteor / Deafening Blast; Tide — Gush / Kraken Shell / Anchor Smash / Ravage; Mirana — Starstorm / Sacred Arrow / Leap / Moonlight Shadow; Clinkz — Strafe / Searing Arrows / Skeleton Walk / Death Pact. Новые виды в симе: dash (рывок к сильнейшему / прочь при <40% HP), line_burst/meteor (зоны по взгляду, стан/горение), armor_buff, rage, frenzy, haste (+уклонение), damage_ward, life_drain, gust, multishot, remnant, edict, mass_freeze, requiem, goo, ravage, death_pact; пассивные presence, armor_passive, frost_arrows, searing, mana_break, coup и `signature` (слот усиливает фирменную пассивку ×1…×2.05). Снаряд автоатаки — в цвете героя. Проверено headless по всем 19 героям (касты/ульты идут, ошибок нет); калибровка ботом (разминка, Herald, 16–24 прогона): первый свип 12–75% → линейные умения (Shadowraze, Dragon Slave, Earth Spike, Powershot…) теперь целятся в ближайшего врага, а не по направлению движения (бот и игрок кайтят спиной к толпе — Lina 19%, Lion 13% → 37/31%); Void получил урон Time Dilation ×1.6 и удвоенную скорость атаки в Chronosphere (19 → 38%); срезаны Bristleback (иглы 30/0.5 с → 18/0.8 с, база 760/6/5 → 680/5/3: 75–87 → 25%), Storm (Remnant, Ball Lightning, база: 69 → 46%), Ursa (69 → 38%), Leshrac и Mirana (63 → 50%). Уникальные Sniper/Zeus 75% — как и раньше, стрелки сильнее в разминке; полный акт и ранги — отдельным проходом.
- **Аудит «маны нет» (2026-09-06, вопрос владельца про ульт Anti-Mage):** все 96 умений имеют реализацию каста и правило автокаста (скриптовая проверка по `AbilityKind`); ресурса маны в рогалике нет, поэтому три умения с «маной» в названии переосмыслены: Mana Break — выжигание сил (+урон, замедление), Mana Drain Лиона — тянет жизнь и лечит, **Mana Void** — теперь отдельный вид `mana_void`: урон 260–580 × (1 + 1.2 × доля потерянного HP цели) по сильнейшей цели, половина — соседям в 120 px (раньше был обычный `assassinate`). Тексты RU/EN объясняют адаптацию.
- **План (было до среза 2, остальные пассивки):** Anti-Mage — Mana Break (удар сжигает «ману» врага: +урон по кастерам/элите и −скорость 1 с); Lich — Frost Shield (при <30% HP щит-аура с замедлением, кд 20 с); Windranger — Focus Fire (после каста 4 с атаки по ближайшей цели вдвое чаще); Leshrac — Pulse Nova (пока стоит на месте >1 с, пульсы урона вокруг); Lion — Finger stacks (убийство элиты навсегда +урон R); Pugna — Nether Ward (при касте ставит вард, бьющий врагов рядом); Invoker — Exort/Quas (чередование каста: следующий удар огонь/лёд); Tidehunter — Kraken Shell (каждые N урона сбрасывает замедление/стан и даёт броню); Mirana — Leap (рывок при получении урона, кд 12 с). Уникальные киты (Jugg, Axe, CM, Sniper, Zeus) уже фирменные. Балансный прогон `npm run sim:arcade` по героям — после второй волны.
- **Deps:** T13.9 (герои), T13.13 (арт: видимость эффекта — иконка/стаки в HUD).

### T13.16 — Звуки ударов героев из файлов Dota 2 (владелец 2026-09-06: «звуки прям мягкие») ✅ (2026-09-06)
- **Срез 2 (2026-09-06, владелец: «звуки не из доты + реплики при ходьбе, как в Dota»):** удар = свист удара героя **+ слой попадания** из `sounds/weapons/hero/shared/impacts` (клинок/тяжёлое) и `physics/deaths/common` (тупое) — таблица IMPACT в `heroSfx.ts`, у стрелков — их собственный impact; громкость поднята (0.4 → 0.55). **Реплики**: `scripts/dota_voice.sh` выгружает `sounds/vo/<hero>/` (в vpk это MP3 — кладём как есть), базовый набор без аркан/персон: spawn ×2, move ×6, attack ×3, kill ×4, level ×2, death ×2, pain ×2, ability ×4 → `public/art/sfx/dota/voice/<hero>/` (~12 МБ на 24 героя, грузится лениво по герою). Триггеры в `ArcadeScreen` (UI-рандом, в сим не входит): спавн при старте; ходьба — после 1.5 с движения раз в 25–45 с; убийство элиты 70% / обычное 8%; ульт 80%, каст 10%; боль 6%; уровень 45%; смерть/победа — всегда; один голосовой канал, реплики не накладываются. Проверено headless: файлы тянутся, ошибок нет.
- `web/scripts/dota_sounds.sh`: Source 2 Viewer CLI декодирует `sounds/weapons/hero/<hero>/*.vsnd_c` в wav, `afconvert` жмёт в AAC mono 40 kbps → `public/art/sfx/dota/<hero>/{attack,pre,impact}_N.m4a` + `index.json` (~650 КБ на 24 героя; у Drow только impact, у Bristleback/Invoker/Mirana в папке нет ударов — синтетика). `ui/sound.ts` получил сэмплы с кэшем декодированных буферов (первый вызов только грузит) и петли; `features/arcade/heroSfx.ts` — удар героя (вариация тона, не чаще 45 мс), петля Blade Fury (`bladefury_start_loop` + `stop`), предзагрузка при выборе героя. Синтетика остаётся фолбэком и слоем крита. Атрибуция Valve в строке под сценой расширена на звуки. Дальше: звуки смерти крипов и Рошана, реплики героев на убийство/уровень (`sounds/vo/<hero>/`), общая громкость сэмплов в настройках.

### T13.20 — Предметы: качество даёт больше эффектов; нейтралки с иконками и зачарованиями; предзагрузка; Esc (владелец 2026-09-06) ✅ срез 1 (a0.15.0)
- **Качество предметов лавки:** множитель редкости и раньше масштабировал числа, но карточка показывала базовый текст — казалось, что качество ничего не даёт. Теперь карточка и подсказки показывают **список эффектов с учётом редкости**, а Exotic/Arcana **открывают дополнительные эффекты** (`ArcadeItemDef.extras`: exotic — первый, arcana — оба; например Butterfly exotic +15% скорости атаки, arcana ещё +6% бега). Дубли складываются (бейдж ×N).
- **Нейтралки:** иконка на карточке и в HUD-слоте; **зачарования** как в Dota 7.39 — у каждого предложения случайный префикс (Кровавый/Быстрый/Острый/Стойкий/Живучий/Тайный/Жадный/Мудрый/Яростный/Разящий) со своим бонусом ×тир; хранится в `player.neutralEnchant`, входит в реплей через RNG сима. Дальше: перезачарование за золото у торговца.
- **Предзагрузка:** перед стартом экран ждёт листы героя/врагов/земли/пропсов («Загрузка карты…», таймаут 6 с), сим и музыка стартуют после; предзагрузка начинается уже при выборе героя — мелькание ригов и голой земли ушло.
- **Esc/Space** во время выбора прокачки, лавки, нейтралки и лута игнорируются (игра и так стоит), пауза больше не ложится под карточки.
- **T13.21 срез 1 (2026-09-06, a0.16.0) — четвёртая школа «Зверинец» с питомцами:** `content/pets.ts` + `Pet` в симе (`sim.pets`, `tickPets`, `syncPets` по рангам): **Ястреб** Beastmaster (собирает шарды в радиусе 110 +30/ранг), **Волк** Lycan (14 урона/ранг, замедление), **Медведь-дух** Lone Druid (30/ранг, 20% стан), **Стая** (+волк/ранг, требует волка), **Первобытный рёв** (+35% урона питомцев/ранг, требует зверя). Питомцы неуязвимы, следуют за героем, обходят препятствия, телепорт при отрыве >520; спрайты `dota_px/{hawk,wolf,bear}` (модели `beastmaster_bird`, `lycan_wolf`, `spirit_bear`), иконка школы — Helm of the Dominator. Референс из данных DMD (каталог Addressables): благословения богов (Radiance, ChainLightning, FrostNova, Meteor, Tornado, WaterShield…) + отдельные **таланты персонажа** (Twincast, Discharge, MagicMissile, PrimalHeart, Stomp, Shadowshift…) — второй слой прокачки, который у нас пока закрывают фирменные пассивки и таланты 10/15/20/25.
- **Препятствия и бот (2026-09-06):** после ввода препятствий бот калибровки падал до 6–12% (шёл по прямой в деревья); добавлено подруливание `ObstacleGrid.steer` (касательная в сторону, противоположную центру; знак стороны был перепутан — первая версия давала 0%): сим применяет его при упоре (герой и обычные враги), бот — непрерывно (ahead 80). Радиусы коллизии уменьшены (ствол 6+0.26·s, камень 4+0.95·s). Разминка, Herald, 16 прогонов: Juggernaut 31%, Lina 25%, SF 38% (без препятствий 69/50 — деревья остаются ощутимым фактором, как и задумано).
- **T13.21 срез 2 (2026-09-06, a0.17.0) — реролл, изгнание, гибриды:** на экране прокачки «Другие карты» за золото (30 + 20·n) и «Изгнать» у школьного апгрейда (3 за забег: карта уходит из пула до конца забега и заменяется новой; способности и легендарки не изгоняются) — как reroll/banish в DMD; протокол: `choose = -2` реролл, `act = 30 + i` изгнание. **Гибриды двух школ** (`requiresSchools`, открываются при обеих школах в билде): Пар (Radiance+Skadi: горящий и охлаждённый +25%/ранг), Сверхпроводник (Skadi+Maelstrom: молния по вмороженному +35%/ранг, цепь +2 цели), Плазма (Radiance+Maelstrom: разряды поджигают), Дикая охота (Зверинец+Skadi: питомцы +30%/ранг по замедленным/оглушённым). Тесты `test/arcadeLevelupActions.test.ts`.
- **Фикс (2026-09-06, владелец: «волки/медведь бегут за жертвой 2–3 с впритык и только потом бьют»):** перезарядка питомца была таймером погони — после удара он гнался за новой целью и стоял рядом до конца `every`. Теперь вход в радиус удара укорачивает перезарядку: готовый бьёт сразу, с недоигранной — не позже 0.2 с (`PET_REARM`), нижняя граница между ударами — `every/2`, чтобы прыжки по толпе не удваивали DPS (`tickPets`, `Pet.inReach`; a0.18.0). Замер сим-пробой: волк — медиана 39 → 14 тиков от подхода до укуса, медведь 1 → 11 ударов за 12 с в толпе. Тесты в `test/arcadePets.test.ts`.
- **План T13.21 (дальше, референс Death Must Die):** (1) **четвёртая школа-«зверинец»** с питомцами: Ястреб Beastmaster (сбор шардов в радиусе, +обзор), Кабан (мили-питомец с ядом-замедлением, `beastmaster_boar` в vpk нет — взять `n_creep_boar`/Spirit Bear), Медведь-дух Lone Druid (танк, притягивает врагов), Стая (+1 кабан), Первобытный рёв (питомцы +урон/скорость); питомцы — сущности сима со своим ИИ (следовать/атаковать ближайшего), спрайты через тот же конвейер; (2) **школа-«святилище»** (аура/поле): Тотем лечения общий, Кольцо молний вокруг героя, Осколки льда по таймеру; (3) в каждой школе +2 «гибридных» апгрейда, требующих две школы (как божественные благословения DMD: огонь+лёд = «Пар» — взрыв при заморозке горящего); (4) веса офферов: первые 3 уровня — три разные школы, дальше 60% своих, редкость растёт с минутами (уже), «перекат» оффера за золото 1 раз за уровень. Сначала посмотреть данные DMD (установлена) — состав благословений и веса.

### T13.23 — Все герои Dota + косметика (владелец 2026-09-06: «по итогу нужно будет добавить абсолютно всех персонажей + добавить к ним косметику») 🟨 волна 2 (2026-09-06)
- **Как добавляется герой (конвейер, всё скриптами):** (1) кит в `content/heroes.ts` из существующих `AbilityKind` по мотивам его умений в Dota + фирменная пассивка при необходимости; (2) строки `arcade.ab.<id>.{q,w,e,r}[.desc]` RU/EN; (3) строка в трёх манифестах спрайтов (`dota_manifest{,_px,_px2}.tsv`) — модель + части из `models/heroes/<folder>/` (список частей берётся из vpk, лишнее: `_shape`, `mount`, `ghostship*`, dragon-форма); (4) `HEROES` в `scripts/dota_sounds.sh` (`id:папка`) и `scripts/dota_voice.sh` (`id:папка:префикс базовой озвучки` — префикс смотреть по счётчику файлов в `sounds/vo/<папка>/`, у Wraith King два голоса: `skel_` старый и `wraith_` новый); (5) `MAP` в `scripts/dota_ability_icons.sh` (имена иконок — `panorama/images/spellicons/<hero>_*`); (6) `HERO_TINT` (снаряды/новы) и `IMPACT` (слой удара) — по одному слову; (7) тест «каждый герой детерминирован» подхватывает нового автоматически.
- **Волна 2 (8 героев):** Wraith King (Wraithfire Blast, Vampiric Spirit — новая фирменная пассивка `vampiric`, Mortal Strike, **Reincarnation** — новый вид: пассивный подъём с 40–80% HP раз в 150 с через общий `revive()` с Aegis), Dragon Knight (Breathe Fire, Dragon Tail, Dragon Blood, Elder Dragon Form + клив), Kunkka (Torrent, Tidebringer-клив 0.7, X Marks, Ghostship), Necrophos (Death Pulse, Ghost Shroud, Heartstopper Aura = presence, Reaper's Scythe), Razor (Plasma Field, Static Link, Storm Surge, Eye of the Storm), Venomancer (Venomous Gale, Poison Sting, Plague Ward, Poison Nova), Witch Doctor (Paralyzing Cask, Voodoo Restoration, Maledict, Death Ward), Luna (Lucent Beam, Moon Glaives, Lunar Blessing, Eclipse). Итого 32 героя.
- **Волна 3 (8 героев, 2026-09-06):** Earthshaker (Fissure, Enchant Totem, **Aftershock** — пассивка: каждый каст бьёт и оглушает вокруг, Echo Slam), Bloodseeker (Bloodrage, Blood Rite, **Thirst** — ускорение при враге < 30% HP рядом, **Rupture** — новый вид: урон за пройденный путь, `tickRupture`), Riki (Smoke Screen, Blink Strike, Tricks of the Trade, **Backstab** — +80% автоатак по оглушённым/замедленным), Queen of Pain (Shadow Strike, Blink, Scream of Pain, Sonic Wave), Viper (Poison Attack, Nethertoxin, Corrosive Skin = quill, Viper Strike), Ogre Magi (Fireblast, Ignite, Bloodlust, **Multicast** — пассивка: шанс повторного срабатывания через сброс перезарядки до 1 тика), Huskar (Inner Fire, Burning Spear, **Berserker's Blood** — новый пассивный вид: frenzy от потерянного HP, `heroPassives`, Life Break), Slardar (Guardian Sprint, Slithereen Crush, Bash = timelock, **Corrosive Haze** — новый вид: метка +30–60% урона от всего). Итого **40 героев**. Звуки умений всех новых героев заведены в `dota_sfx_pack.py`. Бот после усилений (8 прогонов, разминка): Earthshaker 25%, Riki 25%, Viper 25%, QoP 25%, Huskar 33%, Slardar 33%, Bloodseeker 12.5%, Ogre 12.5% — ⬜ Bloodseeker и Ogre Magi ниже полосы, докалибровать (бот не пользуется Rupture/Multicast так, как игрок). Бот-калибровка волны 2 (разминка, 6 прогонов): Kunkka был 100% → клив 0.7→0.45; Witch Doctor 0% → чаще бочонок/проклятие, крепче вард; Venomancer 33% → сильнее Gale/вард.
- **Волна 4 (8 героев, 2026-09-06):** Tiny (Avalanche, Toss, Tree Grab-клив, Grow), Spectre (Spectral Dagger, Desolate, Dispersion = quill, Haunt = edict), Chaos Knight (Chaos Bolt, Reality Rift, Chaos Strike, Phantasm), Night Stalker (Void, Crippling Fear, Hunter in the Night, Dark Ascension), Doom (Devour, Scorched Earth = remnant, Infernal Blade, Doom), Legion Commander (Overwhelming Odds, Press the Attack, Moment of Courage = vampiric, Duel), Templar Assassin (Refraction, Meld, Psi Blades-клив, Psionic Trap), Medusa (Split Shot, Mystic Snake, Mana Shield, Stone Gaze). Итого **48 героев**. Бот (8 прогонов, разминка): Tiny 50%, Templar 50%, Medusa 37%, CK 25%, Doom 25%, Spectre 0→25% и Night Stalker 0→25% после усиления, Legion Commander 87→62% после двух ослаблений (vampiric 0.06, Duel cd 70) — ⬜ проверить ещё. Попутно **баг**: зоны `remnant`/`edict` в симе проверялись по фиксированным слотам Q/W — ульт Razor (Eye of the Storm в R) молчал; теперь поиск по виду в любом слоте, тест в `arcadeSignature.test.ts`. Папки Valve: Night Stalker — `nightstalker` (модель/звуки) и `night_stalker` (vo/иконки), Templar — `lanaya`, Doom — `doom_bringer` (vo/иконки/картинка).
- **Волна 5 (8 героев, 2026-09-06):** Silencer (Arcane Curse, Glaives of Wisdom, Last Word, Global Silence = mass_freeze), Skywrath Mage (Arcane Bolt, Concussive Shot, Ancient Seal = corrosive, Mystic Flare), Dazzle (Poison Touch, Shallow Grave, Shadow Wave = ward, Bad Juju = arcane_aura), Jakiro (Dual Breath, Ice Path, Liquid Fire, Macropyre), Shadow Shaman (Ether Shock, Hex, Shackles = life_drain, Mass Serpent Ward), Warlock (Fatal Bonds, Shadow Word, Upheaval, Rain of Chaos = meteor), Enigma (Malefice, Demonic Conversion = multishot, Midnight Pulse = remnant, Black Hole = ravage), Tinker (Laser, Heat-Seeking Missile = arc_lightning, Defense Matrix, Rearm = multicast). Итого **56 героев**. Бот после двух правок (8 прогонов): Silencer 37%, Skywrath 25%, Jakiro 25%, Warlock 25% (был 87% после первого усиления), Shadow Shaman 25%, Dazzle 12%, Enigma 12%, Tinker 12% — ⬜ саппорт-касты ботом недобирают: он не умеет держать дистанцию с 340-й дальностью; полоса 30–50% для них требует либо роста базовых статов, либо доработки бота. Папки Valve: Skywrath — vo `skywrath_mage` (префикс `drag_` — Dragonus), звуки `skywrath`; Shadow Shaman — модель/звуки `shadowshaman`.
- **Волна 6 (8 героев, 2026-09-06):** Omniknight (Purification = ward, Heavenly Grace, Hammer of Purity, Guardian Angel = death_pact), Abaddon (Mist Coil, Aphotic Shield, Curse of Avernus = frost_arrows, Borrowed Time = reincarnation), Beastmaster (Wild Axes, Call of the Wild Boar = damage_ward, Inner Beast = frenzy, Primal Roar = ravage), Brewmaster (Thunder Clap, Cinder Brew, Drunken Brawler = blur, Primal Split = rage), Centaur (Hoof Stomp, Double Edge, Retaliate = quill, Stampede = haste), Dark Seer (Vacuum, Ion Shell = edict, Surge, Wall of Replica), Death Prophet (Crypt Swarm, Silence, Spirit Siphon, Exorcism = edict), Disruptor (Thunder Strike, Glimpse, Kinetic Field = mass_freeze, Static Storm). Итого **64 героя**. Бот (8 прогонов): Death Prophet 50%, Omniknight 37%, Disruptor 37%, Beastmaster/Brewmaster/Dark Seer/Abaddon 25%, Centaur 12% (⬜ докалибровать).
- **Волна 7 (8 героев, 2026-09-06):** Lycan (Summon Wolves = damage_ward, Howl = rage, Feral Impulse, Shapeshift = frenzy), Lone Druid (Spirit Bear = damage_ward, Spirit Link = vampiric, Savage Roar = gust, True Form = rage), Alchemist (Acid Spray, Unstable Concoction, Corrosive Weaponry = frost_arrows, Chemical Rage = frenzy), Bane (Enfeeble, Brain Sap = life_drain, Nightmare = frostbite, Fiend's Grip = assassinate), Batrider (Sticky Napalm, Flamebreak = gust, Firefly = haste, Flaming Lasso = frostbite), Bounty Hunter (Shuriken Toss = arc_lightning, Jinada, Shadow Walk = dash + backstab, Track = corrosive), Broodmother (Spiderlings = damage_ward, Spin Web = haste, Incapacitating Bite = frost_arrows, Insatiable Hunger = rage + vampiric), Clockwerk (Battery Assault = edict, Power Cogs = mass_freeze, Rocket Flare, Hookshot = dash; папка `rattletrap`). Итого **72 героя**. Бот (8 прогонов, после правок): Lycan 50%, Alchemist 37%, Broodmother 37%, Clockwerk 37%, Lone Druid 25%, Bane 12%, Batrider 12%, Bounty Hunter 0% (⬜ докалибровать: бот с dash-героями без AoE умирает рано).
- **Волна 8 (8 героев, 2026-09-06):** Earth Spirit (Boulder Smash, Rolling Boulder = dash, Geomagnetic Grip, Magnetize = edict), Elder Titan (Echo Stomp = ravage, Astral Spirit, Natural Order = corrosive, Earth Splitter), Ember Spirit (Searing Chains, Sleight of Fist = spin, Flame Guard, Fire Remnant = dash), Grimstroke (Stroke of Fate, Phantom's Embrace = life_drain, Ink Swell, Soulbind = mass_freeze), Gyrocopter (Rocket Barrage = edict, Homing Missile, Flak Cannon = multishot, Call Down = meteor; папка `gyro`), Keeper of the Light (Illuminate, Blinding Light = gust, Chakra Magic = arcane_aura, Will-O-Wisp = mass_freeze; конь в частях), Magnus (Shockwave, Empower = rage + клив, Skewer = dash, Reverse Polarity = ravage; папка `magnataur`), Mars (Spear of Mars, God's Rebuke = gust, Bulwark, Arena of Blood = ravage). Итого **80 героев**. Бот (8 прогонов, после усиления): Gyrocopter 62%, Magnus 62%, Ember 37%, Earth Spirit 25%, Elder Titan 25%, KotL 12%, Grimstroke 0%, Mars 0% — ⬜ докалибровать (Grimstroke/Mars/KotL вниз по полосе, Gyro/Magnus вверх). ⬜ У Keeper of the Light спрайт смещён относительно кольца у ног (корень модели коня не под всадником) — нужен per-hero сдвиг якоря в манифесте/меты.
- **Волна 9 (8 героев, 2026-09-06):** Morphling (Waveform = dash, Adaptive Strike, Attribute Shift, Morph = rage), Naga Siren (Mirror Image = damage_ward, Ensnare, Rip Tide, Song of the Siren = mass_freeze; папка `siren`), Nature's Prophet (Sprout = mass_freeze, Teleportation = dash, Nature's Call = damage_ward, Wrath of Nature = arc_lightning; папка `furion`), Nyx Assassin (Impale, Mana Burn, Spiked Carapace = quill, Vendetta = dash; папка `nerubian_assassin`, звуки `nyx`), Oracle (Fortune's End = frostbite, Fate's Edict, Purifying Flames = ward, False Promise = death_pact), Outworld Destroyer (Arcane Orb, Astral Imprisonment, Essence Flux = arcane_aura, Sanity's Eclipse; папка `obsidian_destroyer`, vo `outworld_destroyer`), Pangolier (Swashbuckle, Shield Crash = ravage, Lucky Shot, Rolling Thunder = spin; vo `pangolin`), Phoenix (Icarus Dive = dash, Fire Spirits = multishot, Sun Ray, Supernova = reincarnation; озвучки у Феникса нет). Итого **88 героев**. Бот (8 прогонов): Morphling 37%, Naga 37%, NP/Nyx/Oracle/Pangolier/Phoenix 25%, OD 0% → Arcane Orb сделан активным → 37%.
- **Волна 10 (8 героев, 2026-09-06):** Puck (Illusory Orb, Waning Rift, Phase Shift = armor_buff, Dream Coil = ravage), Pudge (Meat Hook = dash, Rot = edict, Flesh Heap, Dismember = assassinate), Rubick (Telekinesis = frostbite, Fade Bolt = arc_lightning, Arcane Supremacy = arcane_aura, Spell Steal = multicast), Sand King (Burrowstrike, Sand Storm = edict, Caustic Finale = searing, Epicenter = nova; vo/иконки `sandking`), Shadow Demon (Disruption, Disseminate = corrosive, Shadow Poison, Demonic Purge = goo), Slark (Dark Pact, Pounce = dash, Essence Shift = vampiric, Shadow Dance = death_pact), Snapfire (Scatterblast = multishot, Firesnap Cookie = dash, Lil' Shredder = frenzy, Mortimer Kisses = meteor), Spirit Breaker (Charge = dash, Bulldoze, Greater Bash = timelock, Nether Strike). Итого **96 героев**. Бот (8 прогонов, после правок): Sand King 50%, Puck/Snapfire/SB 25%, Shadow Demon 25%, Rubick 12%; Pudge и Slark после усиления дали 75% и подрезаны → Pudge 25.0%, Slark 62.5% → подрезан ещё раз (⬜ перепроверить).
- **Волна 11 (8 героев, 2026-09-06):** Techies (Sticky Bomb = meteor, Reactive Tazer, Blast Off! = dash, Proximity Mines = remnant), Terrorblade (Reflection, Conjure Image = damage_ward, Metamorphosis = rage, Sunder = death_pact), Timbersaw (Whirling Death = spin, Timber Chain = dash, Reactive Armor, Chakram = damage_ward; папка `shredder`), Treant (Nature's Grasp, Leech Seed = life_drain, Living Armor, Overgrowth = mass_freeze; папка `treant_protector`), Troll Warlord (Whirling Axes, Berserker's Rage = frenzy, Fervor = crit, Battle Trance = rage + vampiric), Tusk (Ice Shards, Snowball = dash, Tag Team = rage, Walrus Punch; папка `tuskarr`), Underlord (Firestorm = meteor, Pit of Malice = mass_freeze, Atrophy Aura = presence, Fiend's Gate = dash; папка `abyssal_underlord`, звуки `underlord`), Undying (Decay = life_drain, Soul Rip = ward, Tombstone = damage_ward, Flesh Golem = rage). Итого **104 героя**. Бот (8 прогонов, после правок): Underlord 50%, Techies 37%, Timbersaw 37%, Tusk 37%, Undying 37%, Treant 25%, Troll 25%, Terrorblade 75→62% (подрезан ещё раз, ⬜ перепроверить).
- **Волна 12 (8 героев, 2026-09-06):** Vengeful Spirit (Magic Missile, Wave of Terror, Vengeance Aura = presence, Nether Swap = dash; папка `vengeful`, vo `vengefulspirit`, звуки `vengeful_spirit`), Visage (Grave Chill, Soul Assumption, Gravekeeper's Cloak, Summon Familiars = damage_ward), Void Spirit (Aether Remnant = remnant, Dissimilate, Resonant Pulse, Astral Step = dash), Weaver (The Swarm = damage_ward, Shukuchi = haste, Geminate Attack = crit, Time Lapse = death_pact), Winter Wyvern (Arctic Burn = searing, Splinter Blast = arc_lightning, Cold Embrace = ward, Winter's Curse = mass_freeze; папка `winterwyvern`), Arc Warden (Flux, Magnetic Field, Spark Wraith = remnant, Tempest Double = multicast), Dawnbreaker (Starbreaker = spin, Celestial Hammer, Luminosity = vampiric, Solar Guardian = meteor; vo `valora_`), Hoodwink (Acorn Shot = arc_lightning, Bushwhack = frostbite, Scurry = haste, Sharpshooter = assassinate). Итого **112 героев**. Бот (8 прогонов, после правок): Weaver/Arc/Dawnbreaker 37% (Dawnbreaker была 100% — ослаблена), Void Spirit 37%, Visage 25%, WW 25%, Vengeful 12%, Hoodwink 0% (⬜ докалибровать двух последних).
- **Волна 13 (7 героев, 2026-09-06):** Marci (Dispose = gust, Rebound = dash, Sidekick = rage + vampiric, Unleash = frenzy; без озвучки — Марси немая), Muerta (Dead Shot, The Calling = nova, Gunslinger = crit, Pierce the Veil = rage), Primal Beast (Onslaught = dash, Trample = spin, Uproar, Pulverize = ravage), Kez (Echo Slash, Grappling Claw = dash, Kazurai Katana = crit, Raptor Dance = spin), Ringmaster (Tame the Beasts, Escape Act, Impalement Arts, Wheel = mass_freeze), Meepo (Earthbind = mass_freeze, Poof = dash, Ransack = vampiric, Divided We Stand = damage_ward), Io (Tether = ward, Spirits = multishot, Overcharge = frenzy, Relocate = dash; модель/звуки `wisp`, озвучки нет). **Largo пропущен: в локальном vpk нет его модели** (в датасете есть). Итого **119 героев** из 126 в датасете. Бот (8 прогонов, после правок): Primal Beast 37%, Meepo 37%, Marci 25%, Ringmaster 25%, Io 25%, Kez 0→37% после усиления; Muerta после замены W на AoE всё ещё 0% (⬜ разобрать трассой бота — умирает до 7-й минуты). Io — сфера без лап: отрисован в половину размера (--world 64), партиклы Dota не переносятся.
- **Скины, партия 3 (2026-09-06):** +6 аркан героев поздних волн — Pudge «Пир одержимости» (своя озвучка `pud_arc_`), Rubick «Магус Ниспосланный» (`rub_arc_`), Skywrath Mage, Spectre, Vengeful Spirit, Drow Ranger (эти четыре — голосом базового героя). Итого **24 скина**.
- **Волна 15 (2026-09-06, a0.19.0): последние семь из датасета** — Phantom Lancer (иллюзии Juxtapose призывом), Lifestealer, Enchantress (энты), Chen (обращённые звери), Ancient Apparition, Monkey King, Dark Willow. В Аркаде 126 героев из 127; остался только Largo — его модели в локальном vpk нет.
- **Калибровка волны 15 (20 прогонов, разминка):** Lifestealer 45%, Enchantress 35%, Monkey King 50% сразу в полосе. Ниже полосы были Phantom Lancer 25→45%, Chen 15→40% (усилены копьё, звери и Hand of God), Ancient Apparition 15→45% и Dark Willow 15→50%. У последних двух дело было не в числах: **Cold Feet и Bramble Maze били одну цель, а это пустой каст в толпе** — та же болезнь, что у Invoker; заменены на взрыв по площади. Промежуточный вариант Dark Willow дал 85% и был урезан.
- ⬜ **Дальше:** Largo — когда обновится Dota (модель появится в vpk); следующая партия косметики (арканы/персоны героев волн 2–13: Pudge, Rubick, Terrorblade, Monkey King?, Spectre, Skywrath, Drow, Lina, Legion…); полный проход бота по всем 119 героям в разминке и полном акте; сдвиг якоря для конных моделей (KotL). Techies, Terrorblade, Timbersaw, Treant, Troll Warlord, Tusk, Underlord, Undying → Vengeful Spirit, Venomancer✓, Visage, Void Spirit, Weaver, Winter Wyvern, Witch Doctor✓, Arc Warden, Dawnbreaker, Hoodwink, Marci, Muerta, Primal Beast, Kez, Ringmaster, Largo. Порядок — по популярности в датасете (`heroes.json` / picks). После каждой волны — `npm run sim:arcade` по новым героям, полоса 30–50% в разминке.
- **Скины, партия 2 (2026-09-06):** +15 скинов в `content/cosmetics.ts` (арканы: CM «Ледяная лавина», PA «Многоликий парадокс», Zeus, Wraith King, Earthshaker, QoP, Faceless Void, Windranger, Ogre Magi, Razor; персоны: CM «Волчица», Dragon Knight Дэвион, Mirana, PA Асан, Invoker «Ученик»). Модели — `models/heroes/<hero>*` и `models/items/<hero>/arcana*` (Windranger — базовая модель + части арканы), озвучка — префиксы `cm_wolf_/dk_davion_/mira_per_/pa_asan_/zeus_arc_/skel_arc_/earth_arcana_/qop_arc_/fv_arc_/wr_arc_/ogm_arc_/rz_vsa_/kidvoker_` (фильтр «чужих» токенов в `dota_voice.sh` теперь снимает токен, если он в самом префиксе; базовые наборы Razor/Mirana/DK/ES очищены от реплик аркан/персон); скин без своей озвучки (CM/PA арканы) говорит голосом базового героя (`voiceKey` в heroSfx). Тест `test/arcadeSkinsManifest.test.ts`: косметика ↔ манифесты ↔ HEROES. Итого 18 скинов.
- ⬜ **Косметика (дальше):** каталог скинов строить из vpk автоматически — арканы/персоны лежат в `models/heroes/<hero>/<hero>_arcana*.vmdl_c` или `models/items/<hero>/arcana/…`, персоны — отдельные папки (`models/heroes/antimage/antimage_persona*` и т.п.); каждый скин = строка `<hero>@<skin>` в манифестах + префикс озвучки в `dota_voice.sh` (`arc_ok`), запись в `content/cosmetics.ts` со слотом `skin` и привязкой `hero`. Открытие — за валюту карьеры Аркады (как остальная косметика), показ — только у своего героя (сделано). Сеты (не арканы) — отдельная тема: `models/items/<hero>/<set>/` заменяют части модели по слотам; делать после того, как все герои есть.

### T13.27 — Гардероб героя: окно внешнего вида (владелец 2026-09-06) 🟨
- **Зачем.** Владелец: «когда мы тыкаем по герою — нужно открывать окошко, где видно, как перс выглядит сейчас и как будет выглядеть, если что-то купим; покупать будем именно там, а не в меню ниже выбора персонажей».
- **Как открыть.** Тычок по уже выбранному герою на экране настройки или кнопка «Внешний вид героя» в блоке косметики (первый тычок по чужой карточке по-прежнему просто выбирает героя).
- **Что внутри** (`features/arcade/HeroWardrobe.tsx`): анимированное превью выбранного облика тем же листом `dota_px*`, что рисует бой (цикл стойка → ходьба с разворотом → удар), список обликов героя (базовая модель + арканы/персоны) с миниатюрами, кнопки «Надеть»/«Купить · N» прямо там, и слоты эффектов (рамка, трейл, смерть врага, оттенок) — покупка тоже здесь. Блок под выбором героя сжат до счётчика и кнопки.
- **Стили аркан (заготовка).** `CosmeticDef.styles` + `cosmetics.styles` в сторе + `skinnedSheet()` дают имя листа `<variant>~<style>`; рендерер откатывается на базовый лист скина, если стиля нет. Строк стилей пока не заведено — нужен рендер (см. ⬜ ниже). Тесты `test/arcadeWardrobe.test.ts` (в т.ч. «под каждый объявленный стиль есть лист в обоих манифестах»).
- **Внутри модалки поверхность инвертирована** (`--surface-invert`/`--on-invert`): плашки гардероба берут цвета из invert-словаря, иначе светлая плашка съедает светлый текст (поймано на первом же скриншоте).
- **Самоцветы аркан** (владелец: «в арканы вставляются гемы, аркана может быть любого цвета»). В Dota самоцвет — параметр цвета материала, у нас — поворот тона готового листа (`hueSheet`, кэш на пару «лист + градусы»), поэтому доступен любой арканe без перерендера. Пять самоцветов у каждой арканы; превью в гардеробе показывает настоящий результат.
- **Стили аркан** (Bladeform Legacy у Juggernaut, красный вариант Drow, стили Pudge/Earthshaker/QoP/WR/Ogre). Это НЕ другая модель, а другой набор color-текстур: рядом с `<part>_color_<hash>.vtex_c` в vpk лежит вариант со вставленным токеном стиля — суффиксом (`..._style1_color_...` у Drow/Pudge) или в середине (`juggernaut_arcana_v2_body_color`). glb от Source2Viewer привозит только базовые, поэтому текстуры стиля достаются отдельно (`dota_style_textures.sh`), а `render_dota_sprites.py --style/--style-dir` подменяет их по правилу «то же имя со вставленным токеном в любой позиции». Конвейер делает это сам по `--style` в строке манифеста. Семь строк `<variant>~style1` заведены в оба манифеста; в игре стиль виден после перерендера.
- **Призывы вместо шарика** (владелец: «Terrorblade должен звать иллюзии, а он ставит на пол шарик»). `AbilityDef.summon {art, count}` — чисто визуальная надстройка над `damage_ward`: сим по-прежнему считает один источник урона ровно в точке игрока (её трогать нельзя — это сид и input-лог), а рендер вместо кружка рисует то, что герой зовёт в Dota: иллюзии — листом самого героя вполупрозрачно (Terrorblade ×2, Naga ×3, Meepo ×2), зверей — своим листом (волки Lycan ×2, медведь Lone Druid, вепрь Beastmaster, энты Nature's Prophet ×2, фамильяры Visage ×2). Призывы расставлены веером в 30 px от точки зова, иначе прячутся под героем. Без листа (паучки Broodmother, варды, надгробие, ловушка) остаётся кружок с кольцом радиуса. Тесты `test/arcadeSummons.test.ts`.
- **Предметы из сетов Dota** (вопрос владельца «можно ли конкретные предметы из сетов»). Да: в `pak01_dir.vpk` 14 033 модели `models/items/<hero>/…`, из них ~1300 полных сетов (части с общим префиксом и суффиксами `_head/_arms/_legs/_back/_weapon`) — ровно та же схема, что уже работает у аркан (части пришиваются к скелету базового героя через Copy Transforms). Заведены 94 сета как облики редкости exotic: по одному каждому герою, у которого не было косметики, плюс четыре именных (Bladesrunner у Juggernaut, Assassination of Dark Feather у PA, Blackthorn у Axe, Nightmare Scarecrow у Pudge). Сет выбирался автоматически: 4+ слота, служебные и событийные наборы отброшены по имени. Без облика остались только Visage и Kez — у них в vpk нет сетов со слотами. У Io облики есть, просто лежат иначе: `models/items/io/<набор>/…` — цельные модели, а не части по слотам, поэтому автоподбор их не увидел; заведён `io@calavera` (у `io_ti7` нет клипа бега).
- **Ряд `cast` для всех героев.** Valve называет клипы каста по способности, а не «cast» (у Shadow Fiend это `nevermore_Requiem` и `nevermore_Shadowraze_1`), поэтому у 33 героев ряд каста просто не находился и анимации каста не было. `pick_action` для ключа `cast` теперь падает на «любой клип не из служебного набора». `dota_render_missing.sh` находит такие листы сам: он проверяет не только отсутствие png, но и отсутствие ряда, который просит `--anims`.
- **Коллизия id листа `centaur`.** Один id был и у нейтрального крипа, и у Centaur Warrunner — строки манифеста затирали друг друга, и крип бегал в модели героя. Лист крипа переименован в `centaur_creep`, вид врага в симе не тронут (он в реплеях и ленте fx); разводит их `ENEMY_SHEET` в sprites.ts. Тест `test/arcadeSheetIds.test.ts` ловит повтор строк в манифесте и новые столкновения id.
- **Листы переведены в WebP (2026-09-06, просьба владельца).** Конвертация `scripts/sheets_to_webp.sh`, в конвейере шаг после pngquant. **Выигрыш оказался куда скромнее, чем я оценил в этой же строке раньше: 4–7%, а не половина.** Причина: листы уже квантованы pngquant до 48 цветов, и PNG на такой картинке сжимает почти так же хорошо. Замеры на листе Juggernaut: PNG 818 КБ · WebP lossless 752 КБ · WebP q95 **1338 КБ** (lossy на резких краях с альфой ХУЖЕ) · без квантования PNG 5.9 МБ и WebP 3.0 МБ. Уровень `-z 6`: на `-z 9` кодек считает 23 секунды вместо 0.7 и выдаёт не меньше, а больше. Итог по трём наборам: 324 → 312 МБ.
- ⬜ **Что реально сократит арт, если понадобится:** меньше кадров у редко видимых рядов (`death`, `cast` — сейчас у всех по 12), палитра 32 цвета вместо 48, отказ от набора `dota_px` в пользу отрисовки плотного набора вполовину масштаба (это сразу минус 67 МБ и целый проход рендера).
- **Кольца зон и вихря рисовались по букве слота (2026-09-06, a0.21.0).** Тот же дефект, что в симе: радиус брался у `q`/`r`, а умение стоит в другом слоте. Diabolic Edict у Leshrac (W) и Eye of the Storm у Razor (R) бьют вокруг героя, но кольцо висело в начале координат карты радиусом чужого слота (проверено живьём: игрок 1600,1600 · zoneX 0,0 · радиус 100 вместо 260); Rolling Thunder у Pangolier — вихрь в R с радиусом 190, а кольцо рисовалось радиусом `q`. Радиус ищется по виду умения (`ArcadeRenderer.slot`).
- **Ремнанты стали призраками.** Static Remnant у Storm Spirit и Aether Remnant у Void Spirit — в Dota это призрак самого героя, а рисовался кружок; `summon: illusion` теперь работает и у вида `remnant` (`drawZoneSummon`).
- ⬜ **Два облика отрендерены не в масштабе** (нашёл `scripts/qa_sprite_sheets.mts`, прогон по всем 283 листам 2026-09-06): `ancient_apparition@frost_djin` — силуэт ×0.18 по пикселям (≈0.42 по линейному размеру, герой размером с крысу), `snapfire@snailfire` — ×2.23 (улитка раздувает bbox, как цепь у Batrider). Остальные 281 лист чистые: кадры двигаются, силуэт в норме, обрезки нет. Лечится перерендером с обрезкой силуэта по массе (`--trim`), то есть тем же блокером — нет Source2Viewer-CLI. Подкручивать `world` в JSON вместо перерендера не стал: это второй механизм поверх того же числа, и перерендер потом пришлось бы откатывать вручную.
- ⬜ **Варды и призывы, которым нужна своя модель:** Nether Ward (Pugna), Plague Ward (Venomancer), Death Ward (Witch Doctor), Mass Serpent Ward (Shadow Shaman), Psionic Trap (TA), Proximity Mines (Techies), Tombstone (Undying), Spawn Spiderlings (Broodmother), The Swarm (Weaver), Golem у Warlock. Все они пока кружок. **Блокер — нет Source2Viewer-CLI:** ни `~/tools/s2v/`, ни `~/Downloads/` (пути из `docs/arcade-dota-sprites.md`), `~/dota-export` тоже пуст. Сам vpk и Blender на месте, так что достаточно вернуть распакованный CLI на место — конвейер отработает по манифесту без правок.
- ⬜ **Смешивание предметов по слотам** (надеть шлем из одного сета и оружие из другого). Пре-рендеренные листы этого не дают: комбинаций больше, чем листов. Нужен послойный рендер — каждая часть отдельным листом с телом в режиме holdout (чтобы скрытые пиксели вырезались), и композит слоёв в рантайме.

### T13.26 — Управление и формы: автокаст по кнопке, Metamorphosis, снаряды по герою (владелец 2026-09-06, вечер) 🟨
- **Автокаст только по переключателю.** Владелец: «умения не должны нажиматься сами — только по нажатию, пока не включишь переключатель рядом». В HUD у каждого умения значок «А»; выключен — умение срабатывает только по кнопке или клавише, включён — само по перезарядке. Настройка живёт между забегами (`aegis-draft.arcade.autocast`), а в сим уходит через `act = AUTOCAST_ACT + i` — попадает в input-лог, поэтому реплей точен. В самом симе автокаст по умолчанию **включён**: так гоняется бот калибровки и читаются старые реплеи, экран догоняет настройку в первых кадрах забега (очередь `act` в контроллере идемпотентна — иначе переключения дублировались и флажки прыгали). Тесты `test/arcadeAutoCast.test.ts`.
- **Смена формы.** Новый вид `metamorphosis` + `AbilityDef.form {ranged, range}` и `player.formUntil`: на время действия меняются лист спрайта (`<hero>@meta`), тип атаки и дальность, кольцо у ног становится красным. Terrorblade Metamorphosis (ближний → дальний, модель `terrorblade/demon`), Dragon Knight Elder Dragon Form (дальний, `dragon_knight_dragon`), Lone Druid True Form (наоборот, дальний → ближний, `true_form`). Тесты `test/arcadeForm.test.ts`.
- **Снаряды по герою.** Вместо общего шарика: стрела у лучников (Mirana, Drow, WR, Clinkz, Medusa, Hoodwink, Lone Druid, Huskar), клинок у метателей (Luna, Silencer, PA, TA, Ringmaster), пуля у стрелков (Sniper, Gyro, Muerta, Snapfire, Tinker), сгусток у остальных — в цвете героя, повёрнут по вектору скорости (`drawHeroProjectile` в particles.ts).
- **Shadow Fiend без крыльев.** В манифесте базовому SF была прицеплена косметическая деталь `nevermore/wings.vmdl_c` (крылья арканы) — убрана, лист перерендерен.
- ⬜ **Анимации умений** (каст ульты SF, вызов энтов у NP, иллюзии Naga, вращение Axe): у моделей Dota есть отдельные клипы каста, но лист рендерится только с walk/idle/attack/death. Нужен новый ряд `cast` в манифесте и перерендер всех листов (~2 ч) плюс проигрывание клипа по событию `events.castQ..R` в рендерере.
- ⬜ **Косметика для остальных героев**: у большинства поздних волн аркан в vpk нет (Terrorblade, Legion, Lina, Techies, Slark — только предметы-сеты). Что есть — заведено; сеты через `models/items/<hero>/<set>/` пока не делались.

### T13.25 — Баланс 119 героев и якорь спрайта (2026-09-06) 🟨
- **Метод:** экранирующий прогон `--runs 6` по всем героям бесполезен — шаг измерения 16.7%, шум перекрывает сигнал. Мерить полосу только на `--runs 20…30`; 6 прогонов годятся лишь чтобы заметить 0% и 100%.
- **Замер (30 прогонов, разминка, Herald):** Juggernaut 33% (эталон, в полосе 30–50%), Necrophos 60%, Magnus 60%, Lina 13%, Muerta 10% — разброс реальный, не шум. После правки (Necrophos: аура 25→17%, Death Pulse реже; Magnus: Empower 110→75%, Shockwave слабее; Lina: +80 HP, +2 брони, +2 урона; Muerta: +80 HP, +1 броня, Dead Shot и The Calling сильнее и чаще) на 20 прогонах: Necrophos 30%, Magnus 35%, Muerta 25%, Lina 20%.
- ⬜ Оставшиеся выбросы искать так же — точечно и с 20+ прогонами, а не сплошным экраном.
- **Свип всех 126 героев (2026-09-06, 20 прогонов, база `sweep`):** 63 в полосе, 47 ниже, 16 выше. Перезамер на двух базах по 30 прогонов подтвердил трёх настоящих аутсайдеров — Drow Ranger, Chaos Knight, Winter Wyvern (правки в a0.20.0), остальные разошлись в пределах ошибки. **20 прогонов = ±11%, 30 = ±9%:** одиночный замер отличает только крайности, поэтому каждая правка перепроверяется на 2–3 базах сидов.
- **Одиннадцать умений не делали ничего (2026-09-06, a0.21.0).** Тик активных эффектов искал вид умения по букве слота (`H.q.kind === "spin"`, `H.w.kind === "ward"`), а вид стоит у разных героев в разных слотах: Rolling Thunder у Pangolier и Raptor Dance у Kez — `spin` в R, Hand of God у Chen — `ward` в R, Cold Embrace у Winter Wyvern — `ward` в E, плюс Riki, Dazzle, Omniknight, Ember Spirit, Oracle, Primal Beast, Io. Каст ставил `spinUntil`/`wardUntil`, тик его не видел. Теперь слот ищется по виду (`ABILITY_KEYS.find`) в симе и в рендере; `test/arcadeAbilitySlots.test.ts` запрещает искать вид по букве и держит таблицу видов, которые читаются из фиксированного слота.
- **Оракул и Io: один источник урона на весь кит (2026-09-06, a0.24.0).** Тот же диагноз, что у Drow и Chaos Knight: у Oracle из четырёх слотов урон был только в одноцелевом Fortune's End (остальные — щит, лечение, баф), у Io — только Spirits. Fortune's End стал вспышкой по площади (в Dota он и бьёт по области вокруг цели), Spirits — кружащими вокруг героя духами (`spin`, а не веер снарядов: в Dota они именно вращаются). Oracle 15% → 23.3/40.0%, Io 20% → 33.3/40.0%. **Замечание к методу:** «один активный источник урона» сам по себе не дефект — так живут кэрри (PA, Slark, Ursa, Sven: урон в автоатаке и пассивках), и Omniknight с нулём активного урона держит 55%. Дефект — когда так живёт саппорт с 560 HP: ему нечем чистить толпу.
- **`mass_freeze` игнорировал свой `value`** — число урона в таблице молчало. Теперь при ненулевом значении ульт бьёт в момент каста (Winter's Curse), а чистый контроль (Chronosphere, Global Silence, Stone Gaze, Song of the Siren) стоит с нулём и не меняется.
- ⬜ **Бот виснет на одном сиде с Death Prophet** (`--hero death_prophet --seed sim`, прогоны 4–5): процесс жжёт минуты CPU и не заканчивается. Сим тут ни при чём — прогон полного акта с 149 врагами и всеми моими правками занимает 0.9 с, а кайт-политика с покупками и выбором карточек по логике бота проходит те же сиды за 0.2 с. Значит дело в самой `scripts/sim_arcade.ts` (её сейчас правит другая сессия: добавлены обработка добычи и поход к сундуку). Обход для калибровки — другая база сидов: `--seed dp`. На vitest и CI не влияет: тесты бота не используют.
- **Якорь ног спрайта — открытый баг.** Конные модели (Keeper of the Light) и сфера Io стоят выше кольца у ног. Причина: в `render_dota_sprites.py` якорь считается как `0.5 + (высота/2)·sin(pitch)/extent`, а `extent` у широкой модели задаётся шириной силуэта. Пробовал считать якорь по нижнему непрозрачному ряду кадра idle — стало хуже: в бою поза другая (у Juggernaut ноги ушли выше кольца), правка откачена. **Замер 2026-09-06 (Keeper of the Light, 64-px кадр):** низ силуэта 0.875 кадра, якорь 0.786 — кольцо проходит по брюху коня, а копыта на 9% кадра ниже. Это не ошибка формулы: якорь честно указывает точку земли под ЦЕНТРОМ модели, а ближний к камере край подошвы при наклоне 45° проецируется ниже. Кольцу под ногами нужен именно ближний край: `anchor = 0.5 + ((высота/2)·cos p − y_ближнего_края·sin p) / охват`, где y считается по вершинам ниже ~0.15 высоты (след на земле), а не по всей модели — иначе плащ и посох тянут вниз. Правку делать одним заходом с ближайшим полным перерендером: она сдвигает якорь у ВСЕХ листов.
**Проверено 2026-09-06 и версия с проекцией отпала:** прогнал `world_to_camera_view((0,0,0))` рядом с формулой на Keeper of the Light и Juggernaut — значения совпадают до третьего знака (формула точна, а не приближённа). Значит дело не в якоре: охват камеры и низ модели меряются пробным рендером в позе покоя, а лист рисуется анимацией, где поза другая (и части вроде коня прикрепляются после пробы). Копать надо там.

### T13.24 — Фидбэк владельца по проду и dev (2026-09-06, вечер) ✅
- **Музыка в проде молчала, эффекты играли:** `<audio>` ходит с заголовком Range и ждёт 206, а service worker отвечал на все GET cache-first (полный ответ / падение `cache.put(206)`). Теперь запросы `destination: audio|video` и любые с Range идут мимо воркера напрямую в сеть (`src/sw.ts`).
- **На 5173 нет звуков ударов, с `?sfxdebug=1` есть:** headless на 5273 оба URL звучат одинаково (журнал `window.__sfxDebug()` в dev: played/pending, master 0.5, контекст running), то есть код не различает URL — разница в состоянии вкладки. Наиболее вероятная причина — AudioContext, созданный вне жеста (HMR-дубль `sound.ts` в долгоживущей вкладке или первый сэмпл до клика): он остаётся `suspended`, `resume()` из rAF браузер отклоняет, а голос играет из старого контекста. Теперь «разлочиватель» слушает pointerdown/keydown постоянно и будит любой уснувший контекст на следующем клике. Если после этого на 5173 тишина остаётся — смотреть Settings → ползунок «Эффекты» (канал `sfx`, голос и музыка на него не завязаны) и DevTools → Application → Service Workers.
- **Нейтралки всегда одни и те же:** было по 3 предмета на тир при двух предложениях. Теперь по 6 на тир (Trusty Shovel, Occult Bracelet, Royal Jelly, Grove Bow, Vampire Fangs, Whisper of the Dread, Elven Tunic, Cloak of Flames, Craggy Coat, Ninja Gear, Timeless Relic, Havoc Hammer, Mirror Shield, Fallen Sky, Pirate Hat) и три предложения; пиксельные иконки — `scripts/dota_item_icons.sh`.

### T13.22 — Пиксельные частицы эффектов: горение, лёд, искры, ауры (владелец 2026-09-06: «у нас нет эффектов горения и прочих вещей») ✅ срез 1 (2026-09-06)
- `features/arcade/particles.ts` — чисто визуальный слой из крупных квадратных пикселей (зерно = 2 арт-пикселя, как искры DMD), детерминированный от тика и хеша (семя, индекс): **горящий враг** — языки пламени по высоте силуэта (не радиуса коллизии) + отсвет на земле; **охлаждённый/замороженный** — ледяная крошка вокруг корпуса с бликом; **ауры героя** — угольки Radiance (радиус ауры, плотность от ранга), ледяная крошка Skadi, искры Maelstrom; **хвосты снарядов** (огонь/лёд/молния/ядро); **искры попадания** у цифр урона (крит — больше и дальше); **кольца нов и взрывов** из пикселей в цвете героя (`HERO_TINT`: Shadowraze тёмно-красная, Frost Nova ледяная). Токены `--arcade-ember/smoke/ice`. Сим и реплей не тронуты. Тесты `test/arcadeParticles.test.ts` (заглушка контекста считает прямоугольники).
- **Партия 2 (2026-09-06):** пепел в воздухе ночью (`drawWeather` — искры сносит ветром через экран, рисуются ДО тумана, иначе дальние светятся сквозь темноту; дым на тёмной земле не виден, поэтому основная масса светлая) и пыль из-под ног при рывке (`drawDust`). Рывок сим отдельным признаком не помечает — ловим скачок позиции между кадрами: обычный бег даёт единицы пикселей, телепорт — сотню.
- **Наземные эффекты ушли под героя (2026-09-06).** Владелец прислал скриншот: кольцо просвечивает сквозь спрайт. `drawFx` разделён на два слоя — кольца, круги зон и оседающие тела (`nova`, `spin`, `die`, `levelup`, `revive`) рисуются до сущностей, числа урона и искры попаданий — поверх.
- **Партия 3 (2026-09-06):** горящий враг оставляет после себя дым и угольки (новый вид эффекта `ash`, сим шлёт его из `killEnemy`, если враг умер в огне) — пламя больше не обрывается на смерти. Возрождение по Aegis получило второе кольцо вдогонку и сноп искр: раньше оно читалось как ещё один левелап. (Dire), снаряды врагов (осада) — трассер.

### T13.19 — Пиксельный стиль по умолчанию, препятствия на карте, дерево школ, разворот к цели (владелец 2026-09-06) ✅ срез 1 (a0.14.0)
- **Пиксель (решение: «как Dead Cells, детально»):** все 41 лист перерендерены `--pixel` в `public/art/sprites/dota_px/` (герой 64 px, крип 48, Рошан 80, деревья 96, Древний 128; Workbench + контур + палитра 48 без дизеринга; ~6 МБ), земля `dota_px/terrain` 256 px / 20 цветов, иконки предметов `items_px` (32×24) и умений `abilities_px` (32 px) с `image-rendering: pixelated`. Режим включён по умолчанию (`features/arcade/pixelMode.ts`, `?pixel=0` выключает): мир рисуется в буфер 1/2 и растягивается nearest, камера — по целым внутренним пикселям, чанки без сглаживания. Швы чанков на тропах: маска размытия теперь с запасом за край чанка. Открыто: тёмные SF/PA (`--light` уже поднят до 1.7/1.4 — проверить), тени/полоски HP по пиксельной сетке, пиксельный шрифт HUD.
- **Препятствия:** генерация карты вынесена в чистый `game/arcade/mapgen.ts` (общий для сима и рендера); деревья (ствол) и камни — круги коллизии в `ObstacleGrid` (сетка 256 px): герой, рывки, толчок Gust и обычные враги выталкиваются, боссы/структуры/неостановимые проходят; точки спавна врагов, лавки и руны выносятся из препятствий. Тесты `test/arcadeObstacles.test.ts`. Открыто: бот `sim:arcade` не обходит препятствия (Lina 37 → 17% при 12 прогонах) — нужен обход в политике бота, иначе калибровка врёт.
- **Дерево школ:** модификаторы (`requires`) предлагаются только после источника статуса той же школы: Inferno/Blast — после ауры/удара/кольца огня, Cold snap/Shatter — после укуса/осколков/поля холода, Overcharge/Mjollnir — после цепи/статики/хлопка; школьные легендарки — только при взятой школе. Тест `test/arcadeUpgradeTree.test.ts`. Дальше: сравнить с деревом богов Death Must Die (установлена в Steam) — веса по редкости и «раскрытие» новых веток после выбора.
- **Срез 1b (фидбэк владельца по живой игре):** «квадраты и полоски» на тропах — это отсутствие `ctx.filter` (Safari/webview): размытие маски троп теперь без фильтра (уменьшить-растянуть со сглаживанием), одинаково во всех движках; надписи (урон, SHOP, T1, $) в пиксельном режиме рисуются поверх буфера на полном разрешении, а не мылятся в нём; катапульта была чёрной — Workbench брал не ту текстуру (имя `…_color_vmat_g_tmasks`), теперь текстура цвета берётся по связи Base Color у Principled BSDF; пиксельные рендеры светлее (`--light` 1.25, exposure +0.25); земля 128 px / 14 цветов, тексель = 2 внутренних пикселя. Одинаковые предметы лавки **складываются** (каждый добавляет свой эффект) — теперь это видно: бейдж ×N в HUD, «у тебя ×N, эффекты сложатся» на карточке, подсказка в лавке.
- **Разворот к цели:** сим пишет `aimX/aimY/aimUntil` при каждом ударе/выстреле; спрайт смотрит в цель 0.45 с, ноги бегут по вводу (как в DMD). Снаряд и спрайт теперь в одну сторону.
- **Срез 2 (2026-09-06, владелец: «оставить пиксельным, но вдвое выше качество; SF мыльный; земля мутная»):** фактор пиксельного режима теперь **по плотности экрана** (`pixelMode.ts`): на Retina/телефоне (DPR ≥ 1.5) — 1 CSS px на арт-пиксель (= 2 физических, как у Death Must Die на 1080p), на обычном мониторе — 2; раньше фактор 2 на Retina давал 4 физических пикселя на арт-пиксель — отсюда «мыло». Под фактор 1 все 47 листов перерендерены с кадром ×2 в `public/art/sprites/dota_px2/` (герой 128, крип 96, Рошан 160, деревья 192, Древний 256; 22 МБ, грузятся лениво по герою/врагу; `dota_manifest_px2.tsv`), загрузчик: `dota_px2 → dota_px → dota`. **Shadow Fiend был чёрным силуэтом** — его color-текстура почти чёрная (в Dota он светится selfillum/spec): в `render_dota_sprites.py --pixel` добавлена автоэкспозиция текстуры (`--autoexpose 0.16 --expose-target 0.4`, гамма по среднему), SF/SF Arcana перерендерены в обоих наборах. **Земля** — `scripts/pixel_terrain.mts`: текстуры Dota → 128 px, 5 ступеней яркости с лестницей контраста и затемнением под тон карты (раньше 4-битный PNG рисовался ровной «мутью»); тексель = 2 внутренних пикселя при любом факторе (`texScale = 2·фактор`). Тесты `test/arcadePixelMode.test.ts`. ⬜ Дальше: `?pixel=1` на не-Retina как опция в настройках; перепроверить светлоту остальных тёмных моделей (PA, Axe, волк ~0.13 средней яркости листа).

### T13.18 — Легендарные апгрейды: тиры «как в Death Must Die» (владелец 2026-09-06: «разбить улучшения на тиры, чтобы выпадали мега-сильные пассивки») ✅ срез 1 (2026-09-06, a0.13.0) · ✅ партия 2: 12→18 легендарок (2026-09-06, a0.19.0) · ✅ редкость влияет на потолок ранга (2026-09-06, a0.22.0)
- **Потолок рангов от редкости (2026-09-06, a0.22.0).** Раньше редкость решала только «насколько сильнее ранг» (`rarity.mult`), а потолок у всех был один — `maxRank`. Теперь экзотический вариант поднимает потолок на ступень, арканный на две (`rarity.rankBonus`), потолок хранится в записи апгрейда и только растёт: взял редкий вариант однажды — дальше докачиваешь и обычными. Легендарок не касается (они одноразовые, но приходят с редкостью arcana — без исключения одна легендарка бралась бы трижды). В карточке показывается свой потолок и приписка «потолок +N», иначе «ранг 4 из 3» читается как баг. Тесты в `test/arcadeUpgradeTree.test.ts`.
- **Партия 2 (2026-09-06, a0.19.0).** У «Зверинца» легендарок не было вовсе, а на три остальные школы приходилось шесть нейтральных. Добавлены: Бабочка (четверть вражеских ударов мимо + скорость атаки), Лунный осколок (+55% скорости атаки), Лотос (полученный урон возвращается всем вокруг, не чаще раза в 0.5 с — иначе в толпе герой чистит волну, ничего не делая), Кровавик (урон умениями лечит), Вожак стаи (звери бьют вдвое сильнее), Псарня (по зверю сверх каждого уже призванного вида — она не даёт зверя с нуля).
- **Иконки берём только из локального зеркала** `public/art/items_px`: Moon Shard, Lotus Orb и Helm of the Overlord там нет, поэтому взяты близкие по смыслу (Mask of Madness, Linken's Sphere, Helm of the Dominator) — иначе офлайн-режим полез бы в CDN.
- **Модель:** к четырём редкостям обычных апгрейдов (standard/refined/exotic/arcana — множитель силы ранга) добавлен слой **легендарных** (`UpgradeDef.legendary`, один ранг, своя иконка-предмет, `neutral` — без привязки к школе). Предлагаются с 8-го уровня с шансом 4% + 1.2%/мин (потолок 22%) и **гарантированно на 12/18/24 уровнях**; в обычный пул не попадают; карточка с золотым свечением и подписью «Легендарное · один раз за забег».
- **Срез 1 (12):** нейтральные — Сердце Тарраска (+40% HP, +12 реген), Октариновое ядро (−25% кд), Refresher (ульт вдвое короче), BKB (треть ударов мимо), Дедал (+25% крит, +0.7 множитель), Satanic (+25% вампиризм); Radiance — Полуденное солнце (огонь ×1.75), Феникс (одно возрождение как Aegis); Skadi — Ледник (вмороженные ×2 урона), Лавина (масс-заморозка каждые 8 с); Maelstrom — Громовержец (+4 цели цепи, ×1.5 молнии), Перегрузка (+35% скорость атаки, +10% бег). Иконки — зеркало `gen:art` (greater_crit, satanic, mjollnir, shivas_guard добавлены). Тесты `test/arcadeLegendary.test.ts`.
- **Дальше:** легендарки на героя (усиление сигнатуры: «Requiem без потери душ», «Blade Fury отражает снаряды»), редкость обычного апгрейда поднимает потолок ранга (arcana — 4/3), баланс шансов по `sim:arcade` в полном акте.
- **Экипировка (T13.14, вопрос владельца «мало тиров»):** сейчас 4 редкости × 3 тира по минуте забега (`rollGear`), уникальные с боссов; план — 5-я редкость `immortal` с боссов Immortal-рангов и наборы (сет-бонусы 2/4 предмета), после калибровки аффиксов.

### T13.17 — Полная звуковая картина и музыка из Dota (владелец 2026-09-06: «все возможные звуки — мобы, их удары, наши удары, эффекты; чтобы не было гробовой тишины и одной фразы героя посреди неё») ✅ срез 1 (2026-09-06)
- **Пакет** `scripts/dota_sfx_pack.py` → `public/art/sfx/dota/pack/` (201 клип, 2.9 МБ, AAC/MP3) + `index.json`: **умения** каждого героя по кнопкам Q/W/E/R (94 клипа: Shadowraze, Requiem, Blink, Laguna, Chronosphere…), **враги** — удар по герою (кнут кобольда, тяжёлый взмах огра, топот кентавра, удары Рошана), смерть по виду (`misc/creep_deaths`: кобольды, тролли, сатиры, огры, гарпии/вайлдкины, големы, фурболги, кентавры), рык Рошана; **UI** — уровень, покупка, руна, подбор Aegis, монеты; **эффекты** — крит-брызги, Radiance-петля, ледяной взрыв, дуга.
- **Диспетчер** `features/arcade/soundscape.ts`: события берутся из сима (`events.castQ/W/E/R`, `events.hurtBy` — вид ударившего врага, лента `fx` «die» с видом и позицией), затухание по расстоянию до героя (700 px), лимиты частоты по категориям, петля Radiance пока школа взята, рык и грунты Рошана пока жив. Синтетика осталась фолбэком, когда пакет не загрузился. **Музыка** `music.ts`: три боевые темы Dota по кругу с кроссфейдом, тема Рошана пока он жив, тишина на паузе/после конца; HTMLAudio (стрим), уважает общий тумблер звука.
- **Срез 2 (2026-09-06):** ползунки громкости в Настройках — эффекты / музыка / реплики (`useVolumeSetting`, persist `aegis-draft.volume.*`; эффекты масштабируют master, реплики идут через свою шину, музыка читает громкость на лету). Панель `?sfxdebug=1` в забеге: состояние AudioContext, кэш сэмплов, последние попытки (played/pending/failed/suspended) и кнопка самопроверки — для отладки «звука нет» на машине владельца; сэмпл, который не декодировался, теперь падает на синтетику, а не в тишину. Текст Thunderclap стал героенезависимым («каст Q или R»).
- **Срез 3 (2026-09-06, владелец: «у Anti-Mage женская озвучка»):** в папках `sounds/vo/<hero>` вместе с базовой озвучкой лежат персоны и арканы (amp_wei у Anti-Mage, jung_axe/auto_axe у Axe, kidvoker у Invoker, mira_per у Mirana, pa_asan у PA, helmet_snip у Sniper, zeus_mars у Zeus, auto_bristle у Bristleback), и по алфавиту они шли первыми. Теперь у каждого героя задан префикс базовой озвучки (`HEROES` в `dota_voice.sh`), реплики перевыгружены. **Персоны как косметика (T13.12 этап 3):** Wei у Anti-Mage, Jungle Axe, Acolyte Invoker, персона Mirana — это модель + озвучка, ложатся в ту же схему «альтернативный лист + альтернативный набор реплик» (`<hero>@wei`).
- **Дальше:** звуки школьных проков (Ring of fire, Chain lightning из `fx.fireRing/chain` — нужен отдельный fx-маркер в симе, чтобы не дублировать касты), взмахи мобов до удара (`shared/whoosh`), шаги Рошана, громкость сэмплов/музыки отдельными ползунками в настройках, проверка в TMA.

### T13.14 — Инвентарь предметов как в Death Must Die (фидбэк владельца 2026-09-06) ✅ срез 1 (2026-09-06, a0.10.0) · ✅ партия 2: 22→34 базы, 3→6 уникальных (2026-09-06, a0.19.0) · ✅ баланс аффиксов (2026-09-06, a0.23.0)
- **Баланс аффиксов (2026-09-06, a0.23.0).** Редкость экипировки почти ничего не решала: арканный предмет отличался от экзотического только множителем значений (1.2 → 1.45 — вчетверо мельче, чем разброс улучшений школ 1 / 1.35 / 1.8 / 2.4), число аффиксов у обоих было три, а `goldPerKill` катался в диапазоне [1, 1] — все кольца выходили одинаковыми. Теперь: аркана даёт четвёртый аффикс (и в каждом пуле слота стало по четыре опциональных — при трёх арканный предмет забирал весь пул и все арканы слота были близнецами), множители 1 / 1.15 / 1.35 / 1.7 (положе, чем у улучшений: экипировка живёт между забегами), `goldPerKill` [1, 3]. Тест в `test/arcadeGear.test.ts` держит и число аффиксов по редкости, и разброс значений.
- **Партия 2 (2026-09-06, a0.19.0).** На слот приходилось 3–4 базы, и лут повторялся уже к третьему забегу: добавлены 12 баз (Mind Breaker, Paladin Sword, Battle Fury, Spell Prism, Apex, Pipe of Insight, Titan Sliver, Guardian Greaves, Faded Broach, Trickster Cloak, Pupil's Gift, Vambrace) и три уникальных (Divine Rapier, Manta Style, Giant's Ring). Уникальные **роняет второй и следующие боссы** — раньше там падал обычный exotic, а первый босс всегда отдаёт Аегис, так что новым предметам просто неоткуда было выпасть.
- **Тест держит контент в согласии:** у каждой базы и уникального обязана быть иконка в локальном зеркале `public/art/items_px` (иначе офлайн полезет в CDN) и строки в RU и EN; на каждом слоте обязана быть база первого тира, иначе ранний лут не соберётся.
- **Запрос:** предметы падают по ходу забега, есть слоты экипировки и инвентарь между забегами.
- **План:** дроп с элиты/боссов/сундуков (сундук = редкий объект на карте) — предмет со слотом (оружие, шлем, доспех, сапоги, амулет, кольцо), редкостью и 1–3 аффиксами из пула слота (как у референса: гарантированный + опциональные); поднял — экипируется автоматически, если слот пуст, иначе сравнение «до/после» с заменой; **инвентарь между забегами** (local-first) — экип перед стартом, разбор в осколки Aegis; уникальные предметы с именем от боссов (Рошан, Tormentor, Древний). Это меняет принцип «без постоянных +статов» для Аркады — как у референса, прогрессия через экипировку; дейлик играется с нормализованным (пустым) экипом ради сравнимости. Существующая лавка (T13.8) остаётся источником покупок в забеге; нейтральный слот — отдельным.
- **Deps:** T13.13 (иконки/арт предметов), решение владельца по PRD §5.10 для Аркады.
- **Сделано (срез 1):** `content/gear.ts` — 6 слотов (оружие/шлем/доспех/сапоги/амулет/кольцо), 22 базы (настоящие предметы Dota, иконки в зеркале), редкость → число аффиксов (1/2/3/3, arcana ×1.45 значения), тир 1–3 по минуте (7:00/14:00), пул аффиксов по слоту: гарантированный + опциональные; три уникальных с боссов (Aegis of the Immortal — воскрешение на старте; Tormentor's Shard; Heart of the Ancient). Источники: сундук с 1:00 каждые 150 с, элита всегда, боссы всегда, обычные — 0.4%. Подбор ставит мир на паузу: экран сравнения «найдено / надето» с силой (`gearScore`) и аффиксами, действия надеть / в сумку (12) / оставить — коды `act`, реплей воспроизводит (код реплея несёт экипировку старта, 8-е поле). Стор: инвентарь между забегами (`aegis-draft.arcade.gear`, кап 80 с авто-разбором старых standard), панель экипировки на настройке (слоты → список по слоту, надеть/снять/разобрать в осколки Aegis), добыча остаётся и при смерти (как у референса), результат показывает добычу, HUD — слоты и сумка. Дейлик — без экипировки. Решение по PRD §5.10: для Аркады прогрессия через экипировку — норма жанра (владелец подтвердил «как в DMD»). Бот берёт лучшее по силе; полный акт у бота с добычей 33% (было 21%).

### T13.12 — Косметика героев: сеты как в Dota (идея владельца 2026-09-05) ✅ срезы 1–2 (2026-09-05) · ⬜ сеты на героя
- **Этап 3, срез 1 (2026-09-06) — скины:** слот `skin` в косметике с привязкой к герою: **Shadow Fiend Arcana** («Пожиратель демонов»: `shadow_fiend_arcana` + крылья/руки/голова/плечи), **Juggernaut Arcana** (`juggernaut_arcana` + базовые части), **Anti-Mage · персона Вэй** (`antimage_female` + одежда/волосы/оружие) — листы `dota_px/<hero>@<skin>` тем же конвейером, озвучка `voice/<hero>@<skin>` (префиксы `nev_arc_`, `jug_arc_`, `amp_wei_`; фильтр «_arc_» снимается для аркан). Рендерер берёт лист скина с падением на базовый, реплики — по скину (`skinnedHero`). В настройке забега показываются скины только текущего героя; выпадают из общего пула редкостей, покупаются за осколки. Дальше: Persona Invoker (kidvoker), сеты через `models/items/<hero>/<set>/`, иконка скина в карточке.
- **План этапа 3 (владелец 2026-09-06: «арканы и сеты, как в Dota»):** косметика = **альтернативный спрайт-лист героя**. Модели аркан/сетов лежат в vpk рядом с базовыми (`models/items/<hero>/<set>/...`, арканы — `models/items/<hero>/<arcana>/`), скелет тот же — конвейер уже умеет пришивать части по костям, значит строка манифеста `shadow_fiend@arcana` = тело + части арканы вместо базовых → `dota/shadow_fiend@arcana.{png,json}`; рендерер выбирает лист по надетой косметике (`dotaSheet(`${hero}@${cosmetic}`) ?? dotaSheet(hero)`), звуки арканы — той же схемой из `sounds/weapons/hero/<hero>/arcana_*`. Реестр `cosmetics.ts` получает слот `skin` с привязкой к герою; дроп — с боссов/за прохождение акта героем (как сейчас), редкость `arcana` — только с Immortal-рангов. Числа не трогает. Объём: первый — Shadow Fiend Arcana (Demon Eater) + один сет Juggernaut; дальше по запросу.
- **Цель:** выбивать косметику за прохождения и надевать на героя — как сеты в Dota. В 2D без арта сетов косметика = **рамка медальона** (материал/форма), **цвет и форма VFX** (трейл клинков Blade Fury, оттенок молний/огня/льда), **эффект смерти врагов** и **портретный фрейм** на экране настройки/итога. Дроп — по итогу забега (ранг сложности × победа/Рошан), редкости те же `standard…arcana`, дубли → осколки Aegis.
- **Файлы:** `game/arcade/content/cosmetics.ts` (реестр), `state/arcadeStore.ts` (инвентарь/экип, local-first), вкладка Arcade в Штабе (§5.10.1), рендерер читает экип через `PlayerStats`-подобный `Cosmetics`.
- **Границы:** косметика **не меняет числа** (принцип §5.10: без постоянных +статов); в input-лог/сид не входит.
- **Deps:** T13.5 (Штаб/карьера), T13.7 (ранги — источник дропа).
- **Сделано (срез 1):** `content/cosmetics.ts` — 14 предметов в 4 слотах (рамка медальона ×4, трейл ×4, эффект смерти врагов ×3, оттенок эффектов героя ×3) с редкостями `standard…arcana`; дроп по итогу забега детерминирован сидом и исходом (1 бросок + Рошан + победа; редкость растёт с рангом; реплей и забег < 1 мин дропа не дают), дубликат → осколки Aegis (5/12/30/80). Стор: `cosmetics` (`aegis-draft.arcade.cosmetics`, local-first) с экипом по слотам; экран настройки — панель экипа, итог — «Выпало за забег», Штаб — плитка коллекции. Рендер читает экип напрямую (`setCosmetics`), сим о косметике не знает — ни одно число не меняется. Срез 2: осколки тратятся — любой ещё не выпавший предмет покупается прямо в панели экипа по цене редкости (20/50/120/320 = 4–6 дублей своей редкости), пунктирные кнопки рядом с экипом. Сеты на конкретного героя — после появления арта.

### T13.10 — Juice, звук, тач/TMA ✅ срез (2026-09-05) · ⬜ музыка-луп, проверка в реальном TMA
- **Цель:** hit-stop, вспышки урона, тряска на ульте/боссе, лут-звуки из слоя R15.5, луп-музыка; проверка на `mobile`-пресете и в Telegram Mini App (джойстик, кнопки способностей).
- **Скиллы:** `game-feel-juice`, `frontend-architecture`.
- **DoD:** motion-бюджет design-language соблюдён; на среднем Android ≥ 45 fps при 300 сущностях, иначе — включение Pixi-чанка (решение по профилю, не заранее).
- **Сделано:** сим ведёт монотонные счётчики событий (`events`: удары/криты/касты/ульты/урон/убийства/элита/подбор) — экран берёт дельту между кадрами и играет процедурные SFX слоя R15.5 (`sfxArcade`, троттлинг на вид, питч удара «плавает»); hit-stop на смерть элиты/босса (6 кадров, только в цикле экрана — детерминизм не трогается; уважает reduced-motion); вспышка по краям при уроне и пульс при HP < 30% (`data-hurt`/`data-lowhp`, токены); кольцо смерти врага в рендере. Тач: джойстик + кнопки способностей проверены headless на Pixel 5 (игрок едет, HUD не перекрывается). Замер fps на Android живьём не делался.

### T13.11 — Дейлик Arcade и шаринг реплея ✅ (2026-09-05)
- **Цель:** общий сид дня по §5.14 (local-first), ссылка на забег = `seed + сжатый input-лог` (реплей проигрывается симом без сервера); серверный лидерборд — только после решения про ре-симуляцию (Go-порт real-time сима не делаем).
- **DoD:** реплей по ссылке даёт тот же итог бит-в-бит; запись дейлика узнаваема в карьере.
- **Сделано:** `game/arcade/replay.ts` — код реплея `A1~seed~hero~rank~act~ver~log` (лог пакуется байтами: varint дельты шага + 5 байт; 38 с забега = 66 символов), `decodeReplay` принимает и ссылку `#arcade=…`; просмотр реплея — тот же экран, ввод берётся из лога (`replayLog` в сторе, HUD «REPLAY», в историю не пишется); на итоге — «Скопировать реплей» / «Скопировать ссылку» / «Смотреть реплей»; на экране настройки — поле кода и авто-подхват ссылки. Дейлик: `arcade-daily-YYYY-MM-DD` по UTC, герой дня из хеша даты, полный акт на Herald, карточка с результатом дня. Шишка: версия баланса содержит точки — разделитель по точкам ломал код (тест использовал версию без точек), теперь `~` с экранированием в сиде и тест на реальную версию. Headless-QA: реплей на том же тике даёт ту же позицию игрока.

## Открытые вопросы (из PRD §10, решить по ходу)
- **A. Решено.** Mixed Draft — свободный порядок незаполненных ролей; support ×2 взаимозаменяемы.
- **B.** Калибровка Peak `v1.1.0`: стартовые 120 дней / `N_min=15` проверить на полном датасете; изменение требует новой `ratingModelVersion`.
- **C.** Калибровка OVR/Peak/Team-Success текущей `v1.2.0` на полном датасете; изменение формулы требует новой `ratingModelVersion`.
- **D.** Атрибуция Liquipedia/OpenDota в UI.
- **E. Пересмотрено 2026-07-27.** Структура забега — конечный сезон `5 актов × 5 этапов` (гипотеза; A/B `20/25/30` — за `R10`), пороги только из реальных placement-бакетов, один босс на финал акта. Точная кривая поля, odds и цены — `R10`.
- **I. Открыт 2026-07-27.** Два обязательных чемпионства (Stage 20 и 25) означают, что забег из 25 турниров теряется на одной неудачной сетке. Ответить измерением (`R6.4`/`R10`): финал `1-е` или `топ-2` + чемпионство как бонус; нужен ли один защитный ресурс на сезон. Заранее не добавлять.
- **F. Частично решено 2026-07-22, число слотов пересмотрено 2026-08-02.** Каркас — 5 общих пассивных слотов Tactics/Items + 2 слота Camp Actions; первый набор-кандидат зафиксирован в PRD §5.10.3. Следующий balance spec должен проверить коэффициенты, caps/stacking, размер Playbook и полный набор Camp Actions уже с новым потолком билда.
