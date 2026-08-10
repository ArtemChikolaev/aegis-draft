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

### T3.9 — Экран итога + шеринг 🟨
- **Файлы:** `web/src/ui/ResultScreen.tsx`.
- **DoD:** итог с разбивкой и назначением героев ✅; **шеринг-ссылка по сиду ✅** — закрыта в T3.12 (кнопка «Скопировать ссылку» на терминальном экране, кодек `state/runLink.ts`). Осталась только «Save as image».
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
- ⬜ **Осталось:** «Save as image» из T3.9 — отдельная механика шеринга, к URL отношения не имеет.
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
- ✅ **T4.1 Форматы `last_1y/2y/5y/valve_legacy` (фильтры + пулы).** Правило назначения окон выведено из даты сборки (`pipeline/internal/formats/Assign` — источник истины + тесты; зеркало в `web/scripts/gen_mock.mjs`). Мок расширен до 6 событий / 7 команд / 4 лет — каждый формат имеет ≥5 команд (Mixed играбелен), все 4 формата в `manifest.formats`. Убран хак «Aegis Mock Five» и ручные `events[].formats`. ⬜ Wiring `Assign` в реальный emit — в M2.5/S4.
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
- 🟨 **S4 — сборка `Dataset` + emit + live-run**. Ассемблер `domain.Build` (events+teamSuccess+players+packs + pass-through heroStats/teammates/squadSynergy + eventHeroStats из appearances + heroes через `/heroes`), клиент `FetchHeroes`, отбор состава пака по ролям (инвариант validate), CLI-флаг `--emit-domain` (+`--as-of`), сквозная `validate.Dataset`. ✅ **Живой smoke прошёл**: 40 матчей → 1 событие (EWC 2026), 24 пака с реальными командами/никами/ролями/OVR, 120 игроков, 127 героев, JSON Schema зелёная. ⬜ Осталось: полноценный бюджетный `--collect-window` прогон на большом окне + wiring деплоя на реальные данные (scheduled refresh вместо `gen:mock`; сейчас `web/public/data` gitignored и CI строит мок). **Deps:** S1–S3.

### TDATA1 — Мульти-эвентный tier-1 датасет: peers/hero-коллекторы + окна (P1) 🟨
> Заведено из алгоритмического аудита 2026-07-12 ([audits/2026-07-12-322-0-scoring-algorithm.md](audits/2026-07-12-322-0-scoring-algorithm.md)). Оживляет Chemistry и углубляет Hero Synergy на реальных данных.
- ✅ **Инкремент 1 — источник пожизненной химии `/players/{id}/peers`.** `opendota.Peer` + `Client.FetchPlayerPeers` (кэш/ретраи/бюджет через общий transport); `aggregate.MergePeers` апсертит пожизненные `with_games/with_win` в `squadSynergy`+`teammates`, только внутри pro-вселенной (pub-тиммейты отсечены), с приоритетом пожизненных тоталов над оконным счётом. Форма контракта не изменена. Юнит-тесты: кросс-командная пара создаётся, оконный счёт перекрывается, out-of-universe/self/zero-игр игнор, symmetry + `Validate` зелёные, gofmt/vet/build/test чисты. Вынесены хелперы `squadSlice`/`teammateSet`/`emitTeammates` (убрано дублирование в `FromOpenDota`).
- ✅ **Инкремент 2 — сбор peers + wiring.** Resumable `/peers`-сбор для всей pro-вселенной (`known` = аккаунты снапшота) в `pipeline.Run` тем же budget-паттерном, что career heroes; `MergePeers` вызывается до `aggregate.Validate`, merged `squadSynergy`/`teammates` прокидываются через `domain.Build`. `CollectionStatus` дополнен `peersTargetPlayers/peersPlayersComplete/peersComplete` + progress-лог. **Живой smoke (Free Tier, 5 матчей, budget 300):** `peers=50/50 (complete=true)`, emit domain зелёный, JSON Schema ок; `squadSynergy` вырос до **539 пар** с пожизненными co-games (топ-пара 2056 игр, wr 0.60; 368 пар >20 игр) — кросс-командная Chemistry структурно ожила.
- ✅ **Инкремент 2b — tier-1 фильтр дискавери (exclude-based + порог).** Решение 2026-07-12: OpenDota-тир `premium` слишком узкий (214 лиг; EWC/DreamLeague/OGA PIT/EPICENTER помечены `professional`), поэтому пакет `internal/tier1` классифицирует **tier-1 = premium ∪ (professional − шум)** (шум = квалы/дивизионы/регионалки/минорки/бегиннеры), а `domain.BuildEvents` отбрасывает события с `< min-event-matches` (CLI, дефолт 8) — гасит мелкий шум/недосбор. `collect.OpenDotaWindow` фильтрует дискавери по set'у tier-1 лиг (пагинация/граница окна не зависят от фильтра). **Живой smoke:** фильтр 2440 лиг, EWC (professional) проходит, events=1, JSON Schema ✅. Проверено, что покрытие ловит DreamLeague S19/23/24, OGA PIT, WePlay, EPICENTER, ESL One, Wallachia. Юнит-тесты `tier1`/`collect`.
- ✅ **Инкремент 2c — tier-1 фильтр: exclude→include (реальный датасет).** Обновление 2026-07-12: на реальном сборе exclude-based (`professional − шум`) пропустил ~46 tier-2/3 (Snake Trophy, CCT, BetBoom Streamers Battle, кубки Сбера, регионалки) при 64 «событиях». Заменено на **include-реестр реальных tier-1 серий** (`tier1Series`: TI/EWC/DreamLeague/ESL One/PGL Wallachia/BLAST Slam/FISSURE/Riyadh/Games of the Future/Elite League/Snow-Ruyi/OGA PIT/DPC Major) + `tier1Exclude` (квалы/дивизионы): tier-1 = premium ∪ (professional, совпавший с реестром). На live-именах: **оставляет 18 настоящих, выкидывает 46 мусорных**. Заодно `event.Type` перекладывает на престиж (**TI→`ti`, Major→`major`, остальное→`tier1`**) — `tier2` больше не эмитим. teamSuccess-престиж не тронут (весит по tier лиги напрямую). Тесты на junk/real кейсы ([57e8d6d], [91c85c2]).
- ✅ **Инкремент 2d — обогащение только для pack-игроков.** career/peers тянем не по всему окну (~1500), а только по аккаунтам, реально попадающим в паки (топ-5 составов на событиях) — полное окно не влезает в дневной бюджет, а непаковые в датасет не входят. Пул паков зависит лишь от ролей и числа игр (не от career/peers), поэтому `domain.PackPlayerAccounts` считает его из снапшота до сетевого обогащения; `known`-фильтр peers сужен до пула (химия нужна между будущими тиммейтами). Вынесены `buildLineups`/`selectRoster` (общий путь отбора с `BuildPacks`). Тест `TestPackPlayerIDs` ([17357d1]).
- 🟨 **Инкремент 3 — окна + valve_legacy.** ✅ `valve_legacy` флаг: `tier1.IsValveLegacy` = все The International (по имени) + курируемый набор Valve/DPC Major id; `BuildEvents` проставляет формат через `formats.Assign`. ✅ Скользящие `1y/2y/5y` уже вложенно даёт `formats.Assign` из одного широкого сбора. ⬜ Осталось: **all-time сбор valve_legacy** (старые TI/Major вне rolling-окна нужно тянуть по league_id, а не по времени) + операционный `--collect-window` прогон. **Deps:** T1.2, T4.3.

