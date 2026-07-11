# Reference parity audit — 322-0 Classic vs Aegis Draft Quick Draft

## Паспорт

- **Дата:** 2026-07-11
- **Наша версия / commit:** 8e8bafc, задеплоено на GitHub Pages (https://artemchikolaev.github.io/aegis-draft/). Датасет — **мок-baseline** (реальный OpenDota-слайс собран, но ещё не опубликован data-refresh).
- **Референс:** https://322-0.app/play — режим **322-0 CLASSIC** (автор Noxville / Datdota).
- **Scope:** golden path Quick Draft: оси старта → драфт → итог, + ключевые механики цикла.
- **Конфиг / viewport:** Team Packs · Standard(2y) · Normal(1 reroll) · Event Rating · Automatic; живой проход в браузере (desktop).
- **Проверки:** живой проход обоих продуктов (полный забег в референсе до projected finish; старт+драфт у нас); код `web/src/game/{engine,packs,score}.ts`, `web/src/ui/*`.

## Матрица

| Capability | Референс (322-0) | Aegis Draft | Статус | Evidence | Задача |
|---|---|---|---|---|---|
| Оси старта: режим | Classic + **Esports Manager (beta)** | Draft Style: Team Packs + **Mixed Draft** | `intentional-divergence` | старт обоих | Mixed — наша фича; Esports Manager вне scope |
| Формат | Valve Legacy, Standard(~2y) — 2 опции | last_1y / 2y / 5y / valve_legacy — 4 | `intentional-divergence` | старт обоих | наш T4.1: расширенные окна |
| Difficulty | Hard 0 · Easy 1 · Smurfing 2 | Hard 0 · Normal 1 · Smurfing 2 · Easy ∞ | `intentional-divergence` | старт обоих | P2: конфликт имён «Easy» |
| Scoring | Event · Peak (SOON) | Event · Peak (SOON) | `parity` | старт обоих | — |
| Allocation Manual | работает («You choose which hero each player gets») | **SOON, не реализовано** | `missing` | старт обоих | P1: сущ. T3.10 |
| Пак | ростер команды на событии + **5 героев** | ростер команды (5 игроков), героев в паке нет | `missing` | draft обоих | P1: новая hero-draft |
| **Драфт героев** | 5 героев драфтятся из паков, привязываются к игрокам, дают Hero Synergy (половина цикла) | героев не драфтишь; heroPool авто-копит signature-героев | `missing` | ref: пик героя дал +1.5 synergy; наш engine.pick | P1: продуктовое решение |
| Роли | CARRY/MID/OFF/SUP/SUP | UI показывает CARRY/MID/OFF/SUP/SUP (safelane→CARRY) | `parity` | draft обоих | — |
| Гейтинг пика (только открытая роль) | занятые роли приглушены | `engine.canPick` то же | `parity` | draft обоих | — |
| Reroll | ограничен difficulty | ограничен difficulty | `parity` | draft обоих | — |
| Модель счёта Base+Synergy+Chemistry | да, + качественная метка («GREAT») | да, число без метки | `parity` | итог реф / score.ts | P2: качественные метки |
| **Итог: Projected Finish + Field** | ранжирование против поля из 18 бот-команд → место (15th–17th), re-roll; цель — 1st | разбивка + назначение героев; **нет места/поля/вердикта** | `missing` | ref result; T3.9/ResultScreen.tsx | P1: привязать к T3.9 |
| Арт героев | реальные портреты Dota | нет картинок (пул как id) | `missing` | draft обоих | P2: hero pictures |
| Имя команды | редактируемое (✎) | нет | `missing` | ref «Your Team ✎» | P2 |
| «View hero stats» | инспекция статы героя у игрока | нет | `missing` | ref кнопки | P2 |
| Раскладка/адаптив | компактная 2-колонки, без скролла | 1 колонка, пентагон во весь экран, много скролла | `defect` | скрины обоих | P2: сущ. T7.3 |
| Брендинг | 322-0 использует собственное имя и знак | «322—0 · Aegis Draft» — пользовательский header заимствует чужой бренд | `defect` | `web/src/App.tsx`: `brand-322`, `brand-0` | P2: T7.4, в UI только **Aegis Draft** |
| Визуальная идентичность | визуальный язык 322-0 принадлежит референсу | текущая палитра/композиция ещё не образует самостоятельной системы Aegis Draft | `intentional-divergence` | продуктовое решение пользователя 2026-07-11 | T7.4: собственный design system, не pixel-copy |
| Локализация | единый язык внутри выбранного интерфейса | RU и EN смешаны: «Start Run», «Draft Style», «Итог забега», «Загрузка данных…» | `defect` | `StartScreen.tsx`, `App.tsx`, `ResultScreen.tsx`; `html lang="ru"` статичен | P2: T7.2 RU/EN |
| Темы | не является обязательной parity-фичей | одна захардкоженная dark-палитра, theme switch отсутствует | `missing` | один набор `:root` tokens в `web/src/styles.css` | P2: T7.5 system/light/dark |
| Данные | реальные игроки/команды/события + арт | деплой на моке (реальный слайс не опубликован) | `missing` | оба | известный deployment gap: M2.5/S4 |
| Производительность драфта | плавно | скролл-таймауты в браузере (возможен тяжёлый ре-рендер) | `unknown` | таймауты computer scroll | P2: сначала воспроизвести |

## Приоритеты

- **P1 (ключевой слой цикла / заявленная опция не работает):**
  - Драфт героев из паков + привязка к игрокам (сейчас героев не драфтишь).
  - Итоговый экран: projected finish / вердикт против поля (сейчас только числа).
  - Manual allocation не реализован (сущ. T3.10).
- **P2 (UX/полиш/реиграбельность):** арт героев, имя команды, view-hero-stats, адаптив/раскладка (T7.3), качественные метки synergy, конфликт имён difficulty, собственный брендинг/design system (T7.4), RU/EN без смешения (T7.2), system/light/dark (T7.5), проверить перф.
- **intentional-divergence (не баг):** Mixed Draft, расширенные форматы (last_1y/5y).

## Синхронизация

- **PRD:** добавлены открытые вопросы §10 (G — драфт героев из паков; H — вердикт итога против поля) и решения по собственной айдентике, RU/EN и темам.
- **BACKLOG:** новые задачи T-REF1…T-REF5 и атомарные T7.2/T7.4/T7.5 в M7/полиш.
- **Исправлено сейчас:** ничего (все находки — продуктовые/крупные, оформлены задачами; scope аудита — сравнение, не фикс).
- **Отложено:** перф-подозрение помечено `unknown` — не задача без воспроизведения.

## Повторная проверка

- [x] Golden path пройден в референсе целиком; у нас — старт+драфт живьём, итог по коду/бэклогу.
- [ ] Перф-подозрение (скролл-таймауты) — воспроизвести отдельно.
- Тесты/сборка не затрагивались (правок кода нет).
