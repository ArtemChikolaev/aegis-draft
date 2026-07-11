# Web (TypeScript + React + Vite)

Фронтенд Aegis Draft. Вся игровая логика счёта — на клиенте; данные грузятся статикой из `public/data/*.json` (сгенерированы пайплайном).

> ⚠️ Скаффолд Vite будет добавлен на этапе реализации.

## Планируемая структура

```
web/
├─ src/
│  ├─ data/          # загрузка + валидация JSON (DataSource-интерфейс)
│  ├─ game/          # логика: генерация паков, скоринг, назначение героев
│  │  ├─ score.ts        # Base + HeroSynergy + Chemistry
│  │  ├─ assign.ts       # венгерский алгоритм (герои→игроки)
│  │  ├─ packs.ts        # Team Packs / Mixed Draft генерация
│  │  └─ modes.ts        # настройки забега
│  ├─ state/         # Zustand store забега
│  ├─ ui/            # экраны: старт, драфт, пентагон, итог
│  └─ types/         # типы, сгенерированные из schema/
└─ public/data/      # ← сюда пайплайн кладёт JSON
```

## Ключевые модули логики

- **score.ts** — `Team OVR = Base + Hero Synergy + Chemistry`, сглаживание winrate.
- **assign.ts** — оптимальное назначение 5 героев 5 игрокам (max-weight matching).
- **packs.ts** — Team Packs (ростер команды) и Mixed Draft (5 из разных команд, порядок 1→5).
- **DataSource** — абстракция над источником данных (статика сейчас → API в фазе 2).

## Типы из контракта

Генерировать TS-типы из `../schema/*.schema.json` (напр. `json-schema-to-typescript`) в `src/types/`, чтобы не расходиться с пайплайном.