### TDATA2 — Полноценный сбор: 1y/2y/5y + все TI/Major, career-глубина, деление по режимам ⬜
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

### TDATA3 — Качество пула: стаки и слабые розыгрыши попадают в паки 🟨 (плейтест 2026-08-05)
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
- **Осталось:** `Games of the Future 2025` теперь событие без единого пака в `events.json` —
  мёртвые метаданные, никто их не перечисляет.

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

**Скиллы:** `external-data-etl`, `data-contract`, `scoring-model`. **Deps:** нет.

## M5 — Полный Roguelite Run
### T5.1 — Stage engine + win/loss ✅
- **Цель:** результат Classic draft провести через воспроизводимый турнирный цикл: 18-team field → две группы → double-elimination playoffs → Grand Final → итоговое место.
- **Файлы:** новый слой orchestration в `web/src/game/` поверх существующего `RunEngine`; UI этапа/результата; тесты.
- **Скиллы:** `discovery-before-code`, `plan-first-communication`, `scoring-model`, `reference-parity-audit`.
- **DoD:** ✅ отдельный чистый `TournamentEngine`; state machine `field → groups → playoffs → final → complete` без перескоков; 2×9 BO2, маршруты 4 UB / 4 LB / 1 out, полная сетка и BO5 Grand Final; каждая из 18 команд получает ровно одно место; seed воспроизводит весь run; шаг турнира сохраняется и replay-ится. Инварианты — `web/scripts/verify_tournament.ts`.
- **Deps:** T3.10–T3.13, M2.

### TREF-TOUR1 — Parity турнирного цикла с 322-0 🟨
> Из аудита [audits/2026-07-12-tournament-cycle-parity.md](audits/2026-07-12-tournament-cycle-parity.md) (живые проходы 322-0). Codex-реализация считала турнир мгновенно и против реальных команд. Статус на 2026-07-12 (правки в рабочем дереве, ждут коммита/деплоя пользователем).
- ✅ **Фэнтези-боты**: соперники Classic — рандомные бот-команды (имена из seed, сила из OVR-распределения), не реальные ростеры; реальные команды остаются для режима Real Tournament (`game/tournament.ts`).
- ✅ **Result → турнир**: убраны «New run» и preview-поле с итога драфта; основная кнопка «Start tournament» → турнир; seed и неинформативная подпись заменены (`features/result/*`).
- ✅ **Field-этап**: подсветка своей команды заливкой без скруглений (без «YOUR TEAM»-тега), выравнивание колонки силы, «Projected finish» → пояснение про прогноз места; кнопка «Draw the groups» → «К групповому этапу».
- ✅ **Сетка**: секции Upper/Lower, **Grand Final в верхнем ряду**, колонки равной ширины во всю ширину с древовидным центрированием (space-around) и коннекторами; своя команда в зелёной рамке, лого-бейджи, победитель ярко/проигравший приглушён.
- ✅ **Консолидированный итог (как 322-0)**: убраны отдельные экраны Grand Final и «complete»; стадии `field → groups → playoffs`, где **playoffs — терминальный экран**: место + чемпион + сетка + итоговая таблица + твой состав (роли/ники/герои + Base/Hero Synergy/Chemistry/Team OVR). `verify_tournament` обновлён (3 стадии).
- ✅ **P0 — live-симуляция как процесс**: движок считает результат детерминированно, а UI **проигрывает** его прогрессивным reveal (презентационный слой, движок чистый). Группа: BO2-матчи падают в фид по одному (A/B чередуются), standings наполняются live, route (upper/lower/out) открывается по завершении группы. Плей-офф: серии раскрываются пораундово в зависимостном порядке до Grand Final; чемпион/итоговая таблица/твой состав скрыты до конца сетки. Индикатор **LIVE** + **Skip** прыгают к финалу; переход к след. стадии заблокирован до доигрывания/Skip. Reveal эфемерный (не в persist), сбрасывается по смене стадии, prefers-reduced-motion. **Файлы:** `features/tournament/{TournamentScreen.tsx,tournament.css}`, `i18n/core.ts` ([6df86ab]).
- ⬜ **P1 — полировка сетки под 322-0**: полные elbow-коннекторы (вертикальные соединения пар матчей), если текущего space-around-центрирования мало; групповая таблица — «кто кого» по картам.
- **DoD:** группа/сетка/standings раскрываются как процесс (LIVE+Skip) ✅, детерминизм сохранён ✅; parity-матрица с 322-0 закрыта (остаётся P1-полировка коннекторов).

