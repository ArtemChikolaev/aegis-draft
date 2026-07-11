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
- T4.1 Форматы `last_1y/last_5y/valve_legacy` (фильтры + пулы). ⬜
- T4.2 Peak Rating в UI-скоринге. ⬜
- T4.3 Курируемый список тир-1 событий и веса престижа. ⬜

## M5 — Полный Roguelite Run
### T5.1 — Stage engine + win/loss ⬜
- **Цель:** Quick Draft оставить отдельным режимом; полный run провести через 4 растущих этапа + Grand Final с порогами и поражением.
- **Файлы:** новый слой orchestration в `web/src/game/` поверх существующего `RunEngine`; UI этапа/результата; тесты.
- **Скиллы:** `discovery-before-code`, `plan-first-communication`, `scoring-model`, `reference-parity-audit`.
- **DoD:** детерминированная state machine; нельзя перескочить этап; есть победа и проигрыш; seed воспроизводит весь run.
- **Deps:** T3.10–T3.13, M2.

### T5.2 — Награды, валюта и Camp/Market ⬜
- **Цель:** после этапа дать выбор награды и trade-off «потратить сейчас / накопить»; draft reroll и market reroll — разные ресурсы.
- **DoD:** минимум 3 осмысленных категории трат; экономика детерминирована и не допускает отрицательного баланса; UI заранее показывает цену и эффект.
- **Deps:** T5.1.

### T5.3 — Boss conditions ⬜
- **Цель:** специальные заранее видимые условия этапов, заставляющие адаптировать ростер/героев/tactics.
- **DoD:** минимум 5 условий, каждое меняет оптимальное решение и покрыто тестом; нет boss-а, который только умножает target.
- **Deps:** T5.1, T5.2.

## M6 — Builds, контент и баланс
- **T6.1 Tactics system:** ограниченные слоты пассивных Dota-native модификаторов; data-driven эффекты и понятный порядок расчёта. ⬜
- **T6.2 Camp actions:** одноразовые scrim/bootcamp/scouting/hero-practice/transfer эффекты. ⬜
- **T6.3 Balance simulator:** массовый прогон seeds, win-rate по этапам/стилям, outlier builds; версионирование balance config. ⬜
- **T6.4 Meta progression:** unlocks/stakes/challenges без постоянного `+OVR`; seeded и daily остаются честно сравнимыми. ⬜

## M7 — Полиш
- T7.1 Шеринг-картинка + название команды. ⬜
- T7.2 Локализация RU/EN (+ скилл `localization`). ⬜
- T7.3 UX parity pass: tooltips IMP/ECO/REL, источники/атрибуция, loading/error/empty states, responsive и keyboard flow. ⬜
- T7.4 Визуальная идентичность Aegis Draft; 322-0 — UX reference, не pixel-copy. ⬜

## M8 — Go API (фаза 2, опц.)
- T8.1 Сервис `server/` (chi/Fiber) + БД. ⬜ · T8.2 Дейлик-сид + валидация. ⬜ · T8.3 Лидерборд. ⬜ · T8.4 Сейвы забегов. ⬜

---

## Открытые вопросы (из PRD §10, решить по ходу)
- **A.** Mixed Draft: строгий `1→5` (дефолт) vs свободный порядок из микс-пака.
- **B.** Калибровка Peak `v1.1.0`: стартовые 120 дней / `N_min=15` проверить на полном датасете; изменение требует новой `ratingModelVersion`.
- **C.** Калибровка OVR/Peak/Team-Success текущей `v1.2.0` на полном датасете; изменение формулы требует новой `ratingModelVersion`.
- **D.** Атрибуция Liquipedia/OpenDota в UI.
- **E.** Roguelite run: точные target curves, 4 этапа + финал как стартовая гипотеза.
- **F.** Tactics: первый набор и лимит слотов — зафиксировать отдельным balance spec до T6.1.
