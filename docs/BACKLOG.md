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
- **DoD:** итог с разбивкой и назначением героев ✅; **шеринг-ссылка по сиду — TODO** (кодирование настроек+сид в URL).
- **Deps:** T3.8

### T3.10 — Исполнение всех настроек старта ⬜
- **Цель:** убрать «декоративные» config-поля: `peak` берёт peak rating; Mixed использует team-success; `manual` открывает реальное назначение героев.
- **Файлы:** `web/src/game/{engine,score,packs}.ts`, `web/src/ui/{StartScreen,ResultScreen}.tsx`, тесты; возможно контракт данных по результатам M2.
- **Скиллы:** `reference-parity-audit`, `scoring-model`, `data-contract`, `discovery-before-code`.
- **DoD:** переключение каждой доступной оси меняет результат/flow и покрыто тестом; недоступная ось disabled/`SOON`, а не молча игнорируется.
- **Deps:** T2.3, T2.4 для реальных Peak/team-success; manual можно делать независимо.

### T3.11 — Correctness hero matching и Mixed packs ✅
- **Цель:** убрать два P0-риска baseline-аудита: 32-битная маска/экспонента на большом hero pool и неполный Mixed-пак при отсутствии роли/уникальных команд.
- **Файлы:** `web/src/game/{assign,packs,engine}.ts`, `web/scripts/verify_{game,engine}.ts` либо unit suite.
- **Скиллы:** `reference-parity-audit`, `scoring-model`, `discovery-before-code`.
- **DoD:** ✅ matching использует маску по 5 игрокам (`O(H·2^5·5)`) и проверен на 40 героях; Mixed выдаёт ровно 5 ролей/5 команд либо fail-fast; тесты на 4 команды, отсутствующую роль и subs/6+ игроков; mock generator обеспечивает 5 команд.

### T3.12 — Воспроизводимый URL забега ⬜
- **Цель:** завершить T3.9: seed + все настройки + `schemaVersion`/`ratingModelVersion` в URL; открыть ссылку и получить тот же run.
- **Файлы:** `web/src/state/runStore.ts`, роутинг/URL codec, UI результата, тесты.
- **Скиллы:** `reference-parity-audit`, `discovery-before-code`.
- **DoD:** round-trip URL стабилен; одинаковые данные+версия+URL дают одинаковые паки и итог; несовместимая версия объясняется пользователю.
- **Deps:** T3.10, T3.11.

### T3.13 — Настоящий test baseline ✅
- **Цель:** превратить ad-hoc verify-скрипты в регрессионный набор для engine/scoring/packs и минимальный browser golden path.
- **Файлы:** `web/vitest.config.ts`, `web/playwright.config.ts`, `web/test/**`, `web/e2e/**`, `web/package.json`, `.github/workflows/ci.yml`.
- **DoD:** одна команда проверяет unit + UI start→draft→result; CI-friendly; утверждение «Mixed Chemistry ниже» либо формализовано инвариантом, либо удалено как ложная гарантия.
- **Итог (2026-07-14):** Vitest 77 tests (assign/score/engine/packs/tournament/career/preferences/regression/golden); Playwright smoke (draft + tournament); golden fixtures (`npm run test:golden:update`, только mock-baseline); legacy `verify_*.ts` удалены; **CI web** — эфемерный `gen:mock` для тестов; **deploy** — реальный датасет из data-refresh; dev debug-logger → VS Code TERMINAL (`web/src/debug/`, `vite-plugin-game-log.ts`).

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

### T5.2 — Награды, валюта и Camp/Market ⬜
- **Цель:** после этапа дать выбор награды и trade-off «потратить сейчас / накопить»; draft reroll и market reroll — разные ресурсы.
- **DoD:** минимум 3 осмысленных категории трат; экономика детерминирована и не допускает отрицательного баланса; UI заранее показывает цену и эффект.
- **Deps:** T5.1.

### T5.3 — Boss conditions ⬜
- **Цель:** специальные заранее видимые условия этапов, заставляющие адаптировать ростер/героев/tactics.
- **DoD:** минимум 5 условий, каждое меняет оптимальное решение и покрыто тестом; нет boss-а, который только умножает target.
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

## M6 — Builds, контент и баланс
- **T6.1 Tactics system:** ограниченные слоты пассивных Dota-native модификаторов; data-driven эффекты и понятный порядок расчёта. ⬜
- **T6.2 Camp actions:** одноразовые scrim/bootcamp/scouting/hero-practice/transfer эффекты. ⬜
- **T6.3 Balance simulator:** массовый прогон seeds, win-rate по этапам/стилям, outlier builds; версионирование balance config. ⬜
- **T6.4 Meta progression:** unlocks/stakes/challenges без постоянного `+OVR`; seeded и daily остаются честно сравнимыми. ⬜