### TREF-TOUR2 — Seamless Classic run flow (бесшовный забег) 🟨
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

### T5.2 — Награды, валюта и Camp/Market 🟨
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

### T5.4 — Mode shell: Classic / Manager / Real Tournament 🟨
- **Цель:** вынести верхнеуровневый режим отдельно от `DraftStyle`; Classic сохраняет Team Packs/Mixed, остальные режимы подключают собственные конфиги и orchestration.
- **Файлы:** `web/src/game/`, `web/src/state/`, start UI; при добавлении DTO — сначала `schema/`.
- **DoD:** выбранный режим входит в seed/share state; недоступные режимы честно помечены SOON; переключение не теряет совместимые настройки Classic.
- **Deps:** T5.1.
- **Статус 2026-07-11:** ✅ отдельная стильная развилка режимов и собственные landing-состояния; Classic ведёт в рабочую конфигурацию, Manager/Tournament — в локализованные продуктовые заглушки. ⬜ Осталось включить mode в seed/share state после появления исполняемых orchestration-модулей; намеренно не добавляем неработающие значения в текущий `RunConfig`.
  - ✅ Контекст выбранного режима хранится отдельно от конкретного run: завершение или подтверждённый выход без сохранения сбрасывают движок, но возвращают в конфигурацию Classic, а не на общую развилку.

### T5.5 — Esports Manager vertical slice ⬜
- **BA-сценарий (2026-07-12):** [docs/modes-scenarios.md §1](modes-scenarios.md) — питч, экономика (цены/зарплаты), дивизионы, идеи-улучшения, MVP-срез. **Открытые решения** (к согласованию до кода): M-A длина сейва, M-B пул игроков, M-C зарплаты в MVP, M-D онлайн vs локальный сейв.
- **Цель:** выбор организации/региона → бюджет и контракты → ростер → квалификация.
- **DoD:** минимум 3 региона и разные стартовые ограничения; контракты имеют цену/срок; невозможно выйти за бюджет; сезон детерминирован по seed. Это отдельный цикл, а не reskin Classic.
- **Данные:** цена/зарплата игрока **синтезируются** из OVR/престижа/окна (детерминированно, версия `economyModelVersion`) — **не** Liquipedia-salaries (их нет). Сейв — сервер по ADR 0002.
- **Deps:** T5.2, T5.4. (Liquipedia-контракты **не** нужны — цены производные от нашей рейтинг-модели.)

### T5.6 — Real Tournament + roster lock ⬜
- **BA-сценарий (2026-07-12):** [docs/modes-scenarios.md §2](modes-scenarios.md) — поле = реальные `packs` события (roster lock по `accountId`), challenger из легенд/ветеранов, реюз `TournamentEngine` (opponentPool = реальные паки вместо ботов). **Открытые решения:** RT-A snapshot по seed vs выбор ивента, RT-B кросс-эра рейтинг, RT-C размер challenger-пула.
- **Цель:** выбрать реальный tournament snapshot, показать известных соперников и собрать challenger roster только из игроков, не заявленных за поле турнира.
- **Данные:** реальные ростеры поля **уже есть** в `packs` (пак = топ-5 состав команды на событии) → жёсткой зависимости от Liquipedia нет; реальные placements/исход отложены → поле **симулируем** движком, а не реплеим (проговорить в UI). locked canonical `accountId`, historical eligible pool.
- **DoD:** 16–20 фиксированных соперников; locked player никогда не появляется в pack/market пользователя; nickname collision не влияет на lock; historical rating берётся из своей эпохи; seed+dataset version воспроизводят поле и пул; генератор fail-fast при невалидном ролевом пуле.
- **Deps:** T5.1, T5.4, M4 historical windows. (T1.3/Liquipedia — опционально, только для реальных placements «как было».)

### T5.7 — Roguelite Run: режим + ante-петля 🟨
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

### T5.8 — Endless Dynasty loop ⬜
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

#### R5.3 — Цена формы и карточка 🟨 (P1; trade-in и происхождение сделаны 2026-07-27)
- **Цель:** цена зависит от внутренней силы формы, не от этапа; `playerCost(ovr)` — основа, но требует пере-калибровки (сегодня игрок 95 стоит подозрительно дёшево для длинного забега). Для same-player апгрейда — trade-in: `upgradeCost = max(minimumUpgradeCost, incomingFormCost − floor(currentFormCost · tradeInRate))`.
- **UI:** карточка объясняет **происхождение** формы (команда · событие · год), а не только итоговый OVR; показывает `до → после` по слагаемым и явное правило по Chemistry/герою.
- ✅ **Trade-in и происхождение формы сделаны 2026-07-27.** `formUpgradeCost(incoming, current) = max(minCost, playerCost(incoming) − floor(playerCost(current) · tradeInRate))`: за человека уже заплачено, иначе апгрейд формы всегда проигрывал покупке нового игрока той же силы. Карточка показывает событие исходной формы и её OVR.
- ⬜ **Осталось:** пере-калибровка `playerCost` под длинный сезон (сегодня игрок 95 стоит подозрительно дёшево) и полноценная карточка `до → после` по всем слагаемым с командой/годом — после `R10`.
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
- ⬜ **Не покрыто (систем ещё нет):** Tournament Power (`R8.2`), Stakes (`T6.4`), Династия (`T5.8`), Cheat Mode как исключённый профиль (он и так не влияет на баланс — золото бесконечно по определению).
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
- ⬜ **Не входило:** тир у карточек Tactics (у них своя модель эффекта) и улучшение тира предмета за
  золото — сегодня тир приходит только дропом. Пере-калибровка самих чисел — `R10`.
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

