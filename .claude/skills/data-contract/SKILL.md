---
name: data-contract
description: Используй при ЛЮБОЙ правке модели данных aegis-draft — файлов schema/*.schema.json, доменных типов Go (pipeline/internal/model), TS-типов (web/src/types) или сгенерированных web/public/data/*.json. Держит единый контракт: schema = источник истины, единый accountId во всех сущностях, версия в manifest, валидация обоих концов. Активируется на изменение схемы, DTO, формата данных или добавление поля.
---

# Data contract — schema это источник истины

`schema/*.schema.json` (JSON Schema draft-07) — единственный источник правды о формате данных. **Go-пайплайн эмитит** по нему, **TS-фронт потребляет** по нему. Любое расхождение = баг «странного парсинга», который мы и чиним относительно 322-0.

## Инварианты (не нарушать)
1. **Единый `accountId`** (OpenDota account_id) во ВСЕХ сущностях — паки, playerHeroStats, teammates, squadSynergy, eventHeroStats, players. Никаких `steamId` в одном файле и других id в другом (это дефект оригинала, §3.8 PRD).
2. **`heroId`** — Valve hero_id везде. **`eventId`** — строковый slug. **`teamId`** — int.
3. **Роли:** `role ∈ {safelane, mid, offlane, support}`, support ×2, без деления 4/5 (см. [[scoring-model]]).
4. **Сырые `games`/`winrate`** храним в данных; сглаживание живёт на клиенте (модель сглаживания меняется без пересборки данных).
5. **Версии в `manifest.json`:** `schemaVersion` (формат) и `ratingModelVersion` (модель рейтингов).

## Порядок при изменении модели
1. **Сначала правь `schema/*.schema.json`** — не data JSON и не типы.
2. Обнови `schema/README.md` (таблица файлов), если добавился/удалился файл.
3. Синхронизируй **оба конца**:
   - Go: доменные типы в `pipeline/internal/model` + эмиттер в `internal/emit`.
   - TS: перегенерируй типы `web/src/types` из схемы (`json-schema-to-typescript`).
4. Если поменялся формат (не аддитивно) → **бампни `schemaVersion`** и мигрируй потребителей.
5. **Провалидируй** сгенерированные `web/public/data/*.json` против схемы: `node .claude/skills/data-contract/tools/validate_data.mjs <dir>`.

## Чек перед «готово» (данные)
- [ ] Схема и оба конца (Go model + TS types) согласованы.
- [ ] Единый `accountId` — нет протёкших `steamId`.
- [ ] `manifest.json` присутствует, версии проставлены.
- [ ] `additionalProperties:false` там, где формат закрыт (ловит опечатки полей).
- [ ] Валидатор проходит на реальных данных.

## Антипаттерны
- Добавил поле в data JSON, не тронув схему → тихий рассинхрон.
- Захардкодил формат в TS вместо генерации из схемы → разъедется с Go.
- Разные id для одного игрока в разных файлах → битые synergy/chemistry.

## Связано
- Внешний сбор данных → [[external-data-etl]]. Рейтинговые поля → [[scoring-model]].
- Перед «готово» → [[self-review-checklist]].
