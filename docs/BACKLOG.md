# BACKLOG — aegis-draft

Атомарные задачи, по которым идёт любой AI-агент (или человек). Каждая задача: **цель · файлы · скиллы · критерии готовности (DoD) · зависимости**. Порядок внутри вехи — сверху вниз. Веха M0 сделана.

Легенда статуса: ⬜ todo · 🟨 in progress · ✅ done · ⛔ blocked.
Перед задачей — прочитать [CLAUDE.md](../CLAUDE.md) и подобрать скиллы по [docs/ai/INDEX.md](ai/INDEX.md).

---

## M0 — Основа ✅
- ✅ PRD ([docs/PRD.md](PRD.md)), ADR ([docs/adr/0001-tech-stack.md](adr/0001-tech-stack.md))
- ✅ Контракт данных ([schema/](../schema)) — 10 JSON Schema
- ✅ Система скиллов/правил (`.claude/`, `.cursor/`, `.codex/`, `docs/ai/`)

---

## M3 — Фронт-MVP на моках (начинаем здесь: Node есть, Go нет)
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

---

## M1 — Пайплайн-скелет (Go)  ·  Go 1.26 установлен
### T1.1 — Go-модуль + CLI-скелет ✅
- **Цель:** `pipeline/go.mod`, `cmd/build`, стадии-заглушки `fetch→normalize→aggregate→rate→emit→validate`.
- **Файлы:** `pipeline/go.mod`, `pipeline/cmd/build/main.go`, `pipeline/internal/{model,opendota,liquipedia,rating,emit,pipeline}`.
- **Скиллы:** `discovery-before-code`, `external-data-etl`, `data-contract`.
- **DoD:** ✅ `gofmt` чист, `go vet` чист, `go build ./...` ок, `--help` печатает флаги; **эмитит валидный по схеме датасет** (кросс-проверка Node-валидатором — Go пишет → Node проверяет).

### T1.2 — OpenDota-клиент ⬜
- **Цель:** клиент с rate-limit, кэшем raw, ретраями; ключ из env.
- **Файлы:** `pipeline/internal/opendota/*.go`.
- **Скиллы:** `external-data-etl`.
- **DoD:** тянет `/proMatches` и `/players/{id}/heroes` в кэш; лимит соблюдён; секрет из env.
- **Deps:** T1.1, ключ OpenDota.

### T1.3 — Liquipedia-клиент ⬜
- **Цель:** MediaWiki-клиент: кастомный User-Agent+контакт, ≤1 req/2s, кэш, gzip; турниры/ростеры/placement.
- **Файлы:** `pipeline/internal/liquipedia/*.go`.
- **Скиллы:** `external-data-etl`.
- **DoD:** тянет 1 турнир (события+команды+ростеры); атрибуция в `manifest.source`.
- **Deps:** T1.1.

### T1.4 — Normalize (канонизация id) ⬜
- **Цель:** единый `accountId` во всех сущностях; дедуп игроков.
- **Файлы:** `pipeline/internal/normalize/*.go`, `pipeline/internal/model/*.go`.
- **Скиллы:** `data-contract`, `external-data-etl`.
- **DoD:** нет `steamId`-протечек дальше normalize; тест на дубли id.
- **Deps:** T1.2, T1.3.

### T1.5 — Emit + validate по схеме ⬜
- **Цель:** запись `web/public/data/*.json` строго по `schema/` + `manifest`.
- **Файлы:** `pipeline/internal/emit/*.go`, `pipeline/internal/validate/*.go`.
- **Скиллы:** `data-contract`.
- **DoD:** `validate_data.mjs` зелёный на реальном выводе 1 турнира; `counts` в manifest.
- **Deps:** T1.4.

---

## M2 — Рейтинг + team-success (Go)
### T2.1 — Агрегация статистик ⬜
- **Цель:** per-event player stats, player×hero (career+event), squad-пары, тиммейты, история команд.
- **Файлы:** `pipeline/internal/aggregate/*.go`.
- **Скиллы:** `scoring-model`, `data-contract`. **DoD:** заполняет playerHeroStats/eventHeroStats/squadSynergy/teammates. **Deps:** T1.5.

### T2.2 — Модель OVR/IMP/ECO/REL ⬜
- **Цель:** нормировка 0–100, веса по ролям; `ratingModelVersion`.
- **Файлы:** `pipeline/internal/rating/ovr.go`, `pipeline/internal/rating/config.go`.
- **Скиллы:** `scoring-model`. **DoD:** осмысленные рейтинги на известных ростерах; параметры в одном конфиге. **Deps:** T2.1.

### T2.3 — Peak (скользящее окно) ⬜
- **Цель:** best rolling 3–6 мес., порог `N_min`, по ролям.
- **Файлы:** `pipeline/internal/rating/peak.go`.
- **Скиллы:** `scoring-model`. **DoD:** один аномальный турнир не даёт пик; порог работает. **Deps:** T2.2.

### T2.4 — Team-success (для Mixed) ⬜
- **Цель:** `teamSuccess.json` по окнам (титулы/призовые/винрейт, веса TI/Major).
- **Файлы:** `pipeline/internal/teamsuccess/*.go`.
- **Скиллы:** `scoring-model`. **DoD:** чемпионские составы весят выше; агрегация по времени в команде. **Deps:** T2.1.

---

## M4 — Полный датасет
- T4.1 Форматы `last_1y/last_5y/valve_legacy` (фильтры + пулы). ⬜
- T4.2 Peak Rating в UI-скоринге. ⬜
- T4.3 Курируемый список тир-1 событий и веса престижа. ⬜

## M5 — Полиш
- T5.1 Итог-экран/шеринг-картинка. ⬜  · T5.2 Локализация RU/EN (+ скилл `localization`). ⬜  · T5.3 Дизайн под 322-0 (+ скилл `design-spec-fidelity`). ⬜

## M6 — Go API (фаза 2, опц.)
- T6.1 Сервис `server/` (chi/Fiber) + БД. ⬜ · T6.2 Дейлик-сид + валидация. ⬜ · T6.3 Лидерборд. ⬜ · T6.4 Сейвы забегов. ⬜

---

## Открытые вопросы (из PRD §10, решить по ходу)
- **A.** Mixed Draft: строгий `1→5` (дефолт) vs свободный порядок из микс-пака.
- **B.** Peak: длина окна (3/6 мес.), шаг, `N_min`.
- **C.** Веса OVR по ролям, сглаживание (`m`,μ), веса team-success — тюнинг на данных.
- **D.** Атрибуция Liquipedia/OpenDota в UI.