### R11.7 — Теги героев не видны в UI 🟨 (плейтест 2026-07-28)
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

### R12 — Плейтест 2026-07-30: рынок героев, качество пассивок, мёртвые боссы, потолок Династии 🟨
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
  ⬜ **Осталось открытым:** `chemistryBlackout` остаётся безусловным (2% выполнено). Сделать его
  условием (например «Chemistry не работает СВЕРХ порога») — отдельное продуктовое решение, не
  калибровка; сейчас он честно читается как «снятие рычага» и предупреждается разведкой.
- 🟨 **R12.6 — потолок билда наступает к этапу ~22 (вход в Династию). Спека согласована
  2026-08-09 — [roguelite-lategame-spec.md](roguelite-lategame-spec.md); реализация ⬜.**
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
  - ⬜ **LG3 — мутаторы круга Династии (= Stakes):** правило на круг, объявляется заранее,
    выбор по seed+кругу; v1-набор из 4 data-driven определений; позже те же определения — как
    добровольные стартовые Stakes в `Special rules` (отдельная задача после обкатки).
  - ⬜ **LG2 — шестой слот тактик за перманентный минус** (−Base до конца забега), одноразовый
    оффер позднего лагеря; `tacticSlots` — поле состояния экономики.
  - ⬜ **LG4 — вторая Edition** — гейт: только после живого плейтеста Charged.
  Метрики приёмки и риски (пере-подбор сидов на обоих датасетах, bump версии на каждую механику,
  UI внутри существующих панелей) — в спеке.
- ⬜ **R12.7 — качество данных тегов.** Жалоба: «tuskar — это pickoff, а shadow shaman — нет; теги
  героев не пересекаются».
  Часть про «не пересекаются» — не баг данных: в Буткемпе карточка показывает НЕ все теги героя, а
  только те, по которым есть условие у экипированных карточек (`conditionAxes`, решение `R11.7`).
  Но замер словаря вскрыл два реальных пробела: **19 героев из 127 не имеют ни одного lore-тега**
  (они невидимы для `maskOfMadness`/`eulsScepter`/`dagon`/`holyLocket` — например Bounty Hunter,
  Riki, Lina), и распределение gameplay-тегов сильно скошено (`control` 68 против `illusion` 9,
  `stealth` 11, `heal` 16, `light` 9). `validateHeroTags` требует ≥1 gameplay-тега, но про lore
  ничего не требует, поэтому пробел прошёл валидацию.
  **Направление:** ревизия словаря (спорные назначения вида Shadow Shaman/pickoff — вручную, файл
  на то и курируемый), инвариант «≥1 lore-тег» в валидаторе, и проверка, что для каждого тега,
  который читает хотя бы один предмет, в игре достаточно героев, чтобы выбрать его `cap`. Пересекается
  с R12.2: даже идеальный словарь бесполезен, пока рынок показывает 20 героев из 127.
- 📊 **A/B симулятора на общих сидах** (`npm run sim -- 120`, b1.18.0 против b1.19.0): целевой
  билд-агент `synergy-build` **34.2% → 34.2%** — сложность сезона не сдвинулась, то есть три фикса
  устраняют дефекты, а не облегчают игру. Единственное значимое изменение — `greedy-oracle`
  **10.0% → 15.8%**: это ЕДИНСТВЕННЫЙ агент, который активно платит за рероллы (1.38 на лагерь), и
  именно ему реролл раньше не давал ничего. Остальные агенты в пределах шума
  (`greedy-power` 5.0% → 5.0%, `naive`/`static`/`economy-first` 0%). Диагностика лагеря почти не
  двинулась (золото 45.6 → 45.2, карт с плюсом 2.27 → 2.18, лучшая дельта 1.17 → 1.17), что и
  ожидалось: рынок стал разнообразнее, но не щедрее.
- **Deps:** R8.1 ✅, R8.3 ✅, R11.2 ✅, R6.1 ✅.

### R13 — Триаж плана Codex «late-game scaling + переработка UI» (2026-07-30) 🟨
*(R13.1–R13.3 закрыты; пользовательский срез R13.4 закрыт; R13.5 открыт)*

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
  побочная поддерживаемость (переоценено 2026-07-31). 🟨 Пользовательский срез реализован
  2026-08-01.** Верхняя навигация
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
  - 🟨 Осталась только механическая декомпозиция крупных JSX-блоков Market/Build/Reward в отдельные
    файлы. Она не блокирует пользовательский результат и должна делаться без изменения поведения.
- **R13.5 — Editions как ВТОРАЯ ось вместо новых тиров редкости. 🟨 `Charged` реализована
  2026-08-09.** Совпадает с уже принятым
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

### R14 — Плейтест 2026-08-03: плотность карточек, анимации, арт 🟨
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
- ⬜ **Переход этап ↔ Буткемп** остаётся мгновенной подменой экрана (R14.4 закрыл раздачу и вход
  раздела, но не смену экранов — это уровень `app/App.tsx`).

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

