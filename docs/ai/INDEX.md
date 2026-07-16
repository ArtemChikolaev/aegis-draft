# Skills Index — aegis-draft

Маршрутизация «задача → скилл». Скиллы живут в `.claude/skills/<имя>/SKILL.md` (единый источник процедур, авто-активация по `description` в Claude Code). Принципы — [PRINCIPLES.md](PRINCIPLES.md). Контракт проекта — [/CLAUDE.md](../../CLAUDE.md).

## Справочники
| Документ | Что внутри |
|---|---|
| [reference-322-0.md](../reference-322-0.md) | **Замеренная модель 322-0** (2026-07-16): Hero Synergy / Chemistry / пороги / симуляция турнира / Esports Manager — дословно из их бандла; распределение OVR и командный член — выведены из их данных. Плюс список наших расхождений. Смотри ПЕРЕД тем как подбирать формулу по скриншотам. |

## Проектные скиллы
| Скилл | Когда брать |
|---|---|
| [discovery-before-code](../../.claude/skills/discovery-before-code/SKILL.md) | Перед новым кодом (Go/TS/схема/скрипт) — найти готовое, не клонировать. |
| [plan-first-communication](../../.claude/skills/plan-first-communication/SKILL.md) | Перед нетривиальной/неоднозначной задачей — план + вопрос до кода. |
| [data-contract](../../.claude/skills/data-contract/SKILL.md) | Правка `schema/`, Go-типов, TS-типов или data JSON — единый контракт, accountId, версии. |
| [external-data-etl](../../.claude/skills/external-data-etl/SKILL.md) | Работа с OpenDota/Liquipedia в пайплайне — rate-limit, UA, кэш, атрибуция, id. |
| [scoring-model](../../.claude/skills/scoring-model/SKILL.md) | Формулы рейтинга/скоринга, паки, Team OVR — зафиксированные решения PRD §5. |
| [frontend-architecture](../../.claude/skills/frontend-architecture/SKILL.md) | Правка UI во `web/src` — примитивы из `ui/`, цвета токенами (`design/`), экраны в `features/`, строки в `i18n/`. |
| [game-state-architecture](../../.claude/skills/game-state-architecture/SKILL.md) | Состояние игры — режимы/mode shell, `RunConfig`, `RunEngine`, reset/exit, оркестрация этапов. Границы + confirm на destructive. |
| [backend-architecture](../../.claude/skills/backend-architecture/SKILL.md) | Go API `server/` — эндпоинты, слои transport/service/store, БД/миграции, auth, ошибки, ре-симуляция (ADR 0002). |
| [self-review-checklist](../../.claude/skills/self-review-checklist/SKILL.md) | Перед «готово»/PR, если трогался код/данные — мысленное ревью + скан. |
| [reference-parity-audit](../../.claude/skills/reference-parity-audit/SKILL.md) | Живое тестирование и сравнение с 322-0/Balatro/макетом; доказательства → PRD/BACKLOG. |

## Задача → скиллы (по порядку)
| Что делаешь | Скиллы |
|---|---|
| Новый код в пайплайне (Go) | `discovery-before-code` → `plan-first-communication` → (`external-data-etl` если внешние данные, `data-contract` если формат, `scoring-model` если рейтинг) → `self-review-checklist` |
| Новая игровая логика во фронте (TS: game/state) | `discovery-before-code` → (`data-contract` если типы, `scoring-model` если счёт) → `self-review-checklist` |
| Новый UI-компонент / экран / стили / тема / строки | `discovery-before-code` → `frontend-architecture` (примитивы `ui/`, токены, i18n, features/) → `self-review-checklist` |
| Режимы / стор забега / exit-reset / этапы roguelite | `discovery-before-code` → `game-state-architecture` (+ `scoring-model` если счёт) → `self-review-checklist` |
| Backend `server/` (ручка / БД / auth / лидерборд / дейлик) | `discovery-before-code` → `backend-architecture` (+ `data-contract`/`scoring-model` при пересечении) → `self-review-checklist` |
| Правка модели данных / схемы | `data-contract` → `self-review-checklist` |
| Внешний источник / fetch / парсинг | `external-data-etl` → `data-contract` → `self-review-checklist` |
| Формула рейтинга / генерация паков / счёт | `scoring-model` (+ `data-contract` если меняется формат) → `self-review-checklist` |
| Рефакторинг | `discovery-before-code` → `plan-first-communication` → `self-review-checklist` |
| Багфикс | `discovery-before-code` → `self-review-checklist` |
| «Протестируй и сравни с референсом / чего не хватает» | `reference-parity-audit` → (профильные скиллы для исправлений) → `self-review-checklist` |
| Опечатка / одна строка | без скиллов |

Не уверен — начни с `discovery-before-code`.

## Общие / инструментальные скиллы (из общей библиотеки)
Живут в `/Users/Shared/Aifory/claude and other/agent-skills/` и в харнесс-скиллах Claude Code:
- **skill-creator** (`anthropic-skills:skill-creator`) — создать/улучшить скилл. Использовать при добавлении новых скиллов сюда.
- **brainstorming** — превратить сырую идею в валидированный дизайн (стыкуется с `plan-first-communication`).
- **excalidraw-diagram** — диаграммы (нужен Python/Playwright).

## Ещё не заведены (по мере надобности, Правило 4)
`localization` (RU/EN), `analytics-events`, `platform-split`, `design-spec-fidelity` (точная вёрстка после продуктового аудита) — завести, когда реально дойдём.
