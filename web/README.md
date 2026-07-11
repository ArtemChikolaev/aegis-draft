# Web (TypeScript + React + Vite)

Фронтенд Aegis Draft. Вся игровая логика счёта — на клиенте; данные грузятся статикой из `public/data/*.json` (сгенерированы пайплайном).

Vite-скелет и играбельный Quick Draft уже реализованы на mock data. Актуальные gaps и следующие задачи — в [`docs/BACKLOG.md`](../docs/BACKLOG.md).

**Base-путь:** `DataSource` берёт префикс из `import.meta.env.BASE_URL`, поэтому фронт работает и в корне (dev, Cloudflare/Netlify), и под сабпутём (GitHub Pages). Для сабпути задать `VITE_BASE` при сборке, напр. `VITE_BASE=/aegis-draft/ npm run build`. Деплой и CI — в корневом [README](../README.md#деплой-и-cicd).

## Структура (design-system + features)

```
web/src/
├─ app/          # шелл приложения: App.tsx, providers.tsx (Theme+I18n), App.css
├─ design/       # ДИЗАЙН-СИСТЕМА (единый источник вида)
│  ├─ tokens.css   # :root + [data-theme] — ВСЕ цвета/радиусы токенами (light/dark)
│  ├─ base.css     # reset, типографика, focus, keyframes, reduced-motion
│  └─ theme/       # ThemeProvider (data-theme на html, persist, system)
├─ i18n/         # общий словарь RU/EN (core.ts) + I18nProvider
├─ ui/           # UIKIT — общие темизированные примитивы (CSS Modules):
│                #   Button, Surface, Eyebrow, Banner, Chip, RoleTag, SoonBadge,
│                #   StatTile, Select, Modal, OptionGroup + index.ts (barrel)
├─ features/     # экраны, собранные ИЗ ui/ (+ локальный CSS раскладки):
│  ├─ start/       #   StartScreen + start.css
│  ├─ draft/       #   DraftScreen, Pentagon (+ draft.css, pentagon.css), heroes.ts
│  └─ result/      #   ResultScreen + result.css
├─ game/         # логика: score/assign/packs/engine (не зависит от UI)
├─ data/         # DataSource (загрузка JSON)
├─ state/        # Zustand store забега
└─ types/        # типы из schema/
public/data/     # ← сюда пайплайн кладёт JSON
```

**Правила архитектуры (важно):**
- **Цвета — только через токены** `design/tokens.css`. Ноль захардкоженных цветов в компонентах → light/dark работают сами, без per-selector override. Всегда-тёмные панели/радар — через инвертные токены (`--surface-invert`, `--on-invert`, `--brand-*`).
- **Вид определяется в `ui/`**, экраны только компонуют примитивы + раскладку. Новый элемент = взять примитив из `ui/`, а не рисовать заново.
- **Локали — только через `i18n/core.ts`** (типобезопасный `MessageKey`), примитивы `ui/` презентационные (строки передаёт вызывающий).

## Ключевые модули логики

- **score.ts** — `Team OVR = Base + Hero Synergy + Chemistry`, сглаживание winrate.
- **assign.ts** — оптимальное назначение 5 героев 5 игрокам (max-weight matching).
- **packs.ts** — Team Packs (ростер команды) и Mixed Draft (5 из разных команд, порядок 1→5).
- **DataSource** — абстракция над источником данных (статика сейчас → API в фазе 2).

## Типы из контракта

Генерировать TS-типы из `../schema/*.schema.json` (напр. `json-schema-to-typescript`) в `src/types/`, чтобы не расходиться с пайплайном.