### R15 — Аудит 2026-08-09: game feel / juice против Balatro 🟨 (R15.1–R15.4, R15.6–R15.8 ✅; остался звук R15.5 — по решению пользователя в самый конец)

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
- ⬜ **R15.5 — звуковой слой v1 (P2, отдельная задача — пользователь подтвердил желание).**
  WebAudio-менеджер в `web/src/ui/sound.ts` (или `app/`): unlock на первом жесте (autoplay policy),
  master-тумблер в Settings (persist через `persist.ts`, в TMA — уважать `WebApp` mute где доступно).
  Набор v1 маленький и семантичный: deal (шелест ×N с питчем по индексу карты — Balatro-приём),
  buy (щелчок), reroll, win/loss стинги коротких reveal-строк своей команды, boss-синг, cash-out
  тики секвенции R15.2, победа/смерть. Файлы — маленькие (< 30KB суммарно на старт), формат — один
  спрайт или отдельные mp3/ogg в `web/public/sfx/`. Эскалация питчем/слоями, не громкостью. DoD:
  без взаимодействия звука нет (no autoplay errors в консоли); тумблер переживает перезагрузку;
  e2e не слышат звук (headless — просто не падают).
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
- **T6.1 Tactics system:** 5 общих ограниченных слотов пассивных Tactics/Items; reward предлагает 3 варианта, новый можно экипировать, заменить/отклонить по правилам экономики. Эффекты data-driven, условные и с trade-off; безусловные глобальные `+N%` не добавляем. Первый набор-кандидат: `Signature Specialists`, `Old Teammates`, `Fresh Project`, `Wide Pool`, `No Superstars`, `Last Dance` (описания — PRD §5.10.3). UI показывает `до → после`, слагаемое Team OVR и причину срабатывания. Тесты фиксируют порядок применения, caps, stacking и детерминизм offers. 🟨 (базовый набор из 5 сделан в срезе 4; Wide Pool ждёт редкость 3b)
  - **Playtest 2026-07-24 (PF-4, PF-5):** добавить **economy-tactics** (множители золота / interest / held-gold доход — Balatro-парити), сейчас набор только про слагаемые OVR; пере-калибровать trade-off'ы (Last Dance: цена «−2/−2 карты рынка» > выгоды +2.1 Base). Дизайн экономики — отдельная спека.
  - 🔁 **2026-07-27:** дизайн экономических пассивок оформлен — [бриф §13/§16](roguelite-balatro-brief.md), реализация в `R8.3` поверх контракта Tournament Power (`R8.2`). До фикса `R9.1` калибровать Last Dance бессмысленно: её trade-off сегодня убирает не «−2 случайные карты», а обоих саппортов.
- **T6.2 Camp actions:** 2 ограниченных слота одноразовых `scrim / bootcamp / scouting / hero-practice / stand-in-transfer`; применяются только между этапами, не во время симуляции турнира, и исчезают после Win/Loss. `Scouting` раскрывает следующее boss condition/Market, остальные действия дают временную подготовку с явной ценой. ⬜
- **T6.3 Balance simulator:** массовый прогон seeds, win-rate по этапам/стилям, outlier builds; версионирование balance config. Для Dynasty отдельно строит survival curve (доля живых по абсолютному Stage), распределение первого Aegis/числа кругов, инфляцию золота и момент насыщения билда; проверяет, что обычная удачная сборка видит второй круг, сильная проходит несколько, исключительная может уйти на 20+ этапов, но ни один билд не масштабируется бесконечно быстрее поля. 🟨
  - ✅ **Инструмент + версионирование + первая калибровка (2026-07-24).** `game/balance.ts`: единая `BALANCE_CONFIG_VERSION` + агрегатор `BALANCE` (числа принадлежат своим модулям, здесь версия и единая точка обзора); каждый config-const помечен «правишь → бампай версию». **Версия в воспроизводимом состоянии:** `RunLink.b` (кодек + issue `"balance"`, значима только для mode "run", старые ссылки lenient) и `SavedRun.balanceConfigVersion` (инвалидирует resume roguelite при смене коэффициентов; classic не трогает; legacy без ключа lenient) — по образцу schema/rating/dataHash; i18n RU+EN на новые причины. **Симулятор** (`npm run sim -- N`, `scripts/sim_run.ts`): 4 стиля (`static`-контроль / `naive-ovr` / `boss-adaptive` / `chem-lean`), win-rate + распределение вылета по этапам + draft→final OVR + золото/покупки на Буткемп; env `NOBOSS=1` для сравнения; Dynasty-метрики (survival по абсолютному Stage, первый Aegis) — каркас готов, включатся в срезе 6. **Первая калибровка (решение «править только при явном вылете»):** замер показал наивно-осмысленную игру ~8% при PRD-цели 30–40% и статик, гибнущий уже на этапе 0 (вместо «жил до середины»); единственный консервативный сдвиг `ANTE_FIELD_HANDICAP 12→16` (кривая `idx·3−16`) поднял наивный симулятор до ~20% (skilled-человек ≈ цель), статик остался ≈0%, форма кривой и «static умирает без апгрейдов» сохранены; `BALANCE_CONFIG_VERSION b1.0.0→b1.1.0`, PRD §5.9.2/§10.E синхронизированы. Тонкая настройка порогов/экономики/боссов и Dynasty-профиль — итеративно с живым playtest. Тесты: `runLink.test.ts`/`runPersist.test.ts` покрывают версию баланса; `test` (295)/`test:e2e` (16)/`tsc`/`build`/golden зелёные (кривая мягче → seed-coupled e2e стабильны), схема/рейтинг/датасет не тронуты.
  - **Осталось (за срезом 6):** Dynasty survival curve по абсолютному Stage, распределение первого Aegis/числа кругов, инфляция золота и точка насыщения билда на бесконечной петле; когда появится T5.8.
  - 🔁 **Расширено 2026-07-27 → `R10`.** Текущий симулятор играет **не ту игру**: он не учитывает качества героев, ручное улучшение, Tactics/Items, Camp Actions, формы игроков, резерв, дорожающий reroll, interest, Tournament Power и акт-модель, поэтому его win-rate нельзя считать финальным аргументом ни за длину забега, ни за цены. Полный список требований, стратегий агентов и метрик — `R10`. Первая находка уже есть: замер поля показал, что кривая `сдвиг-и-кламп` схлопывает 90% поля первого этапа в одно значение (`R7.1`) — то есть измеренные ранее 8%/20% отражали в том числе этот артефакт.
