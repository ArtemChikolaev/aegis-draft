# Aegis Draft

Драфт-рогалик по Dota 2 — вдохновлён [322-0.app](https://322-0.app/play), с расширенной механикой. Собираешь пятёрку по ролям, раздаёшь героев, максимизируешь `Team OVR = Base + Hero Synergy + Chemistry` и ведёшь команду через турнир. Плюс «Аркада» — 2D survivors-роглайк на тех же данных и моделях Dota.

🎮 **Живая версия:** https://artemchikolaev.github.io/aegis-draft/

## Статус
В проде играется четыре режима: **Классика** (быстрый забег и рогалик-сезон), **Киберспорт-менеджер**, **Реальный турнир** и **Аркада**. Поверх ядра: сейв и резюм незавершённого забега, шеринг ссылкой и старт по сид-коду, история забегов и Штаб (коллекция карт, трофеи, Playbook), режим «Хард» (профили закрыты, рероллов нет — ни пака, ни соперников), дейлик (общий сид дня без сервера) и справочники — популярность героев и ростер-веб. Игра **работает офлайн**: service worker, автопрекэш датасета и зеркало арта в репозитории ([ADR 0003](docs/adr/0003-offline-first-pwa.md)), ставится на устройство как PWA.

Данные — **реальный OpenDota-слайс** (события/паки/игроки/рейтинги), обновляется по расписанию. Фронт — на собственной design-system (токены + UIkit + features), RU/EN и system/light/dark темы.

**Чего ещё нет, честно.** Онлайн упирается в публичный `server/`: его деплой встал на верификации карты у Fly.io (T9.0), а в прод-сборке не задан `VITE_API_BASE` — поэтому на живом сайте **Дуэль** и **Арена** недоступны (локально Дуэль играется против поднятого сервера, Арена ещё не собрана). Telegram-бот и Mini App ([PRD §5.11](docs/PRD.md)) ждут того же деплоя. План задач — [docs/BACKLOG.md](docs/BACKLOG.md).

## Режимы игры (PRD §5.9)
| Режим | Состояние | Что это |
|---|---|---|
| **Классика** | ✅ | All-time драфт: **Team Packs** (из ростеров команд) или **Mixed Draft** (5 звёзд из разных команд), затем турнир `groups → playoffs → final`. Внутри — выбор варианта: **быстрый забег** или **рогалик-сезон** (этапы с растущим порогом, усиление между ними, ante-петля и ставки-мутаторы). Отсюда же **дейлик** — общий сид дня. |
| **Киберспорт-менеджер** | ✅ | Организация в регионе: бюджет, контракты, ростер, квалификации; оффсезонный кап зарплат и тренировочный сбор. |
| **Реальный турнир** | ✅ | Поле соперников известно заранее, их игроки заблокированы (roster lock) — собираешь challenger из свободных игроков и легенд вне турнира. |
| **Аркада** | ✅ | 2D survivors-роглайк — см. ниже. Офлайн, свой стор и своя версия конфига. |
| **Дуэль** | 🟨 | Онлайн 1×1 по коду комнаты: капитанский драфт змейкой из общего пула, затем баны и пики на каждую игру серии Bo1/Bo3/Bo5. Готово и играется на локально поднятом `server/` (комнаты + ws-релей); на живом сайте недоступно, пока нет публичного API. |
| **Арена** | ⬜ | Комната до 18 живых соперников: общий пул, одновременные раунды драфта с приоритетом змейки, один турнир. Карточка есть, режим ждёт ws-сервера. |

Формула: **Base** (event-OVR пятёрки) + **Hero Synergy** (оптимальное назначение героев) + **Chemistry** (сыгранность). Роли: `safelane/mid/offlane/support×2` (без деления 4/5).

## Аркада (PRD §5.15)
Второй жанр на той же сцене: герой Dota в реальном времени против волн нейтралов и крипов. Детерминированный сим 60 Гц без DOM (`game/arcade/`), рендер — Canvas 2D (`features/arcade/`), вход WASD/мышь/геймпад/виртуальный джойстик.

- **126 героев** со своими китами, лестница Dota (Q/W/E, R на 6/12/18, таланты на 10/15/20/25).
- **Четыре школы** апгрейдов (Radiance, Skadi, Maelstrom, Зверинец), до трёх за забег; предметы, нейтралы, лавка и экран сборки.
- **Акты**: Рошан на 7:00 и 14:00 с Aegis, Tormentor на 10:30, Древний на 20:00; ночной Dire и река с рунами.
- **40 ступеней сложности** — ранги Dota × 5 звёзд, каждый ранг добавляет именованное правило, а не только числа.
- **Косметика**: арканы, персоны и сеты из Dota, стили и призматические самоцветы, наземные эффекты, свечения и следы. Косметика не меняет ни одного числа и не входит в сид.
- **Спрайты — настоящие модели Dota 2**, отрендеренные в 2D-листы кадров: клиент → Source 2 Viewer CLI → Blender ([docs/arcade-dota-sprites.md](docs/arcade-dota-sprites.md)). Из клиента берётся только визуал, ничего не распространяется отдельно от игры.

Балансировка — headless-симулятором: `npm run sim:arcade -- --runs 120 --hero <id>`.

## Как запустить
```bash
# Фронт (Node 24+): dev-сервер на http://localhost:5173
cd web && npm install && npm run dev
# или из корня репо:
#   make dev        — только комп (localhost:5173)
#   make dev-phone  — комп + телефон в одной Wi-Fi (тот же порт; с телефона по LAN IP)
#   make help       — список целей

# Прод-сборка локально (нужна для всего, что живёт только в ней: service worker и офлайн):
npm run preview          # или preview:pages — под сабпутём /aegis-draft/, как на Pages

# Тесты и валидация (реальный датасет в git; unit/golden — после gen:mock):
npm run validate:data && npm run test && npm run test:e2e && npm run typecheck
npm run gen:mock && npm run test    # локально: mock для golden/fixtures

# Балансовые прогоны без UI:
npm run sim            # рогалик-забег
npm run sim:manager    # менеджер
npm run sim:arcade     # аркада

# Go-пайплайн (Go 1.26+): реальный датасет из OpenDota
cd pipeline
go run ./cmd/build --fetch-opendota --emit-domain --as-of 2026-07-11 \
  --match-detail-limit 100 --out ../web/public/data

# Go-сервер (скелет): http://localhost:8080/healthz
cd server && PORT=8080 go run ./cmd/api
```

## Архитектура
| Слой | Стек | Роль |
|---|---|---|
| **`pipeline/`** | Go | ETL: OpenDota → игровые JSON (`fetch→normalize→aggregate→rate→emit→validate`), детерминизм, версионирование. |
| **`web/`** | TS + React + Vite + Zustand | Фронт + игровая логика счёта на клиенте. Design-system: `design/` (токены+тема) · `ui/` (примитивы) · `features/` (экраны) · `i18n/` · `game/` (логика) · `app/` (шелл). Аркада изолирована: `game/arcade/` (сим) + `features/arcade/` (рендер) + `state/arcadeStore.ts`. |
| **`server/`** | Go + chi + Postgres | API пользовательского/общего состояния (аккаунты/сейвы/лидерборд/дейлик). Игровые данные — **не** тут (они статика). Локально за nginx: [`infra/`](infra/). |
| **`schema/`** | JSON Schema | Единый контракт данных между Go и TS — источник истины. |

**Static-first гибрид** (ADR [0001](docs/adr/0001-tech-stack.md)/[0002](docs/adr/0002-backend-now.md)): игровые данные — статикой на CDN (масштабируется бесконечно), сервер держит только изменяемое состояние. **Без Kubernetes.**

Ассеты в репозитории: зеркало портретов и знаков (`web/public/art/`, для офлайна) и спрайт-листы Аркады (`web/public/art/sprites/`, ~390 МБ) — они версионируются, потому что офлайн-готовность не должна зависеть от того, какие экраны игрок успел открыть.

## Данные, деплой, CI/CD
- [.github/workflows/ci.yml](.github/workflows/ci.yml) — **проверки** (push/PR): Go pipeline · Go server · Web (`gen:mock`→`validate:data`→`test`→`test:e2e`→`typecheck`→`build`; mock только в CI web-job) · antipattern-scan. **Деплой на GitHub Pages** (push в `main`, если проверки зелёные) — публикует **реальный** `web/public/data` из data-refresh.
- [.github/workflows/data-refresh.yml](.github/workflows/data-refresh.yml) — крон обновляет `web/public/data/*.json` (OpenDota-слайс) и коммитит их в репозиторий.
- [.github/workflows/deploy-server.yml](.github/workflows/deploy-server.yml) — деплой `server/` на Fly.io. Пока в репозитории нет секрета `FLY_API_TOKEN`, джоб **чисто пропускается**, а не падает.

Локально: `gen:mock` для golden (`npm run test:golden:update`). Разовая настройка GitHub: **Settings → Pages → Source: GitHub Actions**; **Settings → Actions → General → Workflow permissions → Read and write**.

### Prod-like lab (nginx + Docker Compose)

Локальный стенд с единым входом (`/` SPA · `/data/*` JSON · `/api/*` Go API) — **не заменяет** GitHub Pages. См. [`infra/README.md`](infra/README.md):

```bash
[ -f web/public/data/manifest.json ] || (cd web && npm run gen:mock)
docker compose -f infra/docker-compose.yml up --build
# → http://localhost:8080
```

## Система скиллов и правил (для AI-агентов)
Единый контракт `CLAUDE.md` (= `AGENTS.md`), процедуры-скиллы в `.claude/skills/` (авто-активация по `description`), адаптер Cursor (`.cursor/rules/`), ссылки для Codex (`.agents/skills/`) и адаптер совместимости (`.codex/skills/`). Маршрутизация «задача → скилл» — [docs/ai/INDEX.md](docs/ai/INDEX.md), принципы — [docs/ai/PRINCIPLES.md](docs/ai/PRINCIPLES.md).
Полный каталог и сочетания скиллов, включая Аркаду, ассеты и сохранения, ведутся в INDEX. Проверка YAML, локальных ссылок и адаптеров запускается также в CI.

Порт **5173** занимает разработчик; агенты поднимают свой сервер на **5273** (`.claude/launch.json`).

## Документы
- 📄 **[docs/PRD.md](docs/PRD.md)** — концепция, механики, режимы, роадмап · **[docs/modes-scenarios.md](docs/modes-scenarios.md)** — сценарии режимов.
- 🏛 **[ADR 0001](docs/adr/0001-tech-stack.md)** (стек, static-first) · **[ADR 0002](docs/adr/0002-backend-now.md)** (backend сейчас) · **[ADR 0003](docs/adr/0003-offline-first-pwa.md)** (офлайн: PWA, зеркало арта).
- 🕹 **[docs/arcade-survivors-brief.md](docs/arcade-survivors-brief.md)** — бриф Аркады · **[docs/arcade-dota-sprites.md](docs/arcade-dota-sprites.md)** — конвейер «модели Dota → спрайт-листы».
- 🎲 **[docs/roguelite-balatro-brief.md](docs/roguelite-balatro-brief.md)** · **[docs/roguelite-lategame-spec.md](docs/roguelite-lategame-spec.md)** — рогалик-сезон и его лейтгейм.
- 🎨 **[docs/design-language.md](docs/design-language.md)** — визуальная айдентика · 📐 **[schema/README.md](schema/README.md)** — контракт данных.
- 🔍 **[docs/reference-322-0.md](docs/reference-322-0.md)** и **[docs/audits/](docs/audits/)** — разбор оригинала и аудиты парити.
- 🤖 **[CLAUDE.md](CLAUDE.md)** — контракт для AI-агентов.

## Лицензия
[MIT](LICENSE) © 2026 Artem Chikolaev. Некоммерческий фан-проект по Dota 2; Dota 2 и связанные материалы (модели, звуки, иконки) — собственность Valve. Данные: OpenDota (атрибуция), Liquipedia — только при авторизованном доступе (CC-BY-SA). Остальные спрайты и тайлы — Liberated Pixel Cup (CC-BY-SA 3.0 / GPL 3.0), авторы — в `web/public/art/sprites/lpc/ATTRIBUTION.md`.
