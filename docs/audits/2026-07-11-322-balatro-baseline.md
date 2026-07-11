# Baseline audit: 322-0, Balatro и Aegis Draft

## Паспорт

- **Дата:** 2026-07-11.
- **Наша версия:** текущая рабочая копия; React/Vite MVP на mock data, Go ETL skeleton.
- **Референсы:** [322-0](https://322-0.app/), [Balatro official](https://www.playbalatro.com/), [Balatro на PlayStation](https://www.playstation.com/en-us/games/balatro/).
- **Scope:** старт → драфт → итог; конфигурация, корректность движка, полнота roguelite-цикла.
- **Evidence:** живой DOM-проход 322-0; чтение `web/src/game`, `web/src/ui`, `web/src/state`, verify-скриптов, PRD/BACKLOG.

## Что уже есть и где лежит

| Слой | Реализация |
|---|---|
| Контракт | `schema/*.schema.json`; зеркало Go — `pipeline/internal/model`, TS — `web/src/types/data.ts` |
| Чистая игра | `web/src/game`: RNG, packs, engine, smoothing, assignment, score |
| State/UI | `web/src/state/runStore.ts`; экраны в `web/src/ui` |
| Данные | mock JSON в `web/public/data`; генератор `web/scripts/gen_mock.mjs`; загрузка через `DataSource` |
| ETL | стадии и CLI в `pipeline/`; fetch/normalize/aggregate/rate пока skeleton/TODO кроме emit |
| Процесс | `CLAUDE.md`, `docs/ai/INDEX.md`, `.claude/skills`, `docs/BACKLOG.md` |

## Матрица сравнения

| Capability | Референс / принцип | Aegis Draft сейчас | Статус | Приоритет / решение |
|---|---|---|---|---|
| Start config | 322-0: mode, format, difficulty, scoring, allocation | Пять осей + Team/Mixed и больше форматов; unavailable помечены SOON | `intentional-divergence` | Сохраняем расширение |
| Team pack | 322-0 показывает roster/event; в живом паке встретилось 6 игроков (subs) | `Pack.players` не ограничен пятью, UI рендерит всех | `parity`, test gap | T3.11: fixture на subs/6+ |
| Metric explanation | 322-0 объясняет IMP/ECO/REL/OVR через tooltips | Только короткая строка метрик | `missing` | P2, T7.3 |
| Editable team name | 322-0: `Your Team ✎` | Нет | `missing` | P2, T7.1 |
| Reroll | Бюджет и disabled-состояние видны | 0/1/2/∞ работают на моках | `intentional-divergence` | Расширение сохраняем |
| Event scoring | Живой OVR пересчитывается после выбора | Работает через средний event OVR + synergy + chemistry | `parity` | Нужен unit/browser baseline T3.13 |
| Peak / Mixed team-success | В 322-0 Peak disabled; наш PRD обещает оба режима | Поля config/data есть, но `RunEngine.score()` их не читает | `missing` | P1, T3.10 |
| Manual heroes | 322-0 позволяет выбрать Manual | В UI Aegis Draft честно SOON; движок всегда auto | `missing` | P1, T3.10 |
| Hero assignment scale | Нужен exact matching из накопленного пула | DP использует 32-битный `1 << j` и экспоненту по числу героев; реальный пул может быть >31 | `defect` | **P0**, T3.11 |
| Mixed validity | Пять ролей из пяти разных команд | Fallback допускает повтор команды; отсутствующая роль может сдвинуть индексы и заблокировать strict `1→5` | `defect` | **P0**, T3.11 |
| Share/replay | Seeded runs — базовый принцип честного сравнения | Seed детерминирован внутри сессии, URL codec отсутствует | `missing` | P1, T3.12 |
| Source attribution | 322-0 показывает источник Datdota в footer | Manifest содержит источники, UI их не показывает | `missing` | P1/legal, T7.3 |
| Escalating run | Balatro: серия всё более трудных blinds до final ante | Один драфт из пяти выборов → итог без fail state | `missing` | P1, T5.1 |
| Boss constraint | Balatro: boss меняет правило и требует адаптации | Нет этапов/условий | `missing` | P1, T5.3 |
| Economy/reward | Balatro: награда и shop между испытаниями | Нет валюты/рынка/межэтапного выбора | `missing` | P1, T5.2 |
| Build identity | Balatro: ограниченные Jokers/consumables создают разные синергии | Только inherent player/hero/chemistry score | `missing` | P1, T6.1–T6.2 |
| Meta replayability | Unlocks, stakes, challenge/daily/seeded modes | Seed есть; daily/leaderboard/save только будущий API | `missing` | P2, T6.4/M8 |

## Главный вывод

Текущая реализация — хороший **детерминированный Quick Draft**, но пока не полный roguelite: игрок оптимизирует пять локальных выборов и получает число, однако не переживает растущую арку риска, наград и перестройки билда. Поэтому ближайший технический приоритет — не добавлять десятки модификаторов, а сначала закрыть correctness/config gaps и сделать один малый вертикальный цикл `Draft → Stage → Reward → Boss → Win/Loss`.

## Что не копируем

- покерную терминологию, Jokers/Tarot/Planet-контент и визуальный стиль Balatro;
- баги/рассинхрон id и непрозрачную модель данных оригинала 322-0;
- точные числа, формулы или ассеты референсов.

Заимствуем проверенные продуктовые принципы: прозрачный core loop, нарастающий target, ограниченные build-слоты, заранее видимые контр-условия, экономика opportunity cost, seeded replayability.

## Синхронизация

- **PRD:** версия 0.4, разделы 5.9–5.10 и 11, уточнённый MVP и roadmap.
- **BACKLOG:** T3.10–T3.13, M5–M8 и открытые вопросы E–F.
- **Skill/rule:** `reference-parity-audit` + обязательный триггер в `CLAUDE.md`.
- **Исправлено сейчас:** процесс сравнения и документация; продуктовый код сознательно не расширялся в рамках аудита.
- **Отложено:** подтверждённые code gaps оформлены атомарными задачами с DoD и зависимостями.
- **Follow-up:** T3.11 закрыт — matching исправлен для больших пулов, Mixed стал strict/fail-fast, добавлены subs/role/team edge tests.

## Повторная проверка

- [x] `npm run verify`.
- [x] `npm run validate:data`.
- [x] `npm run typecheck` и `npm run build`.
- [x] `gofmt`, `go vet ./...`, `go build ./...` с временным `GOCACHE`.
- [x] Browser smoke: Start → пять выборов → Result, пять назначенных героев.
- [x] Новый skill прошёл `quick_validate.py`; этот отчёт — `validate_audit.mjs`.