- **T6.4 Meta progression — только после T6.3:** постоянный **Штаб** хранит коллекцию открытых определений карточек, статистику и трофеи, но не усиленные экземпляры. **Playbook** (гипотеза ≈8 карточек) выбирается перед обычным забегом и ограничивает reward/market pool, не давая бесплатной силы со старта; daily/challenge получает фиксированный Playbook, seeded run учитывает `playbookId + balanceConfigVersion`. После первой победы открываются **Stakes**: новые ограничения/boss/economy trade-off вместо простого роста OVR и без постоянного `+OVR`. ⬜
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
- **T7.1 Шеринг-картинка + название команды.** 🟨 ✅ Редактируемое **название команды** (`ui/TeamName`, инлайн-правка по ✎) в заголовках draft/result, персист в localStorage (`state/runPersist`); ✅ **resume незавершённого забега** — на старте баннер «продолжить» (`features/start/ResumeBanner`), восстановление детерминированным replay лога действий на свежем `RunEngine` (реролл/пики/manual точно воспроизводятся; сейв версионируется по датасету и отбрасывается при апдейте данных). Проверено в браузере: имя переживает reload, resume восстанавливает пик + потраченный реролл + тот же пак. ⬜ Осталось: шеринг-картинка. Тест детерминизма replay — в `verify_engine`.
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
- T7.3 UX parity pass: tooltips IMP/ECO/REL, источники/атрибуция, loading/error/empty states, responsive и keyboard flow. ⬜
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
- **T7.8 — Адаптив wide/narrow: канон breakpoints, мобильная модалка, камера турнира 🟨.** 2026-07-18. Первый заход сделан в Cursor, ревизия и доводка — здесь.
  - **Канон.** `design/breakpoints.css` + `breakpoints.ts` — **sm 430 / md 680 / lg 980**; в `@media` литералы (MQ не резолвят `var()`). Разовые ширины сведены к канону: 620 → md, **900 → lg**. Последнее было не косметикой: тим-панель турнирного экрана ломалась на 980, а группы/отчёт/карьера — на 900, и в зазоре 901–980 экран разъезжался сам с собой. `isNarrowViewport()` — тот же порог для JS-решений, чтобы число не двоилось.
  - **Модалка** (`ui/Modal`) стала мобильной поверхностью: drag-to-dismiss (порог 88px либо скорость), липкая шапка у `layout="content"`, safe-area, `dvh`. Дозакрыто по ревизии: **фокус** (забираем на открытии, Tab заперт внутри, возвращаем на закрытии — до этого `aria-modal` был формальным, Tab ходил по экрану за диалогом), **скролл-лок фона** с компенсацией ширины скроллбара, снятие таймера выхода на unmount, один набор touch-слушателей вместо двух (head внутри panel — события и так всплывают, а onMove звался дважды).
  - **Камера турнира.** Группы — сразу к таблице со своей командой. Плей-офф разведён по ширине: на **широком** сетка видна целиком, поэтому камера ставится один раз на верх сетки и больше не дёргается (замер: 14 сэмплов подряд, scrollY неподвижен); на **узком** ведёт за текущей серией юзера — UB → LB при дропе → GF (`userPlayoffCameraTarget`, покрыт двумя тестами в `tournamentPlayback.test.ts`).
  - **Скроллеры.** Список забегов карьеры больше не добирает низ распоркой-пустышкой (`.career-runs__end` удалён): вместо неё обрезка по дуге рамки (`clip-path: inset(0 round …)`, как у `field-list`) плюс 1px под рамку последней карточки. Проверено на 375: список доезжает до конца, рамка не съедается, лишнего отступа под последним забегом нет.
  - **Прочее из захода:** `viewport-fit=cover` + safe-area в шелле, свечение радара через отдельный слой (Safari-паттерн с `clip-path`), зелёный winner-edge в сетке только от **выигранных** серий юзера, `make dev-phone` (один Vite с `--host` на 5173 для телефона в той же Wi-Fi).
  - **Осталось:** пройти узкий экран по остальным экранам (start/draft) так же придирчиво; на мобиле под сеткой плей-оффа остаётся заметный пустой блок.

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

- **T7.9 — Края шкалы OVR читаются с карточки: фольга и «погасшая» 🟨.** 2026-07-18. Тонировки по тиру не хватало, чтобы выцепить взглядом лучшего и худшего в паке — все пять карточек читались как «примерно одно и то же».
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
- **T7.10 — Справочник и настройки: страницы вне забега + хардкор 🟨.** Начато 2026-07-18. Заход 1 из 3 (дальше — страница героев, затем паутина тиммейтов).
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
## MREF — Reference parity gaps (аудит 322-0 Quick Draft, 2026-07-11)
> Источник: [docs/audits/2026-07-11-322-0-quick-draft-parity.md](audits/2026-07-11-322-0-quick-draft-parity.md). Матрица с доказательствами. Продуктовые решения по P1 — открытые вопросы PRD §10 G/H.