## M7 — Полиш
- **T7.1 Шеринг-картинка + название команды.** 🟨 ✅ Редактируемое **название команды** (`ui/TeamName`, инлайн-правка по ✎) в заголовках draft/result, персист в localStorage (`state/runPersist`); ✅ **resume незавершённого забега** — на старте баннер «продолжить» (`features/start/ResumeBanner`), восстановление детерминированным replay лога действий на свежем `RunEngine` (реролл/пики/manual точно воспроизводятся; сейв версионируется по датасету и отбрасывается при апдейте данных). Проверено в браузере: имя переживает reload, resume восстанавливает пик + потраченный реролл + тот же пак. ⬜ Осталось: шеринг-картинка. Тест детерминизма replay — в `verify_engine`.
  - **Починка resume 2026-07-17 [602837d]:** сейв не доживал до конца забега — обрывался на старте драфта и на входе в плейофф. Причины и правила, зафиксированные фиксом:
    - **Момент очистки — `finishTournament`, а не вход в стадию.** Стадия `playoffs` с `canAdvance=false` — ещё **не** финал для игрока: идёт live-reveal. Сейв чистится и career пишется только когда UI доиграл reveal до экрана результатов (флаг `resultsSeen` в `runStore`). Раньше вход в стадию считался терминалом → reload на середине reveal терял забег.
    - **`Infinity` не переживает JSON.** `JSON.stringify({ rerolls: Infinity })` → `null`, и Easy после reload получал `rerollsLeft <= 0`, что блокировало replay: resume **молча** сгорал. Лечит `normalizeSavedRun` (null/не-конечное → `Infinity`) на входе `loadSavedRun`.
    - **Пустой `actions` — валидный resume.** Первый пак уже зафиксирован seed'ом, поэтому «только стартовали» тоже восстанавливается (`isSavedRunResumable` вместо прежнего `actions.length > 0`).
    - **`dataBuiltAt` в сейве** (`manifest.builtAt`): data-refresh обновляет датасет **без** bump `schemaVersion`/`ratingModelVersion`, и старой пары версий не хватало — паки разъезжались. Совместимость теперь = три поля: данные освежаются кроном чаще, чем меняются версии модели.
    - **`frozenRoster`** — ростер на момент persist; replay обязан совпасть побайтно, иначе resume отбрасывается вместо тихой подмены состава.
    - **Dev-only:** `strictPort: 5173` в `vite.config.ts` — Vite уходил на 5174+, а localStorage привязан к origin, поэтому resume «терялся» при живом сейве. Playwright ходит на тот же 5173.
  - **Тесты:** `web/test/runPersist.test.ts` (9 кейсов) фиксирует Infinity-round-trip, пустой actions, несовместимость по каждому из трёх полей и очистку только после `resultsSeen`.
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
- **T8.2 — Postgres + миграции:** схема (users, saves, leaderboard, daily), версионированные миграции, репозитории в `store/`. **Deps:** T8.1. ⬜
- **T8.3 — Auth + аккаунты (Steam OpenID, опционально).** Анонимная игра работает без логина; вход — только для синхронизации/лидерборда. **Deps:** T8.0, T8.2. ⬜
- **T8.4 — Сейвы забегов** (cloud, cross-device); учёт `schemaVersion`/`ratingModelVersion`. **Deps:** T8.3. ⬜
- **T8.5 — Дейлик-сид + серверная валидация** (ре-симуляция на Go, переиспользуя `pipeline/internal/{model,rating}`; анти-чит). **Deps:** T8.2, M2. ⬜
- **T8.6 — Лидерборд** (дейлик/seeded), защита от подделки результата. **Deps:** T8.5. ⬜
- **T8.7 — Фронт: API-клиент** рядом с `DataSource` (статика ≠ динамика). **Deps:** T8.1. ⬜
- ✅ **T8.8 — nginx + Docker Compose (prod-like lab):** `infra/docker-compose.yml`, `infra/nginx/` (reverse proxy: `/` SPA, `/data/*` static JSON, `/api/*` Go API), `server/Dockerfile`. Не заменяет GitHub Pages; Postgres в compose для будущих миграций. **Deps:** T8.1.

---

## Открытые вопросы (из PRD §10, решить по ходу)
- **A. Решено.** Mixed Draft — свободный порядок незаполненных ролей; support ×2 взаимозаменяемы.
- **B.** Калибровка Peak `v1.1.0`: стартовые 120 дней / `N_min=15` проверить на полном датасете; изменение требует новой `ratingModelVersion`.
- **C.** Калибровка OVR/Peak/Team-Success текущей `v1.2.0` на полном датасете; изменение формулы требует новой `ratingModelVersion`.
- **D.** Атрибуция Liquipedia/OpenDota в UI.
- **E.** Roguelite run: точные target curves, 4 этапа + финал как стартовая гипотеза.
- **F.** Tactics: первый набор и лимит слотов — зафиксировать отдельным balance spec до T6.1.
