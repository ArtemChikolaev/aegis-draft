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
- **Цель:** Team Packs (ростер команды) и Mixed Draft (5 из разных команд, порядок 1→5) + реролл; детерминизм по сиду.
- **Файлы:** `web/src/game/packs.ts`, `web/src/game/rng.ts`.
- **Скиллы:** `scoring-model`.
- **DoD:** ✅ одинаковый сид ⇒ один пак; фильтр по формату (last_2y=4, valve_legacy=2); Mixed строгий 1→5; рерроллы вкл. ∞.

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
- **DoD:** ✅ играбельный цикл; Team и Mixed (строгий 1→5, кликабелен только текущий слот); числа сходятся с ядром; проверено в браузере.

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

### T3.13 — Настоящий test baseline ⬜
- **Цель:** превратить ad-hoc verify-скрипты в регрессионный набор для engine/scoring/packs и минимальный browser golden path.
- **Файлы:** test runner/config, unit tests, browser smoke; `web/package.json`.
- **Скиллы:** `reference-parity-audit`, `discovery-before-code`, `self-review-checklist`.
- **DoD:** одна команда проверяет unit + UI start→draft→result; CI-friendly; утверждение «Mixed Chemistry ниже» либо формализовано инвариантом, либо удалено как ложная гарантия.

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

## MREF — Reference parity gaps (аудит 322-0 Quick Draft, 2026-07-11)
> Источник: [docs/audits/2026-07-11-322-0-quick-draft-parity.md](audits/2026-07-11-322-0-quick-draft-parity.md). Матрица с доказательствами. Продуктовые решения по P1 — открытые вопросы PRD §10 G/H.

- **TREF1 — Драфт героев из паков (P1) ✅.** Реализованы 5 пиков игроков + 5 пиков героев, auto matching и инвариант «каждый новый пак показывает ровно 5 ещё не взятых героев». Повтор сигнатурного героя детерминированно добирается из текущего format-pool; внешний API во время забега не нужен. Отрицательные/edge-тесты в `verify_engine.ts`. Manual остаётся T3.10.
- **TREF2 — Итог: projected finish / вердикт (P1) ✅.** Итог драфта показывает воспроизводимый прогноз против 18-team field; это же поле без повторной генерации проходит группы, double-elimination и Grand Final, после чего пользователь получает фактическое место. Соперники — исторические pack snapshots, а не безымянные боты референса. Preview и симуляция используют единый `TournamentEngine`; тесты фиксируют детерминизм и полноту 18 мест. См. аудит `docs/audits/2026-07-12-tournament-cycle-parity.md`.
- **TREF3 — Арт героев (P2) ✅.** `HeroThumb` показывает портреты Valve CDN в паке, назначении и инспекторе игрока.
- **TREF4 — Имя команды + View hero stats (P2) 🟨.** ✅ Клик по игроку в пентагоне открывает event/career heroes `{games, winrate}` и ссылку DatDota; ✅ назначенная player×hero пара показывает games. ⬜ Редактируемое имя команды и его сериализация в sharing URL остаются в T7.1.
- **TREF5 — Раскладка драфта (P2).** ✅ Desktop переведён на компактные 2 колонки: sticky radar + pack panel; start/result используют ту же responsive surface-систему. На ≤980px раскладка становится одноколоночной. Отдельно в T7.3 остаются keyboard-flow и расширенный mobile QA; прежний скролл-таймаут в новом golden path не воспроизвёлся.
- **TREF6 — Chemistry + тиммейты (P1) 🟨.** ✅ Вечное исключение команды заменено на `usedPlayers`; тиммейтов можно собирать. ✅ Промежуточный бонус теперь накапливается относительно 10 пар полной пятёрки (реальный Aurora smoke: `0 → 0.27 → 0.80 → 1.60 → 2.67`), финальный масштаб сохранён. ✅ Текущий snapshot содержит 240 squad-пар. ⬜ Полноценная историческая Chemistry всё ещё требует resumable multi-event last_2y и roster intervals; текущий deploy snapshot содержит только 1 событие. **Deps:** M2.5/S4 collect-window, T1.3, **TDATA1**.
  - **Root cause (аудит 2026-07-12):** формула корректна, но **данных нет**. Committed snapshot = 1 событие (EWC 2026), `squadSynergy` = 240 **внутрикомандных** пар с `winrate:0.5`-заглушками, ноль кросс-карьерных пар. Игрок берётся один на пак → две трети времени в составе нет ни одной пары с историей → Chemistry ≈ 0. 322-0 работает, потому что стоит на пожизненной матрице co-games (наблюдалось `Saksa+Watson·185·+0.8` для игроков из разных паков). **Фикс = данные (TDATA1), не код.**
- **TREF7 — Mixed: строгий 1→5 показывает только текущий слот (P2, продуктовое).** Пользователю кажется, что доступен только carry. **Цель:** решить PRD §10-A — свободный порядок / показывать все роли доступными / убрать «текущая роль»-паттерн в Mixed. **Файлы:** `web/src/game/{engine,packs}.ts`, `web/src/features/draft/DraftScreen.tsx`. **DoD:** UX Mixed не выглядит как «одна опция»; поведение зафиксировано в PRD. **Deps:** PRD §10-A. ⬜
- **TREF8 — Заголовок пака показывает название турнира, а не `eventId` (P2) ✅.** Было `league-19785`, стало имя события (`data.events[].name`) в `DraftScreen` — тем же паттерном, что `PlayerInspector`. Fallback на сырой id, если события нет в справочнике.
- **Отметки к существующим:** T3.10 (Manual allocation — референс имеет рабочим, у нас SOON) остаётся P1 и связан с TREF1 (привязка hero→player). T7.3 (responsive) — включает TREF5. T7.4 удаляет co-brand «322—0». T7.2/T7.5 — RU/EN и темы. Difficulty: «Easy» у нас = ∞ рероллов, у референса = 1 (P2).

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

---

## Открытые вопросы (из PRD §10, решить по ходу)
- **A.** Mixed Draft: строгий `1→5` (дефолт) vs свободный порядок из микс-пака.
- **B.** Калибровка Peak `v1.1.0`: стартовые 120 дней / `N_min=15` проверить на полном датасете; изменение требует новой `ratingModelVersion`.
- **C.** Калибровка OVR/Peak/Team-Success текущей `v1.2.0` на полном датасете; изменение формулы требует новой `ratingModelVersion`.
- **D.** Атрибуция Liquipedia/OpenDota в UI.
- **E.** Roguelite run: точные target curves, 4 этапа + финал как стартовая гипотеза.
- **F.** Tactics: первый набор и лимит слотов — зафиксировать отдельным balance spec до T6.1.
