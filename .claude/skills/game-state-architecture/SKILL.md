---
name: game-state-architecture
description: >-
  Используй при работе с состоянием игры во web/src — режимы (Classic/Esports Manager/
  Real Tournament), выбор режима, RunConfig, RunEngine, сброс/выход из забега, будущая
  оркестрация этапов roguelite run. Держит границы: mode shell ≠ RunConfig ≠ engine;
  reset забега не сбрасывает выбранный режим; destructive/exit требует confirm.
  Активируется на новый режим, правку стора забега, exit/reset флоу, оркестрацию этапов.
  Не для чистого UI-вида (frontend-architecture) или формул счёта (scoring-model).
---

# Game state architecture — режимы, RunConfig, engine, оркестрация

Слои состояния игры (**не смешивать**):
- **Mode shell** (`state/`, `selectedMode`) — какой режим выбран (Classic / Esports Manager / Real Tournament). Живёт отдельно от конкретного забега.
- **RunConfig** (`game/packs.ts`) — **только реально исполнимые** опции забега (`draftStyle`, `format`, `rerolls`, `scoring`, `allocation`, `hardMode`). Не засоряй неработающими режимами/полями.
- **Новое поле RunConfig — опциональным.** `config` целиком лежит в сейве (`runPersist`) и в метке карьеры: обязательное поле сломало бы чтение уже сохранённых забегов. Так добавлен `hardMode`.
- **Ограничения режима — на уровне UI-аффордансов, не движка.** `hardMode` убирает клик по игроку и перевыбор поля; RNG, лог действий и детерминизм не трогает ⇒ golden не двигается и `ratingModelVersion` не бампается. Если опция начнёт менять выдачу движка — это уже другая история, с бампом.
- **RunEngine** (`game/engine.ts`) — чистая логика забега (ростер по слотам, пул героев, счёт, рерроллы). Не зависит от `ui/` и от mode shell.
- **Stage orchestration** (будущее, M5) — этапы roguelite (groups → playoffs → final, экономика, boss-условия) **поверх** RunEngine, отдельным слоем. Не вливать в RunEngine.

## Правила
1. **Не смешивай слои.** Mode selection может существовать без забега. `game/` не знает про `ui/` и про mode shell. UI-фаза (loading/start/draft/result) — в сторе, не в engine.
2. **Reset ≠ смена режима.** Сброс/выход из забега очищает engine/snapshot/config/seed, но **оставляет `selectedMode`**: после Classic-забега возвращаемся в Classic-конфиг, а не на экран выбора режима.
3. **RunConfig — только исполнимое.** Недоступная ось (peak/manual/недоступный формат) — `disabled`/`SOON`, а не молчаливое поле, которое движок игнорирует.
4. **Destructive/exit → confirm.** Любой выход/сброс с потерей прогресса — через подтверждение (модалка Continue / Leave, примитив `Modal` из [[frontend-architecture]]). **Отмена НЕ меняет state**; подтверждение очищает весь transient run state. Click-outside = отмена; a11y-семантика диалога.
5. **Детерминизм.** `seed + dataset + версия ⇒ тот же забег`. Новые режимы (Real Tournament: roster lock по canonical `accountId`, exclusion из draft, historical-era rating) тоже детерминированы — см. PRD §5.9.

## Что НЕ делать
- Не класть неработающий режим/поле в `RunConfig` «на будущее».
- Не сбрасывать `selectedMode` при reset забега.
- Не давать выйти из забега без confirm; не менять state на отмене.
- Не тянуть `ui/`/стор внутрь `game/engine.ts`; не вливать stage-оркестрацию в RunEngine.

## Связано
- UI/примитивы/темы → [[frontend-architecture]]. Формулы/паки/счёт → [[scoring-model]]. Контракт данных → [[data-contract]]. Полный roguelite run (этапы/экономика/мета) — PRD §5.9 и задачи вехи M5.
