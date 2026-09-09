# Проектные скиллы

Единый источник — `.claude/skills/<name>/SKILL.md`. `.agents/skills` — каталог обнаружения Codex; `.codex/skills` сохранён как адаптер совместимости текущей установки. Оба содержат только относительные ссылки на канонические каталоги. Если клиент сканирует оба пути, одинаковые имена могут отображаться дважды: это не две редактируемые версии. Не рассчитывать на слияние дублей клиентом.

Общие правила — [CLAUDE.md](../../CLAUDE.md); поддержка и проверка — [PRINCIPLES.md](PRINCIPLES.md). Загружай только скиллы нужной области.

## Каталог и триггеры

| Скилл | Когда применять |
|---|---|
| [aegis-draft](../../.claude/skills/aegis-draft/SKILL.md) | Маршрутизируй инженерные задачи aegis-draft: код, данные, ревью и проектные скиллы. Читай правила проекта и выбирай профильные процедуры; не нужен для обычной беседы. |
| [discovery-before-code](../../.claude/skills/discovery-before-code/SKILL.md) | Перед новым кодом, исправлением или рефакторингом aegis-draft найди существующие модули и точки расширения. Не нужен для опечаток и чистой дизайн-идеи. |
| [plan-first-communication](../../.claude/skills/plan-first-communication/SKILL.md) | Для сложной или неоднозначной реализации aegis-draft: короткий план, допущения и важные решения до кода. Не требует повторного разрешения на уже порученную работу. |
| [data-contract](../../.claude/skills/data-contract/SKILL.md) | При изменении статического ETL-контракта aegis-draft: schema, Go model, TS data.ts, data JSON и manifest. Не для локальных типов Аркады или самостоятельного API DTO. |
| [external-data-etl](../../.claude/skills/external-data-etl/SKILL.md) | При сборе и нормализации OpenDota/Liquipedia в pipeline: доступ, лимиты, кэш, ретраи, атрибуция и id. Не для игровых ассетов или обычного поиска в интернете. |
| [scoring-model](../../.claude/skills/scoring-model/SKILL.md) | При изменении OVR, Hero Synergy, Chemistry, рейтингов, генерации паков и draft-скоринга aegis-draft. Не для боевого баланса Аркады или косметических эффектов. |
| [frontend-architecture](../../.claude/skills/frontend-architecture/SKILL.md) | При изменении UI aegis-draft: компоненты, раскладка, темы, стили и RU/EN-строки. Переиспользуй ui и токены. Не для чистой симуляции или рендера спрайт-листов. |
| [game-state-architecture](../../.claude/skills/game-state-architecture/SKILL.md) | При изменении режимов, сторов, фаз забега, RunConfig, reset/exit в aegis-draft. Не для боевых формул Аркады, чистого оформления или миграции сейва без смены фаз. |
| [game-feel-juice](../../.claude/skills/game-feel-juice/SKILL.md) | При изменении анимаций, звука, shake, reveal и визуального отклика aegis-draft. Не для урона, таймеров симуляции, импорта моделей или обычной раскладки. |
| [backend-architecture](../../.claude/skills/backend-architecture/SKILL.md) | При изменении Go API в server/: HTTP, auth, service/store, БД, миграции, сейвы и валидация результатов. Не для ETL pipeline или только локального сохранения. |
| [self-review-checklist](../../.claude/skills/self-review-checklist/SKILL.md) | Перед завершением изменений кода, данных или инструментов aegis-draft: проверь diff, архитектуру и подходящие тесты. Не нужен для ответа без изменений. |
| [reference-parity-audit](../../.claude/skills/reference-parity-audit/SKILL.md) | При сравнении aegis-draft с игрой, макетом или прежней версией: аудит поведения, пробелов и доказательств. Для идей отделяй предложения от проверенного parity. |
| [arcade-simulation](../../.claude/skills/arcade-simulation/SKILL.md) | При изменении боя Аркады: герои, враги, статусы, предметы, карты, волны, баланс, input/replay. Не для косметики, draft-OVR или одного UI-экрана. |
| [arcade-assets](../../.claude/skills/arcade-assets/SKILL.md) | При добавлении или исправлении спрайтов Dota, сетов, форм героев, косметики и манифестов Аркады. Не для боевых свойств, UI-анимаций или ETL статистики. |
| [save-compatibility](../../.claude/skills/save-compatibility/SKILL.md) | При изменении сохранений, resume, постоянных наград, истории и совместимости replay aegis-draft. Не для внешних data JSON или только раскладки экрана. |
| [agent-skill-maintenance](../../.claude/skills/agent-skill-maintenance/SKILL.md) | При создании, обновлении или проверке проектных скиллов aegis-draft и адаптеров Claude/Codex. Не для обычной игровой фичи или настройки стороннего плагина. |

## Композиция

- Новая реализация: discovery → короткий plan при сложности → профильный скилл → self-review.
- Статические ETL-поля: data-contract; сбор источника: дополнительно external-data-etl; OVR: scoring-model.
- UI: frontend-architecture; анимации/звук: дополнительно game-feel-juice.
- Бой Аркады: arcade-simulation; сет/рендер: arcade-assets; постоянные награды/resume: save-compatibility.
- Фазы/режимы/reset: game-state-architecture; изменение сохраняемых полей: дополнительно save-compatibility.
- API/БД: backend-architecture; статический ETL-контракт подключай только при реальном пересечении.
- Сравнение/идеи по референсам: reference-parity-audit; исправления — только в порученном объёме.
- Изменение самих процедур/адаптеров: agent-skill-maintenance. Используй доступный skill-creator, если он есть в каталоге среды; не предполагай личный путь или конкретный плагин.

Опечатка не требует полного набора процедур. Router не заменяет профильный скилл.

## Контекст по необходимости

- [PRD](../PRD.md) и [BACKLOG](../BACKLOG.md): решения и план; статус выполнения проверяется по коду/тесту.
- [Модель 322-0](../reference-322-0.md): исторический замер для сравнений с этим референсом.
- [Бриф Аркады](../arcade-survivors-brief.md): исходный замысел, не полный текущий реестр реализации.
- [Пайплайн спрайтов Dota](../arcade-dota-sprites.md): импорт и рендер.
- [Источники и результаты обновления скиллов](2026-09-09-skills-refresh.md).