- **TREF1 — Драфт героев из паков (P1) ✅.** Реализованы 5 пиков игроков + 5 пиков героев, auto matching и инвариант «каждый новый пак показывает ровно 5 ещё не взятых героев». Повтор сигнатурного героя детерминированно добирается из текущего format-pool; внешний API во время забега не нужен. Отрицательные/edge-тесты в `verify_engine.ts`. Manual остаётся T3.10.
- **TREF2 — Итог: projected finish / вердикт (P1) ✅.** Итог драфта показывает воспроизводимый прогноз против 18-team field; это же поле без повторной генерации проходит группы, double-elimination и Grand Final, после чего пользователь получает фактическое место. Соперники — исторические pack snapshots, а не безымянные боты референса. Preview и симуляция используют единый `TournamentEngine`; тесты фиксируют детерминизм и полноту 18 мест. См. аудит `docs/audits/2026-07-12-tournament-cycle-parity.md`.
- **TREF3 — Арт героев (P2) ✅.** `HeroThumb` показывает портреты Valve CDN в паке, назначении и инспекторе игрока.
- **TREF4 — Имя команды + View hero stats (P2) 🟨.** ✅ Клик по игроку в пентагоне открывает event/career heroes `{games, winrate}` и ссылку DatDota; ✅ назначенная player×hero пара показывает games. ⬜ Редактируемое имя команды и его сериализация в sharing URL остаются в T7.1.
- **TREF5 — Раскладка драфта (P2).** ✅ Desktop переведён на компактные 2 колонки: sticky radar + pack panel; start/result используют ту же responsive surface-систему. На ≤980px раскладка становится одноколоночной. Отдельно в T7.3 остаются keyboard-flow и расширенный mobile QA; прежний скролл-таймаут в новом golden path не воспроизвёлся.
- **TREF6 — Chemistry + тиммейты (P1) 🟨.** ✅ Вечное исключение команды заменено на `usedPlayers`; тиммейтов можно собирать. ✅ Промежуточный бонус теперь накапливается относительно 10 пар полной пятёрки (реальный Aurora smoke: `0 → 0.27 → 0.80 → 1.60 → 2.67`), финальный масштаб сохранён. ✅ Текущий snapshot содержит 240 squad-пар. ⬜ Полноценная историческая Chemistry всё ещё требует resumable multi-event last_2y и roster intervals; текущий deploy snapshot содержит только 1 событие. **Deps:** M2.5/S4 collect-window, T1.3, **TDATA1**.
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
- **T9.9 — `startapp` → забег по сиду ⬜.** Direct Link умеет нести параметр: `t.me/aegis_draft_bot/play?startapp=<код>` приезжает во фронт как `tgWebAppStartParam`. У нас уже есть ровно та сущность, которую туда класть, — сид-код забега (T3.14) и кодек ссылки (`state/runLink`). Это делает «челлендж по сиду» нативным для Telegram: код кидают в чат ссылкой, а не текстом. **DoD:** параметр читается и попадает в тот же путь, что и `#run=` (через `pendingLink`), без второго механизма разбора. **Deps:** T9.4 (готов).

- **T9.11 — Матрица трёх контекстов запуска ⬜.** Одна и та же сборка открывается тремя способами, и каждый по-разному видит `window.Telegram.WebApp` — на этом стыке уже поймано **два** бага (оба в T9.5: splash-цвет по чужой теме; светлая тема во встроенном браузере, потому что там `colorScheme` по умолчанию `light`). Нужен один прогон по матрице «контекст × что проверяем», а не отлов по одному.
  - **Три контекста:** (1) **Mini App** — `platform` = ios/android/tdesktop, есть `tgWebApp*` в фрагменте URL, работает CloudStorage/BackButton/хаптика; (2) **встроенный браузер Telegram** — открытая из чата ссылка: `WebApp` существует, но `platform` = `unknown`, параметров запуска нет, `colorScheme` = `light` по умолчанию; (3) **обычный сайт** — `WebApp` отсутствует вовсе.
  - **Что проверять в каждом:** тема в режиме «system» следует нужному источнику (в Mini App — теме Telegram, в браузере и на сайте — `matchMedia`); тема/язык/забег/карьера сохраняются и восстанавливаются (CloudStorage только в Mini App, localStorage в остальных); BackButton, `expand`, `disableVerticalSwipes`, хаптика — активны только в Mini App и молча ничего не делают в двух других; нет перекрытия системной темы там, где мы её перекрывать не должны.
  - **Правило, ради которого задача и заводится:** любое обращение к `WebApp` в `src/tma/` обязано различать эти три случая — «объект есть» ≠ «мы в мини-приложении». Признак мини-приложения — `platform !== "unknown"`, а не просто наличие `WebApp`.
  - **Как гонять без телефона:** контексты (2) и (3) воспроизводятся в браузере подстановкой `window.Telegram.WebApp` со стабом (см. `test/telegram.test.ts` и ручные проверки в истории сессии); (1) — только на живом клиенте. **Deps:** T9.4 (готов).
- **T9.12 — TMA нативный хром: Back на все уровни + Settings в «…»-меню 🟨 (2026-07-21: сделано; живой тест на телефоне).** Баг (fullscreen, живой тест T9.10): на экране деталей режима телеграмная кнопка показывала «Закрыть» вместо «Назад». Корень — mode-навигация (`runStore.selectedMode`) не участвовала в решении «показывать ли Back» (реагировали только на `shellStore.view`). **Фикс:** единый источник правды о «назад» — [`state/navigation.ts`](../web/src/state/navigation.ts) (`canGoBack`/`navigateBack`): вид → назад по истории; экран деталей режима (mode выбран, `phase==="start"`) → в выбор режимов; в самом забеге (draft/tournament) Back НЕ показываем (там Telegram Close + closing-confirmation, не трогали). Телеграмный BackButton теперь делегирует в `navigateBack` и виден на всех уровнях. **Нативный хром (решение 2026-07-21):** в TMA прячем свои кнопки «назад» (`← All modes`/`Back to game`/`← назад`) и кнопку Settings — Settings уходит в системное «…»-меню через `WebApp.SettingsButton` (Bot API 7.0+; на старых клиентах API нет → наша кнопка остаётся фолбэком). Флаги в [`state/tmaChrome.ts`](../web/src/state/tmaChrome.ts) (`backNative` синхронно из `isTelegramLaunch`, `settingsInMenu` по факту проводки SettingsButton). Вне Telegram оба false — веб не меняется (проверено в превью: mode-навигация и все кнопки на месте). Тесты: `web/test/navigation.test.ts` (canGoBack/navigateBack по уровням). **Известное ограничение (не в scope):** браузерный «назад» на мобильном вебе с экрана деталей режима — mode-nav не пишет историю (предсуществующее); в TMA не важно (нет браузерного back), на вебе есть видимые кнопки. **Осталось: живой тест** — на скрине 3 «Закрыть»→«Назад» ведёт в выбор режимов; Settings открывается из «…»-меню; наши дубли скрыты. **Deps:** T9.10.

**Что НЕ делаем в M9:** отдельный фронт под Telegram (правка UI живёт в `web/` и приезжает в оба канала), второй бэкенд (бот ходит в тот же API и ту же статику), платежи и Stars.

**Нужен ли ADR.** Размещение бота внутри `server/` вторым entrypoint — решение уровня ADR 0002 (там уже зафиксировано «один контейнер, без k8s»), поэтому отдельный ADR заводим, только если выберем **не** этот путь (например, serverless-воркер).

---

## M10 — Multiplayer Duel: четвёртый глобальный режим (по [PRD §5.12](PRD.md), запрос 2026-08-09)
> Живой 1v1: каждый собирает свою пятёрку и героев, составы вскрываются после лока, очная серия
> bo3 той же вероятностной моделью. Переиспользуем почти всё (RunEngine/DraftScreen/счёт/движок
> матчей/mode shell `"duel"`); новое — только комнатный слой на WebSocket в `server/`
> (ADR 0002, слой transport). Реализация не начата; ниже — рамка и порядок.

- **MP0 — ws-транспорт + комната по коду ⬜.** `GET /api/ws/rooms/{code}` (upgrade;
  `nhooyr.io/websocket` или `gorilla` — решить в задаче), комнаты в памяти одного инстанса
  (Fly v1 — один инстанс, шардинг не нужен), протокол `{v, type, payload}` с версией с первого
  сообщения. Presence: join/leave/ping, переподключение по токену комнаты. DoD: два клиента
  видят друг друга через живой сервер, из TMA-webview тоже; reconnect не плодит призраков;
  тесты комнатной state-machine без сети (чистая логика отдельно от upgrade-хендлера).
  **Deps: T9.0 (живой деплой Go-сервера)** — как у M9, до него ws некуда подключать.
- **MP1 — дуэль на общем сиде ⬜.** Сервер раздаёт seed комнаты; оба драфтят ТАЙНО тот же набор
  паков (детерминизм = честность бесплатно), лок → вскрытие → bo3 → результат + rematch (новый
  seed). Клиент шлёт только действия (`actions` — формат сейва), легальность в v1 проверяет
  клиент; сервер — авторитет фаз/таймингов/вскрытия (не показывает чужие пики до лока — иначе
  подглядывание тривиально). Просроченный ход = авто-пик первого доступного (как `completeDraft`).
  Career-запись видом `duel` (не смешивать с одиночными агрегатами). Mode shell: четвёртая
  карточка `"duel"` (reset забега не сбрасывает режим — скилл `game-state-architecture`).
  DoD: полная дуэль двумя браузерами на живом сервере; обрыв соединения любой стороны не ломает
  комнату; e2e с двумя контекстами Playwright.
- **MP2 — живой снейк-драфт из общего пула ⬜.** Ходы по очереди с таймером; взятое исчезает у
  обоих. Серверная state-machine становится авторитетом ХОДА (кто ходит, легален ли пик по
  роли/слоту) — это уже не relay; правила пика портируются в Go минимальным подмножеством
  (роль-слот/занятость), полный счёт по-прежнему клиентский. DoD: снейк 1-2-2-…; таймер хода;
  спектатор-режим комнаты (read-only ws) — дешёвый бонус этого шага.
- **MP3 — рейтинг и честность ⬜.** Лидерборд дуэлей, матчмейкинг очереди, анти-чит серверной
  ре-симуляцией лога. **Та же дилемма «четырёх слагаемых», что T8.5** (весь счёт — клиентский
  TS): решается разом для дейлика и дуэлей, раньше — не начинать. Deps: T8.5, T8.6.

**Сквозные границы M10.** Игровые данные — статикой (ws не раздаёт JSON сцены); `scoreTeam` и
`ratingModelVersion` не форкаются; протокол версионируется с первого дня; комнатная логика в
`server/internal/service` (transport только upgrade/кодек — слои ADR 0002 не пробивать).

## Открытые вопросы (из PRD §10, решить по ходу)
- **A. Решено.** Mixed Draft — свободный порядок незаполненных ролей; support ×2 взаимозаменяемы.
- **B.** Калибровка Peak `v1.1.0`: стартовые 120 дней / `N_min=15` проверить на полном датасете; изменение требует новой `ratingModelVersion`.
- **C.** Калибровка OVR/Peak/Team-Success текущей `v1.2.0` на полном датасете; изменение формулы требует новой `ratingModelVersion`.
- **D.** Атрибуция Liquipedia/OpenDota в UI.
- **E. Пересмотрено 2026-07-27.** Структура забега — конечный сезон `5 актов × 5 этапов` (гипотеза; A/B `20/25/30` — за `R10`), пороги только из реальных placement-бакетов, один босс на финал акта. Точная кривая поля, odds и цены — `R10`.
- **I. Открыт 2026-07-27.** Два обязательных чемпионства (Stage 20 и 25) означают, что забег из 25 турниров теряется на одной неудачной сетке. Ответить измерением (`R6.4`/`R10`): финал `1-е` или `топ-2` + чемпионство как бонус; нужен ли один защитный ресурс на сезон. Заранее не добавлять.
- **F. Частично решено 2026-07-22, число слотов пересмотрено 2026-08-02.** Каркас — 5 общих пассивных слотов Tactics/Items + 2 слота Camp Actions; первый набор-кандидат зафиксирован в PRD §5.10.3. Следующий balance spec должен проверить коэффициенты, caps/stacking, размер Playbook и полный набор Camp Actions уже с новым потолком билда.
